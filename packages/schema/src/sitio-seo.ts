/**
 * HU-1512 · SEO técnico del sitio comercial (REQ-071, PNT-26, PNT-29, CP-124, CP-125). Reglas puras que usan la API,
 * `@aptio/db`, el pre-render, la consola web y la simulación de Playwright:
 * - el SEO de cada página: meta título (hasta 60), meta descripción (hasta 160), canonical, «Indexar» y el tipo de
 *   datos estructurados (JSON-LD);
 * - las redirecciones 301 entre rutas internas, sin cadenas, bucles ni pisar una página publicada;
 * - las reglas extra de robots.txt, línea por línea, que se suman a la base del sistema;
 * - la revisión de problemas de la vista «Sitio web › SEO».
 * Todo texto es plano (RN-16-7): el sitio lo escapa al dibujarlo.
 */
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';

export const LIMITES_SEO = { metaTitulo: 60, metaDescripcion: 160, canonical: 300, ruta: 200, robotsLineas: 50, robotsLinea: 200, redirecciones: 500 } as const;

export const TIPOS_DATOS_ESTRUCTURADOS = ['WebPage', 'FAQPage', 'Product'] as const;
export type TipoDatosEstructurados = (typeof TIPOS_DATOS_ESTRUCTURADOS)[number];
export const DATOS_POR_DEFECTO: TipoDatosEstructurados = 'WebPage';
export const esTipoDatos = (v: unknown): v is TipoDatosEstructurados => typeof v === 'string' && (TIPOS_DATOS_ESTRUCTURADOS as readonly string[]).includes(v);

/** El SEO guardado de una página. */
export interface DatosSeo {
  metaTitulo: string | null;
  metaDescripcion: string | null;
  canonical: string | null;
  indexar: boolean;
  datosEstructurados: TipoDatosEstructurados;
}

export const SEO_POR_DEFECTO: DatosSeo = { metaTitulo: null, metaDescripcion: null, canonical: null, indexar: true, datosEstructurados: DATOS_POR_DEFECTO };

/** Cambios que acepta `PATCH /sitio/paginas/{id}`; lo que no llega no cambia. */
export interface CambiosSeo {
  metaTitulo?: string | null | undefined;
  metaDescripcion?: string | null | undefined;
  canonical?: string | null | undefined;
  indexar?: boolean | undefined;
  datosEstructurados?: string | undefined;
}

export type ResultadoSeo = { ok: true; datos: DatosSeo } | { ok: false; errores: ErrorCampo[] };

/** La ruta de una página en el sitio público: las de inglés van bajo `/en` (`/en` para el inicio). */
export function rutaServida(ruta: string, idioma: string): string {
  return idioma === 'en' ? `/en${ruta === '/' ? '' : ruta}` : ruta;
}

/** Ruta interna del sitio: `/`, `/precios`, `/en/precios` (minúsculas, números y guiones). */
const RUTA = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;

const texto = (campo: string, etiqueta: string, v: string | null, max: number, errores: ErrorCampo[]): string | null => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.length > max) errores.push({ campo, mensaje: `${etiqueta} admite hasta ${max} caracteres (tiene ${t.length})` });
  else if (!esTextoPlano(t)) errores.push({ campo, mensaje: `${etiqueta} solo admite texto, sin etiquetas HTML` });
  return t;
};

