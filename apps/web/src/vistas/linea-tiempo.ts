// HU-0608 · Lógica de la línea de tiempo del editor (sin DOM): las pistas de la pantalla y lo que deja cada arrastre.
// - Narración palabra por palabra con las marcas de SUP-47; subtítulos del WebVTT; boca desde sus marcas [ms, boca].
// - Una barra por elemento con su entrada y su salida (las del reproductor: sin tiempo, escalonado de a 0,3 s).
// - Arrastrar el cuerpo mueve la entrada (y la salida, si tiene); el borde izquierdo, la entrada; el derecho, la salida.
//   La entrada se imanta a una palabra (y queda anclada a ella) o a décimas; la salida, a décimas. Con Alt, sin imán.
import type { Cue, TiempoElemento } from '@aptio/player';
import { imantar, type MarcaPalabra, PASO_S } from '@aptio/schema/tiempos';

/** Píxeles por segundo: los límites del zoom y el paso de −/+. */
export const ZOOM_MIN = 40;
export const ZOOM_MAX = 320;
export const ZOOM_PASO = 1.25;
/** Lo mínimo que dura una barra. */
export const BARRA_MIN_S = 0.1;

const redondear = (s: number, d = 2) => Math.round(s * 10 ** d) / 10 ** d;
export const zoomSiguiente = (pps: number, d: 1 | -1) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(d > 0 ? pps * ZOOM_PASO : pps / ZOOM_PASO)));
/** Zoom para que la pantalla entera quepa en el ancho disponible. */
export const zoomAjustado = (anchoPx: number, duracionS: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.floor(anchoPx / Math.max(duracionS, 1))));

/** Segundos que suman `px` píxeles con ese zoom. */
export const pxAS = (px: number, pps: number) => px / pps;

/** Tramos de la boca: cada marca dura hasta la siguiente (la última, hasta el final de la voz). Los X seguidos se juntan. */
export function tramosBoca(bocas: [number, string][] | undefined, duracionMs: number): { boca: string; inicioS: number; finS: number }[] {
  const out: { boca: string; inicioS: number; finS: number }[] = [];
  (bocas ?? []).forEach(([ms, boca], i, todas) => {
    const fin = (todas[i + 1]?.[0] ?? duracionMs) / 1000;
    const previo = out.at(-1);
    if (previo && previo.boca === boca) previo.finS = fin;
    else out.push({ boca, inicioS: ms / 1000, finS: fin });
  });
  return out.filter((t) => t.finS > t.inicioS);
}

/** Subtítulos en segundos para la pista. */
export const tramosSubtitulos = (cues: Cue[]) => cues.map((c) => ({ texto: c.texto, inicioS: c.inicioMs / 1000, finS: c.finMs / 1000 }));

export type Borde = 'cuerpo' | 'inicio' | 'fin';
/** Los campos del ajuste que cambian; undefined los quita (vuelve al escalonado, sin salida o sin ancla). */
export type CambioTiempo = { retardoS?: number | undefined; finS?: number | undefined; anclaPalabra?: number | undefined };

/**
 * Lo que deja arrastrar una barra `dS` segundos. `x` es como estaba (inicio y salida que se ven); `duracion`, el largo de
 * la pantalla, para no salir de ella.
 */
export function arrastrar(x: Pick<TiempoElemento, 'inicioS' | 'finS'>, borde: Borde, dS: number, marcas: MarcaPalabra[], duracion: number, libre = false): CambioTiempo {
  const fin = x.finS;
  if (borde === 'fin') {
    // La salida puede pasar del final: la pantalla dura entonces hasta ella (RN-06-7).
    const salida = Math.max(x.inicioS + BARRA_MIN_S, Math.round(((fin ?? duracion) + dS) / PASO_S) * PASO_S);
    return { finS: redondear(salida, 1) };
  }
  const largo = fin === null ? null : fin - x.inicioS;
  const tope = borde === 'inicio' && fin !== null ? fin - BARRA_MIN_S : Math.max(0, duracion - BARRA_MIN_S);
  const pedido = Math.min(tope, Math.max(0, x.inicioS + dS));
  const im = imantar(pedido, marcas, libre);
  const inicio = Math.min(tope, im.s);
  const ancla = im.anclaPalabra !== undefined && inicio === im.s ? im.anclaPalabra : undefined;
  const salida = borde === 'cuerpo' && largo !== null ? redondear(inicio + largo) : (fin ?? undefined);
  return { retardoS: inicio, finS: salida, anclaPalabra: ancla };
}


/** Las marcas de la regla: cada medio segundo, con número en los enteros. */
export function marcasRegla(duracion: number): { s: number; entero: boolean }[] {
  const out: { s: number; entero: boolean }[] = [];
  for (let i = 0; i * 0.5 <= duracion + 1e-6; i++) out.push({ s: i * 0.5, entero: i % 2 === 0 });
  return out;
}

/** «2,4 s», como lo muestra el editor. */
export const formatoS = (s: number) => `${(Math.round(s * 10) / 10).toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
