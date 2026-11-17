import {
  BadGatewayException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, type OnModuleDestroy, UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
import {
  COLA_COMPROBANTES, COLA_SUSCRIPCIONES, type DatosBienvenida, type DatosComprobante, opcionesRedis, opcionesTareaBienvenida, opcionesTareaComprobante, prefijoColas, TAREA_BIENVENIDA,
  TAREA_EMITIR_COMPROBANTE,
} from '@aptio/colas';
import { Prisma, ultimaVersion } from '@aptio/db';
import { CATALOGO_PASARELAS, esCodigoPasarela } from '@aptio/schema/pasarelas';
import { CAMPO_TRAMPA, type EnvioLead, validarEnvioLead } from '@aptio/schema/leads';
import { planesServidos } from '@aptio/schema/sitio-versiones';
import {
  type Ciclo, esCiclo, esMoneda, type EventoPago, finPeriodo, type Moneda, PASARELA_PRUEBA, resumenCheckout, slugOrganizacion, TARJETAS_PRUEBA, validarEmpresa,
} from '@aptio/schema/suscripciones';
import { opcionesRenderDesdeEnv } from '@aptio/sitio';
import { Queue } from 'bullmq';
import { AuthService } from '../auth/auth.service.js';
import { nuevoToken, VIGENCIA_BIENVENIDA_MS } from '../auth/tokens.service.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { LeadsService } from '../captacion/leads.service.js';
import { BASE_SITIO } from '../sitio/sitio-publico.controller.js';
import { entornoActual } from '../sitio/entorno-sitio.js';
import { type Cabeceras, ErrorPasarela, type PagoCreado } from './pasarelas/contrato.js';
import { firmar, type PasarelaPruebas } from './pasarelas/pruebas.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { CambioPlanDto } from './cambio-plan.dto.js';
import { CambioPlanService } from './cambio-plan.service.js';
import type { CompraCapsulasDto } from './cuotas.dto.js';
import { CuotasService } from './cuotas.service.js';
import { PasarelasService } from './pasarelas.service.js';
import type { CheckoutCreadoDto, EstadoCheckoutDto, WebhookRecibidoDto } from './suscripciones.dto.js';

export { CABECERA_FIRMA, firmar, firmaValida } from './pasarelas/pruebas.js';

/** Checkouts por IP en cada ventana (como los leads); más, 429. Aparte del límite general de /publico/* (SUP-169). */
export const LIMITE_CHECKOUT = { envios: 10, ventanaMs: 10 * 60_000 } as const;
/** HU-1704 · Diferencia tolerada entre el monto que informa la pasarela y el total de la solicitud (redondeo). */
const TOLERANCIA_MONTO = 0.005;

type FilaSolicitud = Prisma.SolicitudSuscripcionGetPayload<{ include: { plan: true; suscripcion: true } }>;
const CON_PLAN = { plan: true, suscripcion: true } as const;

const noValido = (errores: { campo: string; mensaje: string }[]) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });

/**
 * HU-1703 · Alta de suscripción desde /precios (REQ-083, CP-143, RN-18-2, RN-18-3). El checkout de `/pago` crea una
 * solicitud pendiente con el precio del plan publicado; la pasarela confirma con un webhook firmado (HMAC) y cada evento
 * se procesa una sola vez (`eventoPagoId` único). Con el pago aprobado, una transacción crea la organización vacía, su
 * administrador, la suscripción activa (con el precio pactado) y el lead de origen «Suscripción»; después sale el correo
 * de bienvenida con el enlace para crear la clave. Un pago rechazado solo cierra la solicitud.
 *
 * HU-1704 (REQ-084, REQ-110, CP-144, CP-145, RN-18-9): las pasarelas son intercambiables (`PasarelasService`); el pago
 * se cobra en soles o en dólares, con la pasarela visible y activa que cobra esa moneda. Cada evento aprobado deja un
 * solo `Cobro` (sin datos de tarjeta) y un solo trabajo «emitir comprobante» (`jobId` = id del cobro). Un pago aprobado
 * que no puede crear la cuenta (correo en uso, monto distinto o solicitud ya cerrada) queda como cobro sin alta, para
 * reembolsarlo desde Ventas › Pasarelas.
 */
