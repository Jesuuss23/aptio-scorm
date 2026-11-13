/**
 * Menú principal y pie de página del sitio comercial (HU-1506, REQ-066, PNT-25). El menú es una lista plana de
 * enlaces; el pie tiene columnas (sin padre) con sus enlaces (con padre), sin un tercer nivel. Cada grupo de hermanos
 * (misma zona y mismo padre) se ordena por su cuenta con las funciones de `sitio-bloques`. Todo es texto plano
 * (RN-16-7) y lo nuevo nace oculto (RN-16-2).
 */
import { ordenarBloques, type BloqueOrdenable } from './sitio-bloques.js';
import { esTextoPlano } from './sitio-contenido.js';

export const ZONAS_NAVEGACION = ['menu', 'pie'] as const;
export type ZonaNavegacion = (typeof ZONAS_NAVEGACION)[number];

export function esZonaNavegacion(z: unknown): z is ZonaNavegacion {
  return typeof z === 'string' && (ZONAS_NAVEGACION as readonly string[]).includes(z);
}

export const MAX_TEXTO_ENLACE = 60;
export const MAX_RUTA_ENLACE = 300;

/** Ruta interna: `/`, `/precios`, `/funcionalidades/personaje`, con un ancla opcional (`/#testimonios`). */
const RUTA_INTERNA = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:#[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export type ResultadoRuta = { ok: true; ruta: string; externo: boolean } | { ok: false; mensaje: string };

/** Un enlace externo es el que empieza con `https://`: abre en otra pestaña con `rel="noopener"`. */
export function esEnlaceExterno(ruta: string): boolean {
  return ruta.startsWith('https://');
}

/**
 * Valida la ruta de un enlace: solo una ruta interna que empieza con `/` o una URL `https://` con dominio y sin
 * usuario ni clave. Rechaza `javascript:`, `http:`, `data:`, `//otro-sitio` y cualquier otra forma.
 */
export function validarRuta(entrada: unknown): ResultadoRuta {
  if (typeof entrada !== 'string' || entrada.trim() === '') return { ok: false, mensaje: 'La ruta es obligatoria' };
  const ruta = entrada.trim();
  if (ruta.length > MAX_RUTA_ENLACE) return { ok: false, mensaje: `La ruta admite hasta ${MAX_RUTA_ENLACE} caracteres` };
  if (!esTextoPlano(ruta) || /\s/.test(ruta)) return { ok: false, mensaje: 'La ruta no admite espacios ni etiquetas' };
  if (ruta.startsWith('/')) {
    return RUTA_INTERNA.test(ruta)
      ? { ok: true, ruta, externo: false }
      : { ok: false, mensaje: 'La ruta interna va en minúsculas, como /precios o /#testimonios' };
  }
  if (!esEnlaceExterno(ruta)) return { ok: false, mensaje: 'La ruta empieza con / o con https://' };
  let url: URL;
  try {
    url = new URL(ruta);
  } catch {
    return { ok: false, mensaje: 'La dirección https:// no es válida' };
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) {
    return { ok: false, mensaje: 'La dirección https:// no es válida' };
  }
  return { ok: true, ruta, externo: true };
}

export type ResultadoTexto = { ok: true; texto: string } | { ok: false; mensaje: string };

/** Texto del enlace o título de la columna: una línea de texto plano de hasta 60 caracteres (RN-16-7). */
export function validarTextoEnlace(entrada: unknown): ResultadoTexto {
  if (typeof entrada !== 'string' || entrada.trim() === '') return { ok: false, mensaje: 'El texto es obligatorio' };
  const texto = entrada.trim();
  if (texto.length > MAX_TEXTO_ENLACE) return { ok: false, mensaje: `El texto admite hasta ${MAX_TEXTO_ENLACE} caracteres` };
  if (texto.includes('\n') || texto.includes('\r')) return { ok: false, mensaje: 'El texto va en una sola línea' };
  if (!esTextoPlano(texto)) return { ok: false, mensaje: 'El texto solo admite texto, sin etiquetas HTML' };
  return { ok: true, texto };
}

