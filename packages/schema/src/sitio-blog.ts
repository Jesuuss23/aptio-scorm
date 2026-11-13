/**
 * HU-1511 · Sección Blog desde WordPress (REQ-070, PNT-28, RN-16-8). Reglas puras que comparten la API, el worker, el
 * sitio y la web: la URL de WordPress (solo https://, sin usuario ni clave ni IP privadas), la lectura de la API REST de
 * WordPress (solo artículos `publish` y sin clave, CP-154), el texto plano de títulos y extractos, y lo que ve el
 * público: categorías visibles en su orden con su número de artículos y los artículos visibles de esas categorías
 * (CP-123, CP-155).
 */

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
/** 4, 6 o 0, como `net.isIP` (este módulo también corre en el navegador). */
const isIP = (s: string): 4 | 6 | 0 => (IPV4.test(s) ? 4 : s.includes(':') && /^[0-9a-f:.]+$/i.test(s) ? 6 : 0);

export const FRECUENCIAS_BLOG = [15, 30, 60] as const;
export const LIMITES_BLOG = { porPaginaMin: 3, porPaginaMax: 12, titulo: 200, extracto: 300, autor: 80, articulos: 100, categorias: 100, imagenBytes: 1024 * 1024, imagenAncho: 800 } as const;
export const POR_PAGINA_BLOG = 6;
/** Cuántos artículos lleva la columna «Últimos artículos» del pie. */
export const ULTIMOS_BLOG = 3;

export interface ConexionBlog {
  url: string | null;
  frecuenciaMin: number;
  porPagina: number;
  mostrarImagen: boolean;
  mostrarAutor: boolean;
}

export const CONEXION_BLOG_POR_DEFECTO: ConexionBlog = { url: null, frecuenciaMin: 15, porPagina: POR_PAGINA_BLOG, mostrarImagen: true, mostrarAutor: true };

/** IPv4 o IPv6 de redes privadas, locales o reservadas (para no usar el servidor contra la red interna). */
export function esIpPrivada(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s.startsWith('::ffff:')) return esIpPrivada(s.slice(7));
    return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') || s.startsWith('ff');
  }
  return false;
}

export type ResultadoUrlBlog = { ok: true; url: string | null } | { ok: false; mensaje: string };

/** La URL del WordPress: https:// con dominio, sin usuario, clave, puerto raro, consulta ni ancla; sin / final. Vacía = desconectar. */
export function validarUrlBlog(entrada: unknown): ResultadoUrlBlog {
  if (entrada === null || (typeof entrada === 'string' && entrada.trim() === '')) return { ok: true, url: null };
  if (typeof entrada !== 'string') return { ok: false, mensaje: 'La URL del blog debe ser texto' };
  const t = entrada.trim();
  if (t.length > 300) return { ok: false, mensaje: 'La URL del blog admite hasta 300 caracteres' };
  if (!t.startsWith('https://')) return { ok: false, mensaje: 'La URL del blog empieza con https://' };
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, mensaje: 'La URL del blog no es válida' };
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (u.username || u.password || u.search || u.hash || (u.port && u.port !== '443')) return { ok: false, mensaje: 'La URL del blog va sin usuario, clave, puerto ni parámetros' };
  if (isIP(host)) return { ok: false, mensaje: 'La URL del blog usa un dominio, no una dirección IP' };
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host === 'localhost') return { ok: false, mensaje: 'La URL del blog necesita un dominio público' };
  return { ok: true, url: `https://${u.host}${u.pathname.replace(/\/+$/, '')}` };
}

export interface CambiosConexionBlog { url?: string | null; frecuenciaMin?: number; porPagina?: number; mostrarImagen?: boolean; mostrarAutor?: boolean }
export interface ErrorCampoBlog { campo: string; mensaje: string }

