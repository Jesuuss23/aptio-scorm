import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@aptio/db';
import { avanceDe, type DatosTecnicos, perfilPropuesto } from '@aptio/schema/proyecto';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { CursoDto, FiltroProyectosDto, ProyectoCambioDto, ProyectoDto, ProyectoEntradaDto } from './proyecto.dto.js';

const NINGUNO = '00000000-0000-0000-0000-000000000000';
const incluir = { cliente: { select: { nombre: true } }, curso: { select: { documento: true } } } as const;
type ProyectoCompleto = Prisma.ProyectoGetPayload<{ include: typeof incluir }>;

function aDto(p: ProyectoCompleto, costo: number): ProyectoDto {
  const datosTecnicos = (p.datosTecnicos ?? {}) as DatosTecnicos;
  return {
    id: p.id, clienteId: p.clienteId, clienteNombre: p.cliente.nombre, nombre: p.nombre, estado: p.estado,
    idiomas: p.idiomas, modoIdioma: p.modoIdioma, publico: p.publico, tono: p.tono,
    pantallasObjetivo: p.pantallasObjetivo, porcentajeActividades: p.porcentajeActividades,
    datosTecnicos, perfilPropuesto: perfilPropuesto(datosTecnicos), avance: avanceDe(p.curso?.documento ?? null),
    costoIaUsd: costo, creadoEn: p.creadoEn.toISOString(), actualizadoEn: p.actualizadoEn.toISOString(),
  };
}

/** Datos técnicos sin claves vacías: lo que no se sabe no se guarda (RN-03-2). */
function limpiarDatos(d?: DatosTecnicos): Prisma.InputJsonValue {
  return Object.fromEntries(Object.entries(d ?? {}).filter(([, v]) => v !== undefined && v !== '' && v !== null)) as Prisma.InputJsonValue;
}

