/**
 * HU-1508 · Cómo se sirve el sitio pre-renderizado (lo usan la API en `GET /s/*` y la medición con Lighthouse). Traduce
 * la ruta pedida al archivo de la versión y da las cabeceras: las páginas se revalidan (la CDN las guarda un minuto) y
 * las fuentes, que llevan su hash en el nombre, se guardan un año. Rechaza cualquier ruta fuera de las formas válidas.
 */
import { createHash } from 'node:crypto';
import { CARPETA_FUENTES } from './fuentes.js';
import { entornoSitio } from '@aptio/schema/sitio-ficticios';
import { archivoDeRuta, type OpcionesRender } from './render.js';

export type Pedido =
  | { tipo: 'pagina'; archivo: string }
  | { tipo: 'fuente'; archivo: string }
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
  if (partes.length > 8 || !partes.every((p) => SEGMENTO.test(p))) return null;
  return { tipo: 'pagina', archivo: archivoDeRuta(limpia) };
}

export const TIPOS_MIME = {
  pagina: 'text/html; charset=utf-8',
  fuente: 'font/woff2',
  sitemap: 'application/xml; charset=utf-8',
  robots: 'text/plain; charset=utf-8',
} as const;

/** Sin JavaScript ni recursos de fuera: la política permite solo estilos en línea y fuentes propias. */
export const POLITICA_CONTENIDO = "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function cabecerasSitio(tipo: Pedido['tipo'] | '404', cuerpo: Uint8Array | string): Record<string, string> {
  const etag = `"${createHash('sha1').update(cuerpo).digest('base64url')}"`;
  const base = { 'Content-Type': tipo === '404' ? TIPOS_MIME.pagina : TIPOS_MIME[tipo], ETag: etag, 'X-Content-Type-Options': 'nosniff' };
  if (tipo === 'fuente') return { ...base, 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' };
  return {
    ...base,
    'Cache-Control': tipo === '404' ? 'public, max-age=0, s-maxage=30' : 'public, max-age=0, s-maxage=60, must-revalidate',
    ...(tipo === 'pagina' || tipo === '404' ? { 'Content-Security-Policy': POLITICA_CONTENIDO, 'Referrer-Policy': 'strict-origin-when-cross-origin' } : {}),
  };
}

/** ¿El navegador ya tiene esta versión? (`If-None-Match` con la misma ETag, o `*`). */
export function noModificado(siNoCoincide: string | undefined, etag: string): boolean {
  if (!siNoCoincide) return false;
  return siNoCoincide.split(',').map((x) => x.trim().replace(/^W\//, '')).some((x) => x === etag || x === '*');
}

/** HU-1508 · Dónde vive el sitio en el bucket. El puntero dice qué versión se sirve; se escribe al final. */
export const CLAVE_ACTUAL = 'sitio/actual.json';
export const claveVersion = (numero: number, archivo: string) => `sitio/v${numero}/${archivo}`;
export const claveFuente = (archivo: string) => `sitio/fuentes/${archivo}`;
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
