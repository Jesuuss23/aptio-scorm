// HU-0608 · Tiempos de la línea de tiempo (RN-06-7, SUP-47). Lógica pura, la usan el editor y, en el PR 2, el worker.
// - Las marcas de palabra se reparten sobre la duración del audio en proporción a las letras, igual que los subtítulos
//   (SUP-37): con la voz simulada (65 ms por carácter) coinciden con el caso LOTO, y sirven para Google y para audio
//   grabado. Si un proveedor da marcas reales (Azure), se usan esas. Los tiempos siguen la narración en español.
// - `imantar` lleva un segundo a la palabra más cercana (a menos de 0,25 s) o a décimas; con Alt no imanta a palabras.
// - `duracionPantalla`: la mayor entre la voz + 1 s y la salida del último elemento (RN-06-7).
// - PR 2 · `reanclar` sigue la palabra del ancla cuando cambia la narración (RN-06-8, CP-067); `retardoDeAncla` da su
//   segundo con las marcas de la voz nueva; `sincronizarConVoz` es la heurística local de «✦ Sincronizar con la voz»
//   (SUP-48, CP-068), sin IA.

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

/** Palabra comparable: minúsculas, sin tildes ni signos. */
export const normalizarPalabra = (w: string) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const palabrasDe = (texto: string) => (texto.match(/\S+/g) ?? []).map(normalizarPalabra);

/**
 * El índice que tiene en `textoNuevo` la palabra `indice` de `textoViejo`, alineando las dos narraciones palabra por
 * palabra (la subsecuencia común más larga). `undefined` si la palabra ya no está (RN-06-8).
 */
export function reanclar(textoViejo: string, textoNuevo: string, indice: number): number | undefined {
  const a = palabrasDe(textoViejo);
  const b = palabrasDe(textoNuevo);
  if (indice < 0 || indice >= a.length) return undefined;
  // Tabla de la subsecuencia común más larga desde el final; luego se recorre para emparejar.
  const n = a.length;
  const m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i]![j] = a[i] === b[j] && a[i] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j] && a[i] && t[i]![j] === t[i + 1]![j + 1]! + 1) {
      if (i === indice) return j;
      i++;
      j++;
    } else if (t[i + 1]![j]! >= t[i]![j + 1]!) {
      if (i === indice) return undefined;
      i++;
    } else j++;
  }
  return undefined;
}

/** El segundo en que empieza la palabra `indice` (redondeado como el imán), o `undefined` si la voz no la tiene. */
export function retardoDeAncla(marcas: MarcaPalabra[], indice: number): number | undefined {
  const m = marcas[indice];
  return m ? redondear(m.inicioS, 2) : undefined;
}

type ElementoSincronizable = { id: string; tipo: string; rol?: string; contenido?: { es?: string }; alt?: { es?: string }; texto?: { es?: string } };
export type TiempoSincronizado = { retardoS: number; anclaPalabra?: number };

/**
 * «✦ Sincronizar con la voz» (SUP-48): el título y el personaje entran en 0 s; cada otro elemento con texto (o con
 * texto alternativo, si es una imagen) se ancla a la primera de sus palabras de 4 letras o más que Ana dice, igual o
 * con las mismas 5 primeras letras, sin tildes. Lo que no se encuentra queda como estaba (no aparece en `tiempos`).
 */
export function sincronizarConVoz(
  p: { bloques: ElementoSincronizable[]; extras?: ElementoSincronizable[] },
  marcas: MarcaPalabra[],
): { tiempos: Record<string, TiempoSincronizado>; encontrados: number; total: number } {
  const dichas = marcas.map((m) => normalizarPalabra(m.texto));
  const tiempos: Record<string, TiempoSincronizado> = {};
  let encontrados = 0;
  const elementos = [...p.bloques, ...(p.extras ?? [])];
  for (const e of elementos) {
    if (e.tipo === 'personaje' || (e.tipo === 'texto' && e.rol === 'titulo') || e.tipo === 'titulo') {
      tiempos[e.id] = { retardoS: 0 };
      continue;
    }
    const texto = e.tipo === 'imagen' ? e.alt?.es : (e.contenido?.es ?? e.texto?.es);
    let ancla: number | undefined;
    for (const w of palabrasDe(texto ?? '').filter((x) => x.length >= 4)) {
      const i = dichas.findIndex((x) => x === w || (x.length >= 5 && w.length >= 5 && x.slice(0, 5) === w.slice(0, 5)));
      if (i >= 0) {
        ancla = i;
        break;
      }
    }
    if (ancla === undefined) continue;
    tiempos[e.id] = { retardoS: retardoDeAncla(marcas, ancla)!, anclaPalabra: ancla };
    encontrados++;
  }
  return { tiempos, encontrados, total: elementos.length };
}

/** Origen de la observación «Revisar tiempo» (no es de reglas: no se recalcula en cada guardado). */
export const ORIGEN_REVISAR_TIEMPO = 'tiempo';
/** Mensaje de la observación «Revisar tiempo»; lleva el id del elemento entre paréntesis para encontrarla. */
export const mensajeRevisarTiempo = (id: string) => `Revisar tiempo: la palabra de anclaje fue eliminada (${id}).`;
/** El id del elemento de una observación «Revisar tiempo». */
export const elementoRevisarTiempo = (mensaje: string) => /^Revisar tiempo: .*\(([^()]+)\)\.$/.exec(mensaje)?.[1];

type AjusteTiempo = { retardoS?: number; anclaPalabra?: number };

/**
 * RN-06-8 · La narración cambió de `textoViejo` a `textoNuevo`: cada elemento anclado pasa a la misma palabra en el
 * texto nuevo. Si la palabra ya no está, pierde el ancla y conserva su segundo. Cambia `ajustes` y devuelve los ids
 * que perdieron el ancla (para la observación «Revisar tiempo»).
 */
export function reanclarAjustes(ajustes: Record<string, AjusteTiempo | undefined> | undefined, textoViejo: string, textoNuevo: string): string[] {
  const perdidos: string[] = [];
  for (const [id, a] of Object.entries(ajustes ?? {})) {
    if (typeof a?.anclaPalabra !== 'number') continue;
    const nuevo = reanclar(textoViejo, textoNuevo, a.anclaPalabra);
    if (nuevo === undefined) {
      delete a.anclaPalabra;
      perdidos.push(id);
    } else a.anclaPalabra = nuevo;
  }
  return perdidos;
}

/**
 * RN-06-8 · Con la voz nueva, cada elemento anclado toma el segundo de su palabra. Devuelve los ids cuyo índice ya no
 * está en la voz (pierden el ancla y conservan su segundo).
 */
export function recalcularAnclas(ajustes: Record<string, AjusteTiempo | undefined> | undefined, marcas: MarcaPalabra[]): string[] {
  const perdidos: string[] = [];
  for (const [id, a] of Object.entries(ajustes ?? {})) {
    if (typeof a?.anclaPalabra !== 'number') continue;
    const s = retardoDeAncla(marcas, a.anclaPalabra);
    if (s === undefined) {
      delete a.anclaPalabra;
      perdidos.push(id);
    } else a.retardoS = s;
  }
  return perdidos;
}
