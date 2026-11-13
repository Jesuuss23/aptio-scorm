import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type SitioBloque } from '@aptio/db';
import { nombreBloque, ordenAlFinal, validarOrden } from '@aptio/schema/sitio-bloques';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { BloqueSitioDto, BloqueSitioEntradaDto } from './sitio.dto.js';

/** Tope de los ajustes de un bloque, medido como JSON. */
export const MAX_AJUSTES = 20_000;

const aDto = (b: SitioBloque): BloqueSitioDto => ({
  id: b.id, paginaId: b.paginaId, tipo: b.tipo, orden: b.orden, visible: b.visible,
  ajustes: (b.ajustes as Record<string, unknown> | null) ?? null,
  creadoEn: b.creadoEn.toISOString(), actualizadoEn: b.actualizadoEn.toISOString(),
});

const MENSAJE_ORDEN = {
  DUPLICADO: 'Un bloque aparece dos veces en la lista',
  AJENO: 'Un bloque de la lista no es de esta página',
  FALTANTE: 'Falta un bloque de la página en la lista',
} as const;

/**
 * HU-1503 · Bloques de una página del sitio (REQ-066, PNT-26). Solo el superadmin (lo exige el controlador). Un bloque
 * nuevo va al final y oculto (RN-16-2); ocultarlo conserva sus ajustes (CP-112); el orden se cambia con la lista completa
 * (CP-113). Cada cambio queda en la auditoría.
 */
@Injectable()
export class BloquesService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async listar(paginaId: string): Promise<BloqueSitioDto[]> {
    await this.pagina(paginaId);
    const filas = await this.bd.sitioBloque.findMany({ where: { paginaId }, orderBy: { orden: 'asc' } });
    return filas.map(aDto);
  }

  async agregar(u: UsuarioSesion, paginaId: string, dto: BloqueSitioEntradaDto): Promise<BloqueSitioDto> {
    const pagina = await this.pagina(paginaId);
    if (dto.ajustes && JSON.stringify(dto.ajustes).length > MAX_AJUSTES) {
      throw new UnprocessableEntityException({ codigo: 'AJUSTES_GRANDES', mensaje: `Los ajustes del bloque pasan de ${MAX_AJUSTES} caracteres` });
    }
    const b = await this.bd.$transaction(async (tx) => {
      const actuales = await tx.sitioBloque.findMany({ where: { paginaId }, select: { id: true, orden: true, visible: true } });
      return tx.sitioBloque.create({
        data: { paginaId, tipo: dto.tipo, orden: ordenAlFinal(actuales), visible: false, ...(dto.ajustes ? { ajustes: dto.ajustes as Prisma.InputJsonValue } : {}) },
      });
    });
    await this.auditar(u, 'SITIO_BLOQUE_AGREGADO', pagina, b.id, { tipo: b.tipo, nombre: nombreBloque(b.tipo), orden: b.orden });
    return aDto(b);
  }

  async ordenar(u: UsuarioSesion, paginaId: string, ids: string[]): Promise<BloqueSitioDto[]> {
    const pagina = await this.pagina(paginaId);
    const filas = await this.bd.$transaction(async (tx) => {
      const actuales = await tx.sitioBloque.findMany({ where: { paginaId }, orderBy: { orden: 'asc' } });
      const error = validarOrden(actuales, ids);
      if (error) throw new UnprocessableEntityException({ codigo: 'ORDEN_INVALIDO', mensaje: MENSAJE_ORDEN[error.tipo], detalles: [error] });
      await Promise.all(ids.map((id, orden) => tx.sitioBloque.update({ where: { id }, data: { orden } })));
      return { antes: actuales.map((b) => b.id), despues: await tx.sitioBloque.findMany({ where: { paginaId }, orderBy: { orden: 'asc' } }) };
    });
    if (filas.antes.join() !== ids.join()) await this.auditar(u, 'SITIO_BLOQUES_REORDENADOS', pagina, pagina.id, { antes: filas.antes, despues: ids });
    return filas.despues.map(aDto);
  }

  async cambiar(u: UsuarioSesion, paginaId: string, bloqueId: string, visible: boolean): Promise<BloqueSitioDto> {
    const pagina = await this.pagina(paginaId);
    const actual = await this.bloque(paginaId, bloqueId);
    if (actual.visible === visible) return aDto(actual);
    const b = await this.bd.sitioBloque.update({ where: { id: bloqueId }, data: { visible } });
    await this.auditar(u, visible ? 'SITIO_BLOQUE_MOSTRADO' : 'SITIO_BLOQUE_OCULTADO', pagina, b.id, { tipo: b.tipo, nombre: nombreBloque(b.tipo) });
    return aDto(b);
  }

  async borrar(u: UsuarioSesion, paginaId: string, bloqueId: string): Promise<void> {
    const pagina = await this.pagina(paginaId);
    const b = await this.bloque(paginaId, bloqueId);
    await this.bd.$transaction(async (tx) => {
      await tx.sitioBloque.delete({ where: { id: bloqueId } });
      const resto = await tx.sitioBloque.findMany({ where: { paginaId }, orderBy: { orden: 'asc' }, select: { id: true, orden: true } });
      await Promise.all(resto.map((r, orden) => (r.orden === orden ? null : tx.sitioBloque.update({ where: { id: r.id }, data: { orden } }))));
    });
    await this.auditar(u, 'SITIO_BLOQUE_BORRADO', pagina, b.id, { tipo: b.tipo, nombre: nombreBloque(b.tipo), visible: b.visible, ajustes: b.ajustes });
  }

  private async pagina(id: string) {
    const p = await this.bd.sitioPagina.findUnique({ where: { id }, select: { id: true, ruta: true, idioma: true } });
    if (!p) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La página no existe' });
    return p;
  }

  private async bloque(paginaId: string, id: string): Promise<SitioBloque> {
    const b = await this.bd.sitioBloque.findUnique({ where: { id } });
    if (!b || b.paginaId !== paginaId) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El bloque no existe en esta página' });
    return b;
  }

  private auditar(u: UsuarioSesion, accion: string, p: { ruta: string; idioma: string }, entidadId: string, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({
      data: {
        usuarioId: u.id, organizacionId: null, accion, entidad: accion === 'SITIO_BLOQUES_REORDENADOS' ? 'SitioPagina' : 'SitioBloque', entidadId,
        datos: { ruta: p.ruta, idioma: p.idioma, ...datos } as Prisma.InputJsonValue,
      },
    });
  }
}
