// HU-0609 · Imágenes propias en el editor (REQ-046, CP-070). Lógica pura, sin DOM ni red: qué archivos se aceptan antes
// de pedir la subida (la API vuelve a mirar el contenido real, RN-14-1), el extra nuevo con una pieza del kit o una
// imagen subida, y si su texto alternativo sigue siendo el nombre del archivo.
import type { ElementoExtra } from '@aptio/player';
import { altDeArchivo, NOMBRE_PIEZA, type PiezaKit } from '@aptio/schema/biblioteca';
import { extraNuevo, type PantallaConExtras } from './extras';

const MB = 1024 * 1024;
/** Los formatos de imagen que acepta el almacenamiento, con su tope (los mismos que la API). */
export const FORMATOS_IMAGEN: Record<string, number> = { 'image/png': 20 * MB, 'image/jpeg': 20 * MB, 'image/webp': 20 * MB, 'image/svg+xml': 2 * MB };
export const ACEPTA_IMAGEN = Object.keys(FORMATOS_IMAGEN).join(',');
/** Ancho inicial de lo soltado o subido, en % del ancho de la pantalla. */
export const ANCHO_IMAGEN = 20;

/** Por qué no se puede subir el archivo, o null si se puede. */
export function motivoImagen(archivo: { name: string; type: string; size: number }): string | null {
  const tope = FORMATOS_IMAGEN[archivo.type];
  if (!tope) return `«${archivo.name}» no es una imagen que se pueda usar: sube PNG, JPEG, WebP o SVG.`;
  if (archivo.size > tope) return `«${archivo.name}» pesa más de ${tope / MB} MB, el máximo para este tipo de imagen.`;
  return null;
}

/** El extra imagen nuevo con una pieza del kit o una imagen subida, en la posición dada (o la inicial). */
export function extraImagen(p: PantallaConExtras, origen: { pieza: PiezaKit } | { recursoId: string; nombre: string }, posicion?: { x: number; y: number; ancho: number }): ElementoExtra {
  const base = extraNuevo('imagen', p);
  const datos = 'pieza' in origen
    ? { pieza: origen.pieza, texto: { es: NOMBRE_PIEZA[origen.pieza] } }
    : { recursoId: origen.recursoId, texto: { es: altDeArchivo(origen.nombre) } };
  return { ...base, ...datos, ...(posicion ?? {}) };
}

/** El texto alternativo de la imagen subida sigue siendo el que salió del nombre del archivo: hay que revisarlo (RN-14-3). */
export function altPorRevisar(e: ElementoExtra, recursos: readonly { id: string; nombre: string }[]): boolean {
  if (e.tipo !== 'imagen' || !e.recursoId || e.decorativa) return false;
  const r = recursos.find((x) => x.id === e.recursoId);
  return Boolean(r) && (e.texto?.es ?? '') === altDeArchivo(r!.nombre);
}
