// HU-1511 · La copia del blog de WordPress (SitioBlog, WpCategoria, WpArticulo) como la usan la API y el worker.
import type { PrismaClient } from '@prisma/client';
import { blogPublico, type BlogPublico, CONEXION_BLOG_POR_DEFECTO, type ConexionBlog } from '@aptio/schema/sitio-blog';

export const ID_BLOG = 'blog';

/** La conexión guardada, o la de por defecto (sin URL) si nunca se configuró. */
export async function leerConexionBlog(bd: PrismaClient): Promise<ConexionBlog & { sincronizadoEn: Date | null; intentoEn: Date | null; error: string | null }> {
  const f = await bd.sitioBlog.findUnique({ where: { id: ID_BLOG } });
  if (!f) return { ...CONEXION_BLOG_POR_DEFECTO, sincronizadoEn: null, intentoEn: null, error: null };
  return {
    url: f.url, frecuenciaMin: f.frecuenciaMin, porPagina: f.porPagina, mostrarImagen: f.mostrarImagen, mostrarAutor: f.mostrarAutor,
    sincronizadoEn: f.sincronizadoEn, intentoEn: f.intentoEn, error: f.error,
  };
}

/**
 * Lo que ve el público (CP-155): null si no hay WordPress conectado o ningún artículo visible, para que el sitio no
 * muestre la sección ni la columna del pie.
 */
export async function leerBlogPublico(bd: PrismaClient): Promise<BlogPublico | null> {
  const conexion = await leerConexionBlog(bd);
  if (!conexion.url) return null;
  const [categorias, articulos] = await Promise.all([bd.wpCategoria.findMany(), bd.wpArticulo.findMany()]);
  const blog = blogPublico(conexion, categorias, articulos);
  return blog.articulos.length ? blog : null;
}
