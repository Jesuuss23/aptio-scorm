// HU-0604 · Retoques separados del contenido (RN-06-1, SUP-43): los `ajustes` y `extras` de una pantalla son del
// editor y nunca pasan por la IA. Cuando la IA cambia el contenido (una propuesta o «Generar de nuevo»), los retoques
// se conservan: los extras siempre y el ajuste de cada elemento que sigue existiendo. Si cambia la disposición, los
// ajustes se reinician y los extras se conservan (RN-06-3).
// HU-0610 · Los `disparadores` también son del editor: se conservan los que apuntan a elementos que siguen en la pantalla.

import { purgarDisparadores } from './disparadores.js';

type ConRetoques = { id: string; disposicion?: string; bloques: { id: string }[]; ajustes?: Record<string, unknown>; extras?: { id: string }[]; disparadores?: unknown[] };

/** Rutas de los retoques dentro de una pantalla. */
export const CLAVES_RETOQUE = ['ajustes', 'extras', 'disparadores'] as const;

/** La pantalla sin los retoques (para el prompt y la huella). No modifica la recibida. */
export function sinRetoques<T extends object>(p: T): Omit<T, 'ajustes' | 'extras' | 'disparadores'> {
  const { ajustes: _a, extras: _e, disparadores: _d, ...resto } = p as T & { ajustes?: unknown; extras?: unknown; disparadores?: unknown };
  return resto;
}

/**
 * Pone en `despues` los retoques de `antes` (la misma pantalla antes del cambio de la IA): los extras siempre; los
 * ajustes solo si no cambió la disposición, y solo los de elementos que siguen en la pantalla (bloques o extras).
 * Modifica y devuelve `despues`.
 */
export function conservarRetoques<T extends object>(antes: object, despues: T): T {
  const a = antes as ConRetoques;
  const d = despues as T & ConRetoques;
  delete d.ajustes;
  delete d.extras;
  delete d.disparadores;
  if (a.extras?.length) d.extras = structuredClone(a.extras);
  if (a.disparadores?.length) {
    d.disparadores = structuredClone(a.disparadores);
    purgarDisparadores(d);
  }
  if (a.ajustes && (a.disposicion ?? null) === (d.disposicion ?? null)) {
    const vivos = new Set([...d.bloques.map((b) => b.id), ...(d.extras ?? []).map((e) => e.id)]);
    const ajustes = Object.fromEntries(Object.entries(a.ajustes).filter(([id]) => vivos.has(id)).map(([id, v]) => [id, structuredClone(v)]));
    if (Object.keys(ajustes).length) d.ajustes = ajustes;
  }
  return despues;
}