export function aplicarCambiosBlog(actual: ConexionBlog, c: CambiosConexionBlog): { ok: true; conexion: ConexionBlog } | { ok: false; errores: ErrorCampoBlog[] } {
  const r: ConexionBlog = { ...actual };
  const errores: ErrorCampoBlog[] = [];
  if (c.url !== undefined) {
    const u = validarUrlBlog(c.url);
    if (u.ok) r.url = u.url;
    else errores.push({ campo: 'url', mensaje: u.mensaje });
  }
  if (c.frecuenciaMin !== undefined) {
    if ((FRECUENCIAS_BLOG as readonly number[]).includes(c.frecuenciaMin)) r.frecuenciaMin = c.frecuenciaMin;
    else errores.push({ campo: 'frecuenciaMin', mensaje: 'La frecuencia es de 15, 30 o 60 minutos' });
  }
  if (c.porPagina !== undefined) {
    if (Number.isInteger(c.porPagina) && c.porPagina >= LIMITES_BLOG.porPaginaMin && c.porPagina <= LIMITES_BLOG.porPaginaMax) r.porPagina = c.porPagina;
    else errores.push({ campo: 'porPagina', mensaje: `La sección muestra de ${LIMITES_BLOG.porPaginaMin} a ${LIMITES_BLOG.porPaginaMax} artículos` });
  }
  if (c.mostrarImagen !== undefined) r.mostrarImagen = c.mostrarImagen;
  if (c.mostrarAutor !== undefined) r.mostrarAutor = c.mostrarAutor;
  return errores.length ? { ok: false, errores } : { ok: true, conexion: r };
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

/** El HTML de WordPress a texto plano de una línea: sin etiquetas ni caracteres de control, entidades decodificadas. */
export function textoDeHtml(html: unknown, max: number): string {
  if (typeof html !== 'string') return '';
  const sinEtiquetas = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');
  const decodificado = sinEtiquetas.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 31 && n !== 127 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
  // Lo decodificado no vuelve a ser HTML: `<` y `>` quedan como texto y React los escapa.
  const limpio = [...decodificado].map((ch) => { const c = ch.codePointAt(0)!; return c < 32 || c === 127 ? ' ' : ch; }).join('').replace(/\s+/g, ' ').trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export interface CategoriaWp { id: number; nombre: string; slug: string }
export interface ImagenWp { origen: string; ancho: number | null; alto: number | null }
export interface ArticuloWp {
  id: number; slug: string; titulo: string; extracto: string; categorias: number[]; autor: string | null; fecha: Date; enlace: string; imagen: ImagenWp | null;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const enteroPositivo = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const objeto = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const rendered = (v: unknown) => objeto(v)?.rendered;
const httpsValida = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.startsWith('https://') || v.length > 1000) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Una categoría de `/wp-json/wp/v2/categories`, o null si no tiene forma de categoría. «Uncategorized» (id 1 sin artículos) también entra. */
export function leerCategoriaWp(v: unknown): CategoriaWp | null {
  const o = objeto(v);
  if (!o || !enteroPositivo(o.id)) return null;
  const nombre = textoDeHtml(o.name, 60);
  const slug = typeof o.slug === 'string' && SLUG.test(o.slug) ? o.slug : `categoria-${o.id}`;
  return nombre ? { id: o.id, nombre, slug } : null;
}

/** La imagen destacada de `_embedded['wp:featuredmedia']`: el tamaño más grande de hasta 800 px de ancho, o el original. */
function imagenDe(o: Record<string, unknown>): ImagenWp | null {
  const media = objeto((objeto(o._embedded)?.['wp:featuredmedia'] as unknown[] | undefined)?.[0]);
  if (!media) return null;
  const detalles = objeto(media.media_details);
  const tamanos = Object.values(objeto(detalles?.sizes) ?? {}).map(objeto).filter((t): t is Record<string, unknown> => Boolean(t))
    .map((t) => ({ origen: httpsValida(t.source_url), ancho: enteroPositivo(t.width) ? t.width : null, alto: enteroPositivo(t.height) ? t.height : null }))
    .filter((t): t is ImagenWp => t.origen !== null && t.ancho !== null && t.ancho <= LIMITES_BLOG.imagenAncho)
    .sort((a, b) => b.ancho! - a.ancho!);
  if (tamanos[0]) return tamanos[0];
  const origen = httpsValida(media.source_url);
  return origen ? { origen, ancho: enteroPositivo(detalles?.width) ? detalles.width : null, alto: enteroPositivo(detalles?.height) ? detalles.height : null } : null;
}

/**
 * Un artículo de `/wp-json/wp/v2/posts?_embed`, o null si no se puede mostrar: solo `status = publish`, sin clave
 * (`content.protected` o `excerpt.protected`), con título y enlace https:// (CP-154).
 */
export function leerArticuloWp(v: unknown): ArticuloWp | null {
  const o = objeto(v);
  if (!o || !enteroPositivo(o.id) || o.status !== 'publish') return null;
  if (objeto(o.content)?.protected === true || objeto(o.excerpt)?.protected === true || (typeof o.password === 'string' && o.password !== '')) return null;
  const titulo = textoDeHtml(rendered(o.title), LIMITES_BLOG.titulo);
  const enlace = httpsValida(o.link);
  const fecha = new Date(typeof o.date_gmt === 'string' ? `${o.date_gmt.replace(/Z$/, '')}Z` : String(o.date ?? ''));
  if (!titulo || !enlace || Number.isNaN(fecha.getTime())) return null;
  const autor = textoDeHtml(objeto((objeto(o._embedded)?.author as unknown[] | undefined)?.[0])?.name, LIMITES_BLOG.autor) || null;
  return {
    id: o.id, slug: typeof o.slug === 'string' && SLUG.test(o.slug) ? o.slug : `articulo-${o.id}`, titulo,
    extracto: textoDeHtml(rendered(o.excerpt), LIMITES_BLOG.extracto),
    categorias: Array.isArray(o.categories) ? [...new Set(o.categories.filter(enteroPositivo))] : [],
    autor, fecha, enlace, imagen: imagenDe(o),
  };
}

/** La copia guardada (filas de WpCategoria y WpArticulo) que alimenta lo que ve el público. */
export interface FilaCategoriaBlog { id: number; nombre: string; slug: string; orden: number; visible: boolean }
export interface FilaArticuloBlog {
  id: number; titulo: string; extracto: string; categorias: number[]; autor: string | null; fecha: Date | string; enlace: string; visible: boolean;
  imagen: string | null; imagenAncho: number | null; imagenAlto: number | null;
}

export interface CategoriaPublica { slug: string; nombre: string; cantidad: number }
export interface ArticuloPublico {
  id: number; titulo: string; extracto: string; categorias: string[]; fecha: string; enlace: string;
  autor?: string; imagen?: { archivo: string; ancho: number | null; alto: number | null };
}
export interface BlogPublico {
  /** El WordPress conectado, para «Ver todos los artículos en el blog». */
  url: string | null;
  porPagina: number;
  /** Las categorías visibles con al menos un artículo visible, en su orden, con su número de artículos (CP-123). */
  categorias: CategoriaPublica[];
  /** Todos los artículos visibles de alguna categoría visible, del más nuevo al más viejo. */
  articulos: ArticuloPublico[];
}

/**
 * CP-123 y CP-155 · Lo que ve el público: un artículo oculto no sale; un artículo sale solo en sus categorías visibles,
 * y si no tiene ninguna visible no sale en ningún lado. Un artículo sin categorías sale solo en «Todas».
 */
export function blogPublico(conexion: Pick<ConexionBlog, 'url' | 'porPagina' | 'mostrarImagen' | 'mostrarAutor'>, categorias: readonly FilaCategoriaBlog[], articulos: readonly FilaArticuloBlog[]): BlogPublico {
  const visibles = [...categorias].filter((c) => c.visible).sort((a, b) => a.orden - b.orden || a.id - b.id);
  const porId = new Map(visibles.map((c) => [c.id, c]));
  const ocultas = new Set(categorias.filter((c) => !c.visible).map((c) => c.id));
  const lista: ArticuloPublico[] = [...articulos]
    .filter((a) => a.visible)
    .map((a) => ({ a, cats: a.categorias.filter((id) => porId.has(id)) }))
    .filter(({ a, cats }) => cats.length > 0 || a.categorias.every((id) => !ocultas.has(id)))
    .sort((x, y) => new Date(y.a.fecha).getTime() - new Date(x.a.fecha).getTime() || y.a.id - x.a.id)
    .map(({ a, cats }) => ({
      id: a.id, titulo: a.titulo, extracto: a.extracto, categorias: cats.map((id) => porId.get(id)!.slug), fecha: new Date(a.fecha).toISOString(), enlace: a.enlace,
      ...(conexion.mostrarAutor && a.autor ? { autor: a.autor } : {}),
      ...(conexion.mostrarImagen && a.imagen ? { imagen: { archivo: a.imagen, ancho: a.imagenAncho, alto: a.imagenAlto } } : {}),
    }));
  const cantidad = (slug: string) => lista.filter((a) => a.categorias.includes(slug)).length;
  return {
    url: conexion.url, porPagina: conexion.porPagina,
    categorias: visibles.map((c) => ({ slug: c.slug, nombre: c.nombre, cantidad: cantidad(c.slug) })).filter((c) => c.cantidad > 0),
    articulos: lista,
  };
}

/** Los artículos de un filtro: «Todas» (sin categoría) o la de ese slug; `null` si el slug no es un filtro visible. */
export function articulosDeCategoria(blog: BlogPublico, categoria?: string | null): ArticuloPublico[] | null {
  if (!categoria) return blog.articulos;
  if (!blog.categorias.some((c) => c.slug === categoria)) return null;
  return blog.articulos.filter((a) => a.categorias.includes(categoria));
}

/** CP-159 · La categoría con que empieza la sección: la inicial de la landing (por nombre o slug, sin mayúsculas) si es un filtro visible. */
export function categoriaInicial(blog: BlogPublico, inicial: string | null | undefined): string | null {
  if (!inicial) return null;
  const n = inicial.trim().toLocaleLowerCase('es');
  return blog.categorias.find((c) => c.nombre.toLocaleLowerCase('es') === n || c.slug === n)?.slug ?? null;
}

/** Nombre del archivo de una imagen copiada: los primeros 16 del sha256 y su extensión. */
export const ARCHIVO_BLOG = /^[0-9a-f]{16}\.(?:jpg|png|webp)$/;
export const esArchivoBlog = (archivo: string): boolean => ARCHIVO_BLOG.test(archivo);
export type MimeBlog = 'image/jpeg' | 'image/png' | 'image/webp';

/** El tipo de imagen por su firma (no por la cabecera que manda el servidor), o null si no es JPEG, PNG ni WebP. */
export function mimeDeImagen(b: Uint8Array): MimeBlog | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
export const extensionBlog = (m: MimeBlog) => (m === 'image/jpeg' ? 'jpg' : m === 'image/png' ? 'png' : 'webp');

/** «Editar en WordPress»: el administrador de ese artículo. */
export const enlaceEditarWp = (url: string, id: number) => `${url}/wp-admin/post.php?post=${id}&action=edit`;
