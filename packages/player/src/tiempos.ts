// HU-0608 · Tiempos de los elementos en el reproductor (RN-06-7, RN-06-9). El reproductor va solo en cada paquete, sin
// dependencias: estas reglas son las mismas de `@aptio/schema/tiempos`, que usa el editor (las dos tienen pruebas).
// - Con `retardoS` un elemento aparece en ese segundo; con `finS` sale en ese segundo. Fuera de ese rango no se ve.
// - Sin `retardoS`, entra escalonado de a 0,3 s según su lugar en la pantalla (bloques y luego extras).
import type { Idioma, Pantalla } from './tipos.ts';

export const ESCALONADO_S = 0.3;
const DURACION_MINIMA_S = 3;

export interface TiempoElemento {
  id: string;
  inicioS: number;
  finS: number | null;
  /** true si tiene `retardoS` o `finS`: lo mueve el reloj; si no, solo entra escalonado. */
  definido: boolean;
}

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** Los elementos de la pantalla en su orden (bloques y luego extras), con su entrada y su salida. */
export function tiemposDe(p: Pick<Pantalla, 'bloques' | 'ajustes' | 'extras'>): TiempoElemento[] {
  const ids = [...p.bloques.map((b) => b.id), ...(p.extras ?? []).map((e) => e.id)];
  return ids.map((id, i) => {
    const a = p.ajustes?.[id];
    const retardo = numero(a?.retardoS);
    const fin = numero(a?.finS);
    return { id, inicioS: retardo ?? Math.round(i * ESCALONADO_S * 10) / 10, finS: fin, definido: retardo !== null || fin !== null };
  });
}

/** Si el elemento se ve en el segundo `s`. */
export const activoEn = (x: Pick<TiempoElemento, 'inicioS' | 'finS'>, s: number) => s >= x.inicioS && (x.finS === null || s < x.finS);

/**
 * Duración de la pantalla: la mayor entre la voz + 1 s y la salida (o la entrada + 1 s) del último elemento (RN-06-7).
 * HU-0610 · También llega hasta 1 s después del último disparador por tiempo, para que ▶ Reproducir lo alcance.
 */
export function duracionDe(p: Pick<Pantalla, 'bloques' | 'ajustes' | 'extras' | 'narracion' | 'disparadores'>, idioma: Idioma): number {
  const voz = p.narracion?.porIdioma?.[idioma]?.duracionMs;
  let fin = voz && voz > 0 ? voz / 1000 + 1 : DURACION_MINIMA_S;
  for (const x of tiemposDe(p)) {
    if (x.finS !== null) fin = Math.max(fin, x.finS);
    if (x.definido) fin = Math.max(fin, x.inicioS + 1);
  }
  for (const d of p.disparadores ?? []) if (d.cuando.evento === 'tiempo' && typeof d.cuando.segundo === 'number') fin = Math.max(fin, d.cuando.segundo + 1);
  return Math.round(fin * 100) / 100;
}

/** El último límite que mueve el reloj (una entrada o una salida definida): después de él no cambia nada. */
export function ultimoCambio(tiempos: TiempoElemento[]): number {
  return tiempos.filter((x) => x.definido).reduce((m, x) => Math.max(m, x.inicioS, x.finS ?? 0), 0);
}
