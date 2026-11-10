import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseDatosService } from '../base-datos/base-datos.service.js';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Borrado programado de los documentos del cliente (HU-1404, ADR-009): al entregar un proyecto, cada documento
 * de origen CLIENTE queda marcado para borrarse tras los días de retención del cliente. El borrado lo hace el
 * worker cada día; el curso y los recursos generados se conservan.
 */
@Injectable()
export class RetencionService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  async programarBorrado(organizacionId: string, proyectoId: string, entregadoEn = new Date()): Promise<{ eliminarEn: Date; documentos: number }> {
    const bd = this.baseDatos.cliente;
    const proyecto = await bd.proyecto.findFirst({
      where: { id: proyectoId, organizacionId },
      select: { cliente: { select: { retencionDocumentosDias: true } } },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
    const eliminarEn = new Date(entregadoEn.getTime() + proyecto.cliente.retencionDocumentosDias * DIA_MS);
    const { count } = await bd.recurso.updateMany({ where: { organizacionId, proyectoId, origen: 'CLIENTE' }, data: { eliminarEn } });
    return { eliminarEn, documentos: count };
  }
}
