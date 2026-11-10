// HU-0401 y HU-0408 · Lanzar, ver, cancelar y continuar la generación de un proyecto. Las etapas corren en el worker
// (apps/worker/src/generar.ts); aquí solo se crean, se encolan y se marcan.
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@aptio/db';
import { ACTIVOS, ETAPAS, TAREA_GENERAR } from '@aptio/schema/generacion';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { ColasService } from '../trabajos/colas.service.js';
import type { EtapaResultadoDto, GeneracionDto, GeneracionEntradaDto } from './generacion.dto.js';

const NINGUNO = '00000000-0000-0000-0000-000000000000';
const conEtapas = { etapas: { orderBy: { orden: 'asc' } } } as const;
type GeneracionCompleta = Prisma.GeneracionGetPayload<{ include: typeof conEtapas }>;
const rechazo = (codigo: string, mensaje: string) => new UnprocessableEntityException({ codigo, mensaje });

export function aDto(g: GeneracionCompleta): GeneracionDto {
  const hechas = g.etapas.filter((e) => e.estado === 'COMPLETADO').length;
  return {
    id: g.id, proyectoId: g.proyectoId, estado: g.estado, avance: Math.round((hechas / ETAPAS.length) * 100), costoUsd: Number(g.costoUsd),
    parametros: g.parametros as Record<string, unknown>,
    etapas: g.etapas.map((e) => ({
      etapa: e.etapa, orden: e.orden, estado: e.estado, detalle: (e.detalle as { texto?: string } | null)?.texto ?? null,
      inicio: e.inicio?.toISOString() ?? null, fin: e.fin?.toISOString() ?? null, costoUsd: Number(e.costoUsd),
    })),
    creadoEn: g.creadoEn.toISOString(), terminadoEn: g.terminadoEn?.toISOString() ?? null,
  };
}