/** El canonical: una ruta interna (`/precios`) o una dirección `https://` con dominio, sin usuario, clave ni puerto. */
export function validarCanonical(v: string | null | undefined): { ok: true; canonical: string | null } | { ok: false; mensaje: string } {
  const c = (v ?? '').trim();
  if (!c) return { ok: true, canonical: null };
  if (c.length > LIMITES_SEO.canonical) return { ok: false, mensaje: `La URL canónica admite hasta ${LIMITES_SEO.canonical} caracteres` };
  if (c.startsWith('/')) {
    const r = normalizarRuta(c);
    return r ? { ok: true, canonical: r } : { ok: false, mensaje: 'La URL canónica interna va en minúsculas, como /precios' };
  }
  if (!c.startsWith('https://') || /\s/.test(c) || !esTextoPlano(c)) return { ok: false, mensaje: 'La URL canónica empieza con / o con https://' };
  let url: URL;
  try {
    url = new URL(c);
  } catch {
    return { ok: false, mensaje: 'La URL canónica no es una dirección válida' };
  }
  if (url.username || url.password || url.port || !url.hostname.includes('.')) return { ok: false, mensaje: 'La URL canónica necesita un dominio, sin usuario, clave ni puerto' };
  return { ok: true, canonical: url.href };
}

/** Mezcla los cambios con lo guardado y valida. Un texto vacío se guarda null (se usa el título o el texto general). */
export function aplicarCambiosSeo(actual: DatosSeo, c: CambiosSeo): ResultadoSeo {
  const errores: ErrorCampo[] = [];
  const d: DatosSeo = { ...actual };
  if (c.metaTitulo !== undefined) d.metaTitulo = texto('metaTitulo', 'El meta título', c.metaTitulo, LIMITES_SEO.metaTitulo, errores);
  if (c.metaDescripcion !== undefined) d.metaDescripcion = texto('metaDescripcion', 'La meta descripción', c.metaDescripcion, LIMITES_SEO.metaDescripcion, errores);
  if (c.canonical !== undefined) {
    const r = validarCanonical(c.canonical);
    if (r.ok) d.canonical = r.canonical;
    else errores.push({ campo: 'canonical', mensaje: r.mensaje });
  }
  if (c.indexar !== undefined) d.indexar = c.indexar;
  if (c.datosEstructurados !== undefined) {
    if (esTipoDatos(c.datosEstructurados)) d.datosEstructurados = c.datosEstructurados;
    else errores.push({ campo: 'datosEstructurados', mensaje: `Los datos estructurados son ${TIPOS_DATOS_ESTRUCTURADOS.join(', ')}` });
  }
  return errores.length ? { ok: false, errores } : { ok: true, datos: d };
}

/** Lo que guarda la base, normalizado (filas de antes de la HU-1512: los valores por defecto). */
export function leerSeo(p: { metaTitulo?: string | null; metaDescripcion?: string | null; canonical?: string | null; indexar?: boolean | null; datosEstructurados?: string | null }): DatosSeo {
  return {
    metaTitulo: p.metaTitulo ?? null, metaDescripcion: p.metaDescripcion ?? null, canonical: p.canonical ?? null,
    indexar: p.indexar !== false, datosEstructurados: esTipoDatos(p.datosEstructurados) ? p.datosEstructurados : DATOS_POR_DEFECTO,
  };
}

/** El SEO tal como entra en la instantánea: solo lo que no es el valor por defecto (así las versiones de antes no cambian). */
export interface SeoPublicado {
  titulo?: string;
  descripcion?: string;
  canonical?: string;
  indexar?: false;
  datos?: Exclude<TipoDatosEstructurados, 'WebPage'>;
}

/**
 * El SEO de una página para la instantánea, o undefined si todo es por defecto. En una landing el meta título ya viaja
 * en su sector (HU-1514), así que no se repite.
 */
export function seoPublicado(p: Parameters<typeof leerSeo>[0], landing: boolean): SeoPublicado | undefined {
  const s = leerSeo(p);
  const o: SeoPublicado = {
    ...(s.metaTitulo && !landing ? { titulo: s.metaTitulo } : {}),
    ...(s.metaDescripcion ? { descripcion: s.metaDescripcion } : {}),
    ...(s.canonical ? { canonical: s.canonical } : {}),
    ...(s.indexar ? {} : { indexar: false as const }),
    ...(s.datosEstructurados !== 'WebPage' ? { datos: s.datosEstructurados } : {}),
  };
  return Object.keys(o).length ? o : undefined;
}