@Injectable()
export class SuscripcionesService implements OnModuleDestroy {
  private readonly log = new Logger('Suscripciones');
  private readonly ventanas = new Map<string, { inicio: number; cuenta: number }>();
  private cola?: Queue<DatosBienvenida>;
  private colaCobros?: Queue<DatosComprobante>;
  /** El último encolado de la bienvenida y del comprobante (las pruebas lo esperan; la respuesta a la pasarela no). */
  ultimoEncolado: Promise<unknown> = Promise.resolve();

  constructor(private readonly baseDatos: BaseDatosService, private readonly leads: LeadsService, private readonly auth: AuthService, private readonly pasarelas: PasarelasService, private readonly cuotas: CuotasService, private readonly cambios: CambioPlanService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  get colaSuscripciones(): Queue<DatosBienvenida> {
    this.cola ??= new Queue<DatosBienvenida>(COLA_SUSCRIPCIONES, { connection: opcionesRedis(), prefix: prefijoColas() });
    return this.cola;
  }

  get colaComprobantes(): Queue<DatosComprobante> {
    this.colaCobros ??= new Queue<DatosComprobante>(COLA_COMPROBANTES, { connection: opcionesRedis(), prefix: prefijoColas() });
    return this.colaCobros;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.cola?.close(), this.colaCobros?.close()]);
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

  /** Adónde vuelve el visitante desde la página alojada: `/pago` del sitio publicado (el dominio de la versión o `SITIO_URL`, más `SITIO_BASE`). */
  private urlPago(dominio: string | null | undefined, idioma: 'es' | 'en', consulta: Record<string, string>): string {
    const op = opcionesRenderDesdeEnv();
    const origen = dominio ? `https://${dominio}` : op.sitioUrl;
    return `${origen}${op.base}${idioma === 'en' ? '/en' : ''}/pago?${new URLSearchParams(consulta).toString()}`;
  }

