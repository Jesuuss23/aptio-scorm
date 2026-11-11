// HU-1202 · Exportar SCORM 1.2 (M12). La API valida el curso y el pedido, crea la Exportacion ligada a la versión actual
// del curso (RN-12-4) y encola EXPORTAR en la cola `export`; el worker arma el ZIP. Exportar dos veces crea dos
// exportaciones: la anterior no cambia. Se exporta aunque haya pantallas sin aprobar (SUP-51); la web pide confirmación.
// HU-1201 · `validar` estima el peso contra el límite del destino y avisa sin bloquear (RN-12-2, CP-090).
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TAREA_EXPORTAR } from '@aptio/colas';
import type { Exportacion } from '@aptio/db';
import { codigoReproductor, validarScorm12 } from '@aptio/exporters';
import { erroresCurso } from '@aptio/schema';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import { ColasService } from '../trabajos/colas.service.js';
import type { ExportacionDto, ExportacionEntradaDto, InformeExportacionDto, ValidacionDto } from './exportacion.dto.js';

/** Límite de subida que se usa para advertir cuando el cliente no tiene ficha de compatibilidad (configurable). */
export const LIMITE_REFERENCIA_MB = 100;
/** Peso del reproductor si no se pudo empaquetar para medirlo (hoy pesa menos que esto). */
const REPRODUCTOR_ESTIMADO = 200_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pesoReproductor: Promise<number> | null = null;
/** El reproductor se empaqueta una vez por proceso para medir su peso. */
const medirReproductor = () => (pesoReproductor ??= codigoReproductor().then((c) => Buffer.byteLength(c), () => REPRODUCTOR_ESTIMADO));

@Injectable()
export class ExportacionesService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly almacenes: AlmacenService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private async curso(u: UsuarioSesion, cursoId: string) {
    const c = await this.bd.curso.findFirst({ where: { id: cursoId, organizacionId: organizacionDe(u) } });
    if (!c) throw new NotFoundException('Curso no encontrado');
    return c;
  }

  private formatoDisponible(dto: ExportacionEntradaDto) {
    if (dto.formato !== 'SCORM12') {
      throw new UnprocessableEntityException({ codigo: 'FORMATO_NO_DISPONIBLE', mensaje: `El formato ${dto.formato} todavía no está disponible: por ahora se exporta SCORM 1.2` });
    }
    const modoIdioma = dto.modoIdioma ?? 'unico';
    if (modoIdioma !== 'unico') {
      throw new UnprocessableEntityException({ codigo: 'IDIOMA_NO_DISPONIBLE', mensaje: 'Por ahora se exporta un solo idioma, el primero del curso; el paquete bilingüe llega en el S7' });
    }
    return modoIdioma;
  }

  /** HU-1201 · Valida el curso actual para el formato pedido. Responde 200 aunque haya errores: la web los lista. */
  async validar(u: UsuarioSesion, cursoId: string, dto: ExportacionEntradaDto): Promise<ValidacionDto> {
    const c = await this.curso(u, cursoId);
    this.formatoDisponible(dto);
    const doc = c.documento as { recursos?: { id?: unknown }[] } | null;
    const ids = (Array.isArray(doc?.recursos) ? doc.recursos : []).map((r) => r?.id).filter((id): id is string => typeof id === 'string' && UUID.test(id));
    const [filas, proyecto] = await Promise.all([
      ids.length ? this.bd.recurso.findMany({ where: { id: { in: ids }, organizacionId: c.organizacionId }, select: { id: true, nombre: true, bytes: true } }) : [],
      this.bd.proyecto.findFirst({ where: { id: c.proyectoId }, select: { clienteId: true } }),
    ]);
    const ficha = proyecto
      ? await this.bd.fichaCompatibilidad.findFirst({ where: { clienteId: proyecto.clienteId, limiteSubidaMb: { not: null } }, orderBy: { actualizadoEn: 'desc' }, select: { limiteSubidaMb: true } })
      : null;
    const referencia = Number(process.env.LIMITE_SUBIDA_REFERENCIA_MB);
    const limiteMb = ficha?.limiteSubidaMb ?? (Number.isFinite(referencia) && referencia > 0 ? referencia : LIMITE_REFERENCIA_MB);
    const origenLimite = ficha?.limiteSubidaMb ? 'ficha' : 'referencia';
    const pesos = filas.map((r) => ({ id: r.id, nombre: r.nombre, bytes: Number(r.bytes) }));
    const v = validarScorm12(c.documento, pesos, await medirReproductor(), limiteMb, { origenLimite });
    return { ...v, origenLimite };
  }

  async exportar(u: UsuarioSesion, cursoId: string, dto: ExportacionEntradaDto): Promise<ExportacionDto> {
    const c = await this.curso(u, cursoId);
    const modoIdioma = this.formatoDisponible(dto);
    const errores = erroresCurso(c.documento);
    if (errores.length) {
      throw new UnprocessableEntityException({ codigo: 'ESQUEMA_NO_VALIDO', mensaje: 'El curso no cumple el esquema: corrígelo antes de exportar', detalles: errores.slice(0, 10).map((e) => ({ mensaje: e })) });
    }
    const exp = await this.bd.exportacion.create({
      data: { organizacionId: c.organizacionId, cursoId: c.id, versionCurso: c.version, formato: 'SCORM12', perfilLms: dto.perfilLms ?? 'generico', modoIdioma, creadoPorId: u.id },
    });
    await this.colas.encolar('export', { trabajoId: exp.id, organizacionId: c.organizacionId, tarea: TAREA_EXPORTAR });
    return this.dto(exp, null, null);
  }

  async listar(u: UsuarioSesion, cursoId: string): Promise<ExportacionDto[]> {
    await this.curso(u, cursoId);
    const lista = await this.bd.exportacion.findMany({ where: { cursoId }, orderBy: { creadoEn: 'desc' }, take: 50 });
    const nombres = await this.nombres(lista);
    return lista.map((e) => this.dto(e, nombres.get(e.recursoId ?? '') ?? null, null));
  }

  async ver(u: UsuarioSesion, id: string): Promise<ExportacionDto> {
    const e = await this.bd.exportacion.findFirst({ where: { id, organizacionId: organizacionDe(u) } });
    if (!e) throw new NotFoundException('Exportación no encontrada');
    const r = e.estado === 'COMPLETADO' && e.recursoId
      ? await this.bd.recurso.findFirst({ where: { id: e.recursoId, organizacionId: e.organizacionId }, select: { claveS3: true, nombre: true } })
      : null;
    return this.dto(e, r?.nombre ?? null, r ? await this.almacenes.almacen.urlDescarga(r.claveS3, r.nombre) : null);
  }

  private async nombres(lista: Exportacion[]): Promise<Map<string, string>> {
    const ids = lista.map((e) => e.recursoId).filter((x): x is string => Boolean(x));
    if (!ids.length) return new Map();
    const filas = await this.bd.recurso.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } });
    return new Map(filas.map((r) => [r.id, r.nombre]));
  }

  private dto(e: Exportacion, nombreArchivo: string | null, descargaUrl: string | null): ExportacionDto {
    return {
      id: e.id, cursoId: e.cursoId, formato: e.formato, perfilLms: e.perfilLms, modoIdioma: e.modoIdioma, versionCurso: e.versionCurso, estado: e.estado,
      bytes: e.bytes === null ? null : Number(e.bytes), informe: (e.informe as InformeExportacionDto | null) ?? null, motivo: e.motivo,
      nombreArchivo, descargaUrl, creadoEn: e.creadoEn.toISOString(),
    };
  }
}
