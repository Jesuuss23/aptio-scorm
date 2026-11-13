/**
 * HU-1508 · Cómo se sirve el sitio pre-renderizado (lo usan la API en `GET /s/*` y la medición con Lighthouse). Traduce
 * la ruta pedida al archivo de la versión y da las cabeceras: las páginas se revalidan (la CDN las guarda un minuto) y
 * las fuentes, que llevan su hash en el nombre, se guardan un año. Rechaza cualquier ruta fuera de las formas válidas.
 */
import { createHash } from 'node:crypto';
import { CARPETA_FUENTES } from './fuentes.js';
import { entornoSitio } from '@aptio/schema/sitio-ficticios';
import { esArchivoMarca } from '@aptio/schema/sitio-ajustes';
import { archivoDeRuta, CARPETA_MARCA, type OpcionesRender } from './render.js';

export type Pedido =
  | { tipo: 'pagina'; archivo: string }
  | { tipo: 'fuente'; archivo: string }
  | { tipo: 'marca'; archivo: string }
  | { tipo: 'sitemap' | 'robots'; archivo: string };

const SEGMENTO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FUENTE = /^[a-z0-9-]+-[0-9a-f]{8}\.woff2$/;

/** La ruta pedida bajo la base (`/`, `/precios`, `/en/precios`, `/_fuentes/x.woff2`) o `null` si no es válida. */
export function resolverPedido(ruta: string): Pedido | null {
  const limpia = ruta.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  if (limpia === '/sitemap.xml') return { tipo: 'sitemap', archivo: 'sitemap.xml' };
  if (limpia === '/robots.txt') return { tipo: 'robots', archivo: 'robots.txt' };
  const partes = limpia.split('/').slice(1).filter((p) => p !== '');
  if (partes.length === 2 && partes[0] === CARPETA_FUENTES) return FUENTE.test(partes[1]!) ? { tipo: 'fuente', archivo: partes[1]! } : null;
  if (partes.length === 2 && partes[0] === CARPETA_MARCA) return esArchivoMarca(partes[1]!) ? { tipo: 'marca', archivo: partes[1]! } : null;
  if (partes.length > 8 || !partes.every((p) => SEGMENTO.test(p))) return null;
  return { tipo: 'pagina', archivo: archivoDeRuta(limpia) };
}

export const TIPOS_MIME = {
  pagina: 'text/html; charset=utf-8',
  fuente: 'font/woff2',
  marca: 'image/svg+xml',
  sitemap: 'application/xml; charset=utf-8',
  robots: 'text/plain; charset=utf-8',
} as const;

/** Sin JavaScript ni recursos de fuera: la política permite solo estilos en línea y fuentes propias. */
export const POLITICA_CONTENIDO = "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Tipo de un archivo de marca por su extensión. */
export const mimeMarca = (archivo: string) => (archivo.endsWith('.png') ? 'image/png' : 'image/svg+xml');

/**
 * Cabeceras de cada respuesta. HU-1509: la marca (con su hash en el nombre) se guarda un año, como las fuentes; el
 * aviso de mantenimiento (503) no se guarda en ninguna caché; `privada` es para lo que ve el superadmin en mantenimiento.
 */
export function cabecerasSitio(tipo: Pedido['tipo'] | '404' | '503', cuerpo: Uint8Array | string, opciones: { archivo?: string | undefined; privada?: boolean } = {}): Record<string, string> {
  const etag = `"${createHash('sha1').update(cuerpo).digest('base64url')}"`;
  const tipoContenido = tipo === '404' || tipo === '503' ? TIPOS_MIME.pagina : tipo === 'marca' ? mimeMarca(opciones.archivo ?? '') : TIPOS_MIME[tipo];
  const base = { 'Content-Type': tipoContenido, ETag: etag, 'X-Content-Type-Options': 'nosniff' };
  if (tipo === 'fuente' || tipo === 'marca') {
    return { ...base, 'Cache-Control': 'public, max-age=31536000, immutable', ...(tipo === 'fuente' ? { 'Access-Control-Allow-Origin': '*' } : { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }) };
  }
  const cache = opciones.privada || tipo === '503' ? 'private, no-store' : tipo === '404' ? 'public, max-age=0, s-maxage=30' : 'public, max-age=0, s-maxage=60, must-revalidate';
  return {
    ...base,
    'Cache-Control': cache,
    ...(tipo === 'pagina' || tipo === '404' || tipo === '503' ? { 'Content-Security-Policy': POLITICA_CONTENIDO, 'Referrer-Policy': 'strict-origin-when-cross-origin' } : {}),
    ...(tipo === '503' ? { 'Retry-After': String(REINTENTO_MANTENIMIENTO_S) } : {}),
  };
}

/** HU-1509 · Segundos de `Retry-After` en el aviso de mantenimiento. */
export const REINTENTO_MANTENIMIENTO_S = 600;

/** ¿El navegador ya tiene esta versión? (`If-None-Match` con la misma ETag, o `*`). */
export function noModificado(siNoCoincide: string | undefined, etag: string): boolean {
  if (!siNoCoincide) return false;
  return siNoCoincide.split(',').map((x) => x.trim().replace(/^W\//, '')).some((x) => x === etag || x === '*');
}

/** HU-1508 · Dónde vive el sitio en el bucket. El puntero dice qué versión se sirve; se escribe al final. */
export const CLAVE_ACTUAL = 'sitio/actual.json';
export const claveVersion = (numero: number, archivo: string) => `sitio/v${numero}/${archivo}`;
export const claveFuente = (archivo: string) => `sitio/fuentes/${archivo}`;
/** HU-1509 · El logo y el favicon, con su hash en el nombre: no dependen de la versión. */
export const claveMarca = (archivo: string) => `sitio/marca/${archivo}`;
export interface PunteroSitio { version: number; generadoEn: string }

export const SITIO_URL_POR_DEFECTO = 'https://aptioscorm.com';

/** Opciones del render desde el entorno: `SITIO_ENTORNO` (RN-16-3), `SITIO_URL` (canonical y sitemap) y `SITIO_BASE`. */
export function opcionesRenderDesdeEnv(env: NodeJS.ProcessEnv = process.env): OpcionesRender {
  return {
    entorno: entornoSitio(env.SITIO_ENTORNO),
    sitioUrl: (env.SITIO_URL || SITIO_URL_POR_DEFECTO).replace(/\/+$/, ''),
    base: (env.SITIO_BASE ?? '/s').replace(/\/+$/, ''),
  };
}