/** Proyectos de la organización (M03). El revisor del cliente solo ve los de su cliente (RN-01-3). */
@Injectable()
export class ProyectosService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly almacenes: AlmacenService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private alcance(u: UsuarioSesion): Prisma.ProyectoWhereInput {
    const organizacionId = organizacionDe(u);
    return u.rol === 'REVISOR_CLIENTE' ? { organizacionId, clienteId: u.clienteId ?? NINGUNO } : { organizacionId };
  }

  /** Costo de IA acumulado por proyecto (decisión 12). */
  private async costos(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const filas = await this.bd.trabajoIA.groupBy({ by: ['proyectoId'], where: { proyectoId: { in: ids } }, _sum: { costoUsd: true } });
    return new Map(filas.map((f) => [f.proyectoId!, Number(f._sum.costoUsd ?? 0)]));
  }

  async listar(u: UsuarioSesion, f: FiltroProyectosDto): Promise<ProyectoDto[]> {
    const proyectos = await this.bd.proyecto.findMany({
      where: {
        AND: [
          this.alcance(u),
          f.clienteId ? { clienteId: f.clienteId } : {},
          f.estado ? { estado: f.estado } : { estado: { not: 'ARCHIVADO' } },
          f.buscar ? { nombre: { contains: f.buscar, mode: 'insensitive' } } : {},
        ],
      },
      include: incluir,
      orderBy: { actualizadoEn: 'desc' },
      take: 500,
    });
    const costos = await this.costos(proyectos.map((p) => p.id));
    return proyectos.map((p) => aDto(p, costos.get(p.id) ?? 0));
  }

  async ver(u: UsuarioSesion, id: string): Promise<ProyectoDto> {
    const p = await this.buscar(u, id);
    return aDto(p, (await this.costos([p.id])).get(p.id) ?? 0);
  }

  async crear(u: UsuarioSesion, dto: ProyectoEntradaDto): Promise<ProyectoDto> {
    const organizacionId = organizacionDe(u);
    const cliente = await this.cliente(organizacionId, dto.clienteId);
    const idiomas = dto.idiomas?.length ? dto.idiomas : cliente.idiomas.length ? cliente.idiomas : ['es'];
    const p = await this.bd.proyecto.create({
      data: {
        organizacionId, clienteId: cliente.id, nombre: dto.nombre, creadoPorId: u.id, idiomas,
        modoIdioma: dto.modoIdioma ?? (idiomas.length > 1 ? 'mismo-paquete' : 'unico'),
        publico: dto.publico || null, tono: dto.tono ?? null,
        pantallasObjetivo: dto.pantallasObjetivo ?? null, porcentajeActividades: dto.porcentajeActividades ?? null,
        datosTecnicos: limpiarDatos(dto.datosTecnicos),
      },
      include: incluir,
    });
    await this.auditar(u, organizacionId, 'PROYECTO_CREADO', p.id, { nombre: p.nombre, clienteId: p.clienteId });
    return aDto(p, 0);
  }

  async actualizar(u: UsuarioSesion, id: string, dto: ProyectoCambioDto): Promise<ProyectoDto> {
    const organizacionId = organizacionDe(u);
    const actual = await this.buscar(u, id);
    if (dto.clienteId && dto.clienteId !== actual.clienteId) {
      // Con un curso generado, el kit ya se aplicó: cambiar de cliente sería otro proyecto.
      if (actual.curso) throw new ConflictException({ codigo: 'PROYECTO_CON_CURSO', mensaje: 'El proyecto ya tiene curso: no puede cambiar de cliente' });
      await this.cliente(organizacionId, dto.clienteId);
    }
    const idiomas = dto.idiomas ?? actual.idiomas;
    const p = await this.bd.proyecto.update({
      where: { id },
      data: {
        ...(dto.clienteId ? { clienteId: dto.clienteId } : {}),
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.idiomas ? { idiomas } : {}),
        ...(dto.modoIdioma ? { modoIdioma: dto.modoIdioma } : dto.idiomas ? { modoIdioma: idiomas.length > 1 ? 'mismo-paquete' : 'unico' } : {}),
        ...(dto.publico !== undefined ? { publico: dto.publico || null } : {}),
        ...(dto.tono !== undefined ? { tono: dto.tono } : {}),
        ...(dto.pantallasObjetivo !== undefined ? { pantallasObjetivo: dto.pantallasObjetivo } : {}),
        ...(dto.porcentajeActividades !== undefined ? { porcentajeActividades: dto.porcentajeActividades } : {}),
        ...(dto.datosTecnicos ? { datosTecnicos: limpiarDatos(dto.datosTecnicos) } : {}),
      },
      include: incluir,
    });
    await this.auditar(u, organizacionId, 'PROYECTO_EDITADO', id, { campos: Object.keys(dto) });
    return aDto(p, (await this.costos([id])).get(id) ?? 0);
  }

  /** Archivar no borra: el proyecto sale de la lista y se puede consultar con estado=ARCHIVADO. */
  /** HU-1101 · Documento del curso generado (etapa 4). Sin curso todavía: 404. */
  async curso(u: UsuarioSesion, id: string): Promise<CursoDto> {
    await this.buscar(u, id);
    const c = await this.bd.curso.findUnique({ where: { proyectoId: id } });
    if (!c) throw new NotFoundException('El proyecto aún no tiene curso: genera las pantallas en Producción');
    // HU-0702 · La vista previa necesita oír cada narración y mover la boca del personaje: URL firmada de los audios y
    // el SVG (ya saneado al subirlo) en la respuesta, para no depender del CORS del almacenamiento.
    const doc = c.documento as { recursos?: { id: string; tipo: string }[]; modulos?: { capsulas: { pantallas: { bloques: { tipo: string; recursoId?: string }[] }[] }[] }[] };
    // HU-0901 · El video del cliente también va con URL firmada: la vista previa y Video interactivo lo reproducen.
    // HU-0609 · Y las imágenes y SVG del curso (las subidas que muestran los extras), con la misma URL firmada.
    const audios = (doc.recursos ?? []).filter((r) => ['audio', 'video', 'imagen', 'svg'].includes(r.tipo)).map((r) => r.id);
    // HU-0801 · Los WebVTT van como texto, igual que el SVG: son pocos KB y el reproductor los lee sin CORS (SUP-37).
    const vtts = (doc.recursos ?? []).filter((r) => r.tipo === 'subtitulos').map((r) => r.id);
    const personajes = [...new Set((doc.modulos ?? []).flatMap((m) => m.capsulas.flatMap((x) => x.pantallas.flatMap((p) => p.bloques.filter((b) => b.tipo === 'personaje' && b.recursoId).map((b) => b.recursoId!)))))];
    const recursos = await this.bd.recurso.findMany({
      where: { id: { in: [...audios, ...personajes, ...vtts].filter((x) => /^[0-9a-f-]{36}$/i.test(x)) }, organizacionId: c.organizacionId },
      select: { id: true, claveS3: true, nombre: true, mime: true },
    });
    const urlsRecursos: Record<string, string> = {};
    const svgPersonajes: Record<string, string> = {};
    const subtitulos: Record<string, string> = {};
    await Promise.all(recursos.map(async (r) => {
      if (personajes.includes(r.id) && r.mime === 'image/svg+xml') {
        svgPersonajes[r.id] = new TextDecoder().decode(await this.almacenes.almacen.leer(r.claveS3));
      } else if (audios.includes(r.id)) {
        urlsRecursos[r.id] = await this.almacenes.almacen.urlDescarga(r.claveS3, r.nombre);
      } else if (vtts.includes(r.id) && r.mime === 'text/vtt') {
        subtitulos[r.id] = new TextDecoder().decode(await this.almacenes.almacen.leer(r.claveS3));
      }
    }));
    return {
      id: c.id, proyectoId: c.proyectoId, versionEsquema: c.versionEsquema, version: c.version,
      documento: c.documento as Record<string, unknown>, actualizadoEn: c.actualizadoEn.toISOString(), urlsRecursos, svgPersonajes, subtitulos,
    };
  }

  async archivar(u: UsuarioSesion, id: string): Promise<void> {
    const organizacionId = organizacionDe(u);
    await this.buscar(u, id);
    await this.bd.proyecto.update({ where: { id }, data: { estado: 'ARCHIVADO' } });
    await this.auditar(u, organizacionId, 'PROYECTO_ARCHIVADO', id, {});
  }

  private async buscar(u: UsuarioSesion, id: string): Promise<ProyectoCompleto> {
    const p = await this.bd.proyecto.findFirst({ where: { AND: [this.alcance(u), { id }] }, include: incluir });
    if (!p) throw new NotFoundException('Proyecto no encontrado');
    return p;
  }

  private async cliente(organizacionId: string, clienteId: string) {
    const c = await this.bd.cliente.findFirst({ where: { id: clienteId, organizacionId, activo: true }, select: { id: true, idiomas: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return c;
  }

  private async auditar(u: UsuarioSesion, organizacionId: string, accion: string, entidadId: string, datos: Prisma.InputJsonValue) {
    await this.bd.auditoria.create({ data: { organizacionId, usuarioId: u.id, accion, entidad: 'Proyecto', entidadId, datos } });
  }
}
