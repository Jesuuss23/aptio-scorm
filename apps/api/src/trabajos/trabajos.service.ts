import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { tareasSimuladas } from '@aptio/ai';
import type { NombreCola } from '@aptio/colas';
import type { TareaProveedor, TrabajoIA } from '@aptio/db';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { ColasService } from './colas.service.js';
import type { TrabajoDto } from './trabajo.dto.js';

/** Cola y tipo de proveedor de cada tarea (docs/06-ia.md). */
export function destinoTarea(tarea: string): { cola: NombreCola; tipo: TareaProveedor } {
  if (tarea === 'VOZ') return { cola: 'voz', tipo: 'VOZ' };
  if (tarea === 'BOCA') return { cola: 'media', tipo: 'BOCA' };
  const tipos: Record<string, TareaProveedor> = { 'IA-10': 'TRADUCCION', 'IA-11': 'IMAGEN', 'IA-12': 'CALIDAD', 'IA-15': 'PANTALLAS' };
  return { cola: tipos[tarea] === 'IMAGEN' ? 'media' : 'ia', tipo: tipos[tarea] ?? 'TEXTO' };
}

function aDto(t: TrabajoIA): TrabajoDto {
  return {
    id: t.id,
    tarea: t.tarea,
    cola: destinoTarea(t.tarea).cola,
    estado: t.estado,
    proveedor: t.proveedor,
    modelo: t.modelo,
    error: t.error,
    duracionMs: t.duracionMs,
    creadoEn: t.creadoEn.toISOString(),
    eventos: '/api/v1/eventos',
  };
}

@Injectable()
export class TrabajosService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly colas: ColasService,
  ) {}

  /** Encola un trabajo con un proveedor simulado (S0): sirve para probar colas y eventos sin gastar. */
  async encolarSimulado(organizacionId: string, tarea: string): Promise<TrabajoDto> {
    if (!tareasSimuladas().includes(tarea)) {
      throw new UnprocessableEntityException({ codigo: 'TAREA_DESCONOCIDA', mensaje: `No hay salida simulada para ${tarea}` });
    }
    const { cola, tipo } = destinoTarea(tarea);
    const t = await this.baseDatos.cliente.trabajoIA.create({
      data: { organizacionId, tarea, tipo, proveedor: 'simulado', modelo: 'caso-loto' },
    });
    try {
      await this.colas.encolar(cola, { trabajoId: t.id, organizacionId, tarea });
    } catch (e) {
      // Sin Redis no queda un trabajo EN_COLA que nadie va a procesar.
      await this.baseDatos.cliente.trabajoIA.update({ where: { id: t.id }, data: { estado: 'ERROR', error: 'No se pudo encolar' } });
      throw e;
    }
    return aDto(t);
  }

  async ver(organizacionId: string, id: string): Promise<TrabajoDto> {
    const t = await this.baseDatos.cliente.trabajoIA.findFirst({ where: { id, organizacionId } });
    if (!t) throw new NotFoundException('Trabajo no encontrado');
    return aDto(t);
  }
}
