/**
 * HU-1708 · Cobranza y suspensión (REQ-088, CP-150, RN-18-8, PNT-36). El calendario y la suspensión los lleva el worker
 * (`renovar-suscripciones`); aquí:
 *
 * - `estado`: el aviso global de cobranza para cualquier usuario de la organización;
 * - `pagar`: «Pagar ahora» del administrador, con la pasarela de la suscripción (se aplica con el webhook firmado);
 * - `listar` y `reintentar`: Ventas › Suscripciones del superadmin, con auditoría;
 * - `suspendida`: lo que consulta la guarda de solo lectura.
 */
import { BadGatewayException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, type OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { COLA_SUSCRIPCIONES, type DatosIntentoRenovacion, opcionesRedis, opcionesTareaIntento, prefijoColas, TAREA_INTENTO_RENOVACION } from '@aptio/colas';
import type { Prisma } from '@aptio/db';
import { Queue } from 'bullmq';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { CambioPlanService } from './cambio-plan.service.js';
import { aRenovacionDto, type FilaRenovacion, renovacionAbierta } from './cobranza.comun.js';
import type { CobranzaOrgDto, PagoRenovacionDto, ReintentoRenovacionDto, SuscripcionesVentasDto, SuscripcionVentasDto } from './cobranza.dto.js';
import { CuotasService } from './cuotas.service.js';
import type { PagoCreado } from './pasarelas/contrato.js';
import { PasarelasService } from './pasarelas.service.js';

export const RUTA_REGULARIZAR = '/plan';
const CON_TODO = { organizacion: true, plan: true } as const;
type FilaVentas = Prisma.SuscripcionGetPayload<{ include: typeof CON_TODO }>;
const conPago = (estado: string) => estado === 'PAGO_PENDIENTE' || estado === 'SUSPENDIDA';

@Injectable()
export class CobranzaService implements OnModuleDestroy {
  private readonly log = new Logger('Cobranza');
  private cola?: Queue<DatosIntentoRenovacion>;

  constructor(private readonly baseDatos: BaseDatosService, private readonly cuotas: CuotasService, private readonly pasarelas: PasarelasService, private readonly cambios: CambioPlanService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  get colaSuscripciones(): Queue<DatosIntentoRenovacion> {
    this.cola ??= new Queue<DatosIntentoRenovacion>(COLA_SUSCRIPCIONES, { connection: opcionesRedis(), prefix: prefijoColas() });
    return this.cola;
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola?.close();
  }

  /** La guarda de solo lectura: si la organización está suspendida, lo que necesita el 403 para regularizar. */
  async suspendida(organizacionId: string): Promise<{ renovacionId: string | null; total: number | null; moneda: string | null } | null> {
    const s = await this.bd.suscripcion.findUnique({ where: { organizacionId }, select: { id: true, estado: true } });
    if (s?.estado !== 'SUSPENDIDA') return null;
    const r = await renovacionAbierta(this.bd, s.id);
    return { renovacionId: r?.id ?? null, total: r ? Number(r.total) : null, moneda: r?.moneda ?? null };
  }

  /** `GET /organizacion/cobranza`: el aviso global (PNT-36). Sin suscripción, o el superadmin: al día. */
  async estado(u: UsuarioSesion): Promise<CobranzaOrgDto> {
    const alDia: CobranzaOrgDto = { estado: 'AL_DIA', total: null, moneda: null, finPeriodo: null, suspensionEn: null, puedePagar: false, regularizar: RUTA_REGULARIZAR };
    if (!u.organizacionId) return alDia;
    const s = await this.bd.suscripcion.findUnique({ where: { organizacionId: u.organizacionId } });
    if (!s || !conPago(s.estado) || s.cancelarAlFin) return alDia;
    const r = await renovacionAbierta(this.bd, s.id);
    const dto = r ? aRenovacionDto(r) : null;
    return {
      estado: s.estado === 'SUSPENDIDA' ? 'SUSPENDIDA' : 'PAGO_PENDIENTE', total: dto?.total ?? null, moneda: dto?.moneda ?? null, finPeriodo: s.finPeriodo.toISOString(),
      suspensionEn: dto?.suspensionEn ?? null, puedePagar: u.rol === 'ADMINISTRADOR', regularizar: RUTA_REGULARIZAR,
    };
  }

  /** La renovación abierta de la organización del administrador (409 si no hay pago pendiente). */
  async buscarRenovacion(u: UsuarioSesion): Promise<{ suscripcion: Prisma.SuscripcionGetPayload<{ include: { plan: true } }>; renovacion: FilaRenovacion }> {
    const s = await this.bd.suscripcion.findUnique({ where: { organizacionId: organizacionDe(u) }, include: { plan: true } });
    if (!s) throw new NotFoundException({ codigo: 'SIN_SUSCRIPCION', mensaje: 'Tu organización no tiene una suscripción' });
    const r = conPago(s.estado) ? await renovacionAbierta(this.bd, s.id) : null;
    if (!r) throw new ConflictException({ codigo: 'SIN_PAGO_PENDIENTE', mensaje: 'No hay una renovación por pagar' });
    return { suscripcion: s, renovacion: r };
  }

  async pagoDto(u: UsuarioSesion, renovacionId: string, pago?: PagoCreado): Promise<PagoRenovacionDto> {
    const r = await this.bd.renovacion.findUniqueOrThrow({ where: { id: renovacionId }, include: { plan: true } });
    return { renovacion: aRenovacionDto(r), ...(pago && pago.tipo !== 'enviado' ? { pago } : {}), suscripcion: await this.cambios.suscripcion(u) };
  }

  private urlConsola(consulta: Record<string, string>): string {
    return `${process.env.WEB_URL ?? 'http://localhost:5173'}${RUTA_REGULARIZAR}?${new URLSearchParams(consulta).toString()}`;
  }

  /**
   * `POST /organizacion/suscripcion/renovacion/pago`: «Pagar ahora». Prepara el cobro del total de la renovación en la
   * pasarela de la suscripción (o la primera que cobre su moneda); se aplica con el webhook firmado (RN-18-3).
   */
  async pagar(u: UsuarioSesion): Promise<PagoRenovacionDto> {
    const { suscripcion: s, renovacion: r } = await this.buscarRenovacion(u);
    const config = await this.cuotas.pasarelaPara(s);
    if (!config) throw new HttpException({ codigo: 'PAGO_NO_DISPONIBLE', mensaje: 'El pago en línea no está disponible ahora: escríbenos para regularizar tu cuenta' }, HttpStatus.SERVICE_UNAVAILABLE);
    const usuario = await this.bd.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { email: true } });
    await this.bd.$transaction(async (tx) => {
      if (r.pasarela !== config.codigo) await tx.renovacion.update({ where: { id: r.id }, data: { pasarela: config.codigo } });
      await tx.auditoria.create({ data: { organizacionId: s.organizacionId, usuarioId: u.id, accion: 'RENOVACION_PAGO_INICIADO', entidad: 'Renovacion', entidadId: r.id, datos: { total: Number(r.total), moneda: r.moneda, pasarela: config.codigo } } });
    });
    let pago: PagoCreado;
    try {
      pago = await this.pasarelas.adaptador(config.codigo).crearPago(config.modo, {
        solicitudId: r.id, monto: Number(r.total), moneda: r.moneda === 'USD' ? 'USD' : 'PEN', descripcion: `Aptio SCORM · Renovación ${r.plan.nombre} (${s.ciclo === 'ANUAL' ? 'anual' : 'mensual'})`,
        correo: usuario.email, urlExito: this.urlConsola({ renovacion: r.id }), urlCancelado: this.urlConsola({ renovacion: r.id, cancelado: '1' }),
      });
    } catch (err) {
      this.log.error(`La pasarela ${config.codigo} no inició el pago de la renovación ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException({ codigo: 'PASARELA_NO_RESPONDE', mensaje: 'La pasarela de pago no respondió: intenta de nuevo en unos minutos' });
    }
    return this.pagoDto(u, r.id, pago);
  }

  // ── Ventas › Suscripciones (superadmin) ─────────────────────────────────────────────────────────────────────────

  private async ventasDto(s: FilaVentas): Promise<SuscripcionVentasDto> {
    const r = conPago(s.estado) ? await renovacionAbierta(this.bd, s.id) : null;
    return {
      id: s.id, organizacion: { id: s.organizacion.id, nombre: s.organizacion.nombre }, plan: { slug: s.plan.slug, nombre: s.plan.nombre, capsulasMes: s.plan.capsulasMes },
      ciclo: s.ciclo, estado: s.estado, finPeriodo: s.finPeriodo.toISOString(), pasarela: s.pasarela, ultimos4Digitos: s.ultimos4Digitos,
      renovacion: r ? aRenovacionDto(r) : null, reintentable: Boolean(r) && !s.cancelarAlFin,
    };
  }

  /** `GET /ventas/suscripciones`: las 200 que vencen antes primero (con el filtro por estado). */
  async listar(f: { estado?: SuscripcionVentasDto['estado'] | undefined }): Promise<SuscripcionesVentasDto> {
    const filas = await this.bd.suscripcion.findMany({ where: f.estado ? { estado: f.estado } : {}, include: CON_TODO, orderBy: { finPeriodo: 'asc' }, take: 200 });
    return { suscripciones: await Promise.all(filas.map((s) => this.ventasDto(s))) };
  }

  /**
   * `POST /ventas/suscripciones/{id}/reintentar`: «Reintentar ahora». Encola un intento fuera del calendario (con
   * pruebas cobra con la tarjeta guardada; con Stripe o Culqi manda otra vez el enlace) y lo audita.
   */
  async reintentar(u: UsuarioSesion, id: string, ahora = new Date()): Promise<ReintentoRenovacionDto> {
    const s = await this.bd.suscripcion.findUnique({ where: { id }, include: CON_TODO });
    if (!s) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La suscripción no existe' });
    const r = conPago(s.estado) && !s.cancelarAlFin ? await renovacionAbierta(this.bd, s.id) : null;
    if (!r) throw new ConflictException({ codigo: 'SIN_PAGO_PENDIENTE', mensaje: 'Esta suscripción no tiene una renovación por cobrar' });
    try {
      await this.colaSuscripciones.add(TAREA_INTENTO_RENOVACION, { renovacionId: r.id, pedidoPorId: u.id }, opcionesTareaIntento(r.id, ahora.getTime()));
    } catch (e) {
      this.log.error(`No se pudo encolar el intento de la renovación ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableException({ codigo: 'COLA_NO_DISPONIBLE', mensaje: 'No se pudo encolar el intento: vuelve a intentarlo en unos minutos' });
    }
    await this.bd.auditoria.create({
      data: { organizacionId: s.organizacionId, usuarioId: u.id, accion: 'RENOVACION_REINTENTO_PEDIDO', entidad: 'Renovacion', entidadId: r.id, datos: { suscripcionId: s.id, pasarela: r.pasarela, intentos: r.intentos } },
    });
    return { suscripcion: await this.ventasDto(s), encolado: true };
  }
}
