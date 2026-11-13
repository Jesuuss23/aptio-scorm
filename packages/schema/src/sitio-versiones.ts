/**
 * HU-1507 · Versiones del sitio comercial (REQ-068, RN-16-5). Una versión es una instantánea inmutable del sitio
 * completo: las páginas publicadas con sus bloques visibles (en orden) y sus elementos visibles (en orden), y el menú y
 * el pie visibles. El sitio público sirve solo la última versión. Estas funciones son puras: `@aptio/db` lee las tablas
 * y las llama, y la API y el worker usan esa armadora.
 */
import { bloquesPublicos } from './sitio-bloques.js';
import { COLECCION_DE_BLOQUE, delIdioma, elementosDeBloque, nombreElemento } from './sitio-contenido.js';
import { elementosParaPublico, type EntornoSitio } from './sitio-ficticios.js';
import { navegacionPublica, type NavegacionPublica } from './sitio-navegacion.js';
import { ajustesPublicados, type AjustesSitio, type SitioPublicado } from './sitio-ajustes.js';
import { sectorPublicado, type SectorPublicado, testimoniosDeSector } from './sitio-sectores.js';
import { type Redireccion, seoPublicado, type SeoPublicado } from './sitio-seo.js';
import { leerBloqueados } from './sitio-seo-ia.js';

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
  /** HU-1514 · Solo en una landing de sector: su nombre, portada, meta título y categoría inicial del blog. */
  sector?: SectorPublicado;
  /** HU-1512 · Meta título, descripción, canonical, «Indexar» y datos estructurados; falta si todo es por defecto. */
  seo?: SeoPublicado;
}
export interface Instantanea {
  formato: 1;
  paginas: PaginaInstantanea[];
  /** El menú y el pie en español (el idioma principal). */
  navegacion: NavegacionPublica;
  /** HU-1510 · El menú y el pie en inglés; falta si no hay ningún enlace visible en inglés (y en las versiones de antes). */
  navegacionEn?: NavegacionPublica;
  /** HU-1509 · Nombre, dominio, logo, favicon y WhatsApp publicados. Falta en las versiones de antes de los ajustes. */
  sitio?: SitioPublicado;
  /** HU-1512 · Las redirecciones 301 activas (CP-124); falta si no hay ninguna. */
  redirecciones?: { desde: string; hacia: string }[];
  /** HU-1512 · Las reglas extra de robots.txt, ya validadas; falta si no hay. */
  robotsExtra?: string;
  /** HU-1513 · El contenido de `/llms.txt`; falta si está vacío (el sitio responde 404). */
  llmsTxt?: string;
  /** HU-1513 · CP-126 · Los rastreadores de IA bloqueados en robots.txt; falta si todos están permitidos. */
  rastreadoresBloqueados?: string[];
}

/** Filas tal como salen de la base (solo los campos que usa la armadora). */
export interface FilaPagina {
  ruta: string;
  idioma: string;
  titulo: string;
  estado: string;
  publicadaEn: Date | string | null;
  bloques: { id: string; tipo: string; orden: number; visible: boolean; ajustes: unknown }[];
  /** HU-1514 · `sector` en una landing; sin el campo (filas de antes), `general`. */
  tipo?: string | null;
  sector?: string | null;
  portada?: unknown;
  metaTitulo?: string | null;
  blogCategoriaInicial?: string | null;
  /** HU-1512 · SEO de la página; sin los campos (filas de antes), los valores por defecto. */
  metaDescripcion?: string | null;
  canonical?: string | null;
  indexar?: boolean | null;
  datosEstructurados?: string | null;
}
export interface FilaElemento {
  id: string;
  coleccion: string;
  orden: number;
  visible: boolean;
  ficticio: boolean;
  datos: unknown;
  /** HU-1510 · es | en; sin el campo, es. */
  idioma?: string | null;
}
export interface FilaEnlace {
  id: string;
  zona: string;
  padreId: string | null;
  texto: string;
  ruta: string | null;
  orden: number;
  visible: boolean;
  /** HU-1510 · es | en; sin el campo, es. */
  idioma?: string | null;
}

const iso = (f: Date | string | null): string | null => (f === null ? null : typeof f === 'string' ? f : f.toISOString());

/**
 * Una página con sus bloques visibles y, en los bloques con colección, sus elementos visibles (cascada RN-16-4). Los
 * ficticios se marcan; en producción no entran (RN-16-3), así una versión de producción nunca guarda uno.
 */
export function armarPagina(p: FilaPagina, elementos: readonly FilaElemento[], entorno: EntornoSitio): PaginaInstantanea {
  const visibles = bloquesPublicos(p.bloques);
  // HU-1510 · Cada página usa solo los elementos de su idioma.
  const permitidos = elementosParaPublico(entorno, delIdioma(elementos, p.idioma).filter((e) => e.visible));
  // HU-1514 · Una landing suma las preguntas del inicio y muestra los testimonios de su sector (CP-157).
  const sector = sectorPublicado(p);
  const seo = seoPublicado(p, Boolean(sector));
  return {
    ruta: p.ruta, idioma: p.idioma, titulo: p.titulo, publicadaEn: iso(p.publicadaEn),
    ...(sector ? { sector } : {}),
    ...(seo ? { seo } : {}),
    bloques: visibles.map((b) => {
      const todos = elementosDeBloque(b.tipo, p.ruta, permitidos, sector ? ['/'] : []);
      const propios = todos && sector && b.tipo === 'testimonios' ? testimoniosDeSector(sector.nombre, todos) : todos;
      return {
        tipo: b.tipo, ajustes: (b.ajustes as Record<string, unknown> | null) ?? null,
        ...(propios ? { elementos: propios.map((e) => ({ id: e.id, coleccion: e.coleccion, datos: e.datos as Record<string, string | number>, ...(e.ficticio ? { ficticio: true as const } : {}) })) } : {}),
      };
    }),
  };
}

