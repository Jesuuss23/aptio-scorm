// HU-0506 · Lógica de los comentarios en Revisión (contador por pantalla y filtros), sin React para probarla con Vitest.
import type { Comentario } from '../api';

export type FiltroRevision = 'todas' | 'revisar' | 'actividades' | 'comentarios';

/** Comentarios abiertos (sin resolver) por pantalla. */
export function abiertosPorPantalla(comentarios: Pick<Comentario, 'pantallaId' | 'resuelto'>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of comentarios) if (!c.resuelto) m.set(c.pantallaId, (m.get(c.pantallaId) ?? 0) + 1);
  return m;
}

/** Las pantallas que muestra el filtro: «Con comentarios» deja las que tienen al menos uno abierto. */
export function filtrarPantallas<P extends { id: string }>(
  pantallas: P[], filtro: FiltroRevision, criterios: { conObservaciones: Set<string>; abiertos: Map<string, number>; conActividad: (p: P) => boolean },
): P[] {
  if (filtro === 'revisar') return pantallas.filter((p) => criterios.conObservaciones.has(p.id));
  if (filtro === 'actividades') return pantallas.filter(criterios.conActividad);
  if (filtro === 'comentarios') return pantallas.filter((p) => (criterios.abiertos.get(p.id) ?? 0) > 0);
  return pantallas;
}

/** Los comentarios de una pantalla en orden cronológico. */
export const comentariosDe = (comentarios: Comentario[], pantallaId: string) =>
  comentarios.filter((c) => c.pantallaId === pantallaId).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));

export const textoContador = (n: number) => (n === 1 ? '1 comentario abierto' : `${n} comentarios abiertos`);
