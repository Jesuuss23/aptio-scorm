// HU-0601 · Edición en el lugar (CP-056): qué textos del lienzo se editan y qué cuerpo se envía al guardar.
// Lógica pura, sin DOM: la usa EditorVista sobre los elementos `data-bloque` que dibuja el reproductor.
import type { PantallaDoc } from '@aptio/schema/revision';

type Texto = { es?: string; en?: string };
export type CambioTexto = { titulo: Texto } | { textos: Record<string, Texto> };
export type ResultadoEdicion = { tipo: 'cambio'; cambio: CambioTexto } | { tipo: 'sin-cambios' } | { tipo: 'vacio' };

const bloqueDe = (p: PantallaDoc, bloqueId: string) => p.bloques.find((b) => b.id === bloqueId && b.tipo === 'texto');

/** Solo los bloques de texto se escriben en el lienzo; las actividades, las imágenes y la narración no. */
export const esEditable = (p: PantallaDoc, bloqueId: string): boolean => Boolean(bloqueDe(p, bloqueId));

/** El primer texto con rol título es el título de la pantalla: se guarda como `titulo` para que no se separen. */
export function esTituloDePantalla(p: PantallaDoc, bloqueId: string): boolean {
  return p.bloques.find((b) => b.tipo === 'texto' && b.rol === 'titulo')?.id === bloqueId;
}

/** Espacios y saltos de línea seguidos cuentan como uno; el lienzo no guarda saltos (Enter termina). */
export const limpiar = (texto: string) => texto.replace(/\s+/g, ' ').trim();

/**
 * Cuerpo del PATCH de pantalla para lo escrito en el bloque, en español. Conserva el inglés que hubiera.
 * Un texto vacío no se guarda (la API también lo rechaza con TEXTO_VACIO o TITULO_VACIO).
 */
export function edicionDe(p: PantallaDoc, bloqueId: string, escrito: string): ResultadoEdicion {
  const b = bloqueDe(p, bloqueId);
  if (!b) throw new Error(`La pantalla ${p.id} no tiene el texto «${bloqueId}»`);
  const texto = limpiar(escrito);
  if (!texto) return { tipo: 'vacio' };
  if (texto === limpiar(b.contenido?.es ?? '')) return { tipo: 'sin-cambios' };
  if (esTituloDePantalla(p, bloqueId)) return { tipo: 'cambio', cambio: { titulo: { ...p.titulo, es: texto } } };
  return { tipo: 'cambio', cambio: { textos: { [bloqueId]: { ...b.contenido, es: texto } } } };
}
