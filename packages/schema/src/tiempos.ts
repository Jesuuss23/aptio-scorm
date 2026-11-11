// HU-0608 · Tiempos de la línea de tiempo (RN-06-7, SUP-47). Lógica pura, la usan el editor y, en el PR 2, el worker.
// - Las marcas de palabra se reparten sobre la duración del audio en proporción a las letras, igual que los subtítulos
//   (SUP-37): con la voz simulada (65 ms por carácter) coinciden con el caso LOTO, y sirven para Google y para audio
//   grabado. Si un proveedor da marcas reales (Azure), se usan esas. Los tiempos siguen la narración en español.
// - `imantar` lleva un segundo a la palabra más cercana (a menos de 0,25 s) o a décimas; con Alt no imanta a palabras.
// - `duracionPantalla`: la mayor entre la voz + 1 s y la salida del último elemento (RN-06-7).

/** Una palabra de la narración con su tiempo, en segundos desde el inicio de la pantalla. */
export interface MarcaPalabra {
  indice: number;
  texto: string;
  inicioS: number;
  finS: number;
}

/** Distancia máxima para imantar a una palabra, en segundos. */
export const IMAN_PALABRA_S = 0.25;
/** Paso cuando no hay palabra cerca: décimas de segundo. */
export const PASO_S = 0.1;
/** Separación de la entrada escalonada cuando un elemento no tiene tiempo (RN-06-9). */
export const ESCALONADO_S = 0.3;
/** Duración de una pantalla sin voz ni tiempos. */
export const DURACION_MINIMA_S = 3;

const redondear = (s: number, decimales: number) => Math.round(s * 10 ** decimales) / 10 ** decimales;

/** Palabras de la narración con su tiempo, por letras sobre la duración del audio. Sin texto o sin duración, ninguna. */
export function marcasPalabra(texto: string, duracionMs: number): MarcaPalabra[] {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio || !(duracionMs > 0)) return [];
  const paso = duracionMs / limpio.length / 1000;
  return [...limpio.matchAll(/\S+/g)].map((m, indice) => ({
    indice,
    texto: m[0],
    inicioS: redondear(m.index * paso, 3),
    finS: redondear((m.index + m[0].length) * paso, 3),
  }));
}

/** La palabra que suena en el segundo `s` (la última que empezó), o ninguna antes de la primera o después de la voz. */
export function palabraEn(marcas: MarcaPalabra[], s: number): MarcaPalabra | undefined {
  const ultima = marcas.at(-1);
  if (!ultima || s < marcas[0]!.inicioS || s >= ultima.finS) return undefined;
  let actual: MarcaPalabra | undefined;
  for (const m of marcas) if (m.inicioS <= s) actual = m;
  return actual;
}

/**
 * Lleva un segundo al inicio de la palabra más cercana (a menos de 0,25 s) y la deja como ancla; si no hay ninguna cerca
 * o `libre` (Alt), lo redondea a décimas. Nunca es negativo.
 */
export function imantar(s: number, marcas: MarcaPalabra[], libre = false): { s: number; anclaPalabra?: number } {
  const t = Math.max(0, s);
  if (!libre) {
    let cerca: MarcaPalabra | undefined;
    for (const m of marcas) if (Math.abs(m.inicioS - t) <= IMAN_PALABRA_S && (!cerca || Math.abs(m.inicioS - t) < Math.abs(cerca.inicioS - t))) cerca = m;
    if (cerca) return { s: redondear(cerca.inicioS, 2), anclaPalabra: cerca.indice };
  }
  return { s: redondear(Math.round(t / PASO_S) * PASO_S, 1) };
}

type Tiempo = { retardoS?: number; finS?: number };

/**
 * Cuándo aparece y sale cada elemento, en orden: con `retardoS` el que tiene; sin él, escalonado de a 0,3 s según su
 * lugar (RN-06-9). `finS` null: queda hasta el final de la pantalla.
 */
export function tiemposElementos(ids: string[], ajustes: Record<string, Tiempo | undefined> = {}): { id: string; inicioS: number; finS: number | null; definido: boolean }[] {
  return ids.map((id, i) => {
    const a = ajustes[id];
    const definido = typeof a?.retardoS === 'number';
    return { id, inicioS: definido ? a!.retardoS! : redondear(i * ESCALONADO_S, 1), finS: typeof a?.finS === 'number' ? a.finS : null, definido };
  });
}

/** Duración de la pantalla en segundos: la mayor entre la voz + 1 s y la salida (o la entrada + 1 s) del último elemento. */
export function duracionPantalla(duracionVozMs: number | undefined, ajustes: Record<string, Tiempo | undefined> = {}): number {
  let fin = duracionVozMs && duracionVozMs > 0 ? duracionVozMs / 1000 + 1 : DURACION_MINIMA_S;
  for (const a of Object.values(ajustes)) {
    if (typeof a?.finS === 'number') fin = Math.max(fin, a.finS);
    if (typeof a?.retardoS === 'number') fin = Math.max(fin, a.retardoS + 1);
  }
  return redondear(fin, 2);
}
