/**
 * HU-1507 · Versiones del sitio comercial (REQ-068, RN-16-5). Una versión es una instantánea inmutable del sitio
 * completo: las páginas publicadas con sus bloques visibles (en orden) y sus elementos visibles (en orden), y el menú y
 * el pie visibles. El sitio público sirve solo la última versión. Estas funciones son puras: `@aptio/db` lee las tablas
 * y las llama, y la API y el worker usan esa armadora.
 */
import { bloquesPublicos } from './sitio-bloques.js';
import { COLECCION_DE_BLOQUE, elementosDeBloque, nombreElemento } from './sitio-contenido.js';
import { elementosParaPublico, type EntornoSitio } from './sitio-ficticios.js';
import { navegacionPublica, type NavegacionPublica } from './sitio-navegacion.js';
import { ajustesPublicados, type AjustesSitio, type SitioPublicado } from './sitio-ajustes.js';

export const ORIGENES_VERSION = ['publicacion', 'pagina', 'programada', 'restauracion'] as const;
export type OrigenVersion = (typeof ORIGENES_VERSION)[number];

export interface ElementoInstantanea {
  id: string;
  coleccion: string;
  datos: Record<string, string | number>;
  ficticio?: true;
}
export interface BloqueInstantanea {
  tipo: string;
  ajustes: Record<string, unknown> | null;
  elementos?: ElementoInstantanea[];
}
export interface PaginaInstantanea {
  ruta: string;
  idioma: string;
  titulo: string;
  publicadaEn: string | null;
  bloques: BloqueInstantanea[];
}
export interface Instantanea {
  formato: 1;
  paginas: PaginaInstantanea[];
  navegacion: NavegacionPublica;
  /** HU-1509 · Nombre, dominio, logo, favicon y WhatsApp publicados. Falta en las versiones de antes de los ajustes. */
  sitio?: SitioPublicado;
}

/** Filas tal como salen de la base (solo los campos que usa la armadora). */
export interface FilaPagina {
  ruta: string;
  idioma: string;
  titulo: string;
  estado: string;
  publicadaEn: Date | string | null;
  bloques: { id: string; tipo: string; orden: number; visible: boolean; ajustes: unknown }[];
}
export interface FilaElemento {
  id: string;
  coleccion: string;
  orden: number;
  visible: boolean;
  ficticio: boolean;
  datos: unknown;
}
export interface FilaEnlace {
  id: string;
  zona: string;
  padreId: string | null;
  texto: string;
  ruta: string | null;
  orden: number;
  visible: boolean;
}

const iso = (f: Date | string | null): string | null => (f === null ? null : typeof f === 'string' ? f : f.toISOString());

/**
 * Una página con sus bloques visibles y, en los bloques con colección, sus elementos visibles (cascada RN-16-4). Los
 * ficticios se marcan; en producción no entran (RN-16-3), así una versión de producción nunca guarda uno.
 */
export function armarPagina(p: FilaPagina, elementos: readonly FilaElemento[], entorno: EntornoSitio): PaginaInstantanea {
  const visibles = bloquesPublicos(p.bloques);
  const permitidos = elementosParaPublico(entorno, elementos.filter((e) => e.visible));
  return {
    ruta: p.ruta, idioma: p.idioma, titulo: p.titulo, publicadaEn: iso(p.publicadaEn),
    bloques: visibles.map((b) => {
      const propios = elementosDeBloque(b.tipo, p.ruta, permitidos);
      return {
        tipo: b.tipo, ajustes: (b.ajustes as Record<string, unknown> | null) ?? null,
        ...(propios ? { elementos: propios.map((e) => ({ id: e.id, coleccion: e.coleccion, datos: e.datos as Record<string, string | number>, ...(e.ficticio ? { ficticio: true as const } : {}) })) } : {}),
      };
    }),
  };
}

