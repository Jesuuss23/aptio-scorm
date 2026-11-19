import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@aptio/db';
import { aPopupPublico, type DatosPopup, esEventoPopup, POPUP_NUEVO, type PopupPublico, tasaConversion, validarPopup } from '@aptio/schema/popups';
import type { UsuarioSesion } from '../comun/roles.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { LimitadorService } from '../comun/limitador.js';
import { entornoActual } from '../sitio/entorno-sitio.js';
import type { PopupDto, PopupEntradaDto, PopupsDto } from './popups.dto.js';

type FilaPopup = Prisma.SitioPopupGetPayload<object>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Eventos de `POST /s/_popup` por IP y por minuto: un visitante real manda uno o dos por página. */
export const LIMITE_EVENTOS_POPUP = 30;
const VENTANA_MS = 60_000;

const aDto = (p: FilaPopup): PopupDto => ({
  id: p.id, nombre: p.nombre, tipo: p.tipo, idioma: p.idioma, disparador: p.disparador, valorDisparador: p.valorDisparador, paginas: p.paginas as string[], titulo: p.titulo,
  texto: p.texto, boton: p.boton, accion: p.accion, enlaceDestino: p.enlaceDestino, frecuenciaDias: p.frecuenciaDias, visible: p.visible, orden: p.orden, ficticio: p.ficticio,
  impresiones: p.impresiones, conversiones: p.conversiones, tasaConversion: tasaConversion(p.impresiones, p.conversiones), actualizadoEn: p.actualizadoEn.toISOString(),
});

const datosDe = (p: FilaPopup): DatosPopup => ({
  nombre: p.nombre, tipo: p.tipo as DatosPopup['tipo'], idioma: p.idioma as DatosPopup['idioma'], disparador: p.disparador as DatosPopup['disparador'], valorDisparador: p.valorDisparador,
  paginas: p.paginas as string[], titulo: p.titulo, texto: p.texto, boton: p.boton, accion: p.accion as DatosPopup['accion'], enlaceDestino: p.enlaceDestino,
  frecuenciaDias: p.frecuenciaDias, visible: p.visible, ficticio: p.ficticio,
});

/** Solo los campos que llegaron (un PATCH no borra lo que no menciona). */
const presentes = (dto: PopupEntradaDto): Record<string, unknown> => Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));

/**
 * HU-1603 · Popups del sitio (REQ-076, PNT-31, RN-17-3). El panel crea, edita, ordena, activa y reinicia los popups; el
 * sitio los lee en vivo (`GET /s/_popups.json`), así que apagar uno vale sin republicar (CP-132). Las impresiones y las
 * conversiones de los popups con enlace llegan por `POST /s/_popup`; las de los popups de correo, al guardarse el lead.
 */
@Injectable()
export class PopupsService {

