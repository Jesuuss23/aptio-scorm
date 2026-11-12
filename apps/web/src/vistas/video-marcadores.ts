// HU-0901 · Video interactivo (PNT-10, CP-080): lógica pura de la vista. Las reglas son las de
// `@aptio/schema/marcadores` (las mismas que aplica la API al guardar).
import { erroresMarcadores, type MarcadorVideo, mmss } from '@aptio/schema/marcadores';
import { type CursoDoc, pantallasDe } from '@aptio/schema/revision';

export { mmss, type MarcadorVideo };
export const MAX_OPCIONES = 6;
export const NOMBRE_TIPO: Record<MarcadorVideo['tipo'], string> = { pregunta: 'Pregunta', punto: 'Punto interactivo', capitulo: 'Capítulo' };

export interface PantallaVideo { pantallaId: string; numero: number; titulo: string; bloqueId: string; recursoId: string; marcadores: MarcadorVideo[]; impedirAdelantar: boolean }

/** Las pantallas del curso con un bloque de video, con su número en el recorrido. */
export function pantallasConVideo(doc: CursoDoc): PantallaVideo[] {
  return pantallasDe(doc).flatMap((p, i) => (p.bloques as unknown as { id: string; tipo: string; recursoId?: string; marcadores?: MarcadorVideo[]; reglas?: { impedirAdelantar?: boolean } }[])
    .filter((b) => b.tipo === 'video')
    .map((b) => ({ pantallaId: p.id, numero: i + 1, titulo: p.titulo.es ?? '', bloqueId: b.id, recursoId: b.recursoId ?? '', marcadores: b.marcadores ?? [], impedirAdelantar: b.reglas?.impedirAdelantar === true })));
}

/** La duración del video en ms, si el curso la conoce (`recursos[].duracionMs`). */
export const duracionDe = (doc: CursoDoc, recursoId: string): number | undefined =>
  ((doc as { recursos?: { id: string; duracionMs?: number }[] }).recursos ?? []).find((r) => r.id === recursoId)?.duracionMs;

/** Un id libre (`p18-vm-1`, `p18-vm-2`…): los ids del curso no se repiten entre pantallas. */
export function idLibre(pantallaId: string, lista: readonly MarcadorVideo[]): string {
  const usados = new Set(lista.map((m) => m.id));
  let n = 1;
  while (usados.has(`${pantallaId}-vm-${n}`)) n++;
  return `${pantallaId}-vm-${n}`;
}

const LETRAS = 'abcdefghij';
/** Id libre para una opción nueva de la pregunta. */
export function idOpcion(m: MarcadorVideo): string {
  const usados = new Set(m.pregunta?.opciones.map((o) => o.id));
  return `${m.id}-q-${[...LETRAS].find((l) => !usados.has(`${m.id}-q-${l}`))}`;
}

/** «+ Pregunta en 0:45»: obligatoria, con 2 opciones vacías (la primera, correcta) y la retroalimentación de siempre. */
export function nuevaPregunta(pantallaId: string, lista: readonly MarcadorVideo[], tiempoMs: number): MarcadorVideo {
  const id = idLibre(pantallaId, lista);
  return {
    id, tiempoMs: Math.max(0, Math.round(tiempoMs)), tipo: 'pregunta', obligatorio: true,
    pregunta: {
      id: `${id}-q`, enunciado: { es: '' },
      opciones: [{ id: `${id}-q-a`, contenido: { texto: { es: '' } }, correcta: true }, { id: `${id}-q-b`, contenido: { texto: { es: '' } }, correcta: false }],
      retroalimentacion: { correcta: { es: '¡Correcto! Sigue el video.' }, incorrecta: { es: 'Revisa lo que acabas de ver e intenta de nuevo.' } },
    },
  };
}

/** La lista en orden de tiempo (estable: a igual tiempo, como estaba). */
export const ordenar = (lista: readonly MarcadorVideo[]): MarcadorVideo[] => [...lista].sort((a, b) => a.tiempoMs - b.tiempoMs);

/** Errores de la lista, por id de marcador, con las reglas de la API (el primero de cada uno, con mayúscula). */
export function erroresPorMarcador(lista: readonly MarcadorVideo[], duracionMs?: number): Map<string, string> {
  const errores = new Map<string, string>();
  for (const e of erroresMarcadores('v', lista, duracionMs)) {
    const m = /^v\/marcadores\/(\d+)(?:\/\w+)?: (.*)$/.exec(e);
    const id = m ? lista[Number(m[1])]?.id : undefined;
    if (id && !errores.has(id)) errores.set(id, m![2]!.replace(/^./, (c) => c.toUpperCase()));
  }
  return errores;
}

/** Lugar del marcador en la línea, en % (0 a 100). */
export const posicion = (tiempoMs: number, duracionMs: number): number => (duracionMs > 0 ? Math.min(100, Math.max(0, (tiempoMs / duracionMs) * 100)) : 0);

/** El texto que nombra al marcador en la línea y en la lista. */
export function describir(m: MarcadorVideo): string {
  const texto = m.tipo === 'pregunta' ? m.pregunta?.enunciado.es : m.titulo?.es;
  return `${NOMBRE_TIPO[m.tipo]} en ${mmss(m.tiempoMs)}${texto?.trim() ? `: ${texto.trim()}` : ''}`;
}
