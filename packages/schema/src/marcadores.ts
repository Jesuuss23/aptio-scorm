// HU-0901 · Preguntas en el video (CP-080, RN-09-1): los marcadores viven en el bloque de video (`marcadores`), con su
// tiempo y, si son preguntas, la pregunta que pausa el video. Esta validación la usan el validador del curso, la API y
// la vista Video interactivo (PNT-10).

export const TIPOS_MARCADOR = ['pregunta', 'punto', 'capitulo'] as const;
export type TipoMarcador = (typeof TIPOS_MARCADOR)[number];

type Texto = Record<string, string | undefined>;
export interface OpcionMarcador { id: string; contenido: { texto?: Texto; recursoId?: string; alt?: Texto }; correcta: boolean }
export interface PreguntaMarcador {
  id: string;
  enunciado: Texto;
  opciones: OpcionMarcador[];
  retroalimentacion: { correcta: Texto; incorrecta: Texto };
  objetivoId?: string;
  [k: string]: unknown;
}
export interface MarcadorVideo {
  id: string;
  tiempoMs: number;
  tipo: TipoMarcador;
  obligatorio: boolean;
  pregunta?: PreguntaMarcador;
  titulo?: Texto;
  contenido?: Texto;
  posicion?: { x: number; y: number };
  [k: string]: unknown;
}

const lleno = (t: Texto | undefined, idioma: string) => typeof t?.[idioma] === 'string' && t[idioma]!.trim() !== '';

/**
 * Errores de los marcadores de un bloque de video. Lista vacía = válidos. `ruta` antecede cada mensaje (p. ej.
 * `p18/p18-video`). Revisa: el tiempo es un entero desde 0 y, si se conoce la duración del video, no la pasa; los ids no
 * se repiten; una pregunta tiene enunciado en español, al menos 2 opciones y exactamente 1 correcta.
 */
export function erroresMarcadores(ruta: string, marcadores: unknown, duracionMs?: number, idioma = 'es'): string[] {
  if (marcadores === undefined) return [];
  if (!Array.isArray(marcadores)) return [`${ruta}: marcadores debe ser una lista`];
  const errores: string[] = [];
  const ids = new Set<string>();
  marcadores.forEach((m: Partial<MarcadorVideo> | null, i) => {
    const r = `${ruta}/marcadores/${i}`;
    if (!m || typeof m !== 'object') return void errores.push(`${r}: no es un marcador`);
    if (typeof m.id !== 'string' || !m.id) errores.push(`${r}: falta el id`);
    else if (ids.has(m.id)) errores.push(`${r}: el id «${m.id}» se repite`);
    else ids.add(m.id);
    const t = m.tiempoMs;
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 0) errores.push(`${r}: el tiempo debe ser un entero desde 0`);
    else if (duracionMs !== undefined && t > duracionMs) errores.push(`${r}: el tiempo ${mmss(t)} pasa la duración del video (${mmss(duracionMs)})`);
    if (!(TIPOS_MARCADOR as readonly unknown[]).includes(m.tipo)) errores.push(`${r}: tipo no válido`);
    if (m.tipo !== 'pregunta') return;
    const p = m.pregunta;
    if (!p || typeof p !== 'object') return void errores.push(`${r}/pregunta: falta la pregunta`);
    if (!lleno(p.enunciado, idioma)) errores.push(`${r}/pregunta: falta el enunciado`);
    const opciones = Array.isArray(p.opciones) ? p.opciones : [];
    if (opciones.length < 2) errores.push(`${r}/pregunta: necesita al menos 2 opciones`);
    else if (opciones.some((o) => !lleno(o?.contenido?.texto, idioma) && !o?.contenido?.recursoId)) errores.push(`${r}/pregunta: hay una opción vacía`);
    const correctas = opciones.filter((o) => o?.correcta === true).length;
    if (opciones.length >= 2 && correctas !== 1) errores.push(`${r}/pregunta: marca exactamente 1 opción correcta (hay ${correctas})`);
  });
  return errores;
}

/** 62000 → «1:02». */
export function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Los bloques de video de una pantalla. */
export const bloquesVideo = <B extends { tipo: string }>(bloques: readonly B[]) => bloques.filter((b) => b.tipo === 'video') as (B & { id: string; recursoId: string; marcadores: MarcadorVideo[] })[];
