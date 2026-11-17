/**
 * HU-1705 · Cuotas de cápsulas (REQ-085, CP-146, RN-18-6).
 *
 * - `consumir`: dentro de la transacción que lanza una generación. Un proyecto consume una sola vez (la primera vez que se
 *   genera): volver a generar, continuar, regenerar la voz o editar no descuenta, así que una cápsula en revisión nunca
 *   se bloquea. Bloquea la fila de la suscripción (`FOR UPDATE`) para que dos lanzamientos a la vez no gasten la misma
 *   cápsula. Sin cuota, 402 CUOTA_AGOTADA con la oferta de la adicional y el enlace a los planes.
 * - `comprar`: el ADMINISTRADOR compra de 1 a 10 adicionales con la pasarela y la moneda de su suscripción; se acreditan
 *   cuando llega el webhook firmado (`procesarCompra`, llamado por `SuscripcionesService`), con su `Cobro` y la tarea de
 *   comprobante. Valen en la ventana mensual en que se aprueban.
 */
import { BadGatewayException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@aptio/db';
import { calcularCuota, type EstadoCuota, origenDelConsumo, precioAdicionales, precioUnitarioAdicional, validarCantidadAdicionales, type Ventana, ventanaMensual } from '@aptio/schema/cuotas';
import { CATALOGO_PASARELAS, type ConfigPasarela, esCodigoPasarela } from '@aptio/schema/pasarelas';
import type { EventoPago, Moneda } from '@aptio/schema/suscripciones';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { CompraCapsulasDto, CuotaDto } from './cuotas.dto.js';
import type { PagoCreado } from './pasarelas/contrato.js';
import { PasarelasService } from './pasarelas.service.js';

type Tx = Prisma.TransactionClient;
export const ENLACE_PLANES = '/s/precios';
const TOLERANCIA_MONTO = 0.005;
const CON_PLAN = { plan: true } as const;
type SuscripcionConPlan = Prisma.SuscripcionGetPayload<{ include: typeof CON_PLAN }>;
type FilaCompra = Prisma.CompraCapsulasGetPayload<object>;

const moneda = (m: string): Moneda => (m === 'USD' ? 'USD' : 'PEN');
const noValido = (campo: string, mensaje: string) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje, detalles: [{ campo, mensaje }] });
/** Sin suscripción no hay ancla: la ventana del consumo es el mes calendario (UTC). */
const mesCalendario = (ahora: Date): Ventana => ventanaMensual(new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)), ahora);

interface Situacion { suscripcion: SuscripcionConPlan | null; ventana: Ventana; cuota: EstadoCuota }

/** Lo que devuelve el webhook al procesar el pago de una compra: si era repetido y el cobro que dejó. */
export interface ResultadoCompra { duplicado: boolean; cobroId: string | null }

@Injectable()
export class CuotasService {
  private readonly log = new Logger('Cuotas');

