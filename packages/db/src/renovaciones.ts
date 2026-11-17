/**
 * HU-1708 · Cobranza y suspensión (REQ-088, CP-150, RN-18-8). Lo que comparten el worker (el cobro automático de la
 * pasarela de pruebas) y la API (el webhook único de pago): el precio publicado del plan de una bajada programada y la
 * resolución del pago de una renovación, siempre dentro de una transacción.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { periodoAlPagar, precioCicloPublicado } from '@aptio/schema/cobranza';
import { descontarCiclo } from '@aptio/schema/cupones';
import { entornoSitio } from '@aptio/schema/sitio-ficticios';
import { planesServidos } from '@aptio/schema/sitio-versiones';
import type { Moneda } from '@aptio/schema/suscripciones';
import { ultimaVersion } from './sitio.js';

type Tx = Prisma.TransactionClient;
/** Diferencia tolerada entre el monto que informa la pasarela y el total de la renovación (redondeo). */
const TOLERANCIA_MONTO = 0.005;

/**
 * El precio publicado vigente (sin IGV) de un plan por el ciclo y la moneda de la suscripción, en la última versión del
 * sitio; null si el plan ya no se publica, es a medida o no se cobra así. Los planes ficticios no cuentan en producción.
 */
export async function precioPublicado(bd: PrismaClient | Tx, slug: string, ciclo: string, moneda: Moneda, entorno = entornoSitio(process.env.SITIO_ENTORNO)): Promise<number | null> {
  const v = await ultimaVersion(bd);
  const p = (v ? planesServidos(v.instantanea, entorno)?.planes : null)?.find((x) => x.slug === slug);
  return p ? precioCicloPublicado(p, ciclo, moneda) : null;
}

/** El evento de pago de una renovación (del webhook o del cobro automático de pruebas). Sin datos de tarjeta, salvo los 4 últimos. */
export interface PagoRenovacion {
  pasarela: string;
  eventoId: string;
  resultado: 'aprobado' | 'rechazado';
  monto?: number | null;
  moneda?: string | null;
  referencia?: string | null;
  ultimos4?: string | null;
  motivo?: string | null;
}

export type DesenlacePago = 'renovada' | 'reactivada' | 'rechazada' | 'sin-renovacion' | 'monto-distinto' | 'duplicado';
export interface ResultadoPagoRenovacion { desenlace: DesenlacePago; duplicado: boolean; cobroId: string | null }

/**
 * Resuelve el pago de una renovación (RN-18-3, RN-18-8). Con el cerrojo de la suscripción:
 *
 * - el mismo evento otra vez: repetido, no cambia nada;
 * - rechazado: guarda el motivo; la renovación sigue pendiente para el siguiente intento o el pago manual;
 * - aprobado con otro monto o moneda, o con la renovación ya pagada: el dinero entró igual y queda como cobro sin
 *   suscripción, para reembolsarlo desde Ventas › Pasarelas;
 * - aprobado: la suscripción vuelve a ACTIVA con el período renovado (anclado al fin del anterior; si ya estaba
 *   suspendida, desde el día del pago) y se guarda el `Cobro` ligado a la renovación, para emitir su comprobante.
 */
