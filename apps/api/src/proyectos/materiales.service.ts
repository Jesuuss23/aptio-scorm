import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { MaterialFuente, TipoMaterial } from '@aptio/db';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { ColasService } from '../trabajos/colas.service.js';
import type { MaterialDto, MaterialEntradaDto } from './material.dto.js';

/** Tarea de la cola media que extrae el texto (la procesa apps/worker/src/material.ts). */
export const TAREA_EXTRAER = 'EXTRAER_TEXTO';
/** Tarea de la cola media que transcribe video y audio (apps/worker/src/transcribir.ts, HU-0305). */
export const TAREA_TRANSCRIBIR = 'TRANSCRIBIR';
const NINGUNO = '00000000-0000-0000-0000-000000000000';

const TIPO_POR_MIME: Record<string, TipoMaterial> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'WORD',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'POWERPOINT',
};

const rechazo = (codigo: string, mensaje: string) => new UnprocessableEntityException({ codigo, mensaje });

type DatosRecurso = { nombre: string; metadatos: unknown } | undefined;

function aDto(m: MaterialFuente, r: DatosRecurso): MaterialDto {
  const duracion = (r?.metadatos as { duracionS?: number } | null | undefined)?.duracionS;
  return {
    id: m.id, tipo: m.tipo, recursoId: m.recursoId, nombre: r?.nombre ?? null, tema: m.tema, estado: m.estado, error: m.error,
    paginas: (m.paginas ?? []) as unknown as MaterialDto['paginas'],
    transcripcion: (m.transcripcion ?? []) as unknown as MaterialDto['transcripcion'],
    duracionS: typeof duracion === 'number' ? duracion : null,
    creadoEn: m.creadoEn.toISOString(),
  };
}

/** Material del cliente de un proyecto (HU-0304). El texto se extrae en el worker, fuera de la petición. */
@Injectable()
export class MaterialesService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async listar(u: UsuarioSesion, proyectoId: string): Promise<MaterialDto[]> {
    await this.proyecto(u, proyectoId);
    const materiales = await this.bd.materialFuente.findMany({ where: { proyectoId }, orderBy: { creadoEn: 'asc' } });
    const ids = materiales.map((m) => m.recursoId).filter((x): x is string => Boolean(x));
    const recursos = new Map((await this.bd.recurso.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, metadatos: true } })).map((r) => [r.id, r]));
    return materiales.map((m) => aDto(m, m.recursoId ? recursos.get(m.recursoId) : undefined));
  }

  async agregar(u: UsuarioSesion, proyectoId: string, dto: MaterialEntradaDto): Promise<MaterialDto> {
    const organizacionId = organizacionDe(u);
    await this.proyecto(u, proyectoId);
    if (Boolean(dto.recursoId) === Boolean(dto.tema)) throw rechazo('MATERIAL_INCOMPLETO', 'Envía un archivo subido o el tema, no ambos');

    if (dto.tema) {
      const m = await this.bd.materialFuente.create({ data: { proyectoId, tipo: 'TEMA', tema: dto.tema, estado: 'listo' } });
      await this.auditar(u, organizacionId, m.id, { tipo: 'TEMA' });
      return aDto(m, undefined);
    }

    // El recurso ya pasó por la verificación de tipo real al confirmarse la subida (CP-034).
    const recurso = await this.bd.recurso.findFirst({ where: { id: dto.recursoId!, organizacionId, proyectoId } });
    if (!recurso) throw new NotFoundException('Archivo no encontrado en este proyecto');
    // HU-0305: el video y el audio se transcriben con marcas de tiempo; los documentos se leen por página.
    const medio = recurso.tipo === 'AUDIO' || recurso.tipo === 'VIDEO';
    const tipo: TipoMaterial | undefined = medio ? recurso.tipo as TipoMaterial : TIPO_POR_MIME[recurso.mime];
    if (!tipo) throw rechazo('TIPO_NO_PERMITIDO', 'El material debe ser PDF, Word (.docx), PowerPoint (.pptx), video o audio');
    const existente = await this.bd.materialFuente.findFirst({ where: { proyectoId, recursoId: recurso.id } });
    if (existente) return aDto(existente, recurso);

    const m = await this.bd.materialFuente.create({ data: { proyectoId, tipo, recursoId: recurso.id } });
    try {
      await this.colas.encolar('media', { trabajoId: m.id, organizacionId, tarea: medio ? TAREA_TRANSCRIBIR : TAREA_EXTRAER });
    } catch (e) {
      // Sin Redis no queda un material pendiente que nadie va a procesar.
      await this.bd.materialFuente.update({ where: { id: m.id }, data: { estado: 'error', error: `No se pudo encolar la ${medio ? 'transcripción' : 'extracción'}; intenta de nuevo` } });
      throw e;
    }
    await this.auditar(u, organizacionId, m.id, { tipo, recursoId: recurso.id, nombre: recurso.nombre });
    return aDto(m, recurso);
  }

  private async proyecto(u: UsuarioSesion, id: string) {
    const organizacionId = organizacionDe(u);
    const where = u.rol === 'REVISOR_CLIENTE' ? { id, organizacionId, clienteId: u.clienteId ?? NINGUNO } : { id, organizacionId };
    const p = await this.bd.proyecto.findFirst({ where, select: { id: true } });
    if (!p) throw new NotFoundException('Proyecto no encontrado');
  }

  private async auditar(u: UsuarioSesion, organizacionId: string, entidadId: string, datos: object) {
    await this.bd.auditoria.create({ data: { organizacionId, usuarioId: u.id, accion: 'MATERIAL_AGREGADO', entidad: 'MaterialFuente', entidadId, datos } });
  }
}
