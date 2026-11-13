import { Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ID_BLOG, leerBlogPublico, leerConexionBlog, Prisma, ultimaVersion } from '@aptio/db';
import { aplicarCambiosBlog, articulosDeCategoria, type CambiosConexionBlog, enlaceEditarWp } from '@aptio/schema/sitio-blog';
import { CARPETA_BLOG, opcionesRenderDesdeEnv } from '@aptio/sitio';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { BlogPublicoDto, BlogSitioDto } from './blog.dto.js';
import { PrerenderService } from './prerender.service.js';

const CAMPOS = ['url', 'frecuenciaMin', 'porPagina', 'mostrarImagen', 'mostrarAutor'] as const;

/**
 * HU-1511 · Sitio web › Blog (REQ-070, PNT-28, RN-16-8). WordPress es la fuente de los artículos; aquí se conecta, se
 * pide sincronizar y se decide qué categorías y artículos se muestran y en qué orden. El blog no va en la instantánea
 * de la versión: cada cambio que se ve en el sitio vuelve a renderizar la versión vigente, sin «Publicar cambios».
 */
@Injectable()
export class BlogService {
  constructor(private readonly baseDatos: BaseDatosService, private readonly prerender: PrerenderService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private auditar(u: UsuarioSesion, accion: string, entidadId: string, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({ data: { usuarioId: u.id, organizacionId: null, accion, entidad: 'SitioBlog', entidadId, datos: datos as Prisma.InputJsonValue } });
  }

  /** El sitio publicado toma el cambio al volver a renderizar la versión vigente (si hay una). */
  private async rerenderizar(): Promise<void> {
    const v = await ultimaVersion(this.bd);
    if (v) await this.prerender.encolar(v.numero, { rehacer: true });
  }

  async ver(): Promise<BlogSitioDto> {
    const c = await leerConexionBlog(this.bd);
    const [categorias, articulos] = await Promise.all([
      this.bd.wpCategoria.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }] }),
      this.bd.wpArticulo.findMany({ orderBy: [{ fecha: 'desc' }, { id: 'desc' }] }),
    ]);
    const base = opcionesRenderDesdeEnv().base;
    return {
      url: c.url, frecuenciaMin: c.frecuenciaMin, porPagina: c.porPagina, mostrarImagen: c.mostrarImagen, mostrarAutor: c.mostrarAutor,
      sincronizadoEn: c.sincronizadoEn?.toISOString() ?? null, intentoEn: c.intentoEn?.toISOString() ?? null, error: c.error,
      categorias: categorias.map((k) => ({ id: k.id, nombre: k.nombre, slug: k.slug, orden: k.orden, visible: k.visible, articulos: articulos.filter((a) => a.categorias.includes(k.id)).length })),
      articulos: articulos.map((a) => ({
        id: a.id, titulo: a.titulo, extracto: a.extracto, categorias: a.categorias, autor: a.autor, fecha: a.fecha.toISOString(), enlace: a.enlace,
        editar: enlaceEditarWp(c.url ?? new URL(a.enlace).origin, a.id), imagen: a.imagen ? `${base}/${CARPETA_BLOG}/${a.imagen}` : null, visible: a.visible,
      })),
    };
  }

  /** Conexión y opciones. Otra URL es otro blog: la copia anterior se borra y se pide sincronizar enseguida. */
  async actualizar(u: UsuarioSesion, cambios: CambiosConexionBlog): Promise<BlogSitioDto> {
    const claves = CAMPOS.filter((k) => cambios[k] !== undefined);
    if (!claves.length) throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'Indica al menos un cambio' });
    const antes = await leerConexionBlog(this.bd);
    const r = aplicarCambiosBlog(antes, cambios);
    if (!r.ok) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: r.errores.map((e) => e.mensaje).join('. '), detalles: r.errores });
    const nueva = r.conexion;
    const otraUrl = nueva.url !== antes.url;
    const datos = {
      url: nueva.url, frecuenciaMin: nueva.frecuenciaMin, porPagina: nueva.porPagina, mostrarImagen: nueva.mostrarImagen, mostrarAutor: nueva.mostrarAutor,
      ...(otraUrl ? { sincronizadoEn: null, intentoEn: null, error: null } : {}),
    };
    await this.bd.$transaction(async (tx) => {
      if (otraUrl) {
        await tx.wpArticulo.deleteMany();
        await tx.wpCategoria.deleteMany();
      }
      await tx.sitioBlog.upsert({ where: { id: ID_BLOG }, create: { id: ID_BLOG, ...datos }, update: datos });
    });
    await this.auditar(u, 'SITIO_BLOG_ACTUALIZADO', ID_BLOG, { campos: claves, ...(otraUrl ? { url: nueva.url, antes: antes.url } : {}) });
    if (otraUrl && nueva.url) await this.prerender.sincronizarBlog({ solicitadoPorId: u.id }).catch(() => undefined);
    const seVe = otraUrl || nueva.porPagina !== antes.porPagina || nueva.mostrarImagen !== antes.mostrarImagen || nueva.mostrarAutor !== antes.mostrarAutor;
    if (seVe) await this.rerenderizar();
    return this.ver();
  }

  /** «Sincronizar ahora». */
  async sincronizar(u: UsuarioSesion): Promise<{ encolado: boolean }> {
    const c = await leerConexionBlog(this.bd);
    if (!c.url) throw new UnprocessableEntityException({ codigo: 'SIN_URL', mensaje: 'Guarda primero la URL del WordPress' });
    try {
      await this.prerender.sincronizarBlog({ solicitadoPorId: u.id });
    } catch {
      throw new ServiceUnavailableException({ codigo: 'COLAS_NO_DISPONIBLES', mensaje: 'La cola de mantenimiento no responde: intenta en un momento' });
    }
    await this.auditar(u, 'SITIO_BLOG_SINCRONIZACION_PEDIDA', ID_BLOG, { url: c.url });
    return { encolado: true };
  }

  /** El orden de los filtros: todos los ids, sin faltar ni sobrar ni repetir. */
  async ordenar(u: UsuarioSesion, orden: number[]): Promise<BlogSitioDto> {
    const ids = (await this.bd.wpCategoria.findMany({ select: { id: true } })).map((c) => c.id);
    if (orden.length !== ids.length || new Set(orden).size !== orden.length || orden.some((id) => !ids.includes(id))) {
      throw new UnprocessableEntityException({ codigo: 'ORDEN_INVALIDO', mensaje: 'Envía todos los ids de las categorías, una vez cada uno' });
    }
    await this.bd.$transaction(orden.map((id, i) => this.bd.wpCategoria.update({ where: { id }, data: { orden: i } })));
    await this.auditar(u, 'SITIO_BLOG_CATEGORIAS_ORDENADAS', ID_BLOG, { orden });
    await this.rerenderizar();
    return this.ver();
  }

  async categoria(u: UsuarioSesion, id: number, visible: boolean): Promise<BlogSitioDto> {
    const c = await this.bd.wpCategoria.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La categoría no existe en la copia del blog' });
    if (c.visible !== visible) {
      await this.bd.wpCategoria.update({ where: { id }, data: { visible } });
      await this.auditar(u, visible ? 'SITIO_BLOG_CATEGORIA_MOSTRADA' : 'SITIO_BLOG_CATEGORIA_OCULTADA', String(id), { nombre: c.nombre });
      await this.rerenderizar();
    }
    return this.ver();
  }

  async articulo(u: UsuarioSesion, id: number, visible: boolean): Promise<BlogSitioDto> {
    const a = await this.bd.wpArticulo.findUnique({ where: { id } });
    if (!a) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El artículo no existe en la copia del blog' });
    if (a.visible !== visible) {
      await this.bd.wpArticulo.update({ where: { id }, data: { visible } });
      await this.auditar(u, visible ? 'SITIO_BLOG_ARTICULO_MOSTRADO' : 'SITIO_BLOG_ARTICULO_OCULTADO', String(id), { titulo: a.titulo });
      await this.rerenderizar();
    }
    return this.ver();
  }

  /** GET /publico/blog: los filtros y los artículos de uno (o de «Todas»). 404 si la categoría no es un filtro visible. */
  async publico(categoria?: string): Promise<BlogPublicoDto> {
    const blog = await leerBlogPublico(this.bd);
    if (!blog) {
      if (categoria) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La categoría no existe o está oculta' });
      const c = await leerConexionBlog(this.bd);
      return { url: c.url, porPagina: c.porPagina, categorias: [], articulos: [] };
    }
    const articulos = articulosDeCategoria(blog, categoria);
    if (!articulos) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La categoría no existe o está oculta' });
    return { url: blog.url, porPagina: blog.porPagina, categorias: blog.categorias, articulos };
  }
}