@Injectable()
export class GeneracionesService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private alcanceProyecto(u: UsuarioSesion): Prisma.ProyectoWhereInput {
    const organizacionId = organizacionDe(u);
    return u.rol === 'REVISOR_CLIENTE' ? { organizacionId, clienteId: u.clienteId ?? NINGUNO } : { organizacionId };
  }

  async listar(u: UsuarioSesion, proyectoId: string): Promise<GeneracionDto[]> {
    await this.proyecto(u, proyectoId);
    return (await this.bd.generacion.findMany({ where: { proyectoId }, include: conEtapas, orderBy: { creadoEn: 'desc' }, take: 10 })).map(aDto);
  }

  async ver(u: UsuarioSesion, id: string): Promise<GeneracionDto> {
    return aDto(await this.generacion(u, id));
  }

  /**
   * Resultado completo de una etapa terminada (CP-038: ideas clave con página y acta de omitidos). Una etapa en curso
   * devuelve su avance si lo guarda (CP-043: las pantallas listas de la etapa 4).
   */
  async etapa(u: UsuarioSesion, id: string, etapa: string): Promise<EtapaResultadoDto> {
    const g = await this.generacion(u, id);
    const e = g.etapas.find((x) => x.etapa === etapa);
    if (!e) throw new NotFoundException('Etapa no encontrada');
    const dto = aDto({ ...g, etapas: [e] }).etapas[0]!;
    return { ...dto, datos: e.estado === 'COMPLETADO' || e.estado === 'EN_CURSO' ? ((e.detalle as { datos?: unknown } | null)?.datos ?? null) : null };
  }

  /** Comprueba el acceso; lo usa el flujo de eventos antes de suscribirse. */
  async acceso(u: UsuarioSesion, id: string): Promise<void> {
    await this.generacion(u, id);
  }

  /** CP-036 y CP-037: crea las 11 etapas y encola la generación; solo una activa por proyecto (RN-04-3). */
  async lanzar(u: UsuarioSesion, proyectoId: string, dto: GeneracionEntradaDto): Promise<GeneracionDto> {
    const p = await this.proyecto(u, proyectoId);
    if (p.estado === 'ARCHIVADO') throw rechazo('PROYECTO_ARCHIVADO', 'El proyecto está archivado');
    const materiales = await this.bd.materialFuente.findMany({ where: { proyectoId }, select: { estado: true } });
    if (!materiales.length) throw rechazo('SIN_MATERIAL', 'Agrega el material del cliente o el tema antes de generar');
    if (materiales.some((m) => m.estado === 'pendiente' || m.estado === 'procesando')) {
      throw rechazo('MATERIAL_EN_PROCESO', 'Espera a que termine la lectura del material');
    }
    if (!materiales.some((m) => m.estado === 'listo')) throw rechazo('SIN_MATERIAL', 'Ningún material se pudo leer; revisa los archivos');

    const parametros = {
      pantallas: dto.pantallas ?? p.pantallasObjetivo, idiomas: dto.idiomas ?? p.idiomas, publico: dto.publico ?? p.publico,
      tono: dto.tono ?? p.tono, porcentajeActividades: dto.porcentajeActividades ?? p.porcentajeActividades ?? 40,
    };
    const g = await this.bd.$transaction(async (tx) => {
      // Cerrojo por proyecto: dos clics simultáneos no crean dos generaciones (CP-037).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${proyectoId}))`;
      const activa = await tx.generacion.findFirst({ where: { proyectoId, estado: { in: [...ACTIVOS] } }, select: { id: true } });
      if (activa) throw new ConflictException({ codigo: 'GENERACION_ACTIVA', mensaje: 'Ya hay una generación en curso para este proyecto', detalles: [{ generacionId: activa.id }] });
      const nueva = await tx.generacion.create({
        data: {
          organizacionId: p.organizacionId, proyectoId, iniciadoPorId: u.id, parametros: parametros as Prisma.InputJsonValue,
          etapas: { create: ETAPAS.map((etapa, i) => ({ etapa, orden: i + 1 })) },
        },
        include: conEtapas,
      });
      await tx.proyecto.update({ where: { id: proyectoId }, data: { estado: 'GENERANDO' } });
      await tx.auditoria.create({
        data: { organizacionId: p.organizacionId, usuarioId: u.id, accion: 'GENERACION_LANZADA', entidad: 'Generacion', entidadId: nueva.id, datos: parametros as Prisma.InputJsonValue },
      });
      return nueva;
    });
    await this.encolar(g, 1);
    return aDto(g);
  }

  /** CP-045: se conserva lo terminado; lo que estaba en cola o en curso queda cancelado y se puede continuar. */
  async cancelar(u: UsuarioSesion, id: string): Promise<GeneracionDto> {
    const g = await this.generacion(u, id);
    if (!ACTIVOS.includes(g.estado)) throw new ConflictException({ codigo: 'GENERACION_TERMINADA', mensaje: 'La generación ya terminó' });
    await this.bd.$transaction([
      this.bd.generacion.update({ where: { id }, data: { estado: 'CANCELADO', terminadoEn: new Date() } }),
      this.bd.generacionEtapa.updateMany({ where: { generacionId: id, estado: { in: ['EN_COLA', 'EN_CURSO'] } }, data: { estado: 'CANCELADO' } }),
      this.bd.proyecto.update({ where: { id: g.proyectoId }, data: { estado: 'BORRADOR' } }),
      this.bd.auditoria.create({ data: { organizacionId: g.organizacionId, usuarioId: u.id, accion: 'GENERACION_CANCELADA', entidad: 'Generacion', entidadId: id } }),
    ]);
    return aDto(await this.generacion(u, id));
  }

  /** HU-0408: retoma desde la etapa con error o cancelada; las etapas terminadas no se repiten. */
  async continuar(u: UsuarioSesion, id: string): Promise<GeneracionDto> {
    const g = await this.generacion(u, id);
    if (g.estado !== 'ERROR' && g.estado !== 'CANCELADO') throw new ConflictException({ codigo: 'GENERACION_NO_RETOMABLE', mensaje: 'Solo se continúa una generación cancelada o con error' });
    await this.bd.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${g.proyectoId}))`;
      const otra = await tx.generacion.findFirst({ where: { proyectoId: g.proyectoId, estado: { in: [...ACTIVOS] } }, select: { id: true } });
      if (otra) throw new ConflictException({ codigo: 'GENERACION_ACTIVA', mensaje: 'Ya hay una generación en curso para este proyecto' });
      await tx.generacionEtapa.updateMany({ where: { generacionId: id, estado: { in: ['ERROR', 'CANCELADO'] } }, data: { estado: 'EN_COLA', detalle: Prisma.DbNull, inicio: null, fin: null } });
      await tx.generacion.update({ where: { id }, data: { estado: 'EN_COLA', terminadoEn: null } });
      await tx.proyecto.update({ where: { id: g.proyectoId }, data: { estado: 'GENERANDO' } });
      await tx.auditoria.create({ data: { organizacionId: g.organizacionId, usuarioId: u.id, accion: 'GENERACION_CONTINUADA', entidad: 'Generacion', entidadId: id } });
    });
    const intento = (await this.bd.auditoria.count({ where: { entidadId: id, accion: 'GENERACION_CONTINUADA' } })) + 1;
    const actual = await this.generacion(u, id);
    await this.encolar(actual, intento);
    return aDto(actual);
  }

  private async encolar(g: GeneracionCompleta, intento: number) {
    try {
      await this.colas.encolar('ia', { trabajoId: g.id, organizacionId: g.organizacionId, tarea: TAREA_GENERAR }, `${g.id}:${intento}`);
    } catch (e) {
      // Sin cola nadie la procesaría: queda en error y se puede continuar luego.
      await this.bd.generacion.update({ where: { id: g.id }, data: { estado: 'ERROR', terminadoEn: new Date() } });
      await this.bd.proyecto.update({ where: { id: g.proyectoId }, data: { estado: 'BORRADOR' } });
      throw e;
    }
  }

  private async proyecto(u: UsuarioSesion, id: string) {
    const p = await this.bd.proyecto.findFirst({ where: { id, ...this.alcanceProyecto(u) } });
    if (!p) throw new NotFoundException('Proyecto no encontrado');
    return p;
  }

  private async generacion(u: UsuarioSesion, id: string): Promise<GeneracionCompleta> {
    const g = await this.bd.generacion.findFirst({ where: { id, proyecto: this.alcanceProyecto(u) }, include: conEtapas });
    if (!g) throw new NotFoundException('Generación no encontrada');
    return g;
  }
}
