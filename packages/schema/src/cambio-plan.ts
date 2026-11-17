/**
 * HU-1706 · Cambio de plan y cancelación (REQ-086, CP-147, RN-18-7, RN-18-2). Reglas puras, sin base de datos:
 *
 * - el prorrateo por día de una subida a mitad de período: (precio nuevo del ciclo − precio pactado) × días que faltan
 *   / días del período, al céntimo, más IGV de 18 %;
 * - qué cambios se pueden pedir: a un plan publicado, con precio, distinto del actual, en el mismo ciclo y en la moneda
 *   de la suscripción;
 * - si el cambio es una subida (se cobra la diferencia y rige de inmediato) o una bajada (queda programada para la
 *   renovación, sin cobro ni devolución).
 *
 * Los días se cuentan en UTC: un día que empezó ya cuenta como restante, así que el último día del período paga uno.
 */
import { conIgv, type ErrorCampo, igvDe } from './planes.js';
import type { Ciclo, Moneda } from './suscripciones.js';

export type { ErrorCampo };
const DIA_MS = 24 * 60 * 60 * 1000;
export const ESTADOS_CAMBIO_PLAN = ['PENDIENTE', 'APROBADO', 'RECHAZADO'] as const;
export type EstadoCambioPlan = (typeof ESTADOS_CAMBIO_PLAN)[number];
export type TipoCambio = 'SUBIDA' | 'BAJADA';

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Días del período y los que faltan desde `ahora` (de 0 a los del período). */
export function diasDelPeriodo(inicio: Date, fin: Date, ahora: Date): { diasPeriodo: number; diasRestantes: number } {
  const diasPeriodo = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / DIA_MS));
  const faltan = Math.ceil((fin.getTime() - ahora.getTime()) / DIA_MS);
  return { diasPeriodo, diasRestantes: Math.min(diasPeriodo, Math.max(0, faltan)) };
}

export interface Prorrateo { diasPeriodo: number; diasRestantes: number; diferenciaSinIgv: number; igv: number; total: number; moneda: Moneda }

/**
 * La diferencia prorrateada de una subida (CP-147): con S/ 490 → S/ 1 290 y 15 de 30 días, S/ 400,00 + 72,00 de IGV =
 * S/ 472,00. Una bajada (precio nuevo menor o igual) da 0: no se devuelve nada.
 */
export function prorrateo(precioPactado: number, precioNuevo: number, diasRestantes: number, diasPeriodo: number, moneda: Moneda): Prorrateo {
  const bruta = ((precioNuevo - precioPactado) * diasRestantes) / diasPeriodo;
  const diferenciaSinIgv = bruta > 0 ? redondear2(bruta) : 0;
  return { diasPeriodo, diasRestantes, diferenciaSinIgv, igv: igvDe(diferenciaSinIgv), total: conIgv(diferenciaSinIgv), moneda };
}

/** Lo que hace falta del plan destino para validar el cambio. */
export interface PlanCambiable {
  id: string;
  visible: boolean;
  aMedida: boolean;
  /** Precio por el ciclo de la suscripción en su moneda, sin IGV; null si el plan no se cobra así. */
  precioCiclo: number | null;
}

export interface SuscripcionCambiable { planId: string; ciclo: Ciclo; moneda: Moneda; precioPactadoSinIgv: number; estado: string; cancelarAlFin: boolean }

/**
 * Valida el cambio y dice si es subida o bajada. Errores en `plan`: no publicado, a medida, igual al actual o sin precio
 * en ese ciclo y moneda; y en `suscripcion` si ya está cancelada.
 */
export function validarCambio(s: SuscripcionCambiable, destino: PlanCambiable | null): { ok: true; tipo: TipoCambio; precioNuevo: number } | { ok: false; errores: ErrorCampo[] } {
  if (s.estado === 'CANCELADA') return { ok: false, errores: [{ campo: 'suscripcion', mensaje: 'Tu suscripción ya terminó: suscríbete de nuevo para elegir un plan' }] };
  if (!destino || !destino.visible) return { ok: false, errores: [{ campo: 'plan', mensaje: 'Ese plan no está publicado' }] };
  if (destino.id === s.planId) return { ok: false, errores: [{ campo: 'plan', mensaje: 'Ya tienes ese plan' }] };
  if (destino.aMedida) return { ok: false, errores: [{ campo: 'plan', mensaje: 'Un plan a medida se contrata con una demo' }] };
  if (destino.precioCiclo === null) {
    return { ok: false, errores: [{ campo: 'plan', mensaje: `Ese plan no se cobra ${s.ciclo === 'ANUAL' ? 'al año' : 'al mes'} en ${s.moneda === 'USD' ? 'dólares' : 'soles'}` }] };
  }
  return { ok: true, tipo: destino.precioCiclo > s.precioPactadoSinIgv ? 'SUBIDA' : 'BAJADA', precioNuevo: destino.precioCiclo };
}
