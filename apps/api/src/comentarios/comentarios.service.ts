import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Comentario } from '@aptio/db';
import { type CursoDoc, pantallasDe } from '@aptio/schema/revision';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { CursosService } from '../cursos/cursos.service.js';
import type { ComentarioDto, ComentarioEntradaDto } from './comentarios.dto.js';

type ConAutores = Comentario & { autor: { id: string; nombre: string; rol: string }; resueltoPor: { nombre: string } | null };
const INCLUIR = { autor: { select: { id: true, nombre: true, rol: true } }, resueltoPor: { select: { nombre: true } } } as const;

const aDto = (c: ConAutores): ComentarioDto => ({
  id: c.id, cursoId: c.cursoId, pantallaId: c.pantallaId, autor: c.autor, texto: c.texto, resuelto: c.resuelto,
  resueltoPor: c.resueltoPor?.nombre ?? null, resueltoEn: c.resueltoEn?.toISOString() ?? null, creadoEn: c.creadoEn.toISOString(),
});

/**
 * HU-0506 · Comentarios por pantalla (REQ-058, CP-055). Comentan el equipo y el revisor del cliente (solo en cursos de su
 * cliente; otro cliente u otra organización dan 404). Resuelve y reabre solo el equipo, con auditoría. El texto no se
 * edita ni se borra, y un comentario no cambia el estado de aprobación de la pantalla.
 */
@Injectable()
export class ComentariosService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly cursos: CursosService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async listar(u: UsuarioSesion, cursoId: string): Promise<ComentarioDto[]> {
    await this.cursos.buscar(u, cursoId);
    const filas = await this.bd.comentario.findMany({ where: { cursoId }, include: INCLUIR, orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }] });
    return filas.map(aDto);
  }

  async comentar(u: UsuarioSesion, cursoId: string, dto: ComentarioEntradaDto): Promise<ComentarioDto> {
    const curso = await this.cursos.buscar(u, cursoId);
    if (!pantallasDe(curso.documento as unknown as CursoDoc).some((p) => p.id === dto.pantallaId)) {
      throw new UnprocessableEntityException({ codigo: 'PANTALLA_NO_EXISTE', mensaje: `La pantalla ${dto.pantallaId} no es de este curso` });
    }
    const c = await this.bd.comentario.create({ data: { cursoId, pantallaId: dto.pantallaId, autorId: u.id, texto: dto.texto }, include: INCLUIR });
    return aDto(c);
  }

  async resolver(u: UsuarioSesion, id: string, resuelto: boolean): Promise<ComentarioDto> {
    const organizacionId = organizacionDe(u);
    const actual = await this.bd.comentario.findFirst({ where: { id, curso: { organizacionId } } });
    if (!actual) throw new NotFoundException('Comentario no encontrado');
    const c = await this.bd.comentario.update({
      where: { id },
      data: resuelto ? { resuelto: true, resueltoPorId: u.id, resueltoEn: new Date() } : { resuelto: false, resueltoPorId: null, resueltoEn: null },
      include: INCLUIR,
    });
    if (actual.resuelto !== resuelto) {
      await this.bd.auditoria.create({
        data: {
          organizacionId, usuarioId: u.id, accion: resuelto ? 'COMENTARIO_RESUELTO' : 'COMENTARIO_REABIERTO', entidad: 'Comentario', entidadId: id,
          datos: { cursoId: actual.cursoId, pantallaId: actual.pantallaId },
        },
      });
    }
    return aDto(c);
  }
}
