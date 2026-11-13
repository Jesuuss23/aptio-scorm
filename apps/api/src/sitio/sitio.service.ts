import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type SitioPagina } from '@aptio/db';
import { rutaSitioValida, ultimaVersion } from '@aptio/db';
import { paginaServida } from '@aptio/schema/sitio-versiones';
import { SITIO_URL_POR_DEFECTO, sitemapXml } from '@aptio/sitio';
import { entornoActual } from './entorno-sitio.js';
import { VersionesService } from './versiones.service.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { AccionPagina, PaginaPublicaDto, PaginaSitioCambioDto, PaginaSitioDto, PaginaSitioEntradaDto } from './sitio.dto.js';


const aDto = (p: SitioPagina): PaginaSitioDto => ({
  id: p.id, ruta: p.ruta, idioma: p.idioma, titulo: p.titulo, estado: p.estado,
  publicarEn: p.publicarEn?.toISOString() ?? null, publicadaEn: p.publicadaEn?.toISOString() ?? null,
  creadoEn: p.creadoEn.toISOString(), actualizadoEn: p.actualizadoEn.toISOString(),
});

/** Rechaza días que JavaScript corre al mes siguiente (31 de febrero → 3 de marzo). */
const diaExiste = (iso: string): boolean => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};


const AUDITORIA: Record<AccionPagina, string> = {
  borrador: 'SITIO_PAGINA_A_BORRADOR', programar: 'SITIO_PAGINA_PROGRAMADA', publicar: 'SITIO_PAGINA_PUBLICADA',
};

/**
 * HU-1502 · Páginas del sitio comercial con estados (RN-16-6, CP-110, CP-111). Solo el superadmin las administra
 * (la guarda lo exige en el controlador); son de la plataforma, sin organización. Cada cambio queda en la auditoría.
 */
