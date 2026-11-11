// HU-0602 · Retoques del elemento elegido en el editor (CP-057): qué se puede cambiar de cada elemento, los pasos de
// A−/A+ y cómo queda el ajuste que se guarda en `ajustes` de la pantalla (RN-06-1). Lógica pura, sin DOM.
import type { AjusteElemento, RolColor } from '@aptio/player';

/** RN-06-4: solo los roles del kit. «Fondo» queda para el fondo de la pantalla. */
export const COLORES_KIT: [RolColor, string][] = [
  ['primario', 'Primario'], ['secundario', 'Secundario'], ['acento', 'Acento'], ['texto', 'Texto'], ['blanco', 'Blanco'], ['alerta', 'Alerta'],
];
export const ALINEACIONES: [NonNullable<AjusteElemento['alineacion']>, string][] = [['izquierda', 'Izq.'], ['centro', 'Centro'], ['derecha', 'Der.']];
export type Animacion = NonNullable<AjusteElemento['animacion']>;
export const ANIMACIONES: [Animacion, string][] = [
  ['auto', 'Auto'], ['ninguna', 'Ninguna'], ['aparecer', 'Aparecer'], ['deslizar', 'Deslizar'], ['zoom', 'Zoom'], ['rebotar', 'Rebotar'],
];

/** Rangos del esquema del curso (`ajusteElemento`). */
export const TAMANO = { min: 0.5, max: 20 } as const;
export const ESCALA = { min: 0.3, max: 3 } as const;

/** Lo que se retoca según el tipo de bloque: los textos todo; la imagen y el personaje, la escala y la animación. */
export function controlesDe(tipo: string): { tamano: 'texto' | 'escala' | null; color: boolean; alineacion: boolean; animacion: boolean } {
  if (tipo === 'texto') return { tamano: 'texto', color: true, alineacion: true, animacion: true };
  if (tipo === 'imagen' || tipo === 'personaje') return { tamano: 'escala', color: false, alineacion: false, animacion: true };
  return { tamano: null, color: false, alineacion: false, animacion: false };
}
export const seRetoca = (tipo: string) => controlesDe(tipo).tamano !== null;

const limitar = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, v));

/** A−/A+: un 10 % por clic desde el tamaño que se ve (en % del ancho de la pantalla), a una décima y dentro del rango. */
export function tamanoSiguiente(actualCqw: number, paso: 1 | -1): number {
  const base = Number.isFinite(actualCqw) && actualCqw > 0 ? actualCqw : 2;
  let v = Math.round(base * 1.1 ** paso * 10) / 10;
  // A tamaños chicos el 10 % redondeado no se mueve: al menos una décima.
  if (v === Math.round(base * 10) / 10) v += paso * 0.1;
  return Math.round(limitar(v, TAMANO) * 10) / 10;
}

/** Escala de la imagen o el personaje: un 10 % por clic, a centésimas y dentro del rango. */
export function escalaSiguiente(actual: number | undefined, paso: 1 | -1): number {
  return Math.round(limitar((actual ?? 1) * 1.1 ** paso, ESCALA) * 100) / 100;
}

/**
 * El ajuste con el cambio aplicado. Una clave en `undefined` se quita; «auto» es la animación por defecto y no se guarda.
 * Devuelve null si no queda nada (el elemento vuelve a como lo dibujó la disposición).
 */
export function ajusteCon(actual: AjusteElemento | undefined, cambio: Partial<Record<keyof AjusteElemento, unknown>>): AjusteElemento | null {
  const r: Record<string, unknown> = { ...actual, ...cambio };
  if (r.animacion === 'auto') delete r.animacion;
  for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  return Object.keys(r).length ? (r as AjusteElemento) : null;
}

const NOMBRE_ROL: Record<string, string> = { titulo: 'Título', subtitulo: 'Subtítulo', cuerpo: 'Texto', destacado: 'Dato clave' };

/** Nombre del elemento para la barra y el panel: su clase y el comienzo de su texto. */
export function nombreElemento(b: { tipo: string; rol?: string; contenido?: { es?: string; en?: string } }): string {
  if (b.tipo === 'imagen') return 'Imagen';
  if (b.tipo === 'personaje') return 'Personaje';
  const nombre = NOMBRE_ROL[b.rol ?? ''] ?? 'Texto';
  const texto = (b.contenido?.es ?? b.contenido?.en ?? '').trim();
  return texto ? `${nombre} · ${texto.length > 28 ? `${texto.slice(0, 27)}…` : texto}` : nombre;
}
