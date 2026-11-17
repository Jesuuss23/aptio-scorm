/**
 * HU-1705 · Cuotas de cápsulas (REQ-085, CP-146, RN-18-6). Reglas puras, sin base de datos:
 *
 * - la ventana mensual vigente, anclada en el inicio del período de la suscripción (mensual o anual);
 * - lo incluido, lo comprado en la ventana, lo consumido y lo disponible (sin suscripción o a medida: sin límite);
 * - la compra de adicionales: de 1 a 10, al precio `capsulaAdicional` del plan más IGV de 18 %, en la moneda de la
 *   suscripción (en dólares, en proporción al precio al mes en USD del plan: SUP-300).
 *
 * Una cápsula es un proyecto con su primera generación lanzada: volver a generar, continuar, regenerar la voz o editar
 * no consume, así que una cápsula en revisión nunca se bloquea.
 */
import { conIgv, type ErrorCampo, igvDe } from './planes.js';
import { type Moneda, sumarMeses } from './suscripciones.js';

export type { ErrorCampo };
export const LIMITES_ADICIONALES = { min: 1, max: 10 } as const;
export const ORIGENES_CONSUMO = ['CUOTA', 'ADICIONAL'] as const;
export type OrigenConsumo = (typeof ORIGENES_CONSUMO)[number];

export interface Ventana { inicio: Date; fin: Date }

/**
 * La ventana mensual que contiene `ahora`: [inicio + k meses, inicio + k + 1 meses). Cada borde se calcula desde el
 * ancla (no encadenando meses) para que un inicio el 31 vuelva al 31 después de febrero. Antes del inicio, la primera.
 */
export function ventanaMensual(inicioPeriodo: Date, ahora: Date): Ventana {
  const a = inicioPeriodo;
  let k = (ahora.getUTCFullYear() - a.getUTCFullYear()) * 12 + (ahora.getUTCMonth() - a.getUTCMonth());
  if (k < 0) k = 0;
  while (k > 0 && sumarMeses(a, k).getTime() > ahora.getTime()) k--;
  while (sumarMeses(a, k + 1).getTime() <= ahora.getTime()) k++;
  return { inicio: sumarMeses(a, k), fin: sumarMeses(a, k + 1) };
}

export interface EntradaCuota {
  /** Cápsulas al mes del plan; null = a medida (sin límite). */
  capsulasMes: number | null;
  /** Cápsulas adicionales aprobadas en la ventana. */
  adicionales: number;
  /** Consumos de la ventana. */
  usadas: number;
}

export interface EstadoCuota {
  ilimitada: boolean;
  incluidas: number | null;
  adicionales: number;
  usadas: number;
  /** null si es ilimitada. Nunca negativo. */
  disponibles: number | null;
}

/** Lo disponible en la ventana. Sin suscripción, pasa `null` y es ilimitada (organización interna). */
export function calcularCuota(e: EntradaCuota | null): EstadoCuota {
  if (!e || e.capsulasMes === null) return { ilimitada: true, incluidas: null, adicionales: e?.adicionales ?? 0, usadas: e?.usadas ?? 0, disponibles: null };
  const total = e.capsulasMes + e.adicionales;
  return { ilimitada: false, incluidas: e.capsulasMes, adicionales: e.adicionales, usadas: e.usadas, disponibles: Math.max(0, total - e.usadas) };
}

/** Si un consumo nuevo sale de lo incluido o de lo comprado (las incluidas se gastan primero). */
export function origenDelConsumo(e: EstadoCuota): OrigenConsumo {
  return e.incluidas !== null && e.usadas >= e.incluidas ? 'ADICIONAL' : 'CUOTA';
}

export function validarCantidadAdicionales(v: unknown): ErrorCampo[] {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < LIMITES_ADICIONALES.min || v > LIMITES_ADICIONALES.max) {
    return [{ campo: 'cantidad', mensaje: `Elige de ${LIMITES_ADICIONALES.min} a ${LIMITES_ADICIONALES.max} cápsulas` }];
  }
  return [];
}

export interface PlanAdicional { capsulaAdicional: number | null; precioMes: number | null; precioMesUsd?: number | null }

/**
 * Precio unitario sin IGV de una cápsula adicional en la moneda de la suscripción. En soles, `capsulaAdicional`. En
 * dólares, en proporción al precio al mes en USD (redondeado al dólar, mínimo 1). Null si el plan no vende adicionales.
 */
export function precioUnitarioAdicional(plan: PlanAdicional, moneda: Moneda): number | null {
  if (plan.capsulaAdicional === null) return null;
  if (moneda === 'PEN') return plan.capsulaAdicional;
  if (!plan.precioMesUsd || !plan.precioMes) return null;
  return Math.max(1, Math.round((plan.capsulaAdicional * plan.precioMesUsd) / plan.precioMes));
}

export interface PrecioAdicionales { cantidad: number; unitario: number; subtotal: number; igv: number; total: number; moneda: Moneda }

/** Subtotal, IGV de 18 % y total de `cantidad` adicionales, con dos decimales. */
export function precioAdicionales(unitario: number, cantidad: number, moneda: Moneda): PrecioAdicionales {
  const subtotal = unitario * cantidad;
  return { cantidad, unitario, subtotal, igv: igvDe(subtotal), total: conIgv(subtotal), moneda };
}
