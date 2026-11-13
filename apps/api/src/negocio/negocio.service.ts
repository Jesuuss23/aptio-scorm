import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { MedicionProceso, Prisma } from '@aptio/db';
import { calcularRentabilidad, type FuenteRentabilidad, normalizarParametros, type ParametrosNegocio } from '@aptio/schema/rentabilidad';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { MedicionDto, MedicionEntradaDto, ParametrosNegocioDto, ParametrosNegocioRespuestaDto, RentabilidadDto } from './negocio.dto.js';

/** HU-1303 · Parámetros por organización (SUP-143), mediciones y el cálculo compartido de `@aptio/schema/rentabilidad`. */
@Injectable()
export class NegocioService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private async leer(organizacionId: string): Promise<{ p: ParametrosNegocio; fila: { actualizadoEn: Date } | null }> {
    const fila = await this.bd.parametrosNegocio.findUnique({ where: { organizacionId } });
    return { p: normalizarParametros(fila?.datos), fila };
  }

  async parametros(u: UsuarioSesion): Promise<ParametrosNegocioRespuestaDto> {
    const { p, fila } = await this.leer(organizacionDe(u));
    return { ...p, ejemplo: !fila, actualizadoEn: fila?.actualizadoEn.toISOString() ?? null };
  }

  async guardar(u: UsuarioSesion, dto: ParametrosNegocioDto): Promise<ParametrosNegocioRespuestaDto> {
    const organizacionId = organizacionDe(u);
    const p = normalizarParametros(dto);
    const datos = p as unknown as Prisma.InputJsonValue;
    const fila = await this.bd.parametrosNegocio.upsert({ where: { organizacionId }, create: { organizacionId, datos }, update: { datos } });
    await this.bd.auditoria.create({ data: { organizacionId, usuarioId: u.id, accion: 'PARAMETROS_NEGOCIO_GUARDADOS', entidad: 'ParametrosNegocio', entidadId: fila.id } });
    return { ...p, ejemplo: false, actualizadoEn: fila.actualizadoEn.toISOString() };
  }

  async rentabilidad(u: UsuarioSesion, fuente: FuenteRentabilidad): Promise<RentabilidadDto> {
    const organizacionId = organizacionDe(u);
    const { p } = await this.leer(organizacionId);
    const mediciones = fuente === 'mediciones' ? await this.bd.medicionProceso.findMany({ where: { organizacionId } }) : [];
    return calcularRentabilidad(p, fuente, mediciones.map((m) => ({ proyectoRef: m.proyectoRef, proyectoId: m.proyectoId, escenario: m.escenario, etapa: m.etapa, horas: Number(m.horas) })));
  }

  async mediciones(u: UsuarioSesion): Promise<MedicionDto[]> {
    const filas = await this.bd.medicionProceso.findMany({ where: { organizacionId: organizacionDe(u) }, orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }] });
    return filas.map(aDto);
  }

  async registrar(u: UsuarioSesion, dto: MedicionEntradaDto): Promise<MedicionDto> {
    const organizacionId = organizacionDe(u);
    let proyectoRef = dto.proyectoRef?.trim();
    if (dto.proyectoId) {
      const p = await this.bd.proyecto.findFirst({ where: { id: dto.proyectoId, organizacionId }, select: { nombre: true } });
      if (!p) throw new UnprocessableEntityException({ codigo: 'PROYECTO_NO_VALIDO', mensaje: 'El proyecto no es de tu organización' });
      proyectoRef ||= p.nombre;
    }
    if (!proyectoRef) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: 'Indica el proyecto medido' });
    const quien = await this.bd.usuario.findUnique({ where: { id: u.id }, select: { nombre: true } });
    const m = await this.bd.medicionProceso.create({
      data: { organizacionId, proyectoId: dto.proyectoId ?? null, proyectoRef, escenario: dto.escenario, etapa: dto.etapa, horas: dto.horas, notas: dto.notas?.trim() || null, registradoPor: quien?.nombre ?? null },
    });
    return aDto(m);
  }

  async borrar(u: UsuarioSesion, id: string): Promise<void> {
    const organizacionId = organizacionDe(u);
    const { count } = await this.bd.medicionProceso.deleteMany({ where: { id, organizacionId } });
    if (!count) throw new NotFoundException('Medición no encontrada');
    await this.bd.auditoria.create({ data: { organizacionId, usuarioId: u.id, accion: 'MEDICION_BORRADA', entidad: 'MedicionProceso', entidadId: id } });
  }
}

function aDto(m: MedicionProceso): MedicionDto {
  return {
    id: m.id, proyectoRef: m.proyectoRef, proyectoId: m.proyectoId, escenario: m.escenario, etapa: m.etapa, horas: Number(m.horas),
    notas: m.notas, registradoPor: m.registradoPor, creadoEn: m.creadoEn.toISOString(),
  };
}
