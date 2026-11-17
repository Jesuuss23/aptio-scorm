import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, type OnModuleDestroy, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { COLA_SUSCRIPCIONES, type DatosBienvenida, opcionesRedis, opcionesTareaBienvenida, prefijoColas, TAREA_BIENVENIDA } from '@aptio/colas';
import { Prisma, ultimaVersion } from '@aptio/db';
import { CAMPO_TRAMPA, type EnvioLead, validarEnvioLead } from '@aptio/schema/leads';
import { planesServidos } from '@aptio/schema/sitio-versiones';
import {
  type Ciclo, esCiclo, type EventoPago, finPeriodo, leerEventoPrueba, PASARELA_PRUEBA, resumenCheckout, slugOrganizacion, TARJETAS_PRUEBA, validarEmpresa,
} from '@aptio/schema/suscripciones';
import { Queue } from 'bullmq';
import { AuthService } from '../auth/auth.service.js';
import { nuevoToken, VIGENCIA_BIENVENIDA_MS } from '../auth/tokens.service.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { LeadsService } from '../captacion/leads.service.js';
import { BASE_SITIO } from '../sitio/sitio-publico.controller.js';
import { entornoActual } from '../sitio/entorno-sitio.js';
import type { CheckoutCreadoDto, EstadoCheckoutDto, WebhookRecibidoDto } from './suscripciones.dto.js';

/** Checkouts por IP en cada ventana (como los leads); más, 429. Aparte del límite general de /publico/* (SUP-169). */
export const LIMITE_CHECKOUT = { envios: 10, ventanaMs: 10 * 60_000 } as const;
/** La cabecera con la firma del webhook: `sha256=` y el HMAC-SHA256 en hexadecimal del cuerpo tal como llegó. */
export const CABECERA_FIRMA = 'x-aptio-firma';
/** Solo para el entorno de pruebas sin `PAGO_PRUEBA_SECRETO` (en producción la pasarela de pruebas no existe). */
const SECRETO_PRUEBA_LOCAL = 'secreto-local-de-la-pasarela-de-pruebas';

type FilaSolicitud = Prisma.SolicitudSuscripcionGetPayload<{ include: { plan: true; suscripcion: true } }>;
const CON_PLAN = { plan: true, suscripcion: true } as const;