/**
 * El `<title>` de una página: su meta título; si no tiene, el título con el nombre del sitio (el inicio lo lleva
 * delante: «Aptio SCORM · Inicio»; las demás, detrás: «Precios · Aptio SCORM»).
 */
export function tituloDePagina(p: { ruta: string; titulo: string; metaTitulo?: string | null | undefined }, nombreSitio: string): string {
  if (p.metaTitulo) return p.metaTitulo;
  return p.ruta === '/' ? `${nombreSitio} · ${p.titulo}` : `${p.titulo} · ${nombreSitio}`;
}

// ── Redirecciones 301 ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface Redireccion { id?: string; desde: string; hacia: string; activa: boolean }

/** Una ruta interna normalizada (sin espacios ni barra final) o null si no es válida. */
export function normalizarRuta(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const r = v.trim().replace(/(.)\/+$/, '$1');
  return r.length <= LIMITES_SEO.ruta && RUTA.test(r) ? r : null;
}

export type CodigoRedireccion = 'REDIRECCION_INVALIDA' | 'REDIRECCION_A_SI_MISMA' | 'REDIRECCION_REPETIDA' | 'REDIRECCION_EN_BUCLE' | 'REDIRECCION_EN_CADENA' | 'REDIRECCION_PISA_PAGINA';
export type ResultadoRedireccion =
  | { ok: true; redireccion: Omit<Redireccion, 'id'> }
  | { ok: false; codigo: CodigoRedireccion; errores: ErrorCampo[] };

const mal = (codigo: CodigoRedireccion, campo: string, mensaje: string): ResultadoRedireccion => ({ ok: false, codigo, errores: [{ campo, mensaje }] });

/**
 * Valida una redirección contra las demás (sin ella misma) y las rutas de las páginas publicadas (`rutaServida`).
 * Activa, no puede formar un bucle (A → B y B → A) ni una cadena (A → B y B → C, o C → A y A → B) con las otras
 * activas, ni salir de una ruta que hoy sirve una página publicada. El origen no se repite, ni el inicio se redirige.
 */
export function validarRedireccion(entrada: { desde: unknown; hacia: unknown; activa?: boolean | undefined }, otras: readonly Redireccion[], rutasPublicadas: readonly string[]): ResultadoRedireccion {
  const desde = normalizarRuta(entrada.desde);
  const hacia = normalizarRuta(entrada.hacia);
  const activa = entrada.activa !== false;
  if (!desde) return mal('REDIRECCION_INVALIDA', 'desde', 'El origen es una ruta interna en minúsculas, como /precios-2025');
  if (!hacia) return mal('REDIRECCION_INVALIDA', 'hacia', 'El destino es una ruta interna en minúsculas, como /precios');
  if (desde === '/' || desde === '/en') return mal('REDIRECCION_INVALIDA', 'desde', 'El inicio no se redirige');
  if (desde === hacia) return mal('REDIRECCION_A_SI_MISMA', 'hacia', 'El destino es igual al origen');
  if (otras.some((o) => o.desde === desde)) return mal('REDIRECCION_REPETIDA', 'desde', `Ya hay una redirección desde ${desde}`);
  if (activa) {
    if (rutasPublicadas.includes(desde)) return mal('REDIRECCION_PISA_PAGINA', 'desde', `${desde} es una página publicada: la redirección nunca se usaría`);
    const activas = otras.filter((o) => o.activa);
    if (activas.some((o) => o.desde === hacia && o.hacia === desde)) return mal('REDIRECCION_EN_BUCLE', 'hacia', `Forma un bucle con ${hacia} → ${desde}`);
    const sigue = activas.find((o) => o.desde === hacia);
    if (sigue) return mal('REDIRECCION_EN_CADENA', 'hacia', `${hacia} ya redirige a ${sigue.hacia}: usa ese destino directamente`);
    const llega = activas.find((o) => o.hacia === desde);
    if (llega) return mal('REDIRECCION_EN_CADENA', 'desde', `${llega.desde} ya redirige a ${desde}: se formaría una cadena`);
  }
  return { ok: true, redireccion: { desde, hacia, activa } };
}

