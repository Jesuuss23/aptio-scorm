// HU-1104 · Patrón de navegación recomendado o creado con IA (IA-14 v2, M11, CP-088, REQ-048). El contexto que lee la
// IA sale del documento del curso; su salida se comprueba además del esquema (`erroresPatron`) y, al aplicarla, solo
// cambian `patron` y `patronPersonalizado`: las reglas y los elementos visibles quedan como los dejó la persona (RN-11-1).
// El patrón personalizado es configuración validada, nunca código (RN-11-3).
import type { CursoDoc, PantallaDoc } from './revision.js';

export const TAREA_PATRON = 'IA-14';
export const MODOS_PATRON = ['recomendar', 'crear'] as const;
export type ModoPatron = (typeof MODOS_PATRON)[number];
/** Los 7 patrones del catálogo (el personalizado aparte). */
export const PATRONES_CATALOGO = ['clasico', 'historias', 'vertical', 'mapa', 'hub', 'ramificado', 'inmersivo'] as const;
export type PatronCatalogo = (typeof PATRONES_CATALOGO)[number];
/** Largo máximo del nombre de un patrón personalizado (el del esquema del curso). */
export const LARGO_NOMBRE_PATRON = 60;
/** Sin `metadatos.duracionEstimadaMin`, la duración se estima en 20 s por pantalla. */
export const SEGUNDOS_POR_PANTALLA = 20;
/** Sin dato del proyecto, el dispositivo principal es el celular (decisión 10: celular primero). */
export const DISPOSITIVO_POR_DEFECTO = 'celular';

export interface PatronPersonalizado {
  nombre: string;
  base: PatronCatalogo;
  progreso: 'barra' | 'segmentos' | 'puntos' | 'porcentaje' | 'ninguno';
  avance: 'botones' | 'deslizar-y-botones' | 'desplazar';
  menu: 'temario' | 'mapa' | 'temas' | 'ninguno';
  marcador?: boolean;
  barra?: 'arriba' | 'abajo' | 'flotante' | 'ninguna';
  origen?: 'usuario' | 'ia';
}
export interface NavegacionPatron {
  patron: PatronCatalogo | 'personalizado';
  patronPersonalizado?: PatronPersonalizado;
  [clave: string]: unknown;
}
/** Salida de IA-14 (esquema `IA-14.salida.schema.json`). */
export interface PropuestaPatron {
  recomendado: { patron: PatronCatalogo | 'personalizado'; motivo: string };
  alternativa: { patron: PatronCatalogo; motivo: string };
  navegacion: NavegacionPatron;
}

export interface ContextoPatron {
  duracionMin: number;
  publico: string;
  dispositivoPrincipal: string;
  numeroPantallas: number;
  numeroActividades: number;
  gamificacion: string;
  /** Estaciones que tendría el Mapa de misiones: una por módulo y otra en cada pantalla de sección. */
  estaciones: number;
}

type DocNavegacion = CursoDoc & {
  metadatos?: { publico?: string; duracionEstimadaMin?: number };
  gamificacion?: { nivel?: string };
  navegacion?: Record<string, unknown>;
};
const conActividad = (p: PantallaDoc) => p.bloques.some((b) => b.tipo === 'interaccion');

/** Lo que IA-14 sabe del curso: duración, público, dispositivo, pantallas, actividades, gamificación y estaciones. */
export function contextoPatron(doc: CursoDoc, dispositivo?: string | null): ContextoPatron {
  const d = doc as DocNavegacion;
  let estaciones = 0;
  let pantallas = 0;
  let actividades = 0;
  for (const m of d.modulos) {
    let primera = true;
    for (const p of m.capsulas.flatMap((c) => c.pantallas)) {
      pantallas++;
      if (conActividad(p)) actividades++;
      if (primera || (p as PantallaDoc & { disposicion?: string }).disposicion === 'seccion') estaciones++;
      primera = false;
    }
  }
  const minutos = d.metadatos?.duracionEstimadaMin;
  return {
    duracionMin: typeof minutos === 'number' && minutos > 0 ? minutos : Math.max(1, Math.round((pantallas * SEGUNDOS_POR_PANTALLA) / 60)),
    publico: d.metadatos?.publico?.trim() || 'sin dato',
    dispositivoPrincipal: dispositivo?.trim() || DISPOSITIVO_POR_DEFECTO,
    numeroPantallas: pantallas,
    numeroActividades: actividades,
    gamificacion: d.gamificacion?.nivel ?? 'ninguna',
    estaciones,
  };
}

