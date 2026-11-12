// HU-0903 · Pausas propuestas por la IA desde la transcripción (CP-082, REQ-027, IA-09 v2). La IA lee los segmentos de
// la transcripción del video (con sus tiempos) y devuelve los cambios de tema que detectó y los marcadores que propone.
// Estas reglas puras las usan el worker (validación extra de IA-09, con reintentos) y la API (al aplicar las elegidas).
import { erroresMarcadores, type MarcadorVideo, mmss } from './marcadores.js';

export const TAREA_PAUSAS = 'IA-09';
/** Un marcador propuesto a menos de esto de otro del mismo tipo se omite al aplicar. */
export const DISTANCIA_MINIMA_MS = 2000;
/** Margen para reconocer el final de un segmento (los segmentos traen un decimal). */
const MARGEN_FIN_MS = 250;

/** Un segmento de la transcripción del material del cliente (HU-0305): desde y hasta en segundos. */
export interface SegmentoPausas { desde: number; hasta: number; texto: string }
/** Un momento en que la transcripción cambia de tema (no incluye el inicio del video). */
export interface CambioTema { tiempoMs: number; tema: string }
/** Salida de IA-09 v2. */
export interface PropuestaPausas {
  duracionMs: number;
  cambiosTema: CambioTema[];
  marcadores: MarcadorVideo[];
  observaciones?: string[];
}

const finesDe = (segmentos: readonly SegmentoPausas[]) => segmentos.map((s) => Math.round(s.hasta * 1000));

/** El marcador cae en un borde de frase: el inicio del video o el final de un segmento de la transcripción. */
export const alFinDeFrase = (tiempoMs: number, segmentos: readonly SegmentoPausas[]): boolean =>
  tiempoMs === 0 || finesDe(segmentos).some((f) => Math.abs(f - tiempoMs) <= MARGEN_FIN_MS);

/** Duración que vale para la propuesta: la del video si se conoce; si no, el final de la transcripción. */
export const duracionPropuesta = (segmentos: readonly SegmentoPausas[], duracionMs?: number): number =>
  duracionMs ?? Math.max(0, ...finesDe(segmentos));

/**
 * Los tramos de cada cambio de tema: del cambio al siguiente (o al final del video), con los dos bordes incluidos,
 * porque una pregunta al cerrar un tema cae justo donde empieza el otro.
 */
export function tramos(cambios: readonly CambioTema[], duracionMs: number): { desde: number; hasta: number; tema: string }[] {
  const orden = [...cambios].sort((a, b) => a.tiempoMs - b.tiempoMs);
  return orden.map((c, i) => ({ desde: c.tiempoMs, hasta: orden[i + 1]?.tiempoMs ?? duracionMs, tema: c.tema }));
}

/**
 * Reglas propias de la salida de IA-09 v2 (además del esquema). Lista vacía = válida.
 * - Al menos un cambio de tema, sin repetir y dentro del video.
 * - Al menos un marcador en el tramo de cada cambio de tema (CP-082).
 * - Ningún marcador en mitad de una frase (cae al final de un segmento) ni más allá de la duración.
 * - Los marcadores pasan `erroresMarcadores` (ids, preguntas con enunciado, 2 opciones y 1 correcta).
 */
export function erroresPausas(d: PropuestaPausas, segmentos: readonly SegmentoPausas[], duracionMs?: number): string[] {
  const errores: string[] = [];
  const duracion = duracionPropuesta(segmentos, duracionMs);
  const cambios = d.cambiosTema ?? [];
  if (!cambios.length) errores.push('cambiosTema: la transcripción no trae ningún cambio de tema');
  const vistos = new Set<number>();
  cambios.forEach((c, i) => {
    if (vistos.has(c.tiempoMs)) errores.push(`cambiosTema/${i}: el cambio de ${mmss(c.tiempoMs)} se repite`);
    vistos.add(c.tiempoMs);
    if (c.tiempoMs <= 0 || c.tiempoMs > duracion) errores.push(`cambiosTema/${i}: el cambio de ${mmss(c.tiempoMs)} está fuera del video (${mmss(duracion)})`);
  });
  for (const t of tramos(cambios, duracion)) {
    if (!d.marcadores.some((m) => m.tiempoMs >= t.desde && m.tiempoMs <= t.hasta)) {
      errores.push(`cambiosTema: el tema «${t.tema}» (${mmss(t.desde)} a ${mmss(t.hasta)}) no tiene ningún marcador`);
    }
  }
  d.marcadores.forEach((m, i) => {
    if (m.tiempoMs <= duracion && !alFinDeFrase(m.tiempoMs, segmentos)) {
      errores.push(`marcadores/${i}: ${mmss(m.tiempoMs)} cae en mitad de una frase; usa el final de un segmento de la transcripción`);
    }
  });
  errores.push(...erroresMarcadores('propuesta', d.marcadores, duracion));
  return errores;
}

