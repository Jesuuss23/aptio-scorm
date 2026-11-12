// HU-0610 · Disparadores simples en el reproductor (CP-069, REQ-045). Van solos en cada paquete, sin dependencias: las
// reglas de validación viven en `@aptio/schema/disparadores`; aquí solo se deciden cuáles se cumplen y qué se ve.
// - «tiempo» se cumple cuando el reloj de la pantalla (el de la línea de tiempo) llega a su segundo.
// - «fin-voz» se cumple cuando termina el audio de la narración en el idioma activo; sin audio, al entrar.
// - Se cumplen una sola vez por visita y en orden: si dos apuntan al mismo elemento, manda el último que se cumplió.
//   «mostrar» gana sobre `oculto` y `retardoS`; «ocultar», sobre `finS`. Al volver a la pantalla, todo empieza de nuevo.
import type { Disparador } from './tipos.ts';

/** Los disparadores de la lista que se cumplen ahora y aún no se habían cumplido, en su orden. */
export function cumplidos(lista: readonly Disparador[] | undefined, hechos: ReadonlySet<string>, s: number, vozTerminada: boolean): Disparador[] {
  return (lista ?? []).filter((d) => !hechos.has(d.id) && (d.cuando.evento === 'fin-voz' ? vozTerminada : typeof d.cuando.segundo === 'number' && s >= d.cuando.segundo));
}

/** Lo que manda sobre cada elemento según los disparadores cumplidos (en el orden en que se cumplieron). */
export function visibilidad(lista: readonly Disparador[] | undefined, orden: readonly string[]): Map<string, 'mostrar' | 'ocultar'> {
  const porId = new Map((lista ?? []).map((d) => [d.id, d]));
  const vista = new Map<string, 'mostrar' | 'ocultar'>();
  for (const id of orden) {
    const d = porId.get(id);
    if (d && (d.accion.tipo === 'mostrar' || d.accion.tipo === 'ocultar') && d.accion.elementoId) vista.set(d.accion.elementoId, d.accion.tipo);
  }
  return vista;
}

/** Los elementos a los que apunta algún disparador (para restablecerlos al volver a la pantalla). */
export const elementosConDisparador = (lista: readonly Disparador[] | undefined): string[] =>
  [...new Set((lista ?? []).flatMap((d) => (d.accion.elementoId && d.accion.tipo !== 'ir-a' ? [d.accion.elementoId] : [])))];

/** El último segundo con un disparador por tiempo (el reloj sigue hasta ahí). */
export const ultimoSegundo = (lista: readonly Disparador[] | undefined): number =>
  (lista ?? []).reduce((m, d) => (d.cuando.evento === 'tiempo' && typeof d.cuando.segundo === 'number' ? Math.max(m, d.cuando.segundo) : m), 0);