export const firmar = (secreto: string, cuerpo: Buffer | string) => `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;

/** Compara la firma recibida con la esperada en tiempo constante. */
export function firmaValida(secreto: string, cuerpo: Buffer, recibida: string | undefined): boolean {
  if (!recibida) return false;
  const a = Buffer.from(firmar(secreto, cuerpo));
  const b = Buffer.from(recibida.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

const noValido = (errores: { campo: string; mensaje: string }[]) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });

/**
 * HU-1703 · Alta de suscripción desde /precios (REQ-083, CP-143, RN-18-2, RN-18-3). El checkout de `/pago` crea una
 * solicitud pendiente con el precio del plan publicado; la pasarela confirma con un webhook firmado (HMAC) y cada evento
 * se procesa una sola vez (`eventoPagoId` único). Con el pago aprobado, una transacción crea la organización vacía, su
 * administrador, la suscripción activa (con el precio pactado) y el lead de origen «Suscripción»; después sale el correo
 * de bienvenida con el enlace para crear la clave. Un pago rechazado solo cierra la solicitud. La pasarela de pruebas solo
 * existe con `SITIO_ENTORNO=pruebas`; en producción, hasta la HU-1704, el pago en línea no está disponible.
 */
@Injectable()
export class SuscripcionesService implements OnModuleDestroy {
  private readonly log = new Logger('Suscripciones');
  private readonly ventanas = new Map<string, { inicio: number; cuenta: number }>();
  private cola?: Queue<DatosBienvenida>;
  /** El último encolado de la bienvenida (las pruebas lo esperan; la respuesta a la pasarela no). */
  ultimoEncolado: Promise<unknown> = Promise.resolve();

  constructor(private readonly baseDatos: BaseDatosService, private readonly leads: LeadsService, private readonly auth: AuthService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  get colaSuscripciones(): Queue<DatosBienvenida> {
    this.cola ??= new Queue<DatosBienvenida>(COLA_SUSCRIPCIONES, { connection: opcionesRedis(), prefix: prefijoColas() });
    return this.cola;
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola?.close();
  }

  /** Vacía el límite por IP (pruebas). */
  reiniciarLimite(): void {
    this.ventanas.clear();
  }

  private contar(ip: string, ahora: number): void {
    let v = this.ventanas.get(ip);
    if (!v || ahora - v.inicio >= LIMITE_CHECKOUT.ventanaMs) {
      v = { inicio: ahora, cuenta: 0 };
      this.ventanas.set(ip, v);
      if (this.ventanas.size > 10_000) for (const [k, x] of this.ventanas) if (ahora - x.inicio >= LIMITE_CHECKOUT.ventanaMs) this.ventanas.delete(k);
    }
    v.cuenta += 1;
    if (v.cuenta > LIMITE_CHECKOUT.envios) {
      throw new HttpException({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Recibimos varias solicitudes seguidas: espera unos minutos e intenta de nuevo', reintentarEn: Math.ceil((v.inicio + LIMITE_CHECKOUT.ventanaMs - ahora) / 1000) }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** La pasarela que cobra en este entorno: la de pruebas en `pruebas`; ninguna en producción hasta la HU-1704. */
  pasarelaActiva(): string | null {
    return entornoActual() === 'pruebas' ? PASARELA_PRUEBA : null;
  }

  private secreto(pasarela: string): string | null {
    if (pasarela !== PASARELA_PRUEBA || this.pasarelaActiva() !== PASARELA_PRUEBA) return null;
    return process.env.PAGO_PRUEBA_SECRETO || SECRETO_PRUEBA_LOCAL;
  }

  // ── Checkout ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Paso 3 de `/pago`: valida la empresa, toma el precio del plan de la versión publicada y crea la solicitud pendiente.
   * 404 si el plan no se publica o es a medida; 409 si el correo ya es de un usuario; 503 si no hay pasarela.
   */
  async crearCheckout(entrada: unknown, ip: string, ahora = new Date()): Promise<CheckoutCreadoDto> {
    this.contar(ip, ahora.getTime());
    const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
    const v = await ultimaVersion(this.bd);
    const servidos = v ? planesServidos(v.instantanea, entornoActual()) : null;
    const publico = servidos?.planes.find((p) => p.slug === e.plan);
    if (!servidos || !publico || publico.aMedida) throw new NotFoundException({ codigo: 'PLAN_NO_DISPONIBLE', mensaje: 'Este plan no se puede contratar en línea: elige otro en la página de precios o agenda una demo' });
    const ciclo: Ciclo = e.ciclo === undefined || e.ciclo === '' ? 'MENSUAL' : (e.ciclo as Ciclo);
    const errores = esCiclo(ciclo) ? [] : [{ campo: 'ciclo', mensaje: 'El ciclo es MENSUAL o ANUAL' }];
    const empresa = validarEmpresa(e);
    if (!empresa.ok) errores.push(...empresa.errores);
    if (errores.length || !empresa.ok) throw noValido(errores);
    const resumen = resumenCheckout(publico, ciclo, servidos.ajustes.mostrarAnual);
    if (!resumen) throw noValido([{ campo: 'ciclo', mensaje: 'Este plan no se ofrece con pago anual' }]);
    const { datos } = empresa;
    if (await this.bd.usuario.findUnique({ where: { email: datos.correoAdmin } })) {
      throw new ConflictException({ codigo: 'CORREO_EN_USO', mensaje: 'Ese correo ya tiene una cuenta: inicia sesión en la plataforma o usa otro correo' });
    }
    const pasarela = this.pasarelaActiva();
    if (!pasarela) throw new HttpException({ codigo: 'PAGO_NO_DISPONIBLE', mensaje: 'El pago en línea todavía no está disponible: agenda una demo y te ayudamos a suscribirte' }, HttpStatus.SERVICE_UNAVAILABLE);
    const plan = await this.bd.plan.findUnique({ where: { slug: publico.slug } });
    if (!plan) throw new NotFoundException({ codigo: 'PLAN_NO_DISPONIBLE', mensaje: 'Este plan no se puede contratar en línea' });
    // La atribución del lead (página de entrada, UTM, referente), de mejor esfuerzo como en los leads (REQ-074).
    const lead = validarEnvioLead({ ...e, via: 'suscripcion', correo: datos.correoAdmin, nombre: datos.nombreAdmin, empresa: datos.razonSocial, mensaje: undefined, consentimiento: true, [CAMPO_TRAMPA]: undefined }, `/${BASE_SITIO}`);
    const atribucion: EnvioLead | null = lead.ok && !lead.trampa ? { ...lead.envio, mensaje: `Suscripción al plan ${publico.nombre} (${ciclo === 'ANUAL' ? 'anual' : 'mensual'})` } : null;
    const s = await this.bd.solicitudSuscripcion.create({
      data: {
        planId: plan.id, ciclo, razonSocial: datos.razonSocial, ruc: datos.ruc, tipoComprobante: empresa.tipoComprobante, nombreAdmin: datos.nombreAdmin, correoAdmin: datos.correoAdmin,
        subtotal: resumen.subtotal, igv: resumen.igv, total: resumen.total, pasarela, atribucion: (atribucion ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
    return { id: s.id, estado: 'PENDIENTE', resumen, tipoComprobante: empresa.tipoComprobante, pasarela };
  }

  async estado(id: string): Promise<EstadoCheckoutDto> {
    const s = await this.bd.solicitudSuscripcion.findUnique({ where: { id }, include: CON_PLAN });
    if (!s) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe' });
    return this.aEstado(s);
  }

  private aEstado(s: FilaSolicitud): EstadoCheckoutDto {
    return {
      id: s.id, estado: s.estado, plan: s.plan.slug, nombrePlan: s.plan.nombre, ciclo: s.ciclo, total: Number(s.total), tipoComprobante: s.tipoComprobante, correoAdmin: s.correoAdmin,
      motivoRechazo: s.estado === 'RECHAZADA' ? (s.motivoRechazo ?? 'La pasarela rechazó el pago') : null, finPeriodo: s.suscripcion?.finPeriodo.toISOString() ?? null,
    };
  }

  /**
   * La pasarela de pruebas (solo en `pruebas`): con la tarjeta que aprueba o la que rechaza, arma el evento, lo firma y lo
   * procesa por el mismo camino que el webhook. Otra tarjeta, 422. Nunca se guarda el número, solo los 4 últimos.
   */
  async pagarPrueba(id: string, tarjeta: unknown): Promise<EstadoCheckoutDto> {
    const secreto = this.secreto(PASARELA_PRUEBA);
    if (!secreto) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La pasarela de pruebas no está disponible' });
    const numero = (typeof tarjeta === 'string' ? tarjeta : '').replace(/[\s-]/g, '');
    if (numero !== TARJETAS_PRUEBA.aprobada && numero !== TARJETAS_PRUEBA.rechazada) {
      throw noValido([{ campo: 'tarjeta', mensaje: 'Usa una tarjeta de prueba: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza' }]);
    }
    const s = await this.bd.solicitudSuscripcion.findUnique({ where: { id } });
    if (!s || s.pasarela !== PASARELA_PRUEBA) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe' });
    if (s.estado === 'PENDIENTE') {
      const aprobado = numero === TARJETAS_PRUEBA.aprobada;
      const cuerpo = Buffer.from(JSON.stringify({
        id: `prueba_${s.id}`, tipo: aprobado ? 'pago.aprobado' : 'pago.rechazado', solicitudId: s.id, ultimos4: numero.slice(-4), ...(aprobado ? {} : { motivo: 'La tarjeta de prueba fue rechazada' }),
      }));
      await this.recibirWebhook(PASARELA_PRUEBA, cuerpo, firmar(secreto, cuerpo));
    }
    return this.estado(id);
  }

  // ── Webhook ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** `POST /webhooks/pago/{pasarela}`: 404 si la pasarela no existe aquí; 401 si la firma no coincide; 422 si el evento no se entiende. */
  async recibirWebhook(pasarela: string, cuerpo: Buffer | undefined, firma: string | undefined, ahora = new Date()): Promise<WebhookRecibidoDto> {
    const secreto = this.secreto(pasarela);
    if (!secreto) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'Pasarela desconocida' });
    const crudo = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.alloc(0);
    if (!firmaValida(secreto, crudo, firma)) {
      await this.bd.auditoria.create({ data: { organizacionId: null, usuarioId: null, accion: 'PAGO_FIRMA_NO_VALIDA', entidad: 'SolicitudSuscripcion', entidadId: null, datos: { pasarela } } });
      throw new UnauthorizedException({ codigo: 'FIRMA_NO_VALIDA', mensaje: 'La firma del evento no coincide' });
    }
    let json: unknown;
    try {
      json = JSON.parse(crudo.toString('utf8'));
    } catch {
      json = null;
    }
    const evento = leerEventoPrueba(json);
    if (!evento) throw new UnprocessableEntityException({ codigo: 'EVENTO_NO_VALIDO', mensaje: 'El evento no tiene la forma esperada' });
    return this.procesar(pasarela, evento, ahora);
  }

  /**
   * RN-18-3 · Un evento se procesa una sola vez: si su id ya resolvió una solicitud, o la solicitud ya no está pendiente,
   * responde 200 sin crear nada. El alta aprobada va en una sola transacción.
   */
  private async procesar(pasarela: string, ev: EventoPago, ahora: Date): Promise<WebhookRecibidoDto> {
    type Alta = { lead: Awaited<ReturnType<LeadsService['guardarEnTransaccion']>> | null; envio: EnvioLead | null; token: string; solicitudId: string };
    let alta: Alta | null = null;
    let duplicado = false;
    try {
      duplicado = await this.bd.$transaction(async (tx) => {
        if (await tx.solicitudSuscripcion.findUnique({ where: { eventoPagoId: ev.eventoId } })) return true;
        const s = await tx.solicitudSuscripcion.findUnique({ where: { id: ev.solicitudId } });
        if (!s || s.pasarela !== pasarela) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe' });
        const aprobado = ev.resultado === 'aprobado';
        const cambio = await tx.solicitudSuscripcion.updateMany({
          where: { id: s.id, estado: 'PENDIENTE' },
          data: { estado: aprobado ? 'APROBADA' : 'RECHAZADA', eventoPagoId: ev.eventoId, resueltaEn: ahora, motivoRechazo: aprobado ? null : (ev.motivo ?? 'La pasarela rechazó el pago') },
        });
        if (cambio.count === 0) return true;
        if (!aprobado) {
          await tx.auditoria.create({ data: { organizacionId: null, usuarioId: null, accion: 'PAGO_RECHAZADO', entidad: 'SolicitudSuscripcion', entidadId: s.id, datos: { pasarela, eventoId: ev.eventoId } } });
          return false;
        }
        // Si el correo pasó a ser de un usuario mientras se pagaba, el pago queda aprobado sin alta para revisarlo a mano.
        if (await tx.usuario.findUnique({ where: { email: s.correoAdmin } })) {
          await tx.solicitudSuscripcion.update({ where: { id: s.id }, data: { motivoRechazo: 'CORREO_EN_USO: el pago se aprobó pero el correo ya tenía una cuenta' } });
          await tx.auditoria.create({ data: { organizacionId: null, usuarioId: null, accion: 'SUSCRIPCION_SIN_ALTA', entidad: 'SolicitudSuscripcion', entidadId: s.id, datos: { motivo: 'CORREO_EN_USO' } } });
          return false;
        }
        const org = await tx.organizacion.create({ data: { nombre: s.razonSocial, slug: slugOrganizacion(s.razonSocial, s.id.slice(0, 8)), ruc: s.ruc } });
        const admin = await tx.usuario.create({ data: { email: s.correoAdmin, nombre: s.nombreAdmin, rol: 'ADMINISTRADOR', organizacionId: org.id } });
        const { token, hashToken } = nuevoToken();
        await tx.tokenAcceso.create({ data: { usuarioId: admin.id, tipo: 'INVITACION', hashToken, expira: new Date(ahora.getTime() + VIGENCIA_BIENVENIDA_MS) } });
        await tx.suscripcion.create({
          data: {
            organizacionId: org.id, planId: s.planId, ciclo: s.ciclo, precioPactadoSinIgv: Number(s.subtotal), moneda: s.moneda, estado: 'ACTIVA', inicioPeriodo: ahora,
            finPeriodo: finPeriodo(ahora, s.ciclo), pasarela, ultimos4Digitos: ev.ultimos4, solicitudId: s.id,
          },
        });
        await tx.solicitudSuscripcion.update({ where: { id: s.id }, data: { organizacionId: org.id } });
        const envio = (s.atribucion && typeof s.atribucion === 'object' && 'correo' in s.atribucion ? s.atribucion : null) as unknown as EnvioLead | null;
        const lead = envio ? await this.leads.guardarEnTransaccion(tx, envio, ahora, 'GANADO') : null;
        await tx.auditoria.create({
          data: { organizacionId: org.id, usuarioId: null, accion: 'SUSCRIPCION_CREADA', entidad: 'Suscripcion', entidadId: s.id, datos: { pasarela, eventoId: ev.eventoId, planId: s.planId, ciclo: s.ciclo, total: Number(s.total), adminId: admin.id } },
        });
        alta = { lead, envio, token, solicitudId: s.id };
        return false;
      });
    } catch (e) {
      // Dos entregas del mismo evento a la vez: la segunda choca con el `eventoPagoId` único y es un repetido.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { recibido: true, duplicado: true };
      throw e;
    }
    const hecho = alta as Alta | null;
    if (hecho) {
      if (hecho.lead && hecho.envio) this.leads.trasGuardar(hecho.lead.lead, hecho.lead.nuevo, hecho.envio);
      const datos: DatosBienvenida = { solicitudId: hecho.solicitudId, enlace: this.auth.enlace(hecho.token) };
      this.ultimoEncolado = this.colaSuscripciones.add(TAREA_BIENVENIDA, datos, opcionesTareaBienvenida(hecho.solicitudId))
        .catch((e: unknown) => this.log.error(`No se pudo encolar la bienvenida de la solicitud ${hecho.solicitudId}: ${e instanceof Error ? e.message : String(e)}`));
    }
    return { recibido: true, duplicado };
  }
}