/** Antes de validar: ordena por tiempo y marca lo propuesto como hecho por la IA, sin revisar. */
export function normalizarPausas(d: PropuestaPausas): PropuestaPausas {
  return {
    ...d,
    cambiosTema: [...(d.cambiosTema ?? [])].sort((a, b) => a.tiempoMs - b.tiempoMs),
    marcadores: [...(d.marcadores ?? [])].sort((a, b) => a.tiempoMs - b.tiempoMs).map((m) => ({ ...m, origen: { tipo: 'ia', revisado: false } })),
  };
}

const NOMBRE: Record<string, string> = { pregunta: 'la pregunta', punto: 'el punto', capitulo: 'el capítulo' };

/** Un id `${pantallaId}-vm-N` que no esté en `usados` (y lo agrega). */
function idLibre(pantallaId: string, usados: Set<string>): string {
  let n = 1;
  while (usados.has(`${pantallaId}-vm-${n}`)) n++;
  const id = `${pantallaId}-vm-${n}`;
  usados.add(id);
  return id;
}

/** El marcador con su id nuevo y marcado como de la IA; la pregunta y sus opciones toman ids derivados, así nada choca. */
function conId(m: MarcadorVideo, id: string): MarcadorVideo {
  const copia = structuredClone(m);
  copia.id = id;
  // Lo agregado por la IA se marca (principio de trazabilidad) hasta que alguien lo revise.
  copia.origen = { tipo: 'ia', revisado: false };
  if (copia.pregunta) {
    copia.pregunta.id = `${id}-q`;
    copia.pregunta.opciones = copia.pregunta.opciones.map((o, i) => ({ ...o, id: `${id}-q-${'abcdefghij'[i] ?? i}` }));
  }
  return copia;
}

export interface ResultadoPausas {
  marcadores: MarcadorVideo[];
  /** Los ids nuevos de los marcadores que se sumaron. */
  agregados: string[];
  /** Por qué se omitió alguno elegido (a menos de 2 s de otro del mismo tipo). */
  observaciones: string[];
}

/**
 * Suma los marcadores elegidos (`elegidos`, ids de la propuesta) a los que ya tiene el video, sin reemplazar ninguno.
 * Cada uno toma un id nuevo `${pantallaId}-vm-N`; uno a menos de 2 s de otro del mismo tipo (existente o recién sumado)
 * se omite y se dice por qué. El resultado pasa `erroresMarcadores`; si no, lanza un Error con los motivos.
 * `idsCurso` son los ids que ya usa el curso (los ids son únicos en todo el documento).
 */
export function aplicarPausas(
  existentes: readonly MarcadorVideo[], propuesta: Pick<PropuestaPausas, 'marcadores'>, elegidos: readonly string[],
  opciones: { pantallaId: string; ruta: string; duracionMs?: number | undefined; idsCurso?: Iterable<string> },
): ResultadoPausas {
  if (!elegidos.length) throw new Error('elige al menos un marcador');
  const porId = new Map(propuesta.marcadores.map((m) => [m.id, m]));
  const desconocidos = elegidos.filter((id) => !porId.has(id));
  if (desconocidos.length) throw new Error(`la propuesta no tiene ${desconocidos.map((x) => `«${x}»`).join(', ')}`);
  const usados = new Set([...(opciones.idsCurso ?? []), ...existentes.map((m) => m.id)]);
  const lista = [...existentes];
  const agregados: string[] = [];
  const observaciones: string[] = [];
  const elegidosOrden = propuesta.marcadores.filter((m) => elegidos.includes(m.id));
  for (const m of elegidosOrden) {
    const cerca = lista.find((x) => x.tipo === m.tipo && Math.abs(x.tiempoMs - m.tiempoMs) < DISTANCIA_MINIMA_MS);
    if (cerca) {
      observaciones.push(`Se omitió ${NOMBRE[m.tipo]} de ${mmss(m.tiempoMs)}: queda a menos de 2 s de otro marcador del mismo tipo (${mmss(cerca.tiempoMs)}).`);
      continue;
    }
    const nuevo = conId(m, idLibre(opciones.pantallaId, usados));
    if (nuevo.pregunta) { usados.add(nuevo.pregunta.id); for (const o of nuevo.pregunta.opciones) usados.add(o.id); }
    lista.push(nuevo);
    agregados.push(nuevo.id);
  }
  const marcadores = lista.sort((a, b) => a.tiempoMs - b.tiempoMs);
  const errores = erroresMarcadores(opciones.ruta, marcadores, opciones.duracionMs);
  if (errores.length) throw new Error(errores.join('; '));
  return { marcadores, agregados, observaciones };
}
