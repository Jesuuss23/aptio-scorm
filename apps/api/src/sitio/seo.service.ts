import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ID_SEO, leerAjustesSitio, leerBlogPublico, Prisma, type PrismaClient, type SitioRedireccion } from '@aptio/db';
import { ajustesPublicados, NOMBRE_POR_DEFECTO } from '@aptio/schema/sitio-ajustes';
import { analizarSeo, LIMITES_SEO, type ResultadoRedireccion, rutaServida, validarRedireccion, validarRobotsExtra } from '@aptio/schema/sitio-seo';
import { conDominio, opcionesRenderDesdeEnv, robotsTxt } from '@aptio/sitio';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { entornoActual } from './entorno-sitio.js';
import type { RedireccionCambioDto, RedireccionEntradaDto, RedireccionSitioDto, SeoSitioDto } from './seo.dto.js';

type Bd = PrismaClient | Prisma.TransactionClient;

export const aRedireccionDto = (r: SitioRedireccion): RedireccionSitioDto => ({
  id: r.id, desde: r.desde, hacia: r.hacia, activa: r.activa, creadoEn: r.creadoEn.toISOString(), actualizadoEn: r.actualizadoEn.toISOString(),
});

/** Las rutas que hoy sirve una página publicada, como las ve el visitante (`/en/…` en inglés). */
export async function rutasPublicadas(bd: Bd): Promise<string[]> {
  const paginas = await bd.sitioPagina.findMany({ where: { estado: 'PUBLICADA' }, select: { ruta: true, idioma: true } });
  return paginas.map((p) => rutaServida(p.ruta, p.idioma));
}

/** 409 si el origen ya tiene una redirección; 422 con el código y los campos en lo demás. */
export function errorRedireccion(r: Extract<ResultadoRedireccion, { ok: false }>): Error {
  const cuerpo = { codigo: r.codigo, mensaje: r.errores.map((e) => e.mensaje).join('. '), detalles: r.errores };
  return r.codigo === 'REDIRECCION_REPETIDA' ? new ConflictException(cuerpo) : new UnprocessableEntityException(cuerpo);
}

/**
 * HU-1512 · Sitio web › SEO (REQ-071, PNT-29): la revisión de problemas, las redirecciones 301 y las reglas extra de
 * robots.txt. Todo llega al sitio con «Publicar cambios», dentro de la versión (como el resto del sitio). Solo el
 * superadmin; cada cambio queda en la auditoría.
 */