  constructor(private readonly baseDatos: BaseDatosService, private readonly limitador: LimitadorService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** Para las pruebas: vacía el límite por IP. */
  reiniciarLimite(): void {
    this.limitador.reiniciar('popups');
  }

  async listar(): Promise<PopupsDto> {
    const filas = await this.bd.sitioPopup.findMany({ orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }] });
    return { popups: filas.map(aDto) };
  }

  async crear(u: UsuarioSesion, dto: PopupEntradaDto): Promise<PopupDto> {
    const datos = this.validar({ ...POPUP_NUEVO, ...presentes(dto) });
    const ultimo = await this.bd.sitioPopup.aggregate({ _max: { orden: true } });
    const p = await this.bd.sitioPopup.create({ data: { ...datos, paginas: datos.paginas, orden: (ultimo._max.orden ?? -1) + 1 } });
    await this.auditar(u, 'POPUP_CREADO', p.id, { nombre: p.nombre, tipo: p.tipo, visible: p.visible });
    return aDto(p);
  }

  async cambiar(u: UsuarioSesion, id: string, dto: PopupEntradaDto): Promise<PopupDto> {
    const actual = await this.buscar(id);
    const cambios = presentes(dto);
    const datos = this.validar({ ...datosDe(actual), ...cambios });
    const p = await this.bd.sitioPopup.update({ where: { id }, data: { ...datos, paginas: datos.paginas } });
    await this.auditar(u, 'POPUP_EDITADO', id, { nombre: p.nombre, campos: Object.keys(cambios), ...(cambios.visible !== undefined ? { visible: p.visible } : {}) });
    return aDto(p);
  }

  async borrar(u: UsuarioSesion, id: string): Promise<void> {
    const p = await this.buscar(id);
    await this.bd.$transaction(async (tx) => {
      await tx.sitioPopup.delete({ where: { id } });
      const resto = await tx.sitioPopup.findMany({ orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }], select: { id: true } });
      for (const [i, r] of resto.entries()) await tx.sitioPopup.update({ where: { id: r.id }, data: { orden: i } });
    });
    await this.auditar(u, 'POPUP_BORRADO', id, { nombre: p.nombre, impresiones: p.impresiones, conversiones: p.conversiones });
  }

  async ordenar(u: UsuarioSesion, ids: string[]): Promise<PopupsDto> {
    const todos = await this.bd.sitioPopup.findMany({ select: { id: true } });
    const existentes = new Set(todos.map((p) => p.id));
    if (new Set(ids).size !== ids.length || ids.length !== existentes.size || ids.some((i) => !existentes.has(i))) {
      throw new UnprocessableEntityException({ codigo: 'ORDEN_INCOMPLETO', mensaje: 'El orden lleva todos los popups, una vez cada uno' });
    }
    await this.bd.$transaction(ids.map((id, orden) => this.bd.sitioPopup.update({ where: { id }, data: { orden } })));
    await this.auditar(u, 'POPUPS_ORDENADOS', null, { ids });
    return this.listar();
  }

  async reiniciar(u: UsuarioSesion, id: string): Promise<PopupDto> {
    const antes = await this.buscar(id);
    const p = await this.bd.sitioPopup.update({ where: { id }, data: { impresiones: 0, conversiones: 0 } });
    await this.auditar(u, 'POPUP_RESULTADOS_REINICIADOS', id, { nombre: p.nombre, impresiones: antes.impresiones, conversiones: antes.conversiones });
    return aDto(p);
  }

  /** CP-132 · Lo que ve el sitio: solo los activos y, en producción, nunca los ficticios. */
  async publicos(): Promise<PopupPublico[]> {
    const filas = await this.bd.sitioPopup.findMany({
      where: { visible: true, ...(entornoActual() === 'produccion' ? { ficticio: false } : {}) },
      orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }],
    });
    return filas.map((p) => aPopupPublico({ ...p, paginas: p.paginas as string[] } as unknown as PopupPublico & Record<string, unknown>));
  }

  /**
   * `POST /s/_popup`: suma una impresión, o la conversión de un popup con enlace, a un popup activo. Sin datos
   * personales: no se guarda la IP, solo se usa para el límite por IP. Un popup que no existe o está apagado se
   * ignora (204 igual) para no dar pistas.
   */
  async registrar(popupId: unknown, evento: unknown, ip: string): Promise<void> {
    await this.limitador.exigir('popups', ip, { envios: LIMITE_EVENTOS_POPUP, ventanaMs: VENTANA_MS }, 'Demasiadas solicitudes: espera un minuto');
    if (typeof popupId !== 'string' || !UUID.test(popupId) || !esEventoPopup(evento)) throw new BadRequestException({ codigo: 'NO_VALIDO', mensaje: 'popupId y evento (impresion o conversion)' });
    const where = { id: popupId, visible: true, ...(evento === 'conversion' ? { accion: 'enlace_interno' } : {}) };
    await this.bd.sitioPopup.updateMany({ where, data: evento === 'impresion' ? { impresiones: { increment: 1 } } : { conversiones: { increment: 1 } } });
  }

  /** Un correo dejado en un popup de correo: su conversión (lo llama la captura del lead). */
  async convertirPorCorreo(popupId: unknown): Promise<void> {
    if (typeof popupId !== 'string' || !UUID.test(popupId)) return;
    await this.bd.sitioPopup.updateMany({ where: { id: popupId, accion: 'pedir_correo' }, data: { conversiones: { increment: 1 } } });
  }


  private validar(entrada: Record<string, unknown>): DatosPopup {
    const r = validarPopup(entrada);
    if (!r.ok) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: r.errores.map((e) => e.mensaje).join('. '), detalles: r.errores });
    return r.datos;
  }

  private async buscar(id: string): Promise<FilaPopup> {
    const p = await this.bd.sitioPopup.findUnique({ where: { id } });
    if (!p) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El popup no existe' });
    return p;
  }

  private auditar(u: UsuarioSesion, accion: string, entidadId: string | null, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({ data: { usuarioId: u.id, organizacionId: null, accion, entidad: 'SitioPopup', entidadId, datos: datos as Prisma.InputJsonValue } });
  }
}
