// HU-0505 · Control de calidad (M05, CP-054): «✦ Revisar con IA» encola IA-12 en la cola ia (el worker recalcula las
// reglas y suma las observaciones de la IA) y descartar marca resuelta una observación de la IA. Las de reglas no se
// descartan: desaparecen al corregir la pantalla.
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TAREA_CALIDAD } from '@aptio/schema/calidad';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { ColasService } from '../trabajos/colas.service.js';
import { aObservacionDto, type ObservacionCambioDto, type ObservacionDto } from './curso.dto.js';
import { CursosService } from './cursos.service.js';
import type { Trabajo202Dto } from './propuesta.dto.js';

/** Orígenes que una persona puede descartar: lo que propone la IA. */
const DESCARTABLES = ['ia'];

@Injectable()
export class CalidadService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly cursos: CursosService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** Encola IA-12; 409 si ya hay una revisión del proyecto en cola o en curso. */
  async revisar(u: UsuarioSesion, cursoId: string): Promise<Trabajo202Dto> {
    const c = await this.cursos.buscar(u, cursoId);
    const activa = await this.bd.trabajoIA.findFirst({ where: { proyectoId: c.proyectoId, tarea: TAREA_CALIDAD, estado: { in: ['EN_COLA', 'EN_CURSO'] } }, select: { id: true } });
    if (activa) throw new ConflictException({ codigo: 'CALIDAD_EN_CURSO', mensaje: 'Ya hay una revisión de calidad en curso para este curso' });
    const t = await this.bd.trabajoIA.create({
      data: { organizacionId: c.organizacionId, proyectoId: c.proyectoId, tarea: TAREA_CALIDAD, tipo: 'CALIDAD', proveedor: '-', modelo: '-' },
    });
    try {
      await this.colas.encolar('ia', { trabajoId: t.id, organizacionId: c.organizacionId, tarea: TAREA_CALIDAD, calidad: { cursoId: c.id } });
    } catch (e) {
      // Sin Redis no queda un trabajo EN_COLA que nadie va a procesar.
      await this.bd.trabajoIA.update({ where: { id: t.id }, data: { estado: 'ERROR', error: 'No se pudo encolar' } });
      throw e;
    }
    return { id: t.id, estado: 'EN_COLA', eventos: '/api/v1/eventos' };
  }

  /** Descarta (o reabre) una observación de la IA. 422 OBSERVACION_DE_REGLA para las de reglas y las demás. */
  async cambiar(u: UsuarioSesion, observacionId: string, dto: ObservacionCambioDto): Promise<ObservacionDto> {
    const o = await this.bd.observacion.findUnique({ where: { id: observacionId } });
    if (!o) throw new NotFoundException('Observación no encontrada');
    // buscar aplica la organización: una observación de otra organización da 404.
    await this.cursos.buscar(u, o.cursoId).catch(() => { throw new NotFoundException('Observación no encontrada'); });
    if (!DESCARTABLES.includes(o.origen)) {
      throw new UnprocessableEntityException({ codigo: 'OBSERVACION_DE_REGLA', mensaje: 'Esta observación sale de las reglas: desaparece al corregir la pantalla' });
    }
    return aObservacionDto(await this.bd.observacion.update({ where: { id: o.id }, data: { resuelta: dto.resuelta } }));
  }
}
