// HU-0601 · Edición en el lugar (CP-056): qué textos del lienzo se editan y qué cuerpo se envía al guardar.
// Lógica pura, sin DOM: la usa EditorVista sobre los elementos `data-bloque` que dibuja el reproductor.
// HU-0606 · Los extras con texto (título, texto, dato y botón) también se escriben en el lienzo; se guardan con la lista
// de extras de la pantalla.
import type { ElementoExtra } from '@aptio/player';
import type { PantallaDoc } from '@aptio/schema/revision';

type Texto = { es?: string; en?: string };
export type CambioTexto = { titulo: Texto } | { textos: Record<string, Texto> } | { extras: ElementoExtra[] };
type ConExtras = PantallaDoc & { extras?: ElementoExtra[] };
const EXTRAS_CON_TEXTO = ['titulo', 'texto', 'dato', 'boton'];
const extraDe = (p: PantallaDoc, id: string) => (p as ConExtras).extras?.find((e) => e.id === id && EXTRAS_CON_TEXTO.includes(e.tipo));
export type ResultadoEdicion = { tipo: 'cambio'; cambio: CambioTexto } | { tipo: 'sin-cambios' } | { tipo: 'vacio' };

const bloqueDe = (p: PantallaDoc, bloqueId: string) => p.bloques.find((b) => b.id === bloqueId && b.tipo === 'texto');

/** Solo los bloques de texto se escriben en el lienzo; las actividades, las imágenes y la narración no. */
export const esEditable = (p: PantallaDoc, bloqueId: string): boolean => Boolean(bloqueDe(p, bloqueId) ?? extraDe(p, bloqueId));

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
  const e = extraDe(p, bloqueId);
  if (e) {
    const texto = limpiar(escrito);
    if (!texto) return { tipo: 'vacio' };
    if (texto === limpiar(e.texto?.es ?? '')) return { tipo: 'sin-cambios' };
    const extras = (p as ConExtras).extras!.map((x) => (x.id === e.id ? { ...x, texto: { ...x.texto, es: texto } } : x));
    return { tipo: 'cambio', cambio: { extras } };
  }
  const b = bloqueDe(p, bloqueId);
  if (!b) throw new Error(`La pantalla ${p.id} no tiene el texto «${bloqueId}»`);
  const texto = limpiar(escrito);
  if (!texto) return { tipo: 'vacio' };
  if (texto === limpiar(b.contenido?.es ?? '')) return { tipo: 'sin-cambios' };
  if (esTituloDePantalla(p, bloqueId)) return { tipo: 'cambio', cambio: { titulo: { ...p.titulo, es: texto } } };
  return { tipo: 'cambio', cambio: { textos: { [bloqueId]: { ...b.contenido, es: texto } } } };
}