  // ── Checkout ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Paso 3 de `/pago`: valida la empresa, toma el precio del plan de la versión publicada en la moneda pedida (soles por
   * defecto), crea la solicitud pendiente y prepara el cobro en la pasarela que cobra esa moneda (HU-1704).
   * 404 si el plan no se publica o es a medida; 409 si el correo ya es de un usuario; 422 si el plan no se cobra en esa
   * moneda; 503 si ninguna pasarela cobra esa moneda; 502 si la pasarela no responde.
   */
  async crearCheckout(entrada: unknown, ip: string, ahora = new Date()): Promise<CheckoutCreadoDto> {
    this.contar(ip, ahora.getTime());
    const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
    const v = await ultimaVersion(this.bd);
    const servidos = v ? planesServidos(v.instantanea, entornoActual()) : null;
    const publico = servidos?.planes.find((p) => p.slug === e.plan);
    if (!servidos || !publico || publico.aMedida) throw new NotFoundException({ codigo: 'PLAN_NO_DISPONIBLE', mensaje: 'Este plan no se puede contratar en línea: elige otro en la página de precios o agenda una demo' });
    const ciclo: Ciclo = e.ciclo === undefined || e.ciclo === '' ? 'MENSUAL' : (e.ciclo as Ciclo);
    const moneda: Moneda = e.moneda === undefined || e.moneda === '' ? 'PEN' : (e.moneda as Moneda);
    const errores = esCiclo(ciclo) ? [] : [{ campo: 'ciclo', mensaje: 'El ciclo es MENSUAL o ANUAL' }];
    if (!esMoneda(moneda)) errores.push({ campo: 'moneda', mensaje: 'La moneda es PEN o USD' });
    const empresa = validarEmpresa(e);
    if (!empresa.ok) errores.push(...empresa.errores);
    if (errores.length || !empresa.ok) throw noValido(errores);
    if (moneda === 'USD' && (publico.precioMesUsd ?? null) === null) throw noValido([{ campo: 'moneda', mensaje: 'Este plan no se cobra en dólares' }]);
    const resumen = resumenCheckout(publico, ciclo, servidos.ajustes.mostrarAnual, moneda);
    if (!resumen) throw noValido([{ campo: 'ciclo', mensaje: 'Este plan no se ofrece con pago anual' }]);
    const { datos } = empresa;
    if (await this.bd.usuario.findUnique({ where: { email: datos.correoAdmin } })) {
      throw new ConflictException({ codigo: 'CORREO_EN_USO', mensaje: 'Ese correo ya tiene una cuenta: inicia sesión en la plataforma o usa otro correo' });
    }
    const config = await this.pasarelas.elegir(moneda);
    if (!config) throw new HttpException({ codigo: 'PAGO_NO_DISPONIBLE', mensaje: 'El pago en línea todavía no está disponible: agenda una demo y te ayudamos a suscribirte' }, HttpStatus.SERVICE_UNAVAILABLE);
    const plan = await this.bd.plan.findUnique({ where: { slug: publico.slug } });
    if (!plan) throw new NotFoundException({ codigo: 'PLAN_NO_DISPONIBLE', mensaje: 'Este plan no se puede contratar en línea' });
    // La atribución del lead (página de entrada, UTM, referente), de mejor esfuerzo como en los leads (REQ-074).
    const lead = validarEnvioLead({ ...e, via: 'suscripcion', correo: datos.correoAdmin, nombre: datos.nombreAdmin, empresa: datos.razonSocial, mensaje: undefined, consentimiento: true, [CAMPO_TRAMPA]: undefined }, `/${BASE_SITIO}`);
    const atribucion: EnvioLead | null = lead.ok && !lead.trampa ? { ...lead.envio, mensaje: `Suscripción al plan ${publico.nombre} (${ciclo === 'ANUAL' ? 'anual' : 'mensual'})` } : null;
    const s = await this.bd.solicitudSuscripcion.create({
      data: {
        planId: plan.id, ciclo, razonSocial: datos.razonSocial, ruc: datos.ruc, tipoComprobante: empresa.tipoComprobante, nombreAdmin: datos.nombreAdmin, correoAdmin: datos.correoAdmin,
        subtotal: resumen.subtotal, igv: resumen.igv, total: resumen.total, moneda, pasarela: config.codigo, atribucion: (atribucion ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
    const idioma = e.idioma === 'en' ? 'en' : 'es';
    const dominio = (v?.instantanea as { sitio?: { dominio?: string | null } } | undefined)?.sitio?.dominio;
    let pago: PagoCreado;
    try {
      pago = await this.pasarelas.adaptador(config.codigo).crearPago(config.modo, {
        solicitudId: s.id, monto: resumen.total, moneda, descripcion: `Aptio SCORM · Plan ${publico.nombre} (${ciclo === 'ANUAL' ? 'anual' : 'mensual'})`, correo: datos.correoAdmin,
        urlExito: this.urlPago(dominio, idioma, { plan: publico.slug, checkout: s.id }), urlCancelado: this.urlPago(dominio, idioma, { plan: publico.slug, cancelado: '1' }),
      });
    } catch (err) {
      await this.bd.solicitudSuscripcion.update({ where: { id: s.id }, data: { estado: 'RECHAZADA', resueltaEn: new Date(), motivoRechazo: 'PASARELA_NO_RESPONDE: no se pudo iniciar el pago' } });
      this.log.error(`La pasarela ${config.codigo} no inició el pago de la solicitud ${s.id}: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException({ codigo: 'PASARELA_NO_RESPONDE', mensaje: 'La pasarela de pago no respondió: intenta de nuevo en unos minutos' });
    }
    if (pago.tipo === 'enviado') throw new Error('Sin token, la pasarela no debe enviar el cargo');
    return { id: s.id, estado: 'PENDIENTE', resumen, tipoComprobante: empresa.tipoComprobante, pasarela: config.codigo, pago };
  }

  async estado(id: string): Promise<EstadoCheckoutDto> {
    const s = await this.bd.solicitudSuscripcion.findUnique({ where: { id }, include: CON_PLAN });
    if (!s) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe' });
    return this.aEstado(s);
  }

  private aEstado(s: FilaSolicitud): EstadoCheckoutDto {
    return {
      id: s.id, estado: s.estado, plan: s.plan.slug, nombrePlan: s.plan.nombre, ciclo: s.ciclo, total: Number(s.total), moneda: s.moneda === 'USD' ? 'USD' : 'PEN', tipoComprobante: s.tipoComprobante, correoAdmin: s.correoAdmin,
      motivoRechazo: s.estado === 'RECHAZADA' ? (s.motivoRechazo ?? 'La pasarela rechazó el pago') : null, finPeriodo: s.suscripcion?.finPeriodo.toISOString() ?? null,
    };
  }

  /**
   * La pasarela de pruebas (solo en `pruebas`): con la tarjeta que aprueba o la que rechaza, arma el evento, lo firma y lo
   * procesa por el mismo camino que el webhook. Otra tarjeta, 422. Nunca se guarda el número, solo los 4 últimos.
   */
  async pagarPrueba(id: string, tarjeta: unknown): Promise<EstadoCheckoutDto> {
    const numero = await this.tarjetaPrueba(tarjeta);
    const s = await this.bd.solicitudSuscripcion.findUnique({ where: { id } });
    if (!s || s.pasarela !== PASARELA_PRUEBA) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe' });
    if (s.estado === 'PENDIENTE') await this.simularPago(s.id, numero, Number(s.total), s.moneda);
    return this.estado(id);
  }

  /** La tarjeta de prueba sin espacios ni guiones; 404 si la pasarela de pruebas no está, 422 si no es de prueba. */
  private async tarjetaPrueba(tarjeta: unknown): Promise<string> {
    const config = await this.pasarelas.config(PASARELA_PRUEBA);
    if (!config || !this.pasarelas.activa(config)) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La pasarela de pruebas no está disponible' });
    const numero = (typeof tarjeta === 'string' ? tarjeta : '').replace(/[\s-]/g, '');
    if (numero !== TARJETAS_PRUEBA.aprobada && numero !== TARJETAS_PRUEBA.rechazada) {
      throw noValido([{ campo: 'tarjeta', mensaje: 'Usa una tarjeta de prueba: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza' }]);
    }
    return numero;
  }

  /** Arma el evento de la pasarela de pruebas, lo firma y lo procesa por el mismo camino que el webhook. */
  private async simularPago(id: string, numero: string, monto: number, moneda: string): Promise<void> {
    const secreto = (this.pasarelas.adaptador(PASARELA_PRUEBA) as PasarelaPruebas).secreto();
    const aprobado = numero === TARJETAS_PRUEBA.aprobada;
    const cuerpo = Buffer.from(JSON.stringify({
      id: `prueba_${id}`, tipo: aprobado ? 'pago.aprobado' : 'pago.rechazado', solicitudId: id, ultimos4: numero.slice(-4), monto, moneda,
      ...(aprobado ? {} : { motivo: 'La tarjeta de prueba fue rechazada' }),
    }));
    await this.recibirWebhook(PASARELA_PRUEBA, cuerpo, { 'x-aptio-firma': firmar(secreto, cuerpo) });
  }

  /** HU-1705 · Pagar una compra de cápsulas adicionales con la pasarela de pruebas (solo en `pruebas`). */
  async pagarPruebaCompra(u: UsuarioSesion, id: string, tarjeta: unknown): Promise<CompraCapsulasDto> {
    const numero = await this.tarjetaPrueba(tarjeta);
    const c = await this.cuotas.buscarCompra(u, id);
    if (c.pasarela !== PASARELA_PRUEBA) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La compra no existe' });
    if (c.estado === 'PENDIENTE') await this.simularPago(c.id, numero, Number(c.montoTotalConIgv), c.moneda);
    return this.cuotas.compra(u, id);
  }

  /** HU-1705 · El token de Culqi Checkout para una compra de cápsulas: la pasarela crea el cargo; se acredita con el webhook. */
  async enviarTokenCompra(u: UsuarioSesion, id: string, token: unknown): Promise<CompraCapsulasDto> {
    const c = await this.cuotas.buscarCompra(u, id);
    if (!esCodigoPasarela(c.pasarela) || CATALOGO_PASARELAS[c.pasarela].flujo !== 'formulario') throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La compra no existe' });
    if (c.estado !== 'PENDIENTE') throw new ConflictException({ codigo: 'PAGO_RESUELTO', mensaje: 'Este pago ya se resolvió' });
    if (typeof token !== 'string' || !token.trim()) throw noValido([{ campo: 'token', mensaje: 'Falta el token de la pasarela' }]);
    const config = await this.pasarelas.config(c.pasarela);
    if (!config || !this.pasarelas.activa(config)) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La pasarela no está disponible' });
    const usuario = await this.bd.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { email: true } });
    try {
      await this.pasarelas.adaptador(config.codigo).crearPago(config.modo, {
        solicitudId: c.id, monto: Number(c.montoTotalConIgv), moneda: c.moneda === 'USD' ? 'USD' : 'PEN', descripcion: `Aptio SCORM · ${c.cantidad} ${c.cantidad === 1 ? 'cápsula adicional' : 'cápsulas adicionales'}`,
        correo: usuario.email, urlExito: '', urlCancelado: '', token: token.trim(),
      });
    } catch (err) {
      const motivo = err instanceof ErrorPasarela ? err.motivo : null;
      throw new HttpException({ codigo: 'PAGO_RECHAZADO', mensaje: motivo ?? 'La pasarela no pudo procesar el pago: revisa la tarjeta o intenta de nuevo' }, HttpStatus.PAYMENT_REQUIRED);
    }
    return this.cuotas.compra(u, id);
  }

  /** HU-1706 · Pagar la diferencia de una subida de plan con la pasarela de pruebas (solo en `pruebas`). */
  async pagarPruebaCambio(u: UsuarioSesion, id: string, tarjeta: unknown): Promise<CambioPlanDto> {
    const numero = await this.tarjetaPrueba(tarjeta);
    const c = await this.cambios.buscarCambio(u, id);
    if (c.pasarela !== PASARELA_PRUEBA) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El cambio de plan no existe' });
    if (c.estado === 'PENDIENTE') await this.simularPago(c.id, numero, Number(c.total), c.moneda);
    return this.cambios.cambio(u, id);
  }

  /** HU-1706 · El token de Culqi Checkout para la diferencia de una subida: la pasarela crea el cargo; se aplica con el webhook. */
  async enviarTokenCambio(u: UsuarioSesion, id: string, token: unknown): Promise<CambioPlanDto> {
    const c = await this.cambios.buscarCambio(u, id);
    if (!esCodigoPasarela(c.pasarela) || CATALOGO_PASARELAS[c.pasarela].flujo !== 'formulario') throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El cambio de plan no existe' });
    if (c.estado !== 'PENDIENTE') throw new ConflictException({ codigo: 'PAGO_RESUELTO', mensaje: 'Este pago ya se resolvió' });
    if (typeof token !== 'string' || !token.trim()) throw noValido([{ campo: 'token', mensaje: 'Falta el token de la pasarela' }]);
    const config = await this.pasarelas.config(c.pasarela);
    if (!config || !this.pasarelas.activa(config)) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La pasarela no está disponible' });
    const usuario = await this.bd.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { email: true } });
    try {
      await this.pasarelas.adaptador(config.codigo).crearPago(config.modo, {
        solicitudId: c.id, monto: Number(c.total), moneda: c.moneda === 'USD' ? 'USD' : 'PEN', descripcion: `Aptio SCORM · Cambio de plan de ${c.planOrigen.nombre} a ${c.planDestino.nombre}`,
        correo: usuario.email, urlExito: '', urlCancelado: '', token: token.trim(),
      });
    } catch (err) {
      const motivo = err instanceof ErrorPasarela ? err.motivo : null;
      throw new HttpException({ codigo: 'PAGO_RECHAZADO', mensaje: motivo ?? 'La pasarela no pudo procesar el pago: revisa la tarjeta o intenta de nuevo' }, HttpStatus.PAYMENT_REQUIRED);
    }
    return this.cambios.cambio(u, id);
  }

  /**
   * HU-1704 · El token de un solo uso del formulario incrustado de la pasarela (Culqi Checkout): con él, la pasarela crea
   * el cargo. La solicitud sigue pendiente hasta que llegue el webhook firmado (RN-18-3). 404 si el pago no existe o su
   * pasarela no usa formulario; 409 si ya no está pendiente; 402 si la pasarela rechaza el cargo al crearlo.
   */
  async enviarToken(id: string, token: unknown): Promise<EstadoCheckoutDto> {
    const s = await this.bd.solicitudSuscripcion.findUnique({ where: { id } });
    if (!s || !esCodigoPasarela(s.pasarela) || CATALOGO_PASARELAS[s.pasarela].flujo !== 'formulario') throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe' });
    if (s.estado !== 'PENDIENTE') throw new ConflictException({ codigo: 'PAGO_RESUELTO', mensaje: 'Este pago ya se resolvió' });
    if (typeof token !== 'string' || !token.trim()) throw noValido([{ campo: 'token', mensaje: 'Falta el token de la pasarela' }]);
    const config = await this.pasarelas.config(s.pasarela);
    if (!config || !this.pasarelas.activa(config)) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La pasarela no está disponible' });
    const plan = await this.bd.plan.findUnique({ where: { id: s.planId } });
    try {
      await this.pasarelas.adaptador(config.codigo).crearPago(config.modo, {
        solicitudId: s.id, monto: Number(s.total), moneda: s.moneda === 'USD' ? 'USD' : 'PEN', descripcion: `Aptio SCORM · Plan ${plan?.nombre ?? ''} (${s.ciclo === 'ANUAL' ? 'anual' : 'mensual'})`,
        correo: s.correoAdmin, urlExito: '', urlCancelado: '', token: token.trim(),
      });
    } catch (err) {
      const motivo = err instanceof ErrorPasarela ? err.motivo : null;
      throw new HttpException({ codigo: 'PAGO_RECHAZADO', mensaje: motivo ?? 'La pasarela no pudo procesar el pago: revisa la tarjeta o intenta de nuevo' }, HttpStatus.PAYMENT_REQUIRED);
    }
    return this.estado(id);
  }

  // ── Webhook ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * `POST /webhooks/pago/{pasarela}`: 404 si la pasarela no existe o no está activa aquí; 401 si la firma no coincide (no
   * cambia nada, CP-145); 422 si el evento no se entiende; 200 con `ignorado` si no es un evento de pago.
   */
  async recibirWebhook(pasarela: string, cuerpo: Buffer | undefined, cabeceras: Cabeceras, ahora = new Date()): Promise<WebhookRecibidoDto> {
    const config = await this.pasarelas.config(pasarela);
    if (!config || !this.pasarelas.activa(config)) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'Pasarela desconocida' });
    const adaptador = this.pasarelas.adaptador(config.codigo);
    const crudo = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.alloc(0);
    if (!adaptador.verificarFirmaWebhook(config.modo, crudo, cabeceras, ahora)) {
      await this.bd.auditoria.create({ data: { organizacionId: null, usuarioId: null, accion: 'PAGO_FIRMA_NO_VALIDA', entidad: 'SolicitudSuscripcion', entidadId: null, datos: { pasarela: config.codigo } } });
      throw new UnauthorizedException({ codigo: 'FIRMA_NO_VALIDA', mensaje: 'La firma del evento no coincide' });
    }
    const leido = adaptador.leerEvento(crudo);
    if (leido.tipo === 'ignorado') return { recibido: true, duplicado: false, ignorado: true };
    if (leido.tipo === 'invalido') throw new UnprocessableEntityException({ codigo: 'EVENTO_NO_VALIDO', mensaje: 'El evento no tiene la forma esperada' });
    return this.procesar(config.codigo, leido.evento, ahora);
  }

  /**
   * RN-18-3 · Un evento se procesa una sola vez: si su id ya resolvió una solicitud o ya dejó un cobro, responde 200 sin
   * crear nada. El alta aprobada va en una sola transacción con su `Cobro` (HU-1704, CP-144): dos entregas simultáneas
   * del mismo evento chocan con el `eventoPagoId` único y la segunda es un repetido. Un pago aprobado que no puede crear
   * la cuenta deja igual su cobro (sin suscripción), para reembolsarlo.
   */
  private async procesar(pasarela: string, ev: EventoPago, ahora: Date): Promise<WebhookRecibidoDto> {
    type Alta = { lead: Awaited<ReturnType<LeadsService['guardarEnTransaccion']>> | null; envio: EnvioLead | null; token: string; solicitudId: string };
    let alta: Alta | null = null;
    let cobroId: string | null = null;
    let duplicado = false;
    try {
      duplicado = await this.bd.$transaction(async (tx) => {
        if (await tx.solicitudSuscripcion.findUnique({ where: { eventoPagoId: ev.eventoId } })) return true;
        if (await tx.cobro.findUnique({ where: { eventoPagoId: ev.eventoId } })) return true;
        if (await tx.compraCapsulas.findUnique({ where: { eventoPagoId: ev.eventoId } })) return true;
        if (await tx.cambioPlan.findUnique({ where: { eventoPagoId: ev.eventoId } })) return true;
        const s = await tx.solicitudSuscripcion.findUnique({ where: { id: ev.solicitudId } });
        if (!s) {
          // HU-1705 · El mismo webhook acredita las compras de cápsulas adicionales (su id va donde iría el de la solicitud).
          const compra = await tx.compraCapsulas.findUnique({ where: { id: ev.solicitudId } });
          if (!compra) {
            // HU-1706 · …y aplica las subidas de plan con su diferencia prorrateada.
            const cambio = await tx.cambioPlan.findUnique({ where: { id: ev.solicitudId } });
            if (!cambio || cambio.pasarela !== pasarela) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe' });
            const r = await this.cambios.procesarCambio(tx, cambio, pasarela, ev);
            cobroId = r.cobroId;
            return r.duplicado;
          }
          if (compra.pasarela !== pasarela) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe' });
          const r = await this.cuotas.procesarCompra(tx, compra, pasarela, ev, ahora);
          cobroId = r.cobroId;
          return r.duplicado;
        }
        if (s.pasarela !== pasarela) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe' });
        const aprobado = ev.resultado === 'aprobado';
        /** El cobro de un pago aprobado, con o sin alta. Sin datos de tarjeta: la referencia y los 4 últimos (REQ-110). */
        const cobrar = async (suscripcionId: string | null) => {
          const c = await tx.cobro.create({
            data: {
              solicitudSuscripcionId: s.id, suscripcionId, eventoPagoId: ev.eventoId, monto: ev.monto ?? Number(s.total), moneda: ev.moneda ?? s.moneda, pasarela,
              tokenPago: ev.referencia ?? null, ultimos4Digitos: ev.ultimos4,
            },
          });
          cobroId = c.id;
          return c;
        };
        const sinAlta = async (accion: string, datos: Record<string, Prisma.InputJsonValue | null>) => {
          const c = await cobrar(null);
          await tx.auditoria.create({ data: { organizacionId: null, usuarioId: null, accion, entidad: 'SolicitudSuscripcion', entidadId: s.id, datos: { ...datos, pasarela, eventoId: ev.eventoId, cobroId: c.id } } });
        };
        const cambio = await tx.solicitudSuscripcion.updateMany({
          where: { id: s.id, estado: 'PENDIENTE' },
          data: { estado: aprobado ? 'APROBADA' : 'RECHAZADA', eventoPagoId: ev.eventoId, resueltaEn: ahora, motivoRechazo: aprobado ? null : (ev.motivo ?? 'La pasarela rechazó el pago') },
        });
        if (cambio.count === 0) {
          // La solicitud ya se resolvió con otro evento. Si este trae un pago aprobado distinto, el dinero entró igual:
          // queda como cobro sin alta para reembolsarlo (un evento repetido choca con el `eventoPagoId` único).
          const fresca = await tx.solicitudSuscripcion.findUnique({ where: { id: s.id } });
          if (!aprobado || fresca?.eventoPagoId === ev.eventoId) return true;
          await sinAlta('PAGO_SIN_SOLICITUD_PENDIENTE', { estadoSolicitud: fresca?.estado ?? null });
          return false;
        }
        if (!aprobado) {
          await tx.auditoria.create({ data: { organizacionId: null, usuarioId: null, accion: 'PAGO_RECHAZADO', entidad: 'SolicitudSuscripcion', entidadId: s.id, datos: { pasarela, eventoId: ev.eventoId } } });
          return false;
        }
        // HU-1704 · El monto y la moneda cobrados deben ser los de la solicitud: si no, el pago queda sin alta.
        const montoDistinto = (ev.monto != null && Math.abs(ev.monto - Number(s.total)) > TOLERANCIA_MONTO) || (ev.moneda != null && ev.moneda !== s.moneda);
        if (montoDistinto) {
          await tx.solicitudSuscripcion.update({ where: { id: s.id }, data: { motivoRechazo: `MONTO_NO_COINCIDE: la pasarela cobró ${ev.monto ?? '?'} ${ev.moneda ?? ''} y se esperaba ${Number(s.total)} ${s.moneda}`.trim() } });
          await sinAlta('PAGO_MONTO_NO_COINCIDE', { esperado: Number(s.total), monedaEsperada: s.moneda, cobrado: ev.monto ?? null, monedaCobrada: ev.moneda ?? null });
          return false;
        }
        // Si el correo pasó a ser de un usuario mientras se pagaba, el pago queda aprobado sin alta para revisarlo a mano.
        if (await tx.usuario.findUnique({ where: { email: s.correoAdmin } })) {
          await tx.solicitudSuscripcion.update({ where: { id: s.id }, data: { motivoRechazo: 'CORREO_EN_USO: el pago se aprobó pero el correo ya tenía una cuenta' } });
          await sinAlta('SUSCRIPCION_SIN_ALTA', { motivo: 'CORREO_EN_USO' });
          return false;
        }
        const org = await tx.organizacion.create({ data: { nombre: s.razonSocial, slug: slugOrganizacion(s.razonSocial, s.id.slice(0, 8)), ruc: s.ruc } });
        const admin = await tx.usuario.create({ data: { email: s.correoAdmin, nombre: s.nombreAdmin, rol: 'ADMINISTRADOR', organizacionId: org.id } });
        const { token, hashToken } = nuevoToken();
        await tx.tokenAcceso.create({ data: { usuarioId: admin.id, tipo: 'INVITACION', hashToken, expira: new Date(ahora.getTime() + VIGENCIA_BIENVENIDA_MS) } });
        const suscripcion = await tx.suscripcion.create({
          data: {
            organizacionId: org.id, planId: s.planId, ciclo: s.ciclo, precioPactadoSinIgv: Number(s.subtotal), moneda: s.moneda, estado: 'ACTIVA', inicioPeriodo: ahora,
            finPeriodo: finPeriodo(ahora, s.ciclo), pasarela, ultimos4Digitos: ev.ultimos4, solicitudId: s.id,
          },
        });
        const cobro = await cobrar(suscripcion.id);
        await tx.solicitudSuscripcion.update({ where: { id: s.id }, data: { organizacionId: org.id } });
        const envio = (s.atribucion && typeof s.atribucion === 'object' && 'correo' in s.atribucion ? s.atribucion : null) as unknown as EnvioLead | null;
        const lead = envio ? await this.leads.guardarEnTransaccion(tx, envio, ahora, 'GANADO') : null;
        await tx.auditoria.create({
          data: {
            organizacionId: org.id, usuarioId: null, accion: 'SUSCRIPCION_CREADA', entidad: 'Suscripcion', entidadId: s.id,
            datos: { pasarela, eventoId: ev.eventoId, planId: s.planId, ciclo: s.ciclo, total: Number(s.total), moneda: s.moneda, adminId: admin.id, cobroId: cobro.id },
          },
        });
        alta = { lead, envio, token, solicitudId: s.id };
        return false;
      });
    } catch (e) {
      // Dos entregas del mismo evento a la vez: la segunda choca con el `eventoPagoId` único y es un repetido.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { recibido: true, duplicado: true };
      throw e;
    }
    const tareas: Promise<unknown>[] = [];
    const hecho = alta as Alta | null;
    if (hecho) {
      if (hecho.lead && hecho.envio) this.leads.trasGuardar(hecho.lead.lead, hecho.lead.nuevo, hecho.envio);
      const datos: DatosBienvenida = { solicitudId: hecho.solicitudId, enlace: this.auth.enlace(hecho.token) };
      tareas.push(this.colaSuscripciones.add(TAREA_BIENVENIDA, datos, opcionesTareaBienvenida(hecho.solicitudId))
        .catch((e: unknown) => this.log.error(`No se pudo encolar la bienvenida de la solicitud ${hecho.solicitudId}: ${e instanceof Error ? e.message : String(e)}`)));
    }
    const cobro = cobroId as string | null;
    if (cobro) {
      // HU-1704 · Un trabajo «emitir comprobante» por cobro (`jobId` = id del cobro); lo emite el worker (HU-1707).
      tareas.push(this.colaComprobantes.add(TAREA_EMITIR_COMPROBANTE, { cobroId: cobro }, opcionesTareaComprobante(cobro))
        .catch((e: unknown) => this.log.error(`No se pudo encolar el comprobante del cobro ${cobro}: ${e instanceof Error ? e.message : String(e)}`)));
    }
    if (tareas.length) this.ultimoEncolado = Promise.all(tareas);
    return { recibido: true, duplicado };
  }
}
