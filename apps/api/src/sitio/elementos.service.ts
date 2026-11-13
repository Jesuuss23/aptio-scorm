import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type SitioElemento } from '@aptio/db';
import { ordenAlFinal, validarOrden } from '@aptio/schema/sitio-bloques';
import { type Coleccion, type DatosContenido, mezclarDatos, validarDatos } from '@aptio/schema/sitio-contenido';
import { ficticiosVisibles } from '@aptio/schema/sitio-ficticios';
import { entornoActual } from './entorno-sitio.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { ElementoSitioCambioDto, ElementoSitioDto, FicticiosOcultadosDto, FicticiosSitioDto } from './elementos.dto.js';

const aDto = (e: SitioElemento): ElementoSitioDto => ({
  id: e.id, coleccion: e.coleccion, orden: e.orden, visible: e.visible, ficticio: e.ficticio, datos: e.datos as DatosContenido,
  creadoEn: e.creadoEn.toISOString(), actualizadoEn: e.actualizadoEn.toISOString(),
});

const MENSAJE_ORDEN = {
  DUPLICADO: 'Un elemento aparece dos veces en la lista',
  AJENO: 'Un elemento de la lista no es de esta colección',
  FALTANTE: 'Falta un elemento de la colección en la lista',
} as const;

/**
 * HU-1504 · Contenido del sitio (REQ-066, PNT-27): cifras, testimonios, logos, funcionalidades, pasos, LMS y preguntas.
 * Solo el superadmin (lo exige el controlador). Un elemento nuevo va al final y oculto (RN-16-2, CP-115); sus datos se
 * validan contra la colección y solo admiten texto plano (RN-16-7). Cada cambio queda en la auditoría.
 */
