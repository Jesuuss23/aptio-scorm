/**
 * HU-1706 · Cambio de plan y cancelación (REQ-086, CP-147, RN-18-7, RN-18-2). Solo el ADMINISTRADOR, con auditoría.
 *
 * - `suscripcion`: el plan actual, el período, la cancelación y la bajada programada, con los planes publicados.
 * - `cambiar`: vista previa con el prorrateo por día; al confirmar, una **subida** crea el `CambioPlan` pendiente y el
 *   pago de la diferencia en la pasarela de la suscripción (se aplica con el webhook firmado: `procesarCambio`); una
 *   **bajada** queda programada para la renovación, sin cobro ni devolución.
 * - `cancelar` y `reanudar`: la cancelación rige al fin del período pagado; una tarea retrasada de la cola
 *   `suscripciones` la pasa a CANCELADA. Reanudar quita la cancelación, la bajada programada y la tarea.
 */
import { BadGatewayException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, type OnModuleDestroy, UnprocessableEntityException } from '@nestjs/common';
import { COLA_SUSCRIPCIONES, type DatosVencerSuscripcion, idTareaVencer, opcionesRedis, opcionesTareaVencer, prefijoColas, TAREA_VENCER_SUSCRIPCION } from '@aptio/colas';
import { type Prisma, ultimaVersion } from '@aptio/db';
import { diasDelPeriodo, prorrateo, type TipoCambio, validarCambio } from '@aptio/schema/cambio-plan';
import type { PlanPublico } from '@aptio/schema/planes';
import { planesServidos } from '@aptio/schema/sitio-versiones';
import type { EventoPago, Moneda } from '@aptio/schema/suscripciones';
import { Queue } from 'bullmq';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { entornoActual } from '../sitio/entorno-sitio.js';
import type { CambioPlanDto, PlanBreveDto, PlanOpcionDto, SuscripcionOrgDto } from './cambio-plan.dto.js';
import { CuotasService, estaCancelada } from './cuotas.service.js';
import type { PagoCreado } from './pasarelas/contrato.js';
import { PasarelasService } from './pasarelas.service.js';

type Tx = Prisma.TransactionClient;
const TOLERANCIA_MONTO = 0.005;
const CON_PLANES = { plan: true, planProgramado: true } as const;
type FilaSuscripcion = Prisma.SuscripcionGetPayload<{ include: typeof CON_PLANES }>;
const CON_CAMBIO = { planOrigen: true, planDestino: true } as const;
type FilaCambio = Prisma.CambioPlanGetPayload<{ include: typeof CON_CAMBIO }>;
type FilaPlan = { slug: string; nombre: string; capsulasMes: number | null };

const moneda = (m: string): Moneda => (m === 'USD' ? 'USD' : 'PEN');
const breve = (p: FilaPlan): PlanBreveDto => ({ slug: p.slug, nombre: p.nombre, capsulasMes: p.capsulasMes });
const noValido = (campo: string, mensaje: string) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje, detalles: [{ campo, mensaje }] });

/** El precio publicado de un plan por el ciclo y la moneda de la suscripción, sin IGV (null si no se cobra así). */
function precioCiclo(p: PlanPublico, ciclo: string, mon: Moneda): number | null {
  if (p.aMedida) return null;
  if (ciclo === 'ANUAL') return mon === 'USD' ? p.precioAnualUsd : p.precioAnual;
  return mon === 'USD' ? p.precioMesUsd : p.precioMes;
}

/** Lo que devuelve el webhook al procesar el pago de un cambio: si era repetido y el cobro que dejó. */
export interface ResultadoCambio { duplicado: boolean; cobroId: string | null }

@Injectable()
export class CambioPlanService implements OnModuleDestroy {
  private readonly log = new Logger('CambioPlan');
  private cola?: Queue<DatosVencerSuscripcion>;