export interface UbicacionEnlace {
  zona: string;
  padreId: string | null;
}

export type ErrorUbicacion = 'ZONA_INVALIDA' | 'MENU_SIN_NIVELES' | 'PADRE_DE_OTRA_ZONA' | 'PROFUNDIDAD_INVALIDA';

/**
 * Revisa dónde va un enlace: el menú es plano (sin padre) y el pie tiene dos niveles, columna y enlace. El padre debe
 * ser una columna del pie (un enlace del pie sin padre a su vez).
 */
export function validarUbicacion(zona: unknown, padre: UbicacionEnlace | null): ErrorUbicacion | null {
  if (!esZonaNavegacion(zona)) return 'ZONA_INVALIDA';
  if (padre === null) return null;
  if (zona === 'menu') return 'MENU_SIN_NIVELES';
  if (padre.zona !== 'pie') return 'PADRE_DE_OTRA_ZONA';
  if (padre.padreId !== null) return 'PROFUNDIDAD_INVALIDA';
  return null;
}

/** Una columna del pie es un enlace del pie sin padre: su ruta es opcional; el resto de los enlaces la necesita. */
export function esColumnaPie(e: UbicacionEnlace): boolean {
  return e.zona === 'pie' && e.padreId === null;
}

export interface EnlaceOrdenable extends BloqueOrdenable, UbicacionEnlace {}

/** Los hermanos de un grupo (misma zona y mismo padre), en su orden. */
export function hermanosDe<T extends EnlaceOrdenable>(enlaces: readonly T[], zona: string, padreId: string | null): T[] {
  return ordenarBloques(enlaces.filter((e) => e.zona === zona && e.padreId === padreId));
}

export type ColumnaPie<T> = T & { enlaces: T[] };

/** Toda la navegación (visible y oculta) ordenada: el menú y las columnas del pie con sus enlaces. */
export function arbolNavegacion<T extends EnlaceOrdenable>(enlaces: readonly T[]): { menu: T[]; pie: ColumnaPie<T>[] } {
  return {
    menu: hermanosDe(enlaces, 'menu', null),
    pie: hermanosDe(enlaces, 'pie', null).map((c) => ({ ...c, enlaces: hermanosDe(enlaces, 'pie', c.id) })),
  };
}

export interface EnlacePublico { texto: string; ruta: string; externo: boolean }
export interface ColumnaPublica { titulo: string; ruta?: string; externo?: boolean; enlaces: EnlacePublico[] }
export interface NavegacionPublica { menu: EnlacePublico[]; pie: ColumnaPublica[] }

/**
 * Lo que ve el público (CP-118): solo lo visible y en su orden. Una columna oculta oculta sus enlaces, y una columna
 * visible sin enlaces visibles no sale. La cabecera y el menú de celular usan la misma lista `menu`.
 */
export function navegacionPublica<T extends EnlaceOrdenable & { texto: string; ruta: string | null }>(enlaces: readonly T[]): NavegacionPublica {
  const enlace = (e: T): EnlacePublico[] => (e.ruta ? [{ texto: e.texto, ruta: e.ruta, externo: esEnlaceExterno(e.ruta) }] : []);
  const arbol = arbolNavegacion(enlaces);
  return {
    menu: arbol.menu.filter((e) => e.visible).flatMap(enlace),
    pie: arbol.pie.filter((c) => c.visible).flatMap((c) => {
      const hijos = c.enlaces.filter((e) => e.visible).flatMap(enlace);
      if (hijos.length === 0) return [];
      return [{ titulo: c.texto, ...(c.ruta ? { ruta: c.ruta, externo: esEnlaceExterno(c.ruta) } : {}), enlaces: hijos }];
    }),
  };
}
