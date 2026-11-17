/**
 * HU-1708 · Cobranza y suspensión (REQ-088, CP-150, RN-18-8). Reglas puras, sin base de datos:
 *
 * - el calendario: el primer intento el día 0 (el fin del período), los reintentos los días 1, 3 y 7 y la suspensión
 *   a solo lectura el día 10, contados desde el fin del período;
 * - el monto de la renovación: el precio pactado o, con una bajada programada, el precio publicado del plan nuevo por
 *   el ciclo, más 18 % de IGV;
 * - el período siguiente: anclado al fin del anterior si se paga antes de la suspensión; si ya estaba suspendida,
 *   empieza el día del pago.
 */
import { conIgv, igvDe, type PlanPublico } from './planes.js';
import { type Ciclo, finPeriodo, type Moneda } from './suscripciones.js';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Días, desde el fin del período, de cada intento de cobro (RN-18-8). */
export const DIAS_INTENTOS = [0, 1, 3, 7] as const;
/** Día, desde el fin del período, en que la organización queda en solo lectura (CP-150). */
export const DIA_SUSPENSION = 10;
export const ESTADOS_RENOVACION = ['PENDIENTE', 'APROBADA', 'VENCIDA'] as const;
export type EstadoRenovacion = (typeof ESTADOS_RENOVACION)[number];
/** Los últimos dígitos de la tarjeta de prueba que la pasarela de pruebas rechaza (como en el pago). */
export const ULTIMOS4_RECHAZADA = '0002';

const masDias = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS);

/** Cuándo toca el intento `n` (0 a 3) o, con `n` = 4, la suspensión. */
export function fechaDelPaso(finPeriodo: Date, n: number): Date {
  return masDias(finPeriodo, n < DIAS_INTENTOS.length ? DIAS_INTENTOS[n]! : DIA_SUSPENSION);
}

export type Paso = { tipo: 'intento'; numero: number } | { tipo: 'suspender' } | { tipo: 'esperar'; hasta: Date };

/**
 * Qué toca hacer con una renovación pendiente que ya hizo `intentos` intentos: el siguiente intento, la suspensión o
 * esperar hasta su fecha. Si se atrasó varios pasos (el worker estuvo detenido), hace uno por vez.
 */
export function siguientePaso(finPeriodo: Date, intentos: number, ahora: Date): Paso {
  const cuando = fechaDelPaso(finPeriodo, intentos);
  if (ahora.getTime() < cuando.getTime()) return { tipo: 'esperar', hasta: cuando };
  return intentos < DIAS_INTENTOS.length ? { tipo: 'intento', numero: intentos } : { tipo: 'suspender' };
}

/** El día de cobranza (0 = fin del período). */
export const diaDeCobranza = (finPeriodo: Date, ahora: Date) => Math.floor((ahora.getTime() - finPeriodo.getTime()) / DIA_MS);

export interface MontoRenovacion { planId: string; montoSinIgv: number; igv: number; total: number; moneda: Moneda }

/**
 * El monto del período que se renueva: el precio pactado o, con una bajada programada, el precio publicado del plan
 * nuevo por el ciclo y la moneda de la suscripción (null si ese plan ya no se cobra así: se mantiene el pactado).
 */
export function montoRenovacion(s: { planId: string; precioPactadoSinIgv: number; moneda: Moneda }, programado: { id: string; precioCiclo: number | null } | null): MontoRenovacion {
  const conBajada = programado && programado.precioCiclo !== null;
  const base = conBajada ? programado.precioCiclo! : s.precioPactadoSinIgv;
  return { planId: conBajada ? programado.id : s.planId, montoSinIgv: base, igv: igvDe(base), total: conIgv(base), moneda: s.moneda };
}

/** El precio publicado de un plan por el ciclo y la moneda de la suscripción, sin IGV (null si es a medida o no se cobra así). */
export function precioCicloPublicado(p: Pick<PlanPublico, 'aMedida' | 'precioMes' | 'precioMesUsd' | 'precioAnual' | 'precioAnualUsd'>, ciclo: string, mon: Moneda): number | null {
  if (p.aMedida) return null;
  if (ciclo === 'ANUAL') return mon === 'USD' ? p.precioAnualUsd : p.precioAnual;
  return mon === 'USD' ? p.precioMesUsd : p.precioMes;
}

/** El período que paga la renovación: empieza en el fin del anterior. */
export const periodoRenovado = (finAnterior: Date, ciclo: Ciclo) => ({ inicio: finAnterior, fin: finPeriodo(finAnterior, ciclo) });

/**
 * El período vigente al aprobarse el pago: el renovado si la suscripción no llegó a suspenderse; si ya estaba
 * suspendida, uno nuevo desde el día del pago (no se cobran los días en solo lectura).
 */
export function periodoAlPagar(renovado: { inicio: Date; fin: Date }, ciclo: Ciclo, suspendida: boolean, pago: Date): { inicio: Date; fin: Date } {
  return suspendida ? { inicio: pago, fin: finPeriodo(pago, ciclo) } : renovado;
}

/** Si una tarjeta de prueba guardada aprueba el cobro automático de la pasarela de pruebas. */
export const cobroPruebaAprueba = (ultimos4: string | null | undefined) => ultimos4 !== ULTIMOS4_RECHAZADA;
