/**
 * HU-1511 · Sincronización del blog con WordPress (REQ-070, RN-16-8). Lee la API REST pública del WordPress conectado
 * (`/wp-json/wp/v2/categories` y `/wp-json/wp/v2/posts?status=publish&_embed`), guarda una copia de lectura de las
 * categorías y de los artículos publicados sin clave (CP-154) y copia la imagen destacada al bucket, en
 * `sitio/blog/{sha16}.{ext}`, para que el sitio la sirva desde su propio dominio. Lo que el superadmin ocultó sigue
 * oculto; una categoría nueva entra visible al final. Si WordPress no responde, la copia anterior queda tal cual y el
 * error se guarda para el panel (CP-156). Devuelve si algo cambió, para volver a renderizar el sitio.
 */
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import type { Almacen } from '@aptio/almacen';
import { type DatosBlog } from '@aptio/colas';
import { ID_BLOG, leerConexionBlog, type Prisma, type PrismaClient } from '@aptio/db';
import { type ArticuloWp, esIpPrivada, extensionBlog, LIMITES_BLOG, leerArticuloWp, leerCategoriaWp, mimeDeImagen } from '@aptio/schema/sitio-blog';
import { claveBlog } from '@aptio/sitio';

export interface DependenciasBlog {
  /** `fetch` o uno simulado en las pruebas. */
  obtener?: (url: string, init: RequestInit) => Promise<Response>;
  /** Las direcciones de un dominio; por defecto, el DNS del sistema. */
  resolver?: (host: string) => Promise<string[]>;
  ahora?: () => Date;
}

export interface ResultadoBlog {
  estado: 'omitido' | 'listo' | 'error';
  cambios: boolean;
  categorias?: number;
  articulos?: number;
  imagenes?: number;
  error?: string;
}

const ESPERA_MS = 10_000;
const MAX_JSON = 8 * 1024 * 1024;

class ErrorBlog extends Error {}

const resolverDns = async (host: string) => (await lookup(host, { all: true })).map((d) => d.address);

/** Antes de cada pedido: https:// y un dominio que no apunte a la red interna (SSRF). */
async function verificarDestino(url: string, resolver: (host: string) => Promise<string[]>): Promise<void> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password) throw new ErrorBlog('Solo se leen direcciones https:// sin usuario ni clave');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let ips: string[];
  try {
    ips = await resolver(host);
  } catch {
    throw new ErrorBlog(`No se encontró el dominio ${host}`);
  }
  if (!ips.length || ips.some(esIpPrivada)) throw new ErrorBlog(`El dominio ${host} apunta a una red interna`);
}

