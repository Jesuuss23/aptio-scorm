// HU-0610 · Disparadores simples en el editor (CP-069): lógica pura del panel «Avanzado: disparadores» y de los ◆ de la
// línea de tiempo. Las reglas son las de `@aptio/schema/disparadores` (las mismas que aplica la API).
import type { Disparador } from '@aptio/player';
import { erroresDisparadores, MAX_DISPARADORES, SEGUNDO_MAXIMO } from '@aptio/schema/disparadores';

export { MAX_DISPARADORES as MAX_DISPAROS, SEGUNDO_MAXIMO };
export type Opcion = { id: string; nombre: string };

export const NOMBRE_CUANDO: Record<Disparador['cuando']['evento'], string> = { 'fin-voz': 'Termina la voz', tiempo: 'A los N s' };
export const NOMBRE_HACER: Record<Disparador['accion']['tipo'], string> = { mostrar: 'Mostrar', ocultar: 'Ocultar', 'ir-a': 'Ir a otra pantalla' };

/** Un id libre para la pantalla (`p05-disp-1`, `p05-disp-2`…): los ids del curso no se repiten entre pantallas. */
export function idLibre(pantallaId: string, lista: readonly Disparador[]): string {
  const usados = new Set(lista.map((d) => d.id));
  let n = 1;
  while (usados.has(`${pantallaId}-disp-${n}`)) n++;
  return `${pantallaId}-disp-${n}`;
}

/** «+ Nuevo disparador»: a los 3 s, mostrar el primer elemento oculto (o el primero de la pantalla). */
export function nuevoDisparador(pantallaId: string, lista: readonly Disparador[], elementos: readonly (Opcion & { oculto?: boolean })[]): Disparador {
  const elemento = elementos.find((e) => e.oculto) ?? elementos[0];
  return { id: idLibre(pantallaId, lista), cuando: { evento: 'tiempo', segundo: 3 }, accion: { tipo: 'mostrar', ...(elemento ? { elementoId: elemento.id } : {}) } };
}

/** Cambia el evento o la acción conservando lo que sirve (el segundo al volver a «tiempo», el destino del mismo tipo). */
export function conEvento(d: Disparador, evento: Disparador['cuando']['evento']): Disparador {
  return { ...d, cuando: evento === 'tiempo' ? { evento, segundo: d.cuando.segundo ?? 3 } : { evento } };
}
export function conAccion(d: Disparador, tipo: Disparador['accion']['tipo'], elementos: readonly Opcion[], pantallas: readonly Opcion[]): Disparador {
  if (tipo === 'ir-a') return { ...d, accion: { tipo, ...(pantallas[0] ? { pantallaId: d.accion.pantallaId ?? pantallas[0].id } : {}) } };
  const elementoId = d.accion.elementoId ?? elementos[0]?.id;
  return { ...d, accion: { tipo, ...(elementoId ? { elementoId } : {}) } };
}

/** Errores de la lista, por fila (índice), con las reglas de la API. */
export function erroresPorFila(pantalla: { id: string; bloques: { id: string }[]; extras?: { id: string }[] }, lista: readonly Disparador[], pantallas: readonly string[]): Map<number, string> {
  const filas = new Map<number, string>();
  for (const e of erroresDisparadores({ ...pantalla, disparadores: lista }, pantallas)) {
    const m = /\/disparadores\/(\d+)(?:\/\w+)?: (.*)$/.exec(e);
    if (m && !filas.has(Number(m[1]))) filas.set(Number(m[1]), m[2]!.replace(/^./, (c) => c.toUpperCase()));
  }
  return filas;
}

/** «A los 3 s → mostrar «Seguir»» (para el ◆ de la regla y los avisos). */
export function describir(d: Disparador, elementos: readonly Opcion[], pantallas: readonly Opcion[]): string {
  const cuando = d.cuando.evento === 'tiempo' ? `A los ${String(d.cuando.segundo ?? 0).replace('.', ',')} s` : 'Al terminar la voz';
  const destino = d.accion.tipo === 'ir-a'
    ? `ir a ${pantallas.find((p) => p.id === d.accion.pantallaId)?.nombre ?? 'otra pantalla'}`
    : `${d.accion.tipo} «${elementos.find((e) => e.id === d.accion.elementoId)?.nombre ?? 'elemento'}»`;
  return `${cuando} → ${destino}`;
}

/** Los ◆ de la regla: los disparadores por tiempo, con su segundo y su descripción. */
export const marcasDisparo = (lista: readonly Disparador[], elementos: readonly Opcion[], pantallas: readonly Opcion[]) =>
  lista.filter((d) => d.cuando.evento === 'tiempo' && typeof d.cuando.segundo === 'number')
    .map((d) => ({ id: d.id, segundo: d.cuando.segundo!, texto: describir(d, elementos, pantallas) }));