export async function resolverPagoRenovacion(tx: Tx, renovacionId: string, pago: PagoRenovacion, ahora: Date): Promise<ResultadoPagoRenovacion> {
  const previa = await tx.renovacion.findUniqueOrThrow({ where: { id: renovacionId }, select: { suscripcionId: true } });
  await tx.$queryRaw`SELECT "id" FROM "Suscripcion" WHERE "id" = ${previa.suscripcionId}::uuid FOR UPDATE`;
  const r = await tx.renovacion.findUniqueOrThrow({ where: { id: renovacionId } });
  const s = await tx.suscripcion.findUniqueOrThrow({ where: { id: r.suscripcionId } });
  if (r.eventoPagoId === pago.eventoId) return { desenlace: 'duplicado', duplicado: true, cobroId: null };
  const auditar = (accion: string, datos: Record<string, Prisma.InputJsonValue | null>) =>
    tx.auditoria.create({ data: { organizacionId: r.organizacionId, usuarioId: null, accion, entidad: 'Renovacion', entidadId: r.id, datos: { ...datos, pasarela: pago.pasarela, eventoId: pago.eventoId } } });
  const cobrar = async (acreditado: boolean) => (await tx.cobro.create({
    data: {
      renovacionId: r.id, suscripcionId: acreditado ? r.suscripcionId : null, eventoPagoId: pago.eventoId, monto: pago.monto ?? Number(r.total), moneda: pago.moneda ?? r.moneda,
      pasarela: pago.pasarela, tokenPago: pago.referencia ?? null, ultimos4Digitos: pago.ultimos4 ?? null,
    },
  })).id;

  if (pago.resultado === 'rechazado') {
    const motivo = pago.motivo ?? 'La pasarela rechazó el pago';
    if (r.estado !== 'APROBADA') await tx.renovacion.update({ where: { id: r.id }, data: { motivoRechazo: motivo } });
    await auditar('RENOVACION_PAGO_RECHAZADO', { motivo, intentos: r.intentos });
    return { desenlace: 'rechazada', duplicado: false, cobroId: null };
  }
  const montoDistinto = (pago.monto != null && Math.abs(pago.monto - Number(r.total)) > TOLERANCIA_MONTO) || (pago.moneda != null && pago.moneda !== r.moneda);
  if (montoDistinto) {
    const cobroId = await cobrar(false);
    await auditar('PAGO_MONTO_NO_COINCIDE', { esperado: Number(r.total), monedaEsperada: r.moneda, cobrado: pago.monto ?? null, monedaCobrada: pago.moneda ?? null, cobroId });
    return { desenlace: 'monto-distinto', duplicado: false, cobroId };
  }
  // Solo se paga la renovación pendiente (o vencida, con la suscripción suspendida) del período en curso.
  const pagable = r.estado !== 'APROBADA' && (s.estado === 'PAGO_PENDIENTE' || s.estado === 'SUSPENDIDA') && s.finPeriodo.getTime() === r.periodoInicio.getTime();
  if (!pagable) {
    const cobroId = await cobrar(false);
    await auditar('PAGO_SIN_RENOVACION_PENDIENTE', { estadoRenovacion: r.estado, estadoSuscripcion: s.estado, cobroId });
    return { desenlace: 'sin-renovacion', duplicado: false, cobroId };
  }
  const suspendida = s.estado === 'SUSPENDIDA';
  const periodo = periodoAlPagar({ inicio: r.periodoInicio, fin: r.periodoFin }, s.ciclo, suspendida, ahora);
  await tx.renovacion.update({
    where: { id: r.id },
    data: { estado: 'APROBADA', eventoPagoId: pago.eventoId, proximoIntento: null, motivoRechazo: null, periodoInicio: periodo.inicio, periodoFin: periodo.fin },
  });
  await tx.suscripcion.update({
    where: { id: s.id },
    data: {
      estado: 'ACTIVA', inicioPeriodo: periodo.inicio, finPeriodo: periodo.fin, ...(pago.ultimos4 ? { ultimos4Digitos: pago.ultimos4 } : {}),
      // HU-1709 · Pagada una renovación con el descuento del cupón, queda un ciclo menos (null sigue permanente).
      ...(r.porcentajeDescuento !== null ? { ciclosDescuentoRestantes: descontarCiclo(s.ciclosDescuentoRestantes) } : {}),
    },
  });
  const cobroId = await cobrar(true);
  await auditar(suspendida ? 'SUSCRIPCION_REACTIVADA' : 'SUSCRIPCION_RENOVADA', {
    planId: r.planId, total: Number(r.total), moneda: r.moneda, porcentajeDescuento: r.porcentajeDescuento, inicioPeriodo: periodo.inicio.toISOString(), finPeriodo: periodo.fin.toISOString(), intentos: r.intentos, cobroId,
  });
  return { desenlace: suspendida ? 'reactivada' : 'renovada', duplicado: false, cobroId };
}