export async function sincronizarBlog(bd: PrismaClient, almacen: Almacen, datos: DatosBlog = {}, deps: DependenciasBlog = {}): Promise<ResultadoBlog> {
  const obtener = deps.obtener ?? ((url, init) => fetch(url, init));
  const resolver = deps.resolver ?? resolverDns;
  const ahora = deps.ahora?.() ?? new Date();
  const conexion = await leerConexionBlog(bd);
  if (!conexion.url) return { estado: 'omitido', cambios: false };
  if (!datos.forzar && conexion.intentoEn && ahora.getTime() - conexion.intentoEn.getTime() < conexion.frecuenciaMin * 60_000) return { estado: 'omitido', cambios: false };
  const base = conexion.url;

  const pedir = async (url: string): Promise<Response> => {
    await verificarDestino(url, resolver);
    let r: Response;
    try {
      // Sin seguir redirecciones: una redirección podría llevar a la red interna.
      r = await obtener(url, { redirect: 'error', signal: AbortSignal.timeout(ESPERA_MS), headers: { accept: 'application/json, image/*' } });
    } catch (e) {
      const nombre = e instanceof Error ? e.name : '';
      throw new ErrorBlog(nombre === 'TimeoutError' || nombre === 'AbortError' ? `WordPress no respondió en ${ESPERA_MS / 1000} s` : 'No se pudo conectar con WordPress');
    }
    if (!r.ok) throw new ErrorBlog(`WordPress respondió ${r.status}`);
    return r;
  };
  const lista = async (ruta: string): Promise<unknown[]> => {
    const r = await pedir(`${base}${ruta}`);
    if (Number(r.headers.get('content-length') ?? 0) > MAX_JSON) throw new ErrorBlog('La respuesta de WordPress es demasiado grande');
    const texto = await r.text();
    if (texto.length > MAX_JSON) throw new ErrorBlog('La respuesta de WordPress es demasiado grande');
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new ErrorBlog(`${base}${ruta.split('?')[0]} no devolvió JSON: ¿es un WordPress con la API REST activa?`);
    }
    if (!Array.isArray(json)) throw new ErrorBlog(`${base}${ruta.split('?')[0]} no devolvió una lista`);
    return json;
  };

  try {
    const categoriasWp = (await lista(`/wp-json/wp/v2/categories?per_page=${LIMITES_BLOG.categorias}&orderby=id&order=asc`))
      .map(leerCategoriaWp).filter((c) => c !== null).slice(0, LIMITES_BLOG.categorias);
    const articulosWp = (await lista(`/wp-json/wp/v2/posts?status=publish&_embed=author,wp:featuredmedia&per_page=${LIMITES_BLOG.articulos}&orderby=date&order=desc`))
      .map(leerArticuloWp).filter((a) => a !== null).slice(0, LIMITES_BLOG.articulos);

    let cambios = false;
    let imagenes = 0;
    // Categorías: las que ya estaban conservan su orden y si se muestran; las nuevas entran visibles al final.
    const previas = new Map((await bd.wpCategoria.findMany()).map((c) => [c.id, c]));
    let siguiente = Math.max(-1, ...[...previas.values()].map((c) => c.orden)) + 1;
    for (const c of categoriasWp) {
      const antes = previas.get(c.id);
      if (!antes) {
        await bd.wpCategoria.create({ data: { ...c, orden: siguiente++, visible: true, sincronizadoEn: ahora } });
        cambios = true;
      } else {
        const distinta = antes.nombre !== c.nombre || antes.slug !== c.slug;
        await bd.wpCategoria.update({ where: { id: c.id }, data: { nombre: c.nombre, slug: c.slug, sincronizadoEn: ahora } });
        cambios ||= distinta;
      }
    }
    const idsCategorias = new Set(categoriasWp.map((c) => c.id));
    const sobran = [...previas.keys()].filter((id) => !idsCategorias.has(id));
    if (sobran.length) {
      await bd.wpCategoria.deleteMany({ where: { id: { in: sobran } } });
      cambios = true;
    }

    // Artículos: lo publicado sin clave; lo que dejó de estarlo (borrador, privado, con clave o borrado) se quita.
    const previos = new Map((await bd.wpArticulo.findMany()).map((a) => [a.id, a]));
    for (const a of articulosWp) {
      const antes = previos.get(a.id);
      const imagen = await copiarImagen(a, antes, pedir, almacen);
      if (imagen.copiada) imagenes++;
      const fila = {
        slug: a.slug, titulo: a.titulo, extracto: a.extracto, categorias: a.categorias, autor: a.autor, fecha: a.fecha, enlace: a.enlace,
        imagen: imagen.archivo, imagenOrigen: imagen.origen, imagenAncho: imagen.ancho, imagenAlto: imagen.alto,
      };
      if (!antes) {
        await bd.wpArticulo.create({ data: { id: a.id, ...fila, visible: true, sincronizadoEn: ahora } });
        cambios = true;
        continue;
      }
      const distinto = antes.slug !== fila.slug || antes.titulo !== fila.titulo || antes.extracto !== fila.extracto || antes.autor !== fila.autor
        || antes.enlace !== fila.enlace || antes.fecha.getTime() !== fila.fecha.getTime() || antes.imagen !== fila.imagen
        || antes.categorias.join(',') !== fila.categorias.join(',');
      await bd.wpArticulo.update({ where: { id: a.id }, data: { ...fila, sincronizadoEn: ahora } });
      cambios ||= distinto;
    }
    const idsArticulos = new Set(articulosWp.map((a) => a.id));
    const quitados = [...previos.keys()].filter((id) => !idsArticulos.has(id));
    if (quitados.length) {
      await bd.wpArticulo.deleteMany({ where: { id: { in: quitados } } });
      cambios = true;
    }

    await bd.sitioBlog.update({ where: { id: ID_BLOG }, data: { sincronizadoEn: ahora, intentoEn: ahora, error: null } });
    await bd.auditoria.create({
      data: {
        accion: 'SITIO_BLOG_SINCRONIZADO', entidad: 'SitioBlog', entidadId: ID_BLOG, usuarioId: datos.solicitadoPorId ?? null,
        datos: { url: base, categorias: categoriasWp.length, articulos: articulosWp.length, imagenes, cambios, quitados: quitados.length, manual: Boolean(datos.forzar) } as Prisma.InputJsonValue,
      },
    });
    return { estado: 'listo', cambios, categorias: categoriasWp.length, articulos: articulosWp.length, imagenes };
  } catch (e) {
    const error = (e instanceof ErrorBlog ? e.message : `Error al leer WordPress: ${e instanceof Error ? e.message : String(e)}`).slice(0, 300);
    // La copia anterior queda como estaba; el sitio la sigue mostrando (CP-156).
    await bd.sitioBlog.update({ where: { id: ID_BLOG }, data: { intentoEn: ahora, error } });
    // Un mismo error cada 15 min no llena la auditoría: solo se registra cuando cambia.
    if (error !== conexion.error) {
      await bd.auditoria.create({ data: { accion: 'SITIO_BLOG_ERROR', entidad: 'SitioBlog', entidadId: ID_BLOG, usuarioId: datos.solicitadoPorId ?? null, datos: { url: base, error } } });
    }
    return { estado: 'error', cambios: false, error };
  }
}

