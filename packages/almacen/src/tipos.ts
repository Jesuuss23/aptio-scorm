// Tipos de archivo permitidos (RN-14-1): se decide por el contenido real, nunca por la extensión ni por lo que diga el navegador.
import { fileTypeFromBuffer } from 'file-type';

export type TipoRecurso = 'IMAGEN' | 'SVG' | 'AUDIO' | 'VIDEO' | 'DOCUMENTO' | 'FUENTE';

const MB = 1024 * 1024;

/** mime → tipo de recurso y tamaño máximo de subida. */
export const PERMITIDOS: Record<string, { tipo: TipoRecurso; maxBytes: number }> = {
  'application/pdf': { tipo: 'DOCUMENTO', maxBytes: 200 * MB },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { tipo: 'DOCUMENTO', maxBytes: 200 * MB },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { tipo: 'DOCUMENTO', maxBytes: 500 * MB },
  'image/png': { tipo: 'IMAGEN', maxBytes: 20 * MB },
  'image/jpeg': { tipo: 'IMAGEN', maxBytes: 20 * MB },
  'image/webp': { tipo: 'IMAGEN', maxBytes: 20 * MB },
  'audio/mpeg': { tipo: 'AUDIO', maxBytes: 500 * MB },
  'audio/wav': { tipo: 'AUDIO', maxBytes: 500 * MB },
  'audio/mp4': { tipo: 'AUDIO', maxBytes: 500 * MB },
  'video/mp4': { tipo: 'VIDEO', maxBytes: 4096 * MB },
  'video/webm': { tipo: 'VIDEO', maxBytes: 4096 * MB },
  'font/woff2': { tipo: 'FUENTE', maxBytes: 5 * MB },
  // El SVG no se reconoce por su cabecera: se sanea al confirmar (sanearSvg) y se guarda solo la versión limpia.
  'image/svg+xml': { tipo: 'SVG', maxBytes: 2 * MB },
};

/** Equivalencias: file-type puede dar un mime distinto pero compatible con el declarado. */
const EQUIVALENTES: Record<string, string[]> = {
  'audio/wav': ['audio/vnd.wave', 'audio/wave', 'audio/x-wav'],
  'audio/mp4': ['audio/x-m4a', 'audio/m4a', 'video/mp4'],
  'video/mp4': ['video/quicktime'],
};

/** Bytes que bastan para reconocer el tipo. */
export const BYTES_CABECERA = 4100;

export interface Verificacion {
  valido: boolean;
  mimeReal?: string;
  motivo?: string;
}

/** Compara el contenido real con el tipo declarado (CP-034: un .exe renombrado a .pdf se rechaza). */
export async function verificarTipo(cabecera: Uint8Array, mimeDeclarado: string): Promise<Verificacion> {
  if (!PERMITIDOS[mimeDeclarado]) return { valido: false, motivo: `Tipo no permitido: ${mimeDeclarado}` };
  if (mimeDeclarado === 'image/svg+xml') return { valido: false, motivo: 'Un SVG se verifica al sanearlo, no por su cabecera' };
  const real = await fileTypeFromBuffer(cabecera);
  if (!real) return { valido: false, motivo: 'No se reconoce el contenido del archivo' };
  const aceptados = [mimeDeclarado, ...(EQUIVALENTES[mimeDeclarado] ?? [])];
  if (!aceptados.includes(real.mime)) {
    return { valido: false, mimeReal: real.mime, motivo: `El contenido es ${real.mime}, no ${mimeDeclarado}` };
  }
  return { valido: true, mimeReal: real.mime };
}

const OOXML = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** Bytes que se leen si un docx o pptx parece un zip genérico: algunos programas no escriben primero el índice. */
export const BYTES_CABECERA_OOXML = 1024 * 1024;

/** Verifica el tipo leyendo solo los bytes necesarios. `leer(n)` devuelve los primeros n bytes del archivo. */
export async function verificarContenido(leer: (bytes: number) => Promise<Uint8Array>, mimeDeclarado: string): Promise<Verificacion> {
  const primera = await verificarTipo(await leer(BYTES_CABECERA), mimeDeclarado);
  if (!primera.valido && primera.mimeReal === 'application/zip' && OOXML.has(mimeDeclarado)) {
    return verificarTipo(await leer(BYTES_CABECERA_OOXML), mimeDeclarado);
  }
  return primera;
}
