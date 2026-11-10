import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@aptio/db';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { ClienteCambioDto, ClienteDto, ClienteEntradaDto } from './cliente.dto.js';

const conKit = { kit: { select: { id: true } } } as const;
type ClienteConKit = Prisma.ClienteGetPayload<{ include: typeof conKit }>;

function aDto(c: ClienteConKit): ClienteDto {
  return {
    id: c.id,
    nombre: c.nombre,
    lmsHabitual: c.lmsHabitual,
    idiomas: c.idiomas,
    notas: c.notas,
    retencionDocumentosDias: c.retencionDocumentosDias,
    tieneKit: Boolean(c.kit),
    creadoEn: c.creadoEn.toISOString(),
  };
}

/** Clientes de la organización (M02). El revisor del cliente solo ve el suyo (RN-01-3). */
@Injectable()
export class ClientesService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private alcance(u: UsuarioSesion): Prisma.ClienteWhereInput {
    const organizacionId = organizacionDe(u);
    return u.rol === 'REVISOR_CLIENTE' ? { organizacionId, id: u.clienteId ?? '00000000-0000-0000-0000-000000000000' } : { organizacionId };
  }

  async listar(u: UsuarioSesion, buscar?: string): Promise<ClienteDto[]> {
    const texto = buscar?.trim();
    const clientes = await this.bd.cliente.findMany({
      where: { AND: [this.alcance(u), { activo: true }, texto ? { nombre: { contains: texto, mode: 'insensitive' } } : {}] },
      include: conKit,
      orderBy: { nombre: 'asc' },
    });
    return clientes.map(aDto);
  }

  async ver(u: UsuarioSesion, id: string): Promise<ClienteDto> {
    // AND y no un spread: el alcance del revisor ya fija `id` y no debe poder sobrescribirse.
    const c = await this.bd.cliente.findFirst({ where: { AND: [this.alcance(u), { id }] }, include: conKit });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return aDto(c);
  }

  async crear(u: UsuarioSesion, dto: ClienteEntradaDto): Promise<ClienteDto> {
    const organizacionId = organizacionDe(u);
    await this.nombreLibre(organizacionId, dto.nombre);
    const c = await this.bd.cliente.create({
      data: {
        organizacionId,
        nombre: dto.nombre,
        lmsHabitual: dto.lmsHabitual || null,
        idiomas: dto.idiomas?.length ? dto.idiomas : ['es'],
        notas: dto.notas || null,
        ...(dto.retencionDocumentosDias !== undefined ? { retencionDocumentosDias: dto.retencionDocumentosDias } : {}),
      },
      include: conKit,
    });
    await this.auditar(u, organizacionId, 'CLIENTE_CREADO', c.id, { nombre: c.nombre });
    return aDto(c);
  }

  async actualizar(u: UsuarioSesion, id: string, dto: ClienteCambioDto): Promise<ClienteDto> {
    const organizacionId = organizacionDe(u);
    const actual = await this.bd.cliente.findFirst({ where: { id, organizacionId } });
    if (!actual) throw new NotFoundException('Cliente no encontrado');
    if (dto.nombre !== undefined && dto.nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
      await this.nombreLibre(organizacionId, dto.nombre);
    }
    const c = await this.bd.cliente.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.lmsHabitual !== undefined ? { lmsHabitual: dto.lmsHabitual || null } : {}),
        ...(dto.idiomas !== undefined ? { idiomas: dto.idiomas.length ? dto.idiomas : ['es'] } : {}),
        ...(dto.notas !== undefined ? { notas: dto.notas || null } : {}),
        ...(dto.retencionDocumentosDias !== undefined ? { retencionDocumentosDias: dto.retencionDocumentosDias } : {}),
      },
      include: conKit,
    });
    await this.auditar(u, organizacionId, 'CLIENTE_ACTUALIZADO', id, { cambios: { ...dto } });
    return aDto(c);
  }

  /** Dos clientes con el mismo nombre en una organización confunden la lista y los filtros. */
  private async nombreLibre(organizacionId: string, nombre: string): Promise<void> {
    const repetido = await this.bd.cliente.findFirst({
      where: { organizacionId, activo: true, nombre: { equals: nombre, mode: 'insensitive' } },
      select: { id: true },
    });
    if (repetido) throw new ConflictException({ codigo: 'CLIENTE_EXISTE', mensaje: `Ya existe un cliente llamado «${nombre}»` });
  }

  private async auditar(u: UsuarioSesion, organizacionId: string, accion: string, entidadId: string, datos: object) {
    await this.bd.auditoria.create({
      data: { organizacionId, usuarioId: u.id, accion, entidad: 'Cliente', entidadId, datos: datos as Prisma.InputJsonValue },
    });
  }
}
