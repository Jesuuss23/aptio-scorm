import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { PantallaModelo, Prisma } from '@aptio/db';
import { erroresDefinicion, type ModeloParaGenerar, modelosParaGenerar } from '@aptio/schema/marca';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { PantallaModeloDto, PantallaModeloEntradaDto } from './pantalla-modelo.dto.js';

const aDto = (m: PantallaModelo): PantallaModeloDto => ({
  id: m.id,
  disposicion: m.disposicion,
  nombre: m.nombre,
  definicion: m.definicion as Record<string, unknown>,
  miniaturaRecursoId: m.miniaturaRecursoId,
  orden: m.orden,
  activa: m.activa,
});

/** Pantallas modelo que diseña el equipo gráfico para cada cliente (HU-0204). Cambiarlas no regenera contenido. */
@Injectable()
export class PantallasModeloService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async listar(u: UsuarioSesion, clienteId: string, soloActivas = false): Promise<PantallaModeloDto[]> {
    const kitId = await this.kitDe(organizacionDe(u), clienteId);
    const modelos = await this.bd.pantallaModelo.findMany({
      where: { kitId, ...(soloActivas ? { activa: true } : {}) },
      orderBy: [{ disposicion: 'asc' }, { orden: 'asc' }, { nombre: 'asc' }],
    });
    return modelos.map(aDto);
  }

  async crear(u: UsuarioSesion, clienteId: string, dto: PantallaModeloEntradaDto): Promise<PantallaModeloDto> {
    const organizacionId = organizacionDe(u);
    const kitId = await this.kitDe(organizacionId, clienteId);
    this.validar(dto);
    const m = await this.bd.pantallaModelo.create({
      data: {
        kitId, disposicion: dto.disposicion, nombre: dto.nombre, definicion: dto.definicion as Prisma.InputJsonValue,
        orden: dto.orden ?? 0, activa: dto.activa ?? true,
      },
    });
    await this.auditar(u, organizacionId, 'PANTALLA_MODELO_CREADA', m);
    return aDto(m);
  }

  async editar(u: UsuarioSesion, clienteId: string, id: string, dto: PantallaModeloEntradaDto): Promise<PantallaModeloDto> {
    const organizacionId = organizacionDe(u);
    const kitId = await this.kitDe(organizacionId, clienteId);
    await this.modeloDe(kitId, id);
    this.validar(dto);
    const m = await this.bd.pantallaModelo.update({
      where: { id },
      data: {
        disposicion: dto.disposicion, nombre: dto.nombre, definicion: dto.definicion as Prisma.InputJsonValue,
        ...(dto.orden !== undefined ? { orden: dto.orden } : {}),
        ...(dto.activa !== undefined ? { activa: dto.activa } : {}),
      },
    });
    await this.auditar(u, organizacionId, 'PANTALLA_MODELO_EDITADA', m);
    return aDto(m);
  }

  /** Borrado lógico: el modelo deja de usarse pero se conserva para los cursos que ya lo usaron. */
  async desactivar(u: UsuarioSesion, clienteId: string, id: string): Promise<void> {
    const organizacionId = organizacionDe(u);
    const kitId = await this.kitDe(organizacionId, clienteId);
    await this.modeloDe(kitId, id);
    const m = await this.bd.pantallaModelo.update({ where: { id }, data: { activa: false } });
    await this.auditar(u, organizacionId, 'PANTALLA_MODELO_DESACTIVADA', m);
  }

  /**
   * Lo que el generador (IA-15, S2) recibe del kit: por disposición, los modelos activos del cliente o el del
   * estilo base si no tiene (CP-025, CP-026, RN-02-5). Un cliente sin kit usa solo el estilo base.
   */
  async paraGenerar(organizacionId: string, clienteId: string): Promise<ModeloParaGenerar[]> {
    const kit = await this.bd.kitMarca.findFirst({
      where: { clienteId, cliente: { organizacionId } },
      select: { pantallasModelo: { where: { activa: true } } },
    });
    return modelosParaGenerar(kit?.pantallasModelo ?? []);
  }

  private validar(dto: PantallaModeloEntradaDto): void {
    const errores = erroresDefinicion(dto.disposicion, dto.definicion);
    if (errores.length) {
      throw new UnprocessableEntityException({
        codigo: 'DEFINICION_NO_VALIDA',
        mensaje: 'La pantalla modelo no es válida',
        detalles: errores.map((error) => ({ error })),
      });
    }
  }

  private async kitDe(organizacionId: string, clienteId: string): Promise<string> {
    const cliente = await this.bd.cliente.findFirst({ where: { id: clienteId, organizacionId }, select: { kit: { select: { id: true } } } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    if (!cliente.kit) throw new NotFoundException({ codigo: 'SIN_KIT', mensaje: 'Crea el kit antes de agregar pantallas modelo' });
    return cliente.kit.id;
  }

  private async modeloDe(kitId: string, id: string): Promise<void> {
    if (!(await this.bd.pantallaModelo.findFirst({ where: { id, kitId }, select: { id: true } }))) {
      throw new NotFoundException('Pantalla modelo no encontrada');
    }
  }

  private async auditar(u: UsuarioSesion, organizacionId: string, accion: string, m: PantallaModelo) {
    await this.bd.auditoria.create({
      data: { organizacionId, usuarioId: u.id, accion, entidad: 'PantallaModelo', entidadId: m.id, datos: { disposicion: m.disposicion, nombre: m.nombre, activa: m.activa } },
    });
  }
}