/** La instantánea del sitio completo: solo las páginas PUBLICADAS, por ruta e idioma, y la navegación visible. */
export function armarInstantanea(datos: { paginas: readonly FilaPagina[]; elementos: readonly FilaElemento[]; enlaces: readonly FilaEnlace[]; ajustes?: AjustesSitio | null }, entorno: EntornoSitio): Instantanea {
  const paginas = datos.paginas
    .filter((p) => p.estado === 'PUBLICADA')
    .sort((a, b) => a.ruta.localeCompare(b.ruta) || a.idioma.localeCompare(b.idioma))
    .map((p) => armarPagina(p, datos.elementos, entorno));
  // Sin fila de ajustes la instantánea queda igual que antes de la HU-1509 (no marca cambios pendientes).
  return { formato: 1, paginas, navegacion: navegacionPublica(datos.enlaces), ...(datos.ajustes ? { sitio: ajustesPublicados(datos.ajustes) } : {}) };
}

/** Las colecciones que usan los bloques: solo esas se leen de la base. */
export function coleccionesDeBloques(tipos: readonly string[]): string[] {
  return [...new Set(tipos.flatMap((t) => COLECCION_DE_BLOQUE[t] ?? []))];
}

/** JSON con las claves ordenadas: dos instantáneas con el mismo contenido dan el mismo texto. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** ¿El panel tiene cambios sin publicar? Compara el contenido, no el orden de las claves. Sin versión, hay cambios si hay algo publicable. */
export function hayPendientes(actual: Instantanea, ultima: Instantanea | null): boolean {
  if (!ultima) return actual.paginas.length > 0 || actual.navegacion.menu.length > 0 || actual.navegacion.pie.length > 0;
  return canonico(actual) !== canonico(ultima);
}

/** Los elementos ficticios que guarda una instantánea (de una versión publicada en pruebas). */
export function ficticiosDeInstantanea(inst: Instantanea): { id: string; coleccion: string; nombre: string }[] {
  const vistos = new Map<string, { id: string; coleccion: string; nombre: string }>();
  for (const p of inst.paginas) {
    for (const b of p.bloques) {
      for (const e of b.elementos ?? []) {
        if (e.ficticio && !vistos.has(e.id)) vistos.set(e.id, { id: e.id, coleccion: e.coleccion, nombre: nombreElemento(e.coleccion, e.datos) });
      }
    }
  }
  return [...vistos.values()];
}

export interface PaginaServida {
  ruta: string;
  idioma: string;
  titulo: string;
  publicadaEn: string | null;
  bloques: { tipo: string; ajustes: Record<string, unknown> | null; elementos?: { datos: Record<string, string | number>; ficticio?: true }[] }[];
}

/**
 * Lo que sirve el sitio público de una página de la instantánea: sin los ids internos, y en producción sin ficticios
 * (segunda defensa, por si una versión de pruebas llegara a servirse en producción). `null` si no está.
 */
export function paginaServida(inst: Instantanea, ruta: string, idioma: string, entorno: EntornoSitio): PaginaServida | null {
  const p = inst.paginas.find((x) => x.ruta === ruta && x.idioma === idioma);
  if (!p) return null;
  return {
    ruta: p.ruta, idioma: p.idioma, titulo: p.titulo, publicadaEn: p.publicadaEn,
    bloques: p.bloques.map((b) => ({
      tipo: b.tipo, ajustes: b.ajustes,
      ...(b.elementos ? { elementos: elementosParaPublico(entorno, b.elementos.map((e) => ({ ...e, ficticio: e.ficticio ?? false }))).map((e) => ({ datos: e.datos, ...(e.ficticio ? { ficticio: true as const } : {}) })) } : {}),
    })),
  };
}

/** Lee una instantánea guardada; si no tiene la forma esperada, devuelve un sitio vacío en vez de romper el público. */
export function leerInstantanea(v: unknown): Instantanea {
  const o = v as Partial<Instantanea> | null;
  if (!o || o.formato !== 1 || !Array.isArray(o.paginas) || !o.navegacion) return { formato: 1, paginas: [], navegacion: { menu: [], pie: [] } };
  return o as Instantanea;
}
