// HU-0801 · Subtítulos WebVTT de una narración (RN de docs/07-voz-personaje-idiomas.md, SUP-37). Los tiempos se reparten
// sobre la duración del audio en proporción a las letras de cada frase: con la voz simulada (65 ms por carácter) da
// exactamente el caso LOTO (`08-subtitulos-p03-es.vtt`) y sirve igual para la voz de Google que para una grabación.
// Es determinista y local. Se muestra el texto escrito, no la pronunciación del diccionario.

/** Un subtítulo cabe en 2 líneas de 42 caracteres. */
export const MAX_CARACTERES_SUBTITULO = 84;

export interface Subtitulo {
  inicioMs: number;
  finMs: number;
  texto: string;
}

/** Frases del texto con su posición: cortan en «.», «?», «!» o «…» seguidos de espacio. */
function frases(texto: string): { desde: number; texto: string }[] {
  const out: { desde: number; texto: string }[] = [];
  const re = /[^.?!…]+(?:[.?!…]+(?=\s|$)|$)|[.?!…]+/gu;
  for (const m of texto.matchAll(re)) {
    const crudo = m[0];
    const inicio = crudo.length - crudo.trimStart().length;
    const limpio = crudo.trim();
    if (limpio) out.push({ desde: m.index + inicio, texto: limpio });
  }
  return out;
}

/** Parte una frase larga en una coma o entre palabras, sin pasar de `max` caracteres por trozo. */
function partir(f: { desde: number; texto: string }, max: number): { desde: number; texto: string }[] {
  if (f.texto.length <= max) return [f];
  const ventana = f.texto.slice(0, max + 1);
  let corte = Math.max(ventana.lastIndexOf(', '), ventana.lastIndexOf('; '), ventana.lastIndexOf(': '));
  if (corte > max / 3) corte += 1;
  else corte = ventana.lastIndexOf(' ');
  if (corte <= 0) corte = max;
  const primero = f.texto.slice(0, corte).trimEnd();
  const resto = f.texto.slice(corte);
  const saltados = resto.length - resto.trimStart().length;
  return [{ desde: f.desde, texto: primero }, ...partir({ desde: f.desde + corte + saltados, texto: resto.trimStart() }, max)];
}

/** Subtítulos de una narración: una frase por subtítulo (partida si pasa de 84 caracteres), con tiempos por letras. */
export function subtitulosDeNarracion(texto: string, duracionMs: number, max = MAX_CARACTERES_SUBTITULO): Subtitulo[] {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio || duracionMs <= 0) return [];
  const paso = duracionMs / limpio.length;
  return frases(limpio).flatMap((f) => partir(f, max)).map((f) => ({
    inicioMs: Math.round(f.desde * paso),
    finMs: Math.min(Math.round(duracionMs), Math.round((f.desde + f.texto.length) * paso)),
    texto: f.texto,
  }));
}

const dos = (n: number) => String(n).padStart(2, '0');
/** 00:00:02.275 */
export function tiempoVtt(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  return `${dos(h)}:${dos(m)}:${dos(s)}.${String(t % 1000).padStart(3, '0')}`;
}

/** El texto viene del cliente o de la IA: se escapan los caracteres que WebVTT interpreta (y «-->»). */
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Archivo WebVTT con los subtítulos numerados, como el caso LOTO. */
export function aVtt(subtitulos: Subtitulo[]): string {
  // Cada bloque termina con una línea en blanco, también el último.
  return ['WEBVTT', '', ...subtitulos.flatMap((s, i) => [String(i + 1), `${tiempoVtt(s.inicioMs)} --> ${tiempoVtt(s.finMs)}`, escapar(s.texto), ''])].join('\n') + '\n';
}
