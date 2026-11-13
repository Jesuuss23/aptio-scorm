import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type SitioEnlace, ultimaVersion } from '@aptio/db';
import { type IdiomaSitio, idiomaDeFila } from '@aptio/schema/sitio-contenido';
import { navegacionDe } from '@aptio/schema/sitio-versiones';
import { ordenAlFinal, validarOrden } from '@aptio/schema/sitio-bloques';
import {
  arbolNavegacion, esColumnaPie, esEnlaceExterno, validarRuta, validarTextoEnlace, validarUbicacion,
  type ErrorUbicacion, type NavegacionPublica,
} from '@aptio/schema/sitio-navegacion';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { EnlaceSitioCambioDto, EnlaceSitioDto, EnlaceSitioEntradaDto, NavegacionSitioDto } from './navegacion.dto.js';

const aDto = (e: SitioEnlace): EnlaceSitioDto => ({
  id: e.id, zona: e.zona, padreId: e.padreId, idioma: idiomaDeFila(e), texto: e.texto, ruta: e.ruta, externo: e.ruta ? esEnlaceExterno(e.ruta) : false,
  orden: e.orden, visible: e.visible, creadoEn: e.creadoEn.toISOString(), actualizadoEn: e.actualizadoEn.toISOString(),
});

const MENSAJE_ORDEN = {
  DUPLICADO: 'Un enlace aparece dos veces en la lista',
  AJENO: 'Un enlace de la lista no es de este grupo',
  FALTANTE: 'Falta un enlace del grupo en la lista',
} as const;

const MENSAJE_UBICACION: Record<ErrorUbicacion | 'PADRE_INEXISTENTE', string> = {
  ZONA_INVALIDA: 'La zona es menu o pie',
  MENU_SIN_NIVELES: 'El menú principal no tiene columnas: sus enlaces van sin padre',
  PADRE_DE_OTRA_ZONA: 'El padre debe ser una columna del pie',
  PROFUNDIDAD_INVALIDA: 'El pie tiene dos niveles: columna y enlace',
  PADRE_DE_OTRO_IDIOMA: 'La columna del pie es de otro idioma',
  PADRE_INEXISTENTE: 'La columna del pie no existe',
};

interface ErrorCampo { campo: string; mensaje: string }

/**
 * HU-1506 · Menú principal y pie de página (REQ-066, PNT-25). Solo el superadmin (lo exige el controlador). Un enlace
 * nuevo va al final de su grupo y oculto (RN-16-2); el texto es texto plano (RN-16-7) y la ruta, interna o https://.
 * Borrar una columna borra sus enlaces (la base lo hace en cascada). Cada cambio queda en la auditoría.
 */