/** La instantánea del sitio completo: solo las páginas PUBLICADAS, por ruta e idioma, y la navegación visible. */
export function armarInstantanea(datos: {
  paginas: readonly FilaPagina[]; elementos: readonly FilaElemento[]; enlaces: readonly FilaEnlace[]; ajustes?: AjustesSitio | null;
  /** HU-1512 · Solo entran las activas, por origen. */
  redirecciones?: readonly Redireccion[]; robotsExtra?: string | null;
  /** HU-1513 · Solo entran con contenido o con algún bloqueado, para no marcar cambios sobre las versiones de antes. */
  llmsTxt?: string | null; rastreadoresBloqueados?: readonly string[] | null;
}, entorno: EntornoSitio): Instantanea {
  const paginas = datos.paginas
    .filter((p) => p.estado === 'PUBLICADA')
    .sort((a, b) => a.ruta.localeCompare(b.ruta) || a.idioma.localeCompare(b.idioma))
    .map((p) => armarPagina(p, datos.elementos, entorno));
  // Sin fila de ajustes la instantánea queda igual que antes de la HU-1509 (no marca cambios pendientes).
  const en = navegacionPublica(delIdioma(datos.enlaces, 'en'));
  const bloqueados = leerBloqueados(datos.rastreadoresBloqueados);
  const redirecciones = (datos.redirecciones ?? []).filter((r) => r.activa).map((r) => ({ desde: r.desde, hacia: r.hacia })).sort((a, b) => a.desde.localeCompare(b.desde));
  return {
    formato: 1, paginas, navegacion: navegacionPublica(delIdioma(datos.enlaces, 'es')),
    ...(en.menu.length || en.pie.length ? { navegacionEn: en } : {}),
    ...(datos.ajustes ? { sitio: ajustesPublicados(datos.ajustes) } : {}),
    ...(redirecciones.length ? { redirecciones } : {}),
    ...(datos.robotsExtra?.trim() ? { robotsExtra: datos.robotsExtra.trim() } : {}),
    ...(datos.llmsTxt?.trim() ? { llmsTxt: datos.llmsTxt.trim() } : {}),
    ...(bloqueados.length ? { rastreadoresBloqueados: bloqueados } : {}),
  };
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
  if (!ultima) return actual.paginas.length > 0 || actual.navegacion.menu.length > 0 || actual.navegacion.pie.length > 0 || Boolean(actual.navegacionEn);
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
  sector?: SectorPublicado;
  seo?: SeoPublicado;
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
    ...(p.sector ? { sector: p.sector } : {}),
    ...(p.seo ? { seo: p.seo } : {}),
    bloques: p.bloques.map((b) => ({
      tipo: b.tipo, ajustes: b.ajustes,
      ...(b.elementos ? { elementos: elementosParaPublico(entorno, b.elementos.map((e) => ({ ...e, ficticio: e.ficticio ?? false }))).map((e) => ({ datos: e.datos, ...(e.ficticio ? { ficticio: true as const } : {}) })) } : {}),
    })),
  };
}

/** HU-1510 · El menú y el pie de un idioma (el inglés sin enlaces queda vacío, nunca cae al español). */
export function navegacionDe(inst: Pick<Instantanea, 'navegacion' | 'navegacionEn'>, idioma: string): NavegacionPublica {
  return idioma === 'en' ? (inst.navegacionEn ?? { menu: [], pie: [] }) : inst.navegacion;
}

/**
 * HU-1510 · CP-122 · Las versiones publicadas de una ruta en cada idioma (para hreflang y el sitemap): solo si la misma
 * ruta está publicada en los dos idiomas; si no, ninguna (RN-16-6). HU-1512 · CP-125: una página sin indexar no tiene
 * alternas ni es alterna de la otra.
 */
export function alternasDe(inst: Pick<Instantanea, 'paginas'>, ruta: string): { idioma: 'es' | 'en' }[] {
  const idiomas = new Set(inst.paginas.filter((p) => p.ruta === ruta && p.seo?.indexar !== false).map((p) => p.idioma));
  return idiomas.has('es') && idiomas.has('en') ? [{ idioma: 'es' }, { idioma: 'en' }] : [];
}

/** Lee una instantánea guardada; si no tiene la forma esperada, devuelve un sitio vacío en vez de romper el público. */
export function leerInstantanea(v: unknown): Instantanea {
  const o = v as Partial<Instantanea> | null;
  if (!o || o.formato !== 1 || !Array.isArray(o.paginas) || !o.navegacion) return { formato: 1, paginas: [], navegacion: { menu: [], pie: [] } };
  return o as Instantanea;
}
