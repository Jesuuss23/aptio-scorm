// HU-1204 · Fichas de compatibilidad por cliente: crear y listar (de la más nueva a la más vieja). El informe del modo
// diagnóstico se guarda tal cual, si es un objeto de menos de 256 KB; es un dato del soporte, no instrucciones.
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { FichaCompatibilidad, Prisma } from '@aptio/db';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { FichaCompatibilidadDto, FichaCompatibilidadEntradaDto } from './ficha.dto.js';

/** Tamaño máximo del informe pegado (el del paquete pesa unos pocos KB con 200 llamadas). */
export const MAXIMO_INFORME = 256 * 1024;

const aDto = (f: FichaCompatibilidad): FichaCompatibilidadDto => ({
  id: f.id, lmsNombre: f.lmsNombre, lmsVersion: f.lmsVersion, limiteSubidaMb: f.limiteSubidaMb, notas: f.notas,
  resultadoDiagnostico: (f.resultadoDiagnostico as Record<string, unknown> | null) ?? null, actualizadoEn: f.actualizadoEn.toISOString(),
});

@Injectable()
export class FichasService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private async cliente(u: UsuarioSesion, id: string) {
    const c = await this.bd.cliente.findFirst({ where: { id, organizacionId: organizacionDe(u) }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return c;
  }

  async listar(u: UsuarioSesion, clienteId: string): Promise<FichaCompatibilidadDto[]> {
    await this.cliente(u, clienteId);
    const fichas = await this.bd.fichaCompatibilidad.findMany({ where: { clienteId }, orderBy: { actualizadoEn: 'desc' } });
    return fichas.map(aDto);
  }

  async crear(u: UsuarioSesion, clienteId: string, dto: FichaCompatibilidadEntradaDto): Promise<FichaCompatibilidadDto> {
    await this.cliente(u, clienteId);
    const informe = dto.resultadoDiagnostico;
    if (informe !== undefined && (Array.isArray(informe) || JSON.stringify(informe).length > MAXIMO_INFORME)) {
      throw new UnprocessableEntityException({ codigo: 'DIAGNOSTICO_NO_VALIDO', mensaje: 'El informe de diagnóstico debe ser el JSON que copia el paquete (un objeto de menos de 256 KB)' });
    }
    const f = await this.bd.fichaCompatibilidad.create({
      data: {
        clienteId, lmsNombre: dto.lmsNombre, lmsVersion: dto.lmsVersion || null, limiteSubidaMb: dto.limiteSubidaMb ?? null, notas: dto.notas || null,
        ...(informe ? { resultadoDiagnostico: informe as Prisma.InputJsonValue } : {}),
      },
    });
    await this.bd.auditoria.create({ data: { organizacionId: organizacionDe(u), usuarioId: u.id, accion: 'FICHA_LMS_CREADA', entidad: 'FichaCompatibilidad', entidadId: f.id, datos: { clienteId, lmsNombre: f.lmsNombre } } }).catch(() => undefined);
    return aDto(f);
  }
}
