/**
 * HU-1514 · Landings por sector (REQ-092, PNT-25, RN-16-9). Una landing es una página de tipo `sector` en
 * `/sectores/{slug}` con nombre del sector, portada propia, meta título y categoría inicial del blog. Nace en borrador
 * con los bloques de la plantilla (ocultos, RN-16-2) y no se publica ni se programa sin portada y meta título. Muestra
 * los testimonios de su sector (si no hay, todos los visibles) y las preguntas de su ruta, del inicio y las generales.
 * Lo usan la API, `@aptio/db`, el pre-render, la consola web y la simulación de Playwright.
 */
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';

export const TIPOS_PAGINA = ['general', 'sector'] as const;
export type TipoPagina = (typeof TIPOS_PAGINA)[number];

/** El sector de los testimonios que valen para cualquier landing. */
export const SECTOR_GENERAL = 'General';

/** Bloques con que nace una landing, en orden (como «Nueva landing de sector» del prototipo). */
export const PLANTILLA_SECTOR = ['hero', 'metricas', 'pasos', 'testimonios', 'faq', 'bloglista', 'cta'] as const;

export const LIMITES_SECTOR = { sector: 60, portadaTitulo: 120, portadaTexto: 300, metaTitulo: 70, blogCategoria: 60 } as const;

export interface PortadaSector { titulo: string; texto: string }

/** Lo propio de una landing; en una página general todo va en null. */
export interface DatosSector {
  sector: string | null;
  portada: PortadaSector | null;
  metaTitulo: string | null;
  blogCategoriaInicial: string | null;
}

/** El sector de una landing tal como entra en la instantánea y lo dibuja el sitio. */
export interface SectorPublicado {
  nombre: string;
  portada: PortadaSector;
  metaTitulo: string;
  blogCategoria: string | null;
}

/** Nombre del sector → segmento de la ruta: minúsculas, sin tildes, palabras unidas por guiones. */
export function slugSector(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

export const rutaSector = (nombre: string): string => `/sectores/${slugSector(nombre)}`;

/** Compara sectores sin mayúsculas ni espacios de más: «Minería y energía» = «minería y energía ». */
export const mismoSector = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' && typeof b === 'string' && a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

const linea = (campo: string, etiqueta: string, v: string, max: number, errores: ErrorCampo[], obligatorio: boolean): string | null => {
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) {
    if (obligatorio) errores.push({ campo, mensaje: `${etiqueta} es obligatorio` });
    return null;
  }
  if (t.length > max) errores.push({ campo, mensaje: `${etiqueta} admite hasta ${max} caracteres` });
  else if (!esTextoPlano(t)) errores.push({ campo, mensaje: `${etiqueta} solo admite texto, sin etiquetas HTML` });
  return t;
};

/** Cambios que acepta una landing (en la API, `POST` y `PATCH /sitio/paginas`). */
export interface CambiosSector {
  sector?: string | undefined;
  portada?: { titulo?: string | null | undefined; texto?: string | null | undefined } | null | undefined;
  metaTitulo?: string | null | undefined;
  blogCategoriaInicial?: string | null | undefined;
}

export type ResultadoSector = { ok: true; datos: DatosSector } | { ok: false; errores: ErrorCampo[] };

/**
 * Mezcla los cambios con lo guardado y valida: sector obligatorio (texto plano, sin «General», que es la marca de los
 * testimonios de todos), título y texto de la portada, meta título y categoría inicial. Un texto vacío se guarda null.
 */
export function aplicarCambiosSector(actual: DatosSector, c: CambiosSector): ResultadoSector {
  const errores: ErrorCampo[] = [];
  const d: DatosSector = structuredClone(actual);
  if (c.sector !== undefined) {
    const s = linea('sector', 'El sector', c.sector, LIMITES_SECTOR.sector, errores, true);
    if (s && mismoSector(s, SECTOR_GENERAL)) errores.push({ campo: 'sector', mensaje: '«General» no es un sector: es la marca de los testimonios que valen para todos' });
    else if (s && !slugSector(s)) errores.push({ campo: 'sector', mensaje: 'El sector necesita al menos una letra o un número' });
    d.sector = s;
  }
  if (c.portada !== undefined) {
    const titulo = c.portada?.titulo !== undefined ? c.portada.titulo : (d.portada?.titulo ?? null);
    const texto = c.portada?.texto !== undefined ? c.portada.texto : (d.portada?.texto ?? null);
    const t = linea('portada.titulo', 'El título de la portada', titulo ?? '', LIMITES_SECTOR.portadaTitulo, errores, false);
    const x = linea('portada.texto', 'El texto de la portada', texto ?? '', LIMITES_SECTOR.portadaTexto, errores, false);
    d.portada = c.portada === null || (!t && !x) ? null : { titulo: t ?? '', texto: x ?? '' };
  }
  if (c.metaTitulo !== undefined) d.metaTitulo = linea('metaTitulo', 'El meta título', c.metaTitulo ?? '', LIMITES_SECTOR.metaTitulo, errores, false);
  if (c.blogCategoriaInicial !== undefined) d.blogCategoriaInicial = linea('blogCategoriaInicial', 'La categoría inicial del blog', c.blogCategoriaInicial ?? '', LIMITES_SECTOR.blogCategoria, errores, false);
  return errores.length ? { ok: false, errores } : { ok: true, datos: d };
}

/** RN-16-9 · Lo que le falta a una landing para publicarse o programarse (vacío si está lista). */
export function faltantesParaPublicar(d: Pick<DatosSector, 'portada' | 'metaTitulo'>): ErrorCampo[] {
  const f: ErrorCampo[] = [];
  if (!d.portada?.titulo) f.push({ campo: 'portada.titulo', mensaje: 'Falta el título de la portada' });
  if (!d.portada?.texto) f.push({ campo: 'portada.texto', mensaje: 'Falta el texto de la portada' });
  if (!d.metaTitulo) f.push({ campo: 'metaTitulo', mensaje: 'Falta el meta título' });
  return f;
}

/** Lo que guarda la base de una página (`portada` es JSON): normalizado, o null si no tiene la forma esperada. */
export function leerPortada(v: unknown): PortadaSector | null {
  const o = v as Partial<PortadaSector> | null;
  return o && typeof o === 'object' && typeof o.titulo === 'string' && typeof o.texto === 'string' ? { titulo: o.titulo, texto: o.texto } : null;
}

/** El sector que entra en la instantánea, o undefined si la página no es una landing completa. */
export function sectorPublicado(p: { tipo?: string | null } & Partial<Pick<DatosSector, 'sector' | 'metaTitulo' | 'blogCategoriaInicial'>> & { portada?: unknown }): SectorPublicado | undefined {
  const portada = leerPortada(p.portada);
  if (p.tipo !== 'sector' || !p.sector || !portada || !p.metaTitulo) return undefined;
  return { nombre: p.sector, portada, metaTitulo: p.metaTitulo, blogCategoria: p.blogCategoriaInicial ?? null };
}

/** CP-157 · Testimonios de una landing: los de su sector; si no hay ninguno, todos los recibidos (ya visibles). */
export function testimoniosDeSector<T extends { datos: unknown }>(sector: string, testimonios: readonly T[]): T[] {
  const propios = testimonios.filter((t) => mismoSector((t.datos as { sector?: unknown } | null)?.sector, sector));
  return propios.length ? propios : [...testimonios];
}