@Injectable()
export class ElementosService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async listar(coleccion: Coleccion): Promise<ElementoSitioDto[]> {
    const filas = await this.bd.sitioElemento.findMany({ where: { coleccion }, orderBy: { orden: 'asc' } });
    return filas.map(aDto);
  }

  async agregar(u: UsuarioSesion, coleccion: Coleccion, entrada: Record<string, unknown>, ficticio = false): Promise<ElementoSitioDto> {
    const datos = this.validos(coleccion, entrada, false);
    const e = await this.bd.$transaction(async (tx) => {
      const actuales = await tx.sitioElemento.findMany({ where: { coleccion }, select: { id: true, orden: true, visible: true } });
      return tx.sitioElemento.create({ data: { coleccion, orden: ordenAlFinal(actuales), visible: false, ficticio, datos } });
    });
    await this.auditar(u, 'SITIO_ELEMENTO_AGREGADO', e.id, { coleccion, orden: e.orden, ficticio, datos });
    return aDto(e);
  }

  async cambiar(u: UsuarioSesion, id: string, dto: ElementoSitioCambioDto): Promise<ElementoSitioDto> {
    if (dto.datos === undefined && dto.visible === undefined && dto.ficticio === undefined) {
      throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'Indica datos, visible o ficticio' });
    }
    const actual = await this.buscar(id);
    const coleccion = actual.coleccion as Coleccion;
    const data: Prisma.SitioElementoUpdateInput = {};
    let datosNuevos: DatosContenido | null = null;
    if (dto.datos !== undefined) {
      datosNuevos = mezclarDatos(actual.datos as DatosContenido, this.validos(coleccion, dto.datos, true));
      if (JSON.stringify(datosNuevos) !== JSON.stringify(actual.datos)) data.datos = datosNuevos;
    }
    if (dto.visible !== undefined && dto.visible !== actual.visible) data.visible = dto.visible;
    if (dto.ficticio !== undefined && dto.ficticio !== actual.ficticio) data.ficticio = dto.ficticio;
    if (!Object.keys(data).length) return aDto(actual);
    const e = await this.bd.sitioElemento.update({ where: { id }, data });
    if (data.datos) await this.auditar(u, 'SITIO_ELEMENTO_EDITADO', id, { coleccion, antes: actual.datos, despues: datosNuevos });
    if (data.visible !== undefined) await this.auditar(u, e.visible ? 'SITIO_ELEMENTO_MOSTRADO' : 'SITIO_ELEMENTO_OCULTADO', id, { coleccion, ficticio: e.ficticio });
    if (data.ficticio !== undefined) await this.auditar(u, e.ficticio ? 'SITIO_ELEMENTO_MARCADO_FICTICIO' : 'SITIO_ELEMENTO_DESMARCADO_FICTICIO', id, { coleccion });
    return aDto(e);
  }

  async ordenar(u: UsuarioSesion, coleccion: Coleccion, ids: string[]): Promise<ElementoSitioDto[]> {
    const r = await this.bd.$transaction(async (tx) => {
      const actuales = await tx.sitioElemento.findMany({ where: { coleccion }, orderBy: { orden: 'asc' } });
      const error = validarOrden(actuales, ids);
      if (error) throw new UnprocessableEntityException({ codigo: 'ORDEN_INVALIDO', mensaje: MENSAJE_ORDEN[error.tipo], detalles: [error] });
      await Promise.all(ids.map((id, orden) => tx.sitioElemento.update({ where: { id }, data: { orden } })));
      return { antes: actuales.map((e) => e.id), despues: await tx.sitioElemento.findMany({ where: { coleccion }, orderBy: { orden: 'asc' } }) };
    });
    if (r.antes.join() !== ids.join()) await this.auditar(u, 'SITIO_ELEMENTOS_REORDENADOS', null, { coleccion, antes: r.antes, despues: ids });
    return r.despues.map(aDto);
  }

  async borrar(u: UsuarioSesion, id: string): Promise<void> {
    const e = await this.buscar(id);
    await this.bd.$transaction(async (tx) => {
      await tx.sitioElemento.delete({ where: { id } });
      const resto = await tx.sitioElemento.findMany({ where: { coleccion: e.coleccion }, orderBy: { orden: 'asc' }, select: { id: true, orden: true } });
      await Promise.all(resto.map((r, orden) => (r.orden === orden ? null : tx.sitioElemento.update({ where: { id: r.id }, data: { orden } }))));
    });
    await this.auditar(u, 'SITIO_ELEMENTO_BORRADO', id, { coleccion: e.coleccion, visible: e.visible, datos: e.datos });
  }

  /** HU-1505 · Ficticios visibles del sitio, con el entorno (RN-16-3). */
  async ficticios(): Promise<FicticiosSitioDto> {
    const filas = await this.bd.sitioElemento.findMany({ where: { ficticio: true, visible: true } });
    return { entorno: entornoActual(), ficticios: ficticiosVisibles(filas).map(aDto) };
  }

  /** HU-1505 · «Ocultar todos los ficticios»: los oculta de una vez y deja una fila en la auditoría con sus ids. */
  async ocultarFicticios(u: UsuarioSesion): Promise<FicticiosOcultadosDto> {
    const ids = await this.bd.$transaction(async (tx) => {
      const visibles = await tx.sitioElemento.findMany({ where: { ficticio: true, visible: true }, select: { id: true, coleccion: true } });
      if (visibles.length) await tx.sitioElemento.updateMany({ where: { id: { in: visibles.map((v) => v.id) } }, data: { visible: false } });
      return visibles;
    });
    if (ids.length) await this.auditar(u, 'SITIO_FICTICIOS_OCULTADOS', null, { ocultados: ids.length, elementos: ids });
    return { ...(await this.ficticios()), ocultados: ids.length };
  }

  private validos(coleccion: Coleccion, entrada: unknown, parcial: boolean): DatosContenido {
    const r = validarDatos(coleccion, entrada, parcial);
    if (!r.ok) throw new UnprocessableEntityException({ codigo: 'DATOS_NO_VALIDOS', mensaje: r.errores.map((e) => e.mensaje).join('. '), detalles: r.errores });
    return r.datos;
  }

  private async buscar(id: string): Promise<SitioElemento> {
    const e = await this.bd.sitioElemento.findUnique({ where: { id } });
    if (!e) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El elemento no existe' });
    return e;
  }

  private auditar(u: UsuarioSesion, accion: string, entidadId: string | null, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({
      data: { usuarioId: u.id, organizacionId: null, accion, entidad: 'SitioElemento', entidadId, datos: datos as Prisma.InputJsonValue },
    });
  }
}
