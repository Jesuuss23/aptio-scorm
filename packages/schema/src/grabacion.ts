// HU-0704 · Audio del cliente (CP-074, REQ-023, REQ-024, RN-07-4): una grabación real del cliente (un material de audio
// ya transcrito) se usa como narración de una pantalla en español. Lógica pura que comparten la API, el worker y la web:
// subtítulos desde los segmentos con tiempo de la transcripción, el texto de la narración, el hash de la grabación y la
// elección entre el audio original y el limpio.

export const TAREA_GRABACION = 'GRABACION';
export const TAREA_LIMPIAR = 'LIMPIAR_AUDIO';
/** Licencia con que se registra el MP3 del curso hecho desde la grabación (ADR-010). */
export const LICENCIA_GRABACION = 'Grabación del cliente';
/** Proveedor y voz con que la pista de la narración marca una grabación (no la regenera la voz de la IA). */
export const VOZ_GRABACION = { proveedor: 'cliente', voz: 'grabacion' } as const;
/** Filtro de ffmpeg para limpiar el ruido y normalizar a −16 LUFS (REQ-024). */
export const FILTRO_LIMPIEZA = 'afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11';

/** Un segmento de la transcripción del material, en segundos (así lo guarda `MaterialFuente.transcripcion`). */
export interface SegmentoTranscripcion {
  desde: number;
  hasta: number;
  texto: string;
}

export interface SubtituloGrabacion {
  inicioMs: number;
  finMs: number;
  texto: string;
}

const MAX_SUBTITULO = 84;
const limpiar = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Segmentos válidos, en orden: con texto y con fin después del inicio. */
export function segmentosValidos(segmentos: readonly SegmentoTranscripcion[] | null | undefined): SegmentoTranscripcion[] {
  if (!Array.isArray(segmentos)) return [];
  return segmentos
    .filter((s) => s && Number.isFinite(s.desde) && Number.isFinite(s.hasta) && s.hasta > s.desde && typeof s.texto === 'string' && limpiar(s.texto))
    .map((s) => ({ desde: Math.max(0, s.desde), hasta: s.hasta, texto: limpiar(s.texto) }))
    .sort((a, b) => a.desde - b.desde);
}

/** El texto de la narración: los segmentos unidos con un espacio. */
export function textoDeTranscripcion(segmentos: readonly SegmentoTranscripcion[] | null | undefined): string {
  return segmentosValidos(segmentos).map((s) => s.texto).join(' ');
}

/** Parte un texto en trozos de hasta `max` caracteres, en una coma o entre palabras. */
function trozos(texto: string, max: number): string[] {
  if (texto.length <= max) return [texto];
  const ventana = texto.slice(0, max + 1);
  let corte = Math.max(ventana.lastIndexOf(', '), ventana.lastIndexOf('; '), ventana.lastIndexOf('. '));
  if (corte > max / 3) corte += 1;
  else corte = ventana.lastIndexOf(' ');
  if (corte <= 0) corte = max;
  return [texto.slice(0, corte).trimEnd(), ...trozos(texto.slice(corte).trimStart(), max)];
}

/**
 * Subtítulos desde los segmentos reales de la transcripción: cada segmento conserva su tiempo; uno largo se parte y su
 * tiempo se reparte por letras dentro del segmento. Nada pasa de la duración del audio ni se superpone.
 */
export function subtitulosDeSegmentos(segmentos: readonly SegmentoTranscripcion[] | null | undefined, duracionMs: number, max = MAX_SUBTITULO): SubtituloGrabacion[] {
  if (!(duracionMs > 0)) return [];
  const out: SubtituloGrabacion[] = [];
  for (const s of segmentosValidos(segmentos)) {
    const inicio = Math.round(s.desde * 1000);
    const fin = Math.min(Math.round(duracionMs), Math.round(s.hasta * 1000));
    if (inicio >= fin) continue;
    const partes = trozos(s.texto, max);
    const total = partes.reduce((n, p) => n + p.length, 0);
    let acumulado = 0;
    for (const p of partes) {
      const desde = inicio + Math.round(((fin - inicio) * acumulado) / total);
      acumulado += p.length;
      const hasta = inicio + Math.round(((fin - inicio) * acumulado) / total);
      const previo = out.at(-1);
      const desdeOk = previo ? Math.max(desde, previo.finMs) : desde;
      if (hasta > desdeOk) out.push({ inicioMs: desdeOk, finMs: hasta, texto: p });
    }
  }
  return out;
}

/** FNV-1a de 32 bits con una semilla, en hex de 8 caracteres (funciona igual en Node y en el navegador). */
function fnv(texto: string, semilla: number): string {
  let h = semilla >>> 0;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Hash de la pista de una grabación: depende del texto transcrito y del audio usado (original o limpio). Cambia si se
 * cambia el audio, así la vista previa y el control de calidad saben que la pista es otra.
 */
export function hashGrabacion(texto: string, recursoId: string): string {
  const base = `grabacion|${limpiar(texto)}|${recursoId}`;
  return fnv(base, 0x811c9dc5) + fnv(base, 0x01000193 ^ 0x5bd1e995);
}

export type VersionAudio = 'original' | 'limpio';

/** El recurso de audio a usar: el limpio si se eligió y existe; si no, el original. */
export function audioAUsar(audios: { original: string; limpio?: string | null }, version: VersionAudio = 'original'): { recursoId: string; version: VersionAudio } {
  return version === 'limpio' && audios.limpio ? { recursoId: audios.limpio, version: 'limpio' } : { recursoId: audios.original, version: 'original' };
}

/** Si la pista de un idioma es una grabación del cliente (la voz de la IA no la toca). */
export const esGrabacion = (pista: { voz?: { proveedor?: string } } | null | undefined): boolean => pista?.voz?.proveedor === 'cliente';

/** Nombre corto de la grabación para mostrar: «Grabacion_gerente.wav · 2:14 min». */
export function rotuloGrabacion(nombre: string, duracionS?: number | null): string {
  if (!duracionS || duracionS <= 0) return nombre;
  const t = Math.round(duracionS);
  return `${nombre} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} min`;
}

export interface DatosGrabacion {
  materialId: string;
  recursoOrigenId: string;
  version: VersionAudio;
  autorizadoPor: string;
  autorizadoEn: string;
}

/**
 * La pista en español cuando se elige usar la grabación: voz del cliente, los metadatos de la autorización y «pendiente»
 * hasta que el worker deja su audio, su boca y sus subtítulos (el esquema exige los tres para «generado»).
 */
export function pistaDeGrabacion(datos: DatosGrabacion, texto: string) {
  return {
    estado: 'pendiente' as const,
    voz: { ...VOZ_GRABACION },
    hashTexto: hashGrabacion(texto, datos.recursoOrigenId),
    grabacion: { ...datos },
  };
}