@Injectable()
export class SitioService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly config: ConfigService,
    private readonly versiones: VersionesService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async listar(): Promise<PaginaSitioDto[]> {
    const filas = await this.bd.sitioPagina.findMany({ orderBy: [{ ruta: 'asc' }, { idioma: 'asc' }] });
    return filas.map(aDto);
  }

  async crear(u: UsuarioSesion, dto: PaginaSitioEntradaDto, ahora = new Date()): Promise<PaginaSitioDto> {
    const estado = this.estadoPedido(dto.accion ?? 'borrador', dto.publicarEn, ahora);
    const aviso = dto.accion === 'publicar' ? await this.versiones.revisarFicticios() : 0;
    try {
      const p = await this.bd.sitioPagina.create({ data: { ruta: dto.ruta, idioma: dto.idioma ?? 'es', titulo: dto.titulo.trim(), ...estado } });
      await this.auditar(u, 'SITIO_PAGINA_CREADA', p, { estado: p.estado, ...(aviso ? { ficticiosVisibles: aviso } : {}) });
      // HU-1507 · Crear una página ya publicada publica el sitio completo en una versión nueva (RN-16-5).
      const v = p.estado === 'PUBLICADA' ? await this.versiones.nuevaVersion(u, 'pagina') : null;
      return { ...aDto(p), ...(aviso ? { avisoFicticios: aviso } : {}), ...(v ? { version: v.numero } : {}) };
    } catch (e) {
      throw this.duplicada(e, dto.ruta, dto.idioma ?? 'es');
    }
  }

  async cambiar(u: UsuarioSesion, id: string, dto: PaginaSitioCambioDto, ahora = new Date()): Promise<PaginaSitioDto> {
    const actual = await this.buscar(id);
    if (dto.publicarEn !== undefined && dto.accion !== 'programar') {
      throw new UnprocessableEntityException({ codigo: 'PUBLICAR_EN_SIN_PROGRAMAR', mensaje: 'publicarEn solo va con accion=programar' });
    }
    if (dto.ruta !== undefined && dto.ruta !== actual.ruta && actual.estado === 'PUBLICADA') {
      throw new UnprocessableEntityException({ codigo: 'RUTA_PUBLICADA', mensaje: 'No se cambia la ruta de una página publicada: pásala a borrador primero' });
    }
    const datos: Prisma.SitioPaginaUpdateInput = {};
    const editado: Record<string, string> = {};
    if (dto.titulo !== undefined && dto.titulo.trim() !== actual.titulo) editado.titulo = datos.titulo = dto.titulo.trim();
    if (dto.ruta !== undefined && dto.ruta !== actual.ruta) editado.ruta = datos.ruta = dto.ruta;
    if (dto.accion) Object.assign(datos, this.estadoPedido(dto.accion, dto.publicarEn, ahora));
    if (!Object.keys(datos).length) return aDto(actual);
    // HU-1505 · CP-116 y CP-117: en producción no se publica con ficticios visibles; en pruebas, sí, con aviso.
    const aviso = dto.accion === 'publicar' ? await this.versiones.revisarFicticios() : 0;
    try {
      const p = await this.bd.sitioPagina.update({ where: { id }, data: datos });
      if (Object.keys(editado).length) await this.auditar(u, 'SITIO_PAGINA_EDITADA', p, { antes: { titulo: actual.titulo, ruta: actual.ruta }, ...editado });
      if (dto.accion) {
        await this.auditar(u, AUDITORIA[dto.accion], p, { desde: actual.estado, publicarEn: p.publicarEn?.toISOString() ?? null, ...(aviso ? { ficticiosVisibles: aviso } : {}) });
      }
      // HU-1507 · Publicar una página, o retirar una publicada (a borrador o programada), crea una versión del sitio
      // completo: lleva al sitio todos los cambios pendientes (RN-16-5).
      const v = dto.accion && (dto.accion === 'publicar' || actual.estado === 'PUBLICADA') ? await this.versiones.nuevaVersion(u, 'pagina') : null;
      return { ...aDto(p), ...(aviso ? { avisoFicticios: aviso } : {}), ...(v ? { version: v.numero } : {}) };
    } catch (e) {
      throw this.duplicada(e, dto.ruta ?? actual.ruta, actual.idioma);
    }
  }

  async borrar(u: UsuarioSesion, id: string): Promise<void> {
    const p = await this.buscar(id);
    if (p.estado !== 'BORRADOR') {
      throw new UnprocessableEntityException({ codigo: 'PAGINA_NO_BORRADOR', mensaje: 'Solo se borra una página en borrador: pásala a borrador primero' });
    }
    await this.bd.sitioPagina.delete({ where: { id } });
    await this.auditar(u, 'SITIO_PAGINA_BORRADA', p, { titulo: p.titulo });
  }

  /**
   * CP-110 · El sitio público solo ve las páginas publicadas. HU-1507 · Lee la última versión (RN-16-5): sin versiones,
   * o si la página no está en ella, 404. En producción nunca sale un ficticio (segunda defensa, RN-16-3).
   */
  async publica(ruta: string, idioma = 'es'): Promise<PaginaPublicaDto> {
    const v = rutaSitioValida(ruta) && (idioma === 'es' || idioma === 'en') ? await ultimaVersion(this.bd) : null;
    const p = v ? paginaServida(v.instantanea, ruta, idioma, entornoActual()) : null;
    if (!p) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'Página no encontrada' });
    return { ...p, publicadaEn: p.publicadaEn ?? v!.creadoEn.toISOString() };
  }

  /** CP-110 y CP-111 · Las páginas de la última versión. El inglés va bajo `/en` hasta que la HU-1510 sume hreflang (SUP-168). */
  async sitemap(): Promise<string> {
    const v = await ultimaVersion(this.bd);
    return sitemapXml(v?.instantanea ?? { paginas: [] }, this.config.get<string>('SITIO_URL') || SITIO_URL_POR_DEFECTO);
  }

  private async buscar(id: string): Promise<SitioPagina> {
    const p = await this.bd.sitioPagina.findUnique({ where: { id } });
    if (!p) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La página no existe' });
    return p;
  }

  private estadoPedido(accion: AccionPagina, publicarEn: string | undefined, ahora: Date) {
    if (accion === 'publicar') return { estado: 'PUBLICADA' as const, publicadaEn: ahora, publicarEn: null };
    if (accion === 'borrador') {
      if (publicarEn !== undefined) throw new UnprocessableEntityException({ codigo: 'PUBLICAR_EN_SIN_PROGRAMAR', mensaje: 'publicarEn solo va con accion=programar' });
      return { estado: 'BORRADOR' as const, publicarEn: null };
    }
    if (publicarEn === undefined) throw new UnprocessableEntityException({ codigo: 'PUBLICAR_EN_REQUERIDO', mensaje: 'Para programar indica la fecha y hora de publicación' });
    const fecha = new Date(publicarEn);
    if (Number.isNaN(fecha.getTime()) || !diaExiste(publicarEn)) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: 'publicarEn no es una fecha válida' });
    if (fecha.getTime() <= ahora.getTime()) {
      throw new UnprocessableEntityException({ codigo: 'PUBLICAR_EN_PASADO', mensaje: 'La fecha de publicación tiene que ser futura' });
    }
    return { estado: 'PROGRAMADA' as const, publicarEn: fecha };
  }

  private duplicada(e: unknown, ruta: string, idioma: string): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException({ codigo: 'RUTA_EN_USO', mensaje: `Ya hay una página en ${ruta} en ${idioma === 'en' ? 'inglés' : 'español'}` });
    }
    return e;
  }

  private auditar(u: UsuarioSesion, accion: string, p: SitioPagina, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({
      data: { usuarioId: u.id, organizacionId: null, accion, entidad: 'SitioPagina', entidadId: p.id, datos: { ruta: p.ruta, idioma: p.idioma, ...datos } as Prisma.InputJsonValue },
    });
  }
}
