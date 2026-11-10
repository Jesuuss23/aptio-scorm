// HU-0801 · Subtítulos WebVTT de la narración: se leen del archivo de cada pantalla y, mientras suena el audio, «CC»
// muestra la frase que se está diciendo (SUP-37). Solo entiende lo que escribe el generador (tiempos y texto), y lo
// muestra como texto plano: nunca como HTML.

export interface Cue {
  inicioMs: number;
  finMs: number;
  texto: string;
}

const TIEMPO = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/;

function ms(t: string): number | null {
  const m = TIEMPO.exec(t.trim());
  if (!m) return null;
  return ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4]);
}

const desescapar = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** Lee un WebVTT; lo que no entiende lo salta. Sin la cabecera WEBVTT devuelve una lista vacía. */
export function leerVtt(texto: string): Cue[] {
  const lineas = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  if (!lineas[0]?.startsWith('WEBVTT')) return [];
  const cues: Cue[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const flecha = lineas[i]!.indexOf('-->');
    if (flecha < 0) continue;
    const inicio = ms(lineas[i]!.slice(0, flecha));
    const fin = ms(lineas[i]!.slice(flecha + 3).trim().split(/\s+/)[0] ?? '');
    const texto: string[] = [];
    while (i + 1 < lineas.length && lineas[i + 1]!.trim() !== '') texto.push(lineas[++i]!);
    if (inicio !== null && fin !== null && fin > inicio && texto.length) {
      cues.push({ inicioMs: inicio, finMs: fin, texto: desescapar(texto.join('\n').replace(/<[^>]*>/g, '')) });
    }
  }
  return cues.sort((a, b) => a.inicioMs - b.inicioMs);
}

/**
 * La frase de ese momento: la última que ya empezó. En el hueco entre dos frases sigue la anterior, para que el
 * texto no parpadee; después del final del audio no hay ninguna.
 */
export function cueEn(cues: Cue[], ms: number): Cue | undefined {
  let elegido: Cue | undefined;
  for (const c of cues) {
    if (c.inicioMs > ms) break;
    elegido = c;
  }
  return elegido && ms <= (cues.at(-1)?.finMs ?? 0) ? elegido : undefined;
}
