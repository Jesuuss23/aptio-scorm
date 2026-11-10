// M11 · Reglas de avance (RN-11-1, RN-11-4): funciones puras que comparten todos los patrones de navegación.
import type { CursoReproductor, ModoNavegacion, Pantalla, ResultadoActividad } from './tipos.ts';

export interface PantallaPlana {
  pantalla: Pantalla;
  indice: number;
  moduloId: string;
  capsulaId: string;
  /** Tiene una actividad que hay que hacer para avanzar (pantalla obligatoria con interacción). */
  conActividad: boolean;
}

/** Las pantallas del curso en orden de recorrido. */
export function aplanar(curso: CursoReproductor): PantallaPlana[] {
  const lista: PantallaPlana[] = [];
  for (const m of curso.modulos)
    for (const c of m.capsulas)
      for (const p of c.pantallas)
        lista.push({
          pantalla: p, indice: lista.length, moduloId: m.id, capsulaId: c.id,
          conActividad: p.obligatoria && p.bloques.some((b) => b.tipo === 'interaccion'),
        });
  return lista;
}

/** Sin `navegacion` en el curso: clásico con actividades obligatorias (esquema del curso). */
export const modoDe = (curso: CursoReproductor): ModoNavegacion => curso.navegacion?.modo ?? 'condiciones';

export interface Avance {
  actual: number;
  /** La pantalla más lejana a la que llegó el participante. */
  maxima: number;
  resultados: ReadonlyMap<string, ResultadoActividad>;
}

export type Motivo = 'actividad' | 'orden';

const pendiente = (x: PantallaPlana | undefined, r: Avance['resultados']) => Boolean(x?.conActividad && !r.get(x.pantalla.id)?.completada);

/**
 * Por qué no se puede ir a `destino`, o null si se puede.
 * - libre: a cualquier pantalla.
 * - condiciones: a cualquiera mientras no quede atrás una actividad sin hacer.
 * - secuencial: a las ya vistas y a la siguiente de la más lejana, si esa está completa.
 */
export function motivoBloqueo(pantallas: readonly PantallaPlana[], avance: Avance, modo: ModoNavegacion, destino: number): Motivo | null {
  if (destino < 0 || destino >= pantallas.length) return 'orden';
  if (modo === 'libre' || destino <= avance.actual) return null;
  if (modo === 'condiciones') {
    for (let j = 0; j < destino; j++) if (pendiente(pantallas[j], avance.resultados)) return 'actividad';
    return null;
  }
  if (destino <= avance.maxima) return null;
  if (destino > avance.maxima + 1) return 'orden';
  return pendiente(pantallas[avance.maxima], avance.resultados) ? 'actividad' : null;
}