interface ImagenCopiada { archivo: string | null; origen: string | null; ancho: number | null; alto: number | null; copiada: boolean }

/**
 * La imagen destacada: si su origen no cambió, la que ya estaba copiada; si no, se baja (hasta 1 MB, JPEG, PNG o WebP
 * según su firma) y se sube con el nombre de su hash. Si falla, el artículo sale sin imagen y se reintenta la próxima vez.
 */
async function copiarImagen(a: ArticuloWp, antes: { imagen: string | null; imagenOrigen: string | null; imagenAncho: number | null; imagenAlto: number | null } | undefined, pedir: (url: string) => Promise<Response>, almacen: Almacen): Promise<ImagenCopiada> {
  if (!a.imagen) return { archivo: null, origen: null, ancho: null, alto: null, copiada: false };
  if (antes?.imagen && antes.imagenOrigen === a.imagen.origen) return { archivo: antes.imagen, origen: antes.imagenOrigen, ancho: a.imagen.ancho, alto: a.imagen.alto, copiada: false };
  try {
    const r = await pedir(a.imagen.origen);
    if (Number(r.headers.get('content-length') ?? 0) > LIMITES_BLOG.imagenBytes) throw new Error('grande');
    const bytes = new Uint8Array(await r.arrayBuffer());
    const mime = bytes.length <= LIMITES_BLOG.imagenBytes ? mimeDeImagen(bytes) : null;
    if (!mime) throw new Error('tipo');
    const archivo = `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${extensionBlog(mime)}`;
    if (!(await almacen.info(claveBlog(archivo)))) await almacen.subir(claveBlog(archivo), bytes, mime);
    return { archivo, origen: a.imagen.origen, ancho: a.imagen.ancho, alto: a.imagen.alto, copiada: true };
  } catch {
    return { archivo: null, origen: null, ancho: null, alto: null, copiada: false };
  }
}