/** La redirección que corresponde a una ruta pedida, entre las de la versión publicada (solo activas). */
export function redireccionDe(redirecciones: readonly { desde: string; hacia: string }[] | undefined, ruta: string): string | null {
  const r = normalizarRuta(ruta.split(/[?#]/)[0] || '/');
  return (r && redirecciones?.find((x) => x.desde === r)?.hacia) || null;
}

// ── robots.txt ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Una ruta de robots.txt: empieza con `/`, sin espacios; admite los comodines `*` y `$`. */
const RUTA_ROBOTS = /^\/[A-Za-z0-9\-._~/*$%?=&+]*$/;

export type ResultadoRobots = { ok: true; robotsExtra: string } | { ok: false; errores: ErrorCampo[] };

/**
 * Las reglas extra de robots.txt, línea por línea: solo `Allow: /ruta`, `Disallow: /ruta` y comentarios `#`. No se
 * acepta `Disallow: /` ni `Disallow: /*` (bloquearía el sitio entero), ni `User-agent`, `Sitemap` u otras directivas:
 * esas las pone el sistema. Devuelve el texto normalizado (`Disallow: /x`), sin líneas vacías al final.
 */
export function validarRobotsExtra(v: string | null | undefined): ResultadoRobots {
  const lineas = (v ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
  while (lineas.length && !lineas.at(-1)) lineas.pop();
  const errores: ErrorCampo[] = [];
  if (lineas.length > LIMITES_SEO.robotsLineas) return { ok: false, errores: [{ campo: 'robotsExtra', mensaje: `robots.txt admite hasta ${LIMITES_SEO.robotsLineas} reglas extra` }] };
  const salida = lineas.map((l, i) => {
    const n = i + 1;
    const err = (mensaje: string) => { errores.push({ campo: `robotsExtra.${n}`, mensaje: `Línea ${n}: ${mensaje}` }); return l; };
    if (!l) return '';
    if (l.length > LIMITES_SEO.robotsLinea) return err(`admite hasta ${LIMITES_SEO.robotsLinea} caracteres`);
    if (!esTextoPlano(l) || /[<>]/.test(l)) return err('solo texto, sin etiquetas HTML');
    if (l.startsWith('#')) return l;
    const m = /^(allow|disallow)\s*:\s*(\S*)$/i.exec(l);
    if (!m) return err('solo se aceptan «Allow: /ruta», «Disallow: /ruta» o comentarios que empiezan con #');
    const ruta = m[2]!;
    if (!RUTA_ROBOTS.test(ruta)) return err('la ruta empieza con / y no lleva espacios');
    const directiva = m[1]!.toLowerCase() === 'allow' ? 'Allow' : 'Disallow';
    if (directiva === 'Disallow' && (ruta === '/' || ruta === '/*')) return err('no se bloquea el sitio entero desde aquí');
    return `${directiva}: ${ruta}`;
  });
  return errores.length ? { ok: false, errores } : { ok: true, robotsExtra: salida.join('\n') };
}

// ── Revisión de problemas (PNT-29) ───────────────────────────────────────────────────────────────────────────────────

export type Severidad = 'alta' | 'media' | 'baja';
export type TipoProblema = 'sin-descripcion' | 'titulo-largo' | 'descripcion-larga' | 'sin-indexar' | 'redireccion-sin-destino' | 'redireccion-tapada';

export interface ProblemaSeo {
  tipo: TipoProblema;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  paginaId?: string;
  redireccionId?: string;
}

export interface PaginaAnalizable {
  id: string; ruta: string; idioma: string; titulo: string; estado: string;
  metaTitulo?: string | null; metaDescripcion?: string | null; indexar?: boolean | null;
}

/** Rutas que existen aunque no haya una página guardada en ellas. */
export const RUTAS_RESERVADAS = ['/'] as const;

const ORDEN_SEVERIDAD: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };

/**
 * Revisa el sitio y devuelve los problemas, de los más graves a los más leves: páginas sin meta descripción, con un
 * título de más de 60 o una descripción de más de 160 caracteres, sin indexar, y redirecciones activas cuyo destino no
 * es ninguna página (ni una ruta reservada) o que una página publicada deja sin usar.
 */
export function analizarSeo(datos: { paginas: readonly PaginaAnalizable[]; redirecciones: readonly Redireccion[]; nombreSitio: string }): ProblemaSeo[] {
  const problemas: ProblemaSeo[] = [];
  for (const p of datos.paginas) {
    const donde = `${p.titulo} (${rutaServida(p.ruta, p.idioma)})`;
    const titulo = tituloDePagina(p, datos.nombreSitio);
    if (!p.metaDescripcion) problemas.push({ tipo: 'sin-descripcion', severidad: 'alta', titulo: 'Falta la meta descripción', detalle: `${donde}: los buscadores muestran el texto general del sitio.`, paginaId: p.id });
    else if (p.metaDescripcion.length > LIMITES_SEO.metaDescripcion) problemas.push({ tipo: 'descripcion-larga', severidad: 'media', titulo: `Meta descripción de más de ${LIMITES_SEO.metaDescripcion} caracteres`, detalle: `${donde}: tiene ${p.metaDescripcion.length} y Google la corta.`, paginaId: p.id });
    if (titulo.length > LIMITES_SEO.metaTitulo) problemas.push({ tipo: 'titulo-largo', severidad: 'media', titulo: `Título de más de ${LIMITES_SEO.metaTitulo} caracteres`, detalle: `${donde}: «${titulo}» tiene ${titulo.length} y Google lo corta.`, paginaId: p.id });
    if (p.indexar === false) problemas.push({ tipo: 'sin-indexar', severidad: 'baja', titulo: 'Página sin indexar', detalle: `${donde}: lleva noindex y no está en el sitemap.`, paginaId: p.id });
  }
  const rutas = new Map(datos.paginas.map((p) => [rutaServida(p.ruta, p.idioma), p]));
  for (const r of datos.redirecciones.filter((x) => x.activa)) {
    const destino = rutas.get(r.hacia);
    const reservada = (RUTAS_RESERVADAS as readonly string[]).includes(r.hacia);
    if (!destino && !reservada) problemas.push({ tipo: 'redireccion-sin-destino', severidad: 'alta', titulo: 'Redirección a una página que no existe', detalle: `${r.desde} → ${r.hacia}: el visitante termina en la página 404.`, ...(r.id ? { redireccionId: r.id } : {}) });
    else if (destino && destino.estado !== 'PUBLICADA') problemas.push({ tipo: 'redireccion-sin-destino', severidad: 'media', titulo: 'Redirección a una página sin publicar', detalle: `${r.desde} → ${r.hacia}: hasta que se publique, el visitante termina en la página 404.`, ...(r.id ? { redireccionId: r.id } : {}) });
    const tapa = rutas.get(r.desde);
    if (tapa?.estado === 'PUBLICADA') problemas.push({ tipo: 'redireccion-tapada', severidad: 'baja', titulo: 'Redirección sin uso', detalle: `${r.desde} es una página publicada: se muestra la página y la redirección no se usa.`, ...(r.id ? { redireccionId: r.id } : {}) });
  }
  return problemas.map((p, i) => ({ p, i })).sort((a, b) => ORDEN_SEVERIDAD[a.p.severidad] - ORDEN_SEVERIDAD[b.p.severidad] || a.i - b.i).map((x) => x.p);
}
