// HU-0702 · Marcas de boca [tiempoMs, boca] de una narración (RN-07-2). En producción las calcula Rhubarb Lip Sync
// desde el audio con su reconocedor fonético, que no depende del idioma; en modo simulado se reparten por letras sobre
// la duración del audio, con la misma regla que el caso LOTO grabado (`07-boca-p03.json`). Supuesto SUP-35.

/** Formas de boca de Rhubarb (A–F básicas, G, H y X extendidas), las mismas capas `boca_*` del personaje. */
export type FormaBoca = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';
export type MarcaBoca = [number, FormaBoca];

const FORMAS = new Set<string>(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X']);

export class BocaNoDisponible extends Error {}

/** Forma de boca de una letra en español (convención de Rhubarb, ver `docs/07-voz-personaje-idiomas.md`). */
export function bocaDeLetra(c: string): FormaBoca {
  if ('aá'.includes(c)) return 'D';
  if ('eé'.includes(c)) return 'C';
  if ('ií'.includes(c)) return 'B';
  if ('oó'.includes(c)) return 'E';
  if ('uúüw'.includes(c)) return 'F';
  if ('mbp'.includes(c)) return 'A';
  if ('fv'.includes(c)) return 'G';
  if (c === 'l') return 'H';
  if (' .,;:¿?¡!\n\t'.includes(c)) return 'X';
  return 'B';
}

/** Junta marcas seguidas con la misma boca, las ordena y cierra con reposo (X) al final del audio. */
export function normalizarBocas(marcas: MarcaBoca[], duracionMs: number): MarcaBoca[] {
  const out: MarcaBoca[] = [];
  for (const [ms, b] of [...marcas].sort((x, y) => x[0] - y[0])) {
    const t = Math.max(0, Math.round(ms));
    if (t >= duracionMs) break;
    if (out.length && out.at(-1)![1] === b) continue;
    if (out.length && out.at(-1)![0] === t) out.pop();
    if (out.length && out.at(-1)![1] === b) continue;
    out.push([t, b]);
  }
  // La última marca siempre es el reposo justo al final del audio (como en el caso LOTO), aunque ya venga en X.
  const fin = Math.max(0, Math.round(duracionMs));
  if (!out.length || out.at(-1)![0] < fin) out.push([fin, 'X']);
  return out;
}

/**
 * Modo simulado: una boca por letra de lo que dice la voz, repartidas en la duración del audio. Con la voz simulada
 * (65 ms por carácter) da exactamente las marcas del caso LOTO. Es determinista.
 */
export function bocasSimuladas(textoHablado: string, duracionMs: number): MarcaBoca[] {
  const letras = [...textoHablado.toLocaleLowerCase('es')];
  if (!letras.length) return [[0, 'X']];
  const paso = duracionMs / letras.length;
  return normalizarBocas(letras.map((c, i) => [i * paso, bocaDeLetra(c)]), duracionMs);
}

/** Salida JSON de `rhubarb -f json`: `mouthCues` con inicio y fin en segundos. */
export function bocasDeRhubarb(salida: string, duracionMs: number): MarcaBoca[] {
  let datos: { mouthCues?: { start: number; end: number; value: string }[] };
  try {
    datos = JSON.parse(salida) as typeof datos;
  } catch {
    throw new BocaNoDisponible('Rhubarb no devolvió un JSON legible');
  }
  if (!Array.isArray(datos.mouthCues)) throw new BocaNoDisponible('La salida de Rhubarb no trae marcas de boca');
  const marcas = datos.mouthCues.map((c): MarcaBoca => {
    if (!FORMAS.has(c.value) || !Number.isFinite(c.start)) throw new BocaNoDisponible(`Rhubarb devolvió una marca desconocida: ${c.value}`);
    return [c.start * 1000, c.value as FormaBoca];
  });
  return normalizarBocas(marcas, duracionMs);
}

export interface PedidoBoca {
  audio: Uint8Array;
  mime: string;
  /** Lo que dice la voz (con el diccionario aplicado); en modo simulado es la fuente de las marcas. */
  texto: string;
  duracionMs: number;
}

export interface ResultadoBoca {
  bocas: MarcaBoca[];
  metodo: 'rhubarb' | 'simulado';
}

export type CalculadorBocas = (pedido: PedidoBoca) => Promise<ResultadoBoca>;

export const calculadorSimulado: CalculadorBocas = async (p) => ({ bocas: bocasSimuladas(p.texto, p.duracionMs), metodo: 'simulado' });