@Injectable()
export class NavegacionService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** HU-1510 · La navegación de un idioma: cada uno tiene su menú y su pie. */
  async listar(idioma: IdiomaSitio = 'es'): Promise<NavegacionSitioDto> {
    const arbol = arbolNavegacion(await this.bd.sitioEnlace.findMany({ where: { idioma } }));
    return { menu: arbol.menu.map(aDto), pie: arbol.pie.map((c) => ({ ...aDto(c), enlaces: c.enlaces.map(aDto) })) };
  }

  /** CP-118 · Solo lo visible, en su orden. HU-1507 · Sale de la última versión publicada; sin versiones, vacía (RN-16-5). */
  async publica(idioma: IdiomaSitio = 'es'): Promise<NavegacionPublica & { mostrarSelectorIdioma: boolean }> {
    const inst = (await ultimaVersion(this.bd))?.instantanea;
    return { ...(inst ? navegacionDe(inst, idioma) : { menu: [], pie: [] }), mostrarSelectorIdioma: inst?.sitio?.mostrarSelectorIdioma !== false };
  }

  async agregar(u: UsuarioSesion, dto: EnlaceSitioEntradaDto): Promise<EnlaceSitioDto> {
    const padreId = dto.padreId ?? null;
    // HU-1510 · Sin idioma, un enlace de una columna del pie toma el de su columna; con idioma, debe coincidir.
    let idioma: IdiomaSitio = idiomaDeFila({ idioma: dto.idioma ?? null });
    if (padreId !== null) idioma = await this.revisarUbicacion(dto.zona, padreId, dto.idioma === undefined ? undefined : idioma);
    else this.ubicacionValida(validarUbicacion(dto.zona, null));
    const columna = esColumnaPie({ zona: dto.zona, padreId });
    const errores: ErrorCampo[] = [];
    const texto = this.texto(dto.texto, errores);
    const ruta = this.ruta(dto.ruta, columna, errores);
    this.sinErrores(errores);
    const e = await this.bd.$transaction(async (tx) => {
      const hermanos = await tx.sitioEnlace.findMany({ where: { zona: dto.zona, padreId, idioma }, select: { id: true, orden: true, visible: true } });
      return tx.sitioEnlace.create({ data: { zona: dto.zona, padreId, idioma, texto: texto!, ruta: ruta ?? null, orden: ordenAlFinal(hermanos), visible: false } });
    });
    await this.auditar(u, 'SITIO_ENLACE_AGREGADO', e.id, { zona: e.zona, padreId, idioma, texto: e.texto, ruta: e.ruta, orden: e.orden });
    return aDto(e);
  }

  async cambiar(u: UsuarioSesion, id: string, dto: EnlaceSitioCambioDto): Promise<EnlaceSitioDto> {
    if (dto.texto === undefined && dto.ruta === undefined && dto.visible === undefined) {
      throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'Indica texto, ruta o visible' });
    }
    const actual = await this.buscar(id);
    const errores: ErrorCampo[] = [];
    const data: Prisma.SitioEnlaceUpdateInput = {};
    if (dto.texto !== undefined) {
      const texto = this.texto(dto.texto, errores);
      if (texto !== undefined && texto !== actual.texto) data.texto = texto;
    }
    if (dto.ruta !== undefined) {
      const ruta = this.ruta(dto.ruta, esColumnaPie(actual), errores);
      if (!errores.some((x) => x.campo === 'ruta') && (ruta ?? null) !== actual.ruta) data.ruta = ruta ?? null;
    }
    this.sinErrores(errores);
    if (dto.visible !== undefined && dto.visible !== actual.visible) data.visible = dto.visible;
    if (!Object.keys(data).length) return aDto(actual);
    const e = await this.bd.sitioEnlace.update({ where: { id }, data });
    if (data.texto !== undefined || data.ruta !== undefined) {
      await this.auditar(u, 'SITIO_ENLACE_EDITADO', id, { zona: e.zona, antes: { texto: actual.texto, ruta: actual.ruta }, despues: { texto: e.texto, ruta: e.ruta } });
    }
    if (data.visible !== undefined) await this.auditar(u, e.visible ? 'SITIO_ENLACE_MOSTRADO' : 'SITIO_ENLACE_OCULTADO', id, { zona: e.zona, texto: e.texto });
    return aDto(e);
  }

  async ordenar(u: UsuarioSesion, zona: string, padreId: string | null, ids: string[], idioma: IdiomaSitio = 'es'): Promise<EnlaceSitioDto[]> {
    if (padreId !== null) await this.revisarUbicacion(zona, padreId, idioma);
    const r = await this.bd.$transaction(async (tx) => {
      const actuales = await tx.sitioEnlace.findMany({ where: { zona, padreId, idioma }, orderBy: { orden: 'asc' } });
      const error = validarOrden(actuales, ids);
      if (error) throw new UnprocessableEntityException({ codigo: 'ORDEN_INVALIDO', mensaje: MENSAJE_ORDEN[error.tipo], detalles: [error] });
      await Promise.all(ids.map((id, orden) => tx.sitioEnlace.update({ where: { id }, data: { orden } })));
      return { antes: actuales.map((e) => e.id), despues: await tx.sitioEnlace.findMany({ where: { zona, padreId, idioma }, orderBy: { orden: 'asc' } }) };
    });
    if (r.antes.join() !== ids.join()) await this.auditar(u, 'SITIO_ENLACES_REORDENADOS', padreId, { zona, padreId, idioma, antes: r.antes, despues: ids });
    return r.despues.map(aDto);
  }

  async borrar(u: UsuarioSesion, id: string): Promise<void> {
    const e = await this.buscar(id);
    const hijos = await this.bd.$transaction(async (tx) => {
      const n = await tx.sitioEnlace.count({ where: { padreId: id } });
      await tx.sitioEnlace.delete({ where: { id } });
      const resto = await tx.sitioEnlace.findMany({ where: { zona: e.zona, padreId: e.padreId, idioma: e.idioma }, orderBy: { orden: 'asc' }, select: { id: true, orden: true } });
      await Promise.all(resto.map((r, orden) => (r.orden === orden ? null : tx.sitioEnlace.update({ where: { id: r.id }, data: { orden } }))));
      return n;
    });
    await this.auditar(u, 'SITIO_ENLACE_BORRADO', id, { zona: e.zona, padreId: e.padreId, idioma: idiomaDeFila(e), texto: e.texto, ruta: e.ruta, visible: e.visible, enlacesBorrados: hijos });
  }

  /** Revisa el padre y devuelve su idioma; con `idioma`, el padre debe ser de ese idioma (HU-1510). */
  private async revisarUbicacion(zona: string, padreId: string, idioma?: IdiomaSitio): Promise<IdiomaSitio> {
    const padre = await this.bd.sitioEnlace.findUnique({ where: { id: padreId }, select: { zona: true, padreId: true, idioma: true } });
    if (!padre) this.ubicacionValida(validarUbicacion(zona, { zona: 'pie', padreId: null }) ?? 'PADRE_INEXISTENTE');
    else this.ubicacionValida(validarUbicacion(zona, padre, idioma));
    return idiomaDeFila(padre ?? {});
  }

  private ubicacionValida(error: ErrorUbicacion | 'PADRE_INEXISTENTE' | null): void {
    if (error) throw new UnprocessableEntityException({ codigo: 'UBICACION_INVALIDA', mensaje: MENSAJE_UBICACION[error], detalles: [{ tipo: error }] });
  }

  private texto(entrada: string, errores: ErrorCampo[]): string | undefined {
    const r = validarTextoEnlace(entrada);
    if (!r.ok) errores.push({ campo: 'texto', mensaje: r.mensaje });
    return r.ok ? r.texto : undefined;
  }

  /** La ruta es obligatoria salvo en una columna del pie, donde vacía o null la quita. */
  private ruta(entrada: string | null | undefined, columna: boolean, errores: ErrorCampo[]): string | undefined {
    if (columna && (entrada === undefined || entrada === null || entrada.trim() === '')) return undefined;
    const r = validarRuta(entrada);
    if (!r.ok) errores.push({ campo: 'ruta', mensaje: r.mensaje });
    return r.ok ? r.ruta : undefined;
  }

  private sinErrores(errores: ErrorCampo[]): void {
    if (errores.length) throw new UnprocessableEntityException({ codigo: 'DATOS_NO_VALIDOS', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });
  }

  private async buscar(id: string): Promise<SitioEnlace> {
    const e = await this.bd.sitioEnlace.findUnique({ where: { id } });
    if (!e) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El enlace no existe' });
    return e;
  }

  private auditar(u: UsuarioSesion, accion: string, entidadId: string | null, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({
      data: { usuarioId: u.id, organizacionId: null, accion, entidad: 'SitioEnlace', entidadId, datos: datos as Prisma.InputJsonValue },
    });
  }
}
