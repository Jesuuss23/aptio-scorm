// HU-0606 · Elementos agregados en el editor (RN-06-1, SUP-45): qué se puede agregar, con qué valores empieza cada uno y
// la lista de capas de la pantalla. Lógica pura, sin DOM.
import type { AjusteElemento, ElementoExtra } from '@aptio/player';
import type { PantallaDoc } from '@aptio/schema/revision';
import { nombreElemento, seRetoca } from './ajustes-elemento';

export type TipoExtra = ElementoExtra['tipo'];
export type PantallaConExtras = PantallaDoc & { extras?: ElementoExtra[]; ajustes?: Record<string, AjusteElemento> };

/** Los 8 tipos del panel Agregar, con los nombres del prototipo. */
export const TIPOS_EXTRA: [TipoExtra, string][] = [
  ['titulo', 'Título'], ['texto', 'Texto'], ['dato', 'Dato clave'], ['boton', 'Botón'],
  ['imagen', 'Imagen del kit'], ['insignia', 'Insignia'], ['forma', 'Forma'], ['personaje', 'Personaje'],
];
const NOMBRE_EXTRA = Object.fromEntries(TIPOS_EXTRA) as Record<TipoExtra, string>;

/** Los extras que llevan un texto que se escribe en el lienzo. */
export const CON_TEXTO: readonly TipoExtra[] = ['titulo', 'texto', 'dato', 'boton'];

/** Valores iniciales del prototipo: texto, x, y y ancho en %. */
const INICIAL: Record<TipoExtra, [string, number, number, number]> = {
  titulo: ['Nuevo título', 30, 8, 40], texto: ['Escribe aquí tu texto', 30, 40, 40], dato: ['Dato clave', 30, 60, 36], boton: ['Continuar', 40, 80, 14],
  imagen: ['Imagen', 42, 30, 16], insignia: ['', 44, 30, 12], forma: ['', 40, 45, 20], personaje: ['', 70, 40, 12],
};

/**
 * El extra nuevo con un id que no está en la pantalla (ni en sus bloques ni en sus extras). El botón empieza con
 * «Siguiente»; el personaje usa el del curso si lo hay, y la imagen queda como marco hasta elegir una (SUP-45).
 */
export function extraNuevo(tipo: TipoExtra, p: PantallaConExtras, personajeId?: string): ElementoExtra {
  const usados = new Set([...p.bloques.map((b) => b.id), ...(p.extras ?? []).map((e) => e.id)]);
  let n = 1;
  while (usados.has(`${p.id}-extra-${tipo}-${n}`)) n++;
  const [texto, x, y, ancho] = INICIAL[tipo];
  return {
    id: `${p.id}-extra-${tipo}-${n}`, tipo, x, y, ancho,
    ...(texto ? { texto: { es: texto } } : {}),
    ...(tipo === 'boton' ? { alClic: 'siguiente' as const } : {}),
    ...(tipo === 'personaje' && personajeId ? { recursoId: personajeId } : {}),
  };
}

/** Nombre de un extra para la barra, el panel y las capas: su clase y el comienzo de su texto. */
export function nombreExtra(e: ElementoExtra): string {
  const texto = (e.texto?.es ?? e.texto?.en ?? '').trim();
  const nombre = NOMBRE_EXTRA[e.tipo] ?? 'Elemento';
  return texto && CON_TEXTO.includes(e.tipo) ? `${nombre} · ${texto.length > 28 ? `${texto.slice(0, 27)}…` : texto}` : nombre;
}

export interface Capa {
  id: string;
  nombre: string;
  /** Tipo para los controles: el del bloque o el del extra. */
  tipo: string;
  extra: boolean;
  oculto: boolean;
}

/** Las capas de la pantalla en el orden en que se dibujan: los bloques que se retocan y, encima, los extras. */
export function capasDe(p: PantallaConExtras): Capa[] {
  const oculto = (id: string) => p.ajustes?.[id]?.oculto === true;
  return [
    ...p.bloques.filter((b) => seRetoca(b.tipo)).map((b) => ({ id: b.id, nombre: nombreElemento(b), tipo: b.tipo, extra: false, oculto: oculto(b.id) })),
    ...(p.extras ?? []).map((e) => ({ id: e.id, nombre: nombreExtra(e), tipo: e.tipo, extra: true, oculto: oculto(e.id) })),
  ];
}

/** La lista de extras sin uno (Eliminar). */
export const sinExtra = (p: PantallaConExtras, id: string): ElementoExtra[] => (p.extras ?? []).filter((e) => e.id !== id);
