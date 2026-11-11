// Lo común a las 8 interacciones del catálogo cerrado (docs/05-interacciones.md): se usan con dedo, ratón y teclado
// (todo son botones), anuncian el resultado con aria-live y no dependen solo del color (✓ y ✗ además del tono).
import { h } from '../dom.ts';
import { t, type Textos } from '../textos.ts';
import type { Idioma, ResultadoActividad, Visual } from '../tipos.ts';

export interface ContextoActividad {
  /** Id de la pantalla: semilla del orden y prefijo de los ids del DOM. */
  id: string;
  idioma: Idioma;
  tx: Textos;
  modo: 'formativa' | 'sumativa';
  /** Intentos de una actividad sumativa (null = sin límite). Las formativas siempre se pueden repetir. */
  intentosMaximos: number | null;
  /** HU-1105 · Intentos que ya se usaron (en una sesión anterior, si se reanudó). */
  intentosPrevios?: number;
  urlRecurso: (id: string) => string | undefined;
  anunciar: (texto: string) => void;
  terminar: (r: ResultadoActividad) => void;
  /** false cuando el reproductor se desmontó (detiene los relojes). */
  activo: () => boolean;
}

export type Actividad = (datos: Record<string, unknown>, ctx: ContextoActividad) => HTMLElement;

export const porcentaje = (aciertos: number, total: number): number => (total ? Math.round((aciertos / total) * 100) : 0);

/** INT-01: 100 × pares / (pares + errores × 0,5). */
export const puntajeMemoria = (pares: number, errores: number): number => Math.round((100 * pares) / (pares + errores * 0.5));

/** Texto alternativo o contenido de un visual, para lectores de pantalla. */
export const textoVisual = (v: Visual | undefined, idioma: Idioma): string => t(v?.texto, idioma) || t(v?.alt, idioma);

/** Texto o imagen de una opción, carta o elemento. Sin archivo aún, un marco con el texto alternativo. */
export function visual(v: Visual | undefined, ctx: Pick<ContextoActividad, 'idioma' | 'urlRecurso' | 'tx'>): Node {
  if (v?.recursoId) {
    const url = ctx.urlRecurso(v.recursoId);
    const alt = t(v.alt, ctx.idioma);
    return url ? h('img', { src: url, alt, class: 'ap-visual-img' }) : h('span', { class: 'ap-sin-imagen', role: 'img', 'aria-label': alt }, alt || ctx.tx.imagenPendiente);
  }
  return h('span', { class: 'ap-visual-texto' }, t(v?.texto, ctx.idioma));
}

/** Cuántos intentos van y si se puede repetir. */
export function intentos(ctx: ContextoActividad) {
  let hechos = ctx.intentosPrevios ?? 0;
  return {
    sumar: () => { hechos++; },
    quedan: () => ctx.modo === 'formativa' || ctx.intentosMaximos === null || hechos < ctx.intentosMaximos,
  };
}

/** Pie con el resultado y, si quedan intentos, el botón para repetir. */
export function pieResultado(ctx: ContextoActividad, puntaje: number | null, puedeRepetir: boolean, repetir: () => void): HTMLElement {
  const texto = puntaje === null ? ctx.tx.completada : ctx.tx.resultado(puntaje);
  ctx.anunciar(texto);
  return h('div', { class: 'ap-resultado' },
    h('p', { class: 'ap-resultado-texto' }, h('span', { 'aria-hidden': 'true' }, '★ '), texto),
    puedeRepetir ? h('button', { type: 'button', class: 'ap-boton', onclick: repetir }, ctx.tx.reintentar) : h('p', { class: 'ap-nota' }, ctx.modo === 'sumativa' ? ctx.tx.sinIntentos : ''),
  );
}

/** Marca de acierto o error que no depende solo del color. */
export const marca = (bien: boolean, tx: Textos): HTMLElement =>
  h('span', { class: bien ? 'ap-marca ap-bien' : 'ap-marca ap-mal' }, h('span', { 'aria-hidden': 'true' }, bien ? '✓ ' : '✗ '), bien ? tx.correcto : tx.incorrecto);

export const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