@Injectable()
export class SeoService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private auditar(u: UsuarioSesion, accion: string, entidad: string, entidadId: string, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({ data: { usuarioId: u.id, organizacionId: null, accion, entidad, entidadId, datos: datos as Prisma.InputJsonValue } });
  }

  async ver(): Promise<SeoSitioDto> {
    const [fila, redirecciones, paginas, ajustes, blog] = await Promise.all([
      this.bd.sitioSeo.findUnique({ where: { id: ID_SEO } }),
      this.bd.sitioRedireccion.findMany({ orderBy: [{ desde: 'asc' }] }),
      this.bd.sitioPagina.findMany({ orderBy: [{ ruta: 'asc' }, { idioma: 'asc' }] }),
      leerAjustesSitio(this.bd),
      leerBlogPublico(this.bd),
    ]);
    const robotsExtra = fila?.robotsExtra ?? '';
    const sitio = ajustes ? ajustesPublicados(ajustes) : undefined;
    const op = conDominio(sitio ? { sitio } : null, { ...opcionesRenderDesdeEnv(), entorno: entornoActual(), blog });
    return {
      robotsExtra,
      robotsVistaPrevia: robotsTxt(op, robotsExtra),
      redirecciones: redirecciones.map(aRedireccionDto),
      problemas: analizarSeo({ paginas, redirecciones, nombreSitio: sitio?.nombre ?? NOMBRE_POR_DEFECTO }),
    };
  }

  async actualizar(u: UsuarioSesion, robotsExtra: string): Promise<SeoSitioDto> {
    const r = validarRobotsExtra(robotsExtra);
    if (!r.ok) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: r.errores.map((e) => e.mensaje).join('. '), detalles: r.errores });
    const antes = await this.bd.sitioSeo.findUnique({ where: { id: ID_SEO } });
    if ((antes?.robotsExtra ?? '') !== r.robotsExtra) {
      await this.bd.sitioSeo.upsert({ where: { id: ID_SEO }, create: { id: ID_SEO, robotsExtra: r.robotsExtra, actualizadoPorId: u.id }, update: { robotsExtra: r.robotsExtra, actualizadoPorId: u.id } });
      await this.auditar(u, 'SITIO_ROBOTS_EDITADO', 'SitioSeo', ID_SEO, { antes: antes?.robotsExtra ?? '', robotsExtra: r.robotsExtra });
    }
    return this.ver();
  }

  async crearRedireccion(u: UsuarioSesion, dto: RedireccionEntradaDto): Promise<RedireccionSitioDto> {
    const otras = await this.bd.sitioRedireccion.findMany();
    if (otras.length >= LIMITES_SEO.redirecciones) throw new UnprocessableEntityException({ codigo: 'LIMITE_REDIRECCIONES', mensaje: `El sitio admite hasta ${LIMITES_SEO.redirecciones} redirecciones` });
    const r = validarRedireccion(dto, otras, await rutasPublicadas(this.bd));
    if (!r.ok) throw errorRedireccion(r);
    const fila = await this.guardar(() => this.bd.sitioRedireccion.create({ data: r.redireccion }), r.redireccion.desde);
    await this.auditar(u, 'SITIO_REDIRECCION_CREADA', 'SitioRedireccion', fila.id, { desde: fila.desde, hacia: fila.hacia, activa: fila.activa });
    return aRedireccionDto(fila);
  }

  async cambiarRedireccion(u: UsuarioSesion, id: string, dto: RedireccionCambioDto): Promise<RedireccionSitioDto> {
    const actual = await this.buscar(id);
    const otras = (await this.bd.sitioRedireccion.findMany()).filter((o) => o.id !== id);
    const r = validarRedireccion({ desde: dto.desde ?? actual.desde, hacia: dto.hacia ?? actual.hacia, activa: dto.activa ?? actual.activa }, otras, await rutasPublicadas(this.bd));
    if (!r.ok) throw errorRedireccion(r);
    const cambios = (['desde', 'hacia', 'activa'] as const).filter((k) => r.redireccion[k] !== actual[k]);
    if (!cambios.length) return aRedireccionDto(actual);
    const fila = await this.guardar(() => this.bd.sitioRedireccion.update({ where: { id }, data: r.redireccion }), r.redireccion.desde);
    await this.auditar(u, 'SITIO_REDIRECCION_EDITADA', 'SitioRedireccion', id, { antes: { desde: actual.desde, hacia: actual.hacia, activa: actual.activa }, desde: fila.desde, hacia: fila.hacia, activa: fila.activa });
    return aRedireccionDto(fila);
  }

  async borrarRedireccion(u: UsuarioSesion, id: string): Promise<void> {
    const actual = await this.buscar(id);
    await this.bd.sitioRedireccion.delete({ where: { id } });
    await this.auditar(u, 'SITIO_REDIRECCION_BORRADA', 'SitioRedireccion', id, { desde: actual.desde, hacia: actual.hacia });
  }

  private async buscar(id: string): Promise<SitioRedireccion> {
    const r = await this.bd.sitioRedireccion.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La redirección no existe' });
    return r;
  }

  /** Dos altas a la vez con el mismo origen: la segunda choca con la unicidad y recibe el mismo 409. */
  private async guardar(f: () => Promise<SitioRedireccion>, desde: string): Promise<SitioRedireccion> {
    try {
      return await f();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ codigo: 'REDIRECCION_REPETIDA', mensaje: `Ya hay una redirección desde ${desde}`, detalles: [{ campo: 'desde', mensaje: `Ya hay una redirección desde ${desde}` }] });
      }
      throw e;
    }
  }
}