  constructor(private readonly baseDatos: BaseDatosService, private readonly cuotas: CuotasService, private readonly pasarelas: PasarelasService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  get colaSuscripciones(): Queue<DatosVencerSuscripcion> {
    this.cola ??= new Queue<DatosVencerSuscripcion>(COLA_SUSCRIPCIONES, { connection: opcionesRedis(), prefix: prefijoColas() });
    return this.cola;
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola?.close();
  }

  private async fila(organizacionId: string): Promise<FilaSuscripcion> {
    const s = await this.bd.suscripcion.findUnique({ where: { organizacionId }, include: CON_PLANES });
    if (!s) throw new NotFoundException({ codigo: 'SIN_SUSCRIPCION', mensaje: 'Tu organización no tiene una suscripción' });
    return s;
  }

  /** Los planes de la versión publicada (los ficticios no cuentan en producción). */
  private async publicados(): Promise<PlanPublico[]> {
    const v = await ultimaVersion(this.bd);
    return (v ? planesServidos(v.instantanea, entornoActual())?.planes : null) ?? [];
  }

  private async suscripcionDto(s: FilaSuscripcion, ahora: Date): Promise<SuscripcionOrgDto> {
    const mon = moneda(s.moneda);
    const publicados = await this.publicados();
    const planes: PlanOpcionDto[] = publicados.map((p) => {
      const precio = precioCiclo(p, s.ciclo, mon);
      const actual = p.slug === s.plan.slug;
      return { slug: p.slug, nombre: p.nombre, capsulasMes: p.capsulasMes, precioCiclo: precio, actual, tipo: actual || precio === null ? null : precio > s.precioPactadoSinIgv ? 'SUBIDA' : 'BAJADA' };
    });
    return {
      plan: breve(s.plan), ciclo: s.ciclo, precioPactadoSinIgv: s.precioPactadoSinIgv, moneda: mon, estado: estaCancelada(s, ahora) ? 'CANCELADA' : 'ACTIVA',
      inicioPeriodo: s.inicioPeriodo.toISOString(), finPeriodo: s.finPeriodo.toISOString(), cancelarAlFin: s.cancelarAlFin, canceladaEn: s.canceladaEn?.toISOString() ?? null,
      planProgramado: s.planProgramado ? breve(s.planProgramado) : null, planes, pagoDisponible: Boolean(await this.cuotas.pasarelaPara(s)),
    };
  }

  /** `GET /organizacion/suscripcion`. */
  async suscripcion(u: UsuarioSesion, ahora = new Date()): Promise<SuscripcionOrgDto> {
    return this.suscripcionDto(await this.fila(organizacionDe(u)), ahora);
  }

  private auditar(tx: Tx, organizacionId: string, usuarioId: string | null, accion: string, entidadId: string, datos: Record<string, Prisma.InputJsonValue | null>) {
    return tx.auditoria.create({ data: { organizacionId, usuarioId, accion, entidad: 'Suscripcion', entidadId, datos } });
  }

  private urlConsola(consulta: Record<string, string>): string {
    return `${process.env.WEB_URL ?? 'http://localhost:5173'}/plan?${new URLSearchParams(consulta).toString()}`;
  }

  /**
   * `POST /organizacion/suscripcion/cambio`. Sin `confirmar`, la vista previa. Confirmada una bajada, se programa para la
   * renovación; confirmada una subida, se crea el cambio pendiente y el pago de la diferencia. 422 si el plan no se puede
   * elegir; 409 PERIODO_VENCIDO si el período ya terminó (la renovación llega con la HU-1708); 503 sin pasarela.
   */
  async cambiar(u: UsuarioSesion, entrada: unknown, ahora = new Date()): Promise<CambioPlanDto> {
    const organizacionId = organizacionDe(u);
    const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
    if (typeof e.plan !== 'string' || !e.plan) throw noValido('plan', 'Elige un plan');
    if (e.confirmar !== undefined && typeof e.confirmar !== 'boolean') throw noValido('confirmar', 'confirmar es verdadero o falso');
    const s = await this.fila(organizacionId);
    const mon = moneda(s.moneda);
    const publico = (await this.publicados()).find((p) => p.slug === e.plan) ?? null;
    const destino = publico ? await this.bd.plan.findUnique({ where: { slug: publico.slug } }) : null;
    const valido = validarCambio(
      { planId: s.planId, ciclo: s.ciclo, moneda: mon, precioPactadoSinIgv: s.precioPactadoSinIgv, estado: estaCancelada(s, ahora) ? 'CANCELADA' : s.estado, cancelarAlFin: s.cancelarAlFin },
      publico && destino ? { id: destino.id, visible: true, aMedida: publico.aMedida, precioCiclo: precioCiclo(publico, s.ciclo, mon) } : null,
    );
    if (!valido.ok) {
      const err = valido.errores[0]!;
      if (err.campo === 'suscripcion') throw new UnprocessableEntityException({ codigo: 'SUSCRIPCION_CANCELADA', mensaje: err.mensaje });
      throw noValido(err.campo, err.mensaje);
    }
    const dias = diasDelPeriodo(s.inicioPeriodo, s.finPeriodo, ahora);
    if (dias.diasRestantes === 0) throw new ConflictException({ codigo: 'PERIODO_VENCIDO', mensaje: 'Tu período ya terminó: el cambio de plan se hará al renovar' });
    const tipo: TipoCambio = valido.tipo;
    const p = prorrateo(s.precioPactadoSinIgv, valido.precioNuevo, dias.diasRestantes, dias.diasPeriodo, mon);
    const base = {
      tipo, planOrigen: breve(s.plan), planDestino: breve(destino!), ciclo: s.ciclo, precioNuevoSinIgv: valido.precioNuevo, diasRestantes: p.diasRestantes, diasPeriodo: p.diasPeriodo,
      diferenciaSinIgv: p.diferenciaSinIgv, igv: p.igv, total: p.total, moneda: mon, rigeDesde: (tipo === 'SUBIDA' ? ahora : s.finPeriodo).toISOString(), motivoRechazo: null,
    };
    if (!e.confirmar) return { ...base, id: null, estado: 'VISTA_PREVIA', pasarela: null, suscripcion: await this.suscripcionDto(s, ahora) };

    if (tipo === 'BAJADA') {
      await this.bd.$transaction(async (tx) => {
        await tx.suscripcion.update({ where: { id: s.id }, data: { planProgramadoId: destino!.id } });
        await this.auditar(tx, organizacionId, u.id, 'PLAN_CAMBIO_PROGRAMADO', s.id, { planOrigenId: s.planId, planDestinoId: destino!.id, rigeDesde: s.finPeriodo.toISOString() });
      });
      return { ...base, id: null, estado: 'PROGRAMADO', pasarela: null, suscripcion: await this.suscripcion(u, ahora) };
    }

    const config = await this.cuotas.pasarelaPara(s);
    if (!config) throw new HttpException({ codigo: 'PAGO_NO_DISPONIBLE', mensaje: 'El pago en línea no está disponible ahora: escríbenos para cambiar de plan' }, HttpStatus.SERVICE_UNAVAILABLE);
    const usuario = await this.bd.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { email: true } });
    const cambio = await this.bd.$transaction(async (tx) => {
      const c = await tx.cambioPlan.create({
        data: {
          organizacionId, suscripcionId: s.id, planOrigenId: s.planId, planDestinoId: destino!.id, ciclo: s.ciclo, precioNuevoSinIgv: valido.precioNuevo, diasRestantes: p.diasRestantes,
          diasPeriodo: p.diasPeriodo, diferenciaSinIgv: p.diferenciaSinIgv, igv: p.igv, total: p.total, moneda: mon, pasarela: config.codigo, pedidoPorId: u.id,
        },
        include: CON_CAMBIO,
      });
      await tx.auditoria.create({
        data: { organizacionId, usuarioId: u.id, accion: 'PLAN_CAMBIO_INICIADO', entidad: 'CambioPlan', entidadId: c.id, datos: { planOrigenId: s.planId, planDestinoId: destino!.id, total: p.total, moneda: mon, pasarela: config.codigo } },
      });
      return c;
    });
    let pago: PagoCreado;
    try {
      pago = await this.pasarelas.adaptador(config.codigo).crearPago(config.modo, {
        solicitudId: cambio.id, monto: p.total, moneda: mon, descripcion: `Aptio SCORM · Cambio de plan de ${s.plan.nombre} a ${destino!.nombre} (${p.diasRestantes} de ${p.diasPeriodo} días)`,
        correo: usuario.email, urlExito: this.urlConsola({ cambio: cambio.id }), urlCancelado: this.urlConsola({ cambio: cambio.id, cancelado: '1' }),
      });
    } catch (err) {
      await this.bd.cambioPlan.update({ where: { id: cambio.id }, data: { estado: 'RECHAZADO', motivoRechazo: 'PASARELA_NO_RESPONDE: no se pudo iniciar el pago' } });
      this.log.error(`La pasarela ${config.codigo} no inició el pago del cambio ${cambio.id}: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException({ codigo: 'PASARELA_NO_RESPONDE', mensaje: 'La pasarela de pago no respondió: intenta de nuevo en unos minutos' });
    }
    return this.cambioDto(u, cambio, ahora, pago);
  }

  private async cambioDto(u: UsuarioSesion, c: FilaCambio, ahora: Date, pago?: PagoCreado): Promise<CambioPlanDto> {
    const p = pago && pago.tipo !== 'enviado' ? { pago } : {};
    return {
      id: c.id, tipo: 'SUBIDA', estado: c.estado, planOrigen: breve(c.planOrigen), planDestino: breve(c.planDestino), ciclo: c.ciclo, precioNuevoSinIgv: c.precioNuevoSinIgv,
      diasRestantes: c.diasRestantes, diasPeriodo: c.diasPeriodo, diferenciaSinIgv: Number(c.diferenciaSinIgv), igv: Number(c.igv), total: Number(c.total), moneda: moneda(c.moneda),
      rigeDesde: (c.estado === 'APROBADO' ? c.actualizadoEn : c.creadoEn).toISOString(), pasarela: c.pasarela,
      motivoRechazo: c.estado === 'RECHAZADO' ? (c.motivoRechazo ?? 'La pasarela rechazó el pago') : null, ...p, suscripcion: await this.suscripcion(u, ahora),
    };
  }

  /** El cambio de la organización del usuario (otra organización: 404). */
  async buscarCambio(u: UsuarioSesion, id: string): Promise<FilaCambio> {
    const c = await this.bd.cambioPlan.findFirst({ where: { id, organizacionId: organizacionDe(u) }, include: CON_CAMBIO });
    if (!c) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El cambio de plan no existe' });
    return c;
  }

  /** `GET /organizacion/suscripcion/cambios/{id}`: para consultar hasta que la pasarela confirme. */
  async cambio(u: UsuarioSesion, id: string, ahora = new Date()): Promise<CambioPlanDto> {
    return this.cambioDto(u, await this.buscarCambio(u, id), ahora);
  }

  /**
   * `POST /organizacion/suscripcion/cancelar`: rige al fin del período pagado (RN-18-7), sin devolución. Programa la tarea
   * que la pasa a CANCELADA en `finPeriodo`. Repetirlo no cambia nada.
   */
  async cancelar(u: UsuarioSesion, ahora = new Date()): Promise<SuscripcionOrgDto> {
    const organizacionId = organizacionDe(u);
    const s = await this.fila(organizacionId);
    if (estaCancelada(s, ahora)) throw new ConflictException({ codigo: 'SUSCRIPCION_CANCELADA', mensaje: 'Tu suscripción ya terminó' });
    if (!s.cancelarAlFin) {
      await this.bd.$transaction(async (tx) => {
        await tx.suscripcion.update({ where: { id: s.id }, data: { cancelarAlFin: true } });
        await this.auditar(tx, organizacionId, u.id, 'SUSCRIPCION_CANCELACION_PEDIDA', s.id, { finPeriodo: s.finPeriodo.toISOString(), planId: s.planId });
      });
    }
    // Se programa también si ya estaba marcada, por si la tarea se perdió (el `jobId` fijo evita duplicarla).
    await this.colaSuscripciones.add(TAREA_VENCER_SUSCRIPCION, { suscripcionId: s.id }, opcionesTareaVencer(s.id, s.finPeriodo.getTime() - ahora.getTime()))
      .catch((e: unknown) => this.log.error(`No se pudo programar el vencimiento de la suscripción ${s.id}: ${e instanceof Error ? e.message : String(e)}`));
    return this.suscripcion(u, ahora);
  }

  /** `POST /organizacion/suscripcion/reanudar`: «Seguir con mi plan». Quita la cancelación, la bajada programada y la tarea. */
  async reanudar(u: UsuarioSesion, ahora = new Date()): Promise<SuscripcionOrgDto> {
    const organizacionId = organizacionDe(u);
    const s = await this.fila(organizacionId);
    if (estaCancelada(s, ahora)) throw new ConflictException({ codigo: 'SUSCRIPCION_CANCELADA', mensaje: 'Tu suscripción ya terminó: suscríbete de nuevo para volver' });
    if (s.cancelarAlFin || s.planProgramadoId) {
      await this.bd.$transaction(async (tx) => {
        await tx.suscripcion.update({ where: { id: s.id }, data: { cancelarAlFin: false, planProgramadoId: null } });
        await this.auditar(tx, organizacionId, u.id, 'SUSCRIPCION_REANUDADA', s.id, { cancelabaAlFin: s.cancelarAlFin, planProgramadoId: s.planProgramadoId });
      });
    }
    await this.colaSuscripciones.remove(idTareaVencer(s.id))
      .catch((e: unknown) => this.log.error(`No se pudo quitar el vencimiento de la suscripción ${s.id}: ${e instanceof Error ? e.message : String(e)}`));
    return this.suscripcion(u, ahora);
  }

  /**
   * El evento de la pasarela para un cambio (dentro de la transacción del webhook, RN-18-3). Aprobado con el monto y la
   * moneda del cambio, y con la suscripción todavía en el plan y precio de origen: la suscripción pasa al plan nuevo de
   * inmediato (su cuota rige en la ventana vigente) con su cobro. Rechazado: RECHAZADO. Un pago aprobado que no se puede
   * aplicar (monto distinto, cambio cerrado o la suscripción ya cambió) deja su cobro sin suscripción, para reembolsarlo.
   */
  async procesarCambio(tx: Tx, c: Prisma.CambioPlanGetPayload<object>, pasarela: string, ev: EventoPago): Promise<ResultadoCambio> {
    const aprobado = ev.resultado === 'aprobado';
    const montoDistinto = aprobado && ((ev.monto != null && Math.abs(ev.monto - Number(c.total)) > TOLERANCIA_MONTO) || (ev.moneda != null && ev.moneda !== c.moneda));
    // Cerrojo de la suscripción: un cambio y un lanzamiento (o dos cambios) no se pisan.
    await tx.$queryRaw`SELECT "id" FROM "Suscripcion" WHERE "id" = ${c.suscripcionId}::uuid FOR UPDATE`;
    const s = await tx.suscripcion.findUniqueOrThrow({ where: { id: c.suscripcionId } });
    const yaCambio = aprobado && !montoDistinto && (s.planId !== c.planOrigenId || s.estado === 'CANCELADA');
    const cobrar = async (acreditado: boolean) => (await tx.cobro.create({
      data: {
        cambioPlanId: c.id, suscripcionId: acreditado ? c.suscripcionId : null, eventoPagoId: ev.eventoId, monto: ev.monto ?? Number(c.total), moneda: ev.moneda ?? c.moneda, pasarela,
        tokenPago: ev.referencia ?? null, ultimos4Digitos: ev.ultimos4,
      },
    })).id;
    const auditar = (accion: string, datos: Record<string, Prisma.InputJsonValue | null>) =>
      tx.auditoria.create({ data: { organizacionId: c.organizacionId, usuarioId: null, accion, entidad: 'CambioPlan', entidadId: c.id, datos: { ...datos, pasarela, eventoId: ev.eventoId } } });

    const motivo = !aprobado ? (ev.motivo ?? 'La pasarela rechazó el pago')
      : montoDistinto ? `MONTO_NO_COINCIDE: la pasarela cobró ${ev.monto ?? '?'} ${ev.moneda ?? ''} y se esperaba ${Number(c.total)} ${c.moneda}`.trim()
        : yaCambio ? 'PLAN_YA_CAMBIO: la suscripción ya no estaba en el plan de origen' : null;
    const aplicar = aprobado && !montoDistinto && !yaCambio;
    const cambio = await tx.cambioPlan.updateMany({ where: { id: c.id, estado: 'PENDIENTE' }, data: { estado: aplicar ? 'APROBADO' : 'RECHAZADO', eventoPagoId: ev.eventoId, motivoRechazo: motivo } });
    if (cambio.count === 0) {
      const fresco = await tx.cambioPlan.findUnique({ where: { id: c.id } });
      if (!aprobado || fresco?.eventoPagoId === ev.eventoId) return { duplicado: true, cobroId: null };
      const cobroId = await cobrar(false);
      await auditar('PAGO_SIN_CAMBIO_PENDIENTE', { estadoCambio: fresco?.estado ?? null, cobroId });
      return { duplicado: false, cobroId };
    }
    if (!aprobado) {
      await auditar('PLAN_CAMBIO_RECHAZADO', { motivo });
      return { duplicado: false, cobroId: null };
    }
    if (!aplicar) {
      const cobroId = await cobrar(false);
      await auditar(montoDistinto ? 'PAGO_MONTO_NO_COINCIDE' : 'PAGO_SIN_CAMBIO_PENDIENTE', { esperado: Number(c.total), monedaEsperada: c.moneda, cobrado: ev.monto ?? null, monedaCobrada: ev.moneda ?? null, motivo, cobroId });
      return { duplicado: false, cobroId };
    }
    await tx.suscripcion.update({ where: { id: s.id }, data: { planId: c.planDestinoId, precioPactadoSinIgv: c.precioNuevoSinIgv, planProgramadoId: null } });
    const cobroId = await cobrar(true);
    await auditar('PLAN_CAMBIADO', { planOrigenId: c.planOrigenId, planDestinoId: c.planDestinoId, precioNuevoSinIgv: c.precioNuevoSinIgv, total: Number(c.total), moneda: c.moneda, cobroId });
    return { duplicado: false, cobroId };
  }
}