  constructor(private readonly baseDatos: BaseDatosService, private readonly pasarelas: PasarelasService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** La situación de la organización en la ventana vigente: lo incluido, lo comprado y lo consumido. */
  private async situacion(tx: Tx, organizacionId: string, ahora: Date): Promise<Situacion> {
    const suscripcion = await tx.suscripcion.findUnique({ where: { organizacionId }, include: CON_PLAN });
    const ventana = suscripcion ? ventanaMensual(suscripcion.inicioPeriodo, ahora) : mesCalendario(ahora);
    const usadas = await tx.consumoCapsula.count({ where: { organizacionId, ventanaInicio: ventana.inicio } });
    if (!suscripcion) return { suscripcion, ventana, cuota: calcularCuota({ capsulasMes: null, adicionales: 0, usadas }) };
    const compradas = await tx.compraCapsulas.aggregate({ where: { suscripcionId: suscripcion.id, estado: 'APROBADA', ventanaInicio: ventana.inicio }, _sum: { cantidad: true } });
    return { suscripcion, ventana, cuota: calcularCuota({ capsulasMes: suscripcion.plan.capsulasMes, adicionales: compradas._sum.cantidad ?? 0, usadas }) };
  }

  /** La pasarela de la compra: la de la suscripción si sigue activa y cobra esa moneda; si no, la primera que la cobre. */
  private async pasarelaPara(s: SuscripcionConPlan): Promise<ConfigPasarela | null> {
    const propia = esCodigoPasarela(s.pasarela) ? await this.pasarelas.config(s.pasarela) : null;
    if (propia && propia.visible && this.pasarelas.activa(propia) && (CATALOGO_PASARELAS[propia.codigo].monedas as readonly string[]).includes(s.moneda)) return propia;
    return this.pasarelas.elegir(moneda(s.moneda));
  }

  private async aDto(rol: UsuarioSesion['rol'], { suscripcion, ventana, cuota }: Situacion): Promise<CuotaDto> {
    const unitario = suscripcion && !cuota.ilimitada ? precioUnitarioAdicional(suscripcion.plan, moneda(suscripcion.moneda)) : null;
    const oferta = suscripcion && unitario !== null
      ? (() => { const p = precioAdicionales(unitario, 1, moneda(suscripcion.moneda)); return { unitario, igv: p.igv, total: p.total, moneda: p.moneda, disponible: false }; })()
      : null;
    if (oferta && suscripcion) oferta.disponible = Boolean(await this.pasarelaPara(suscripcion));
    return {
      ilimitada: cuota.ilimitada, ventanaInicio: ventana.inicio.toISOString(), ventanaFin: ventana.fin.toISOString(), incluidas: cuota.incluidas, adicionales: cuota.adicionales,
      usadas: cuota.usadas, disponibles: cuota.disponibles, oferta, puedeComprar: rol === 'ADMINISTRADOR' && Boolean(oferta?.disponible), planes: ENLACE_PLANES,
    };
  }

  /** `GET /organizacion/cuota`. */
  async cuota(u: UsuarioSesion, ahora = new Date()): Promise<CuotaDto> {
    const organizacionId = organizacionDe(u);
    return this.aDto(u.rol, await this.situacion(this.bd, organizacionId, ahora));
  }

  /**
   * CP-146 · Descuenta una cápsula al lanzar la primera generación de un proyecto, dentro de la transacción del
   * lanzamiento. Devuelve el origen del consumo, o null si el proyecto ya había consumido (no descuenta de nuevo).
   */
  async consumir(tx: Tx, u: UsuarioSesion, organizacionId: string, proyectoId: string, ahora = new Date()): Promise<'CUOTA' | 'ADICIONAL' | null> {
    if (await tx.consumoCapsula.findUnique({ where: { proyectoId }, select: { id: true } })) return null;
    // Cerrojo de la suscripción: dos proyectos lanzados a la vez esperan su turno y ven el conteo del otro.
    await tx.$queryRaw`SELECT "id" FROM "Suscripcion" WHERE "organizacionId" = ${organizacionId}::uuid FOR UPDATE`;
    const s = await this.situacion(tx, organizacionId, ahora);
    if (!s.cuota.ilimitada && s.cuota.disponibles === 0) {
      throw new HttpException({
        codigo: 'CUOTA_AGOTADA',
        mensaje: `Usaste las ${s.cuota.incluidas! + s.cuota.adicionales} cápsulas de este mes. Compra una adicional o sube de plan; las cápsulas en revisión siguen editables.`,
        detalles: [{ ...(await this.aDto(u.rol, s)) }],
      }, HttpStatus.PAYMENT_REQUIRED);
    }
    const origen = origenDelConsumo(s.cuota);
    await tx.consumoCapsula.create({ data: { organizacionId, suscripcionId: s.suscripcion?.id ?? null, proyectoId, ventanaInicio: s.ventana.inicio, ventanaFin: s.ventana.fin, origen } });
    return origen;
  }

  private urlConsola(consulta: Record<string, string>): string {
    return `${process.env.WEB_URL ?? 'http://localhost:5173'}/?${new URLSearchParams(consulta).toString()}`;
  }

  private async compraDto(u: UsuarioSesion, c: FilaCompra, pago?: PagoCreado): Promise<CompraCapsulasDto> {
    const cuota = await this.cuota(u);
    const p = pago && pago.tipo !== 'enviado' ? { pago } : {};
    return {
      id: c.id, estado: c.estado, cantidad: c.cantidad, subtotal: Number(c.montoSinIgv), igv: Number(c.igv), total: Number(c.montoTotalConIgv), moneda: moneda(c.moneda), pasarela: c.pasarela,
      motivoRechazo: c.estado === 'RECHAZADA' ? (c.motivoRechazo ?? 'La pasarela rechazó el pago') : null, ...p, cuota,
    };
  }

  /**
   * `POST /organizacion/cuota/adicionales` (solo ADMINISTRADOR): crea la compra pendiente y prepara el pago en la pasarela
   * de la suscripción. 422 si la cantidad no es de 1 a 10 o el plan no vende adicionales; 503 sin pasarela; 502 si la
   * pasarela no responde (la compra queda RECHAZADA).
   */
  async comprar(u: UsuarioSesion, entrada: unknown, ahora = new Date()): Promise<CompraCapsulasDto> {
    const organizacionId = organizacionDe(u);
    const cantidad = (entrada && typeof entrada === 'object' ? (entrada as Record<string, unknown>).cantidad : undefined) ?? 1;
    const errores = validarCantidadAdicionales(cantidad);
    if (errores.length) throw noValido('cantidad', errores[0]!.mensaje);
    const s = await this.situacion(this.bd, organizacionId, ahora);
    if (!s.suscripcion) throw new UnprocessableEntityException({ codigo: 'SIN_SUSCRIPCION', mensaje: 'Tu organización no tiene un plan con cuota de cápsulas' });
    if (s.cuota.ilimitada) throw new UnprocessableEntityException({ codigo: 'CUOTA_ILIMITADA', mensaje: 'Tu plan no tiene límite de cápsulas' });
    const mon = moneda(s.suscripcion.moneda);
    const unitario = precioUnitarioAdicional(s.suscripcion.plan, mon);
    if (unitario === null) throw new UnprocessableEntityException({ codigo: 'SIN_ADICIONALES', mensaje: 'Tu plan no vende cápsulas adicionales: sube de plan para tener más' });
    const config = await this.pasarelaPara(s.suscripcion);
    if (!config) throw new HttpException({ codigo: 'PAGO_NO_DISPONIBLE', mensaje: 'El pago en línea no está disponible ahora: escríbenos para comprar cápsulas adicionales' }, HttpStatus.SERVICE_UNAVAILABLE);
    const precio = precioAdicionales(unitario, cantidad as number, mon);
    const usuario = await this.bd.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { email: true } });
    const compra = await this.bd.compraCapsulas.create({
      data: { organizacionId, suscripcionId: s.suscripcion.id, cantidad: precio.cantidad, montoSinIgv: precio.subtotal, igv: precio.igv, montoTotalConIgv: precio.total, moneda: mon, pasarela: config.codigo, pedidoPorId: u.id },
    });
    await this.bd.auditoria.create({
      data: { organizacionId, usuarioId: u.id, accion: 'CAPSULAS_COMPRA_INICIADA', entidad: 'CompraCapsulas', entidadId: compra.id, datos: { cantidad: precio.cantidad, total: precio.total, moneda: mon, pasarela: config.codigo } },
    });
    let pago: PagoCreado;
    try {
      pago = await this.pasarelas.adaptador(config.codigo).crearPago(config.modo, {
        solicitudId: compra.id, monto: precio.total, moneda: mon, descripcion: `Aptio SCORM · ${precio.cantidad} ${precio.cantidad === 1 ? 'cápsula adicional' : 'cápsulas adicionales'}`, correo: usuario.email,
        urlExito: this.urlConsola({ compra: compra.id }), urlCancelado: this.urlConsola({ compra: compra.id, cancelado: '1' }),
      });
    } catch (err) {
      await this.bd.compraCapsulas.update({ where: { id: compra.id }, data: { estado: 'RECHAZADA', motivoRechazo: 'PASARELA_NO_RESPONDE: no se pudo iniciar el pago' } });
      this.log.error(`La pasarela ${config.codigo} no inició el pago de la compra ${compra.id}: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException({ codigo: 'PASARELA_NO_RESPONDE', mensaje: 'La pasarela de pago no respondió: intenta de nuevo en unos minutos' });
    }
    return this.compraDto(u, compra, pago);
  }

  /** La compra de la organización del usuario (otra organización: 404). */
  async buscarCompra(u: UsuarioSesion, id: string): Promise<FilaCompra> {
    const c = await this.bd.compraCapsulas.findFirst({ where: { id, organizacionId: organizacionDe(u) } });
    if (!c) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La compra no existe' });
    return c;
  }

  /** `GET /organizacion/cuota/adicionales/{id}`: para consultar hasta que la pasarela confirme. */
  async compra(u: UsuarioSesion, id: string): Promise<CompraCapsulasDto> {
    return this.compraDto(u, await this.buscarCompra(u, id));
  }

  /**
   * El evento de la pasarela para una compra (dentro de la transacción del webhook, RN-18-3). Aprobado con el monto y la
   * moneda de la compra: APROBADA en la ventana vigente, con su cobro. Rechazado: RECHAZADA. Un pago aprobado que no se
   * puede acreditar (monto distinto o compra ya cerrada) deja su cobro sin suscripción, para reembolsarlo.
   */
  async procesarCompra(tx: Tx, c: FilaCompra, pasarela: string, ev: EventoPago, ahora: Date): Promise<ResultadoCompra> {
    const aprobado = ev.resultado === 'aprobado';
    const montoDistinto = aprobado && ((ev.monto != null && Math.abs(ev.monto - Number(c.montoTotalConIgv)) > TOLERANCIA_MONTO) || (ev.moneda != null && ev.moneda !== c.moneda));
    const s = await tx.suscripcion.findUniqueOrThrow({ where: { id: c.suscripcionId } });
    const ventana = ventanaMensual(s.inicioPeriodo, ahora);
    const cobrar = async (acreditado: boolean) => (await tx.cobro.create({
      data: {
        compraCapsulasId: c.id, suscripcionId: acreditado ? c.suscripcionId : null, eventoPagoId: ev.eventoId, monto: ev.monto ?? Number(c.montoTotalConIgv), moneda: ev.moneda ?? c.moneda, pasarela,
        tokenPago: ev.referencia ?? null, ultimos4Digitos: ev.ultimos4,
      },
    })).id;
    const auditar = (accion: string, datos: Record<string, Prisma.InputJsonValue | null>) =>
      tx.auditoria.create({ data: { organizacionId: c.organizacionId, usuarioId: null, accion, entidad: 'CompraCapsulas', entidadId: c.id, datos: { ...datos, pasarela, eventoId: ev.eventoId } } });

    const motivo = !aprobado ? (ev.motivo ?? 'La pasarela rechazó el pago')
      : montoDistinto ? `MONTO_NO_COINCIDE: la pasarela cobró ${ev.monto ?? '?'} ${ev.moneda ?? ''} y se esperaba ${Number(c.montoTotalConIgv)} ${c.moneda}`.trim() : null;
    const acreditar = aprobado && !montoDistinto;
    const cambio = await tx.compraCapsulas.updateMany({
      where: { id: c.id, estado: 'PENDIENTE' },
      data: { estado: acreditar ? 'APROBADA' : 'RECHAZADA', eventoPagoId: ev.eventoId, motivoRechazo: motivo, ...(acreditar ? { ventanaInicio: ventana.inicio, ventanaFin: ventana.fin } : {}) },
    });
    if (cambio.count === 0) {
      // La compra ya se resolvió con otro evento: si este trae otro pago aprobado, el dinero entró igual y queda sin acreditar.
      const fresca = await tx.compraCapsulas.findUnique({ where: { id: c.id } });
      if (!aprobado || fresca?.eventoPagoId === ev.eventoId) return { duplicado: true, cobroId: null };
      const cobroId = await cobrar(false);
      await auditar('PAGO_SIN_COMPRA_PENDIENTE', { estadoCompra: fresca?.estado ?? null, cobroId });
      return { duplicado: false, cobroId };
    }
    if (!aprobado) {
      await auditar('CAPSULAS_PAGO_RECHAZADO', { motivo });
      return { duplicado: false, cobroId: null };
    }
    if (montoDistinto) {
      const cobroId = await cobrar(false);
      await auditar('PAGO_MONTO_NO_COINCIDE', { esperado: Number(c.montoTotalConIgv), monedaEsperada: c.moneda, cobrado: ev.monto ?? null, monedaCobrada: ev.moneda ?? null, cobroId });
      return { duplicado: false, cobroId };
    }
    const cobroId = await cobrar(true);
    await auditar('CAPSULAS_COMPRADAS', { cantidad: c.cantidad, total: Number(c.montoTotalConIgv), moneda: c.moneda, ventanaInicio: ventana.inicio.toISOString(), cobroId });
    return { duplicado: false, cobroId };
  }
}