/**
 * Antes de validar: recorta el nombre del personalizado a 60 caracteres (por palabras si se puede) y lo marca como
 * creado por la IA. No modifica lo recibido.
 */
export function normalizarPatron(datos: unknown): unknown {
  const p = (datos as Partial<PropuestaPatron> | null)?.navegacion?.patronPersonalizado;
  if (!p || typeof p !== 'object') return datos;
  const copia = structuredClone(datos) as PropuestaPatron;
  const pp = copia.navegacion.patronPersonalizado!;
  if (typeof pp.nombre === 'string') pp.nombre = recortarNombre(pp.nombre);
  pp.origen = 'ia';
  return copia;
}

export function recortarNombre(nombre: string): string {
  const limpio = nombre.replace(/\s+/g, ' ').trim();
  if (limpio.length <= LARGO_NOMBRE_PATRON) return limpio;
  const corte = limpio.slice(0, LARGO_NOMBRE_PATRON + 1);
  const espacio = corte.lastIndexOf(' ');
  return (espacio > LARGO_NOMBRE_PATRON / 2 ? corte.slice(0, espacio) : corte.slice(0, LARGO_NOMBRE_PATRON)).trim();
}

const esCatalogo = (x: unknown): x is PatronCatalogo => typeof x === 'string' && (PATRONES_CATALOGO as readonly string[]).includes(x);

/** Lo que el esquema no dice: en «crear», un personalizado completo; en «recomendar», uno del catálogo y una alternativa distinta. */
export function erroresPatron(modo: ModoPatron, datos: unknown): string[] {
  const d = datos as Partial<PropuestaPatron> | null;
  const errores: string[] = [];
  const nav = d?.navegacion;
  const rec = d?.recomendado?.patron;
  if (!nav || !rec) return ['Faltan recomendado o navegacion'];
  if (nav.patron !== rec) errores.push(`/navegacion/patron debe ser el recomendado («${rec}»)`);
  if (modo === 'crear') {
    if (rec !== 'personalizado') errores.push('/recomendado/patron debe ser «personalizado» al crear un patrón');
    const pp = nav.patronPersonalizado;
    if (!pp) errores.push('/navegacion/patronPersonalizado es obligatorio al crear un patrón');
    else {
      if (!pp.nombre?.trim()) errores.push('/navegacion/patronPersonalizado/nombre no puede quedar vacío');
      if ((pp.nombre ?? '').length > LARGO_NOMBRE_PATRON) errores.push(`/navegacion/patronPersonalizado/nombre tiene más de ${LARGO_NOMBRE_PATRON} caracteres`);
      if (!esCatalogo(pp.base)) errores.push('/navegacion/patronPersonalizado/base debe ser un patrón del catálogo');
      if (pp.marcador === undefined) errores.push('/navegacion/patronPersonalizado/marcador es obligatorio al crear un patrón');
      if (pp.barra === undefined) errores.push('/navegacion/patronPersonalizado/barra es obligatorio al crear un patrón');
    }
  } else {
    if (!esCatalogo(rec)) errores.push('/recomendado/patron debe ser uno de los 7 patrones del catálogo al recomendar');
    if (nav.patronPersonalizado) errores.push('/navegacion/patronPersonalizado no va al recomendar un patrón del catálogo');
  }
  if (d.alternativa?.patron === rec || (modo === 'crear' && d.alternativa?.patron === nav.patronPersonalizado?.base)) {
    errores.push('/alternativa/patron debe ser distinto del recomendado' + (modo === 'crear' ? ' y de su base' : ''));
  }
  if (!d.alternativa?.motivo?.trim()) errores.push('/alternativa/motivo no puede quedar vacío');
  return errores;
}

/** Aplica el patrón de la propuesta (lo modifica): solo `patron` y `patronPersonalizado`; lo demás de `navegacion` se conserva. */
export function aplicarPatron(doc: CursoDoc, nav: NavegacionPatron): void {
  const d = doc as DocNavegacion;
  const actual = { ...(d.navegacion ?? {}) };
  actual.patron = nav.patron;
  if (nav.patron === 'personalizado' && nav.patronPersonalizado) actual.patronPersonalizado = structuredClone(nav.patronPersonalizado);
  else delete actual.patronPersonalizado;
  d.navegacion = actual;
}
