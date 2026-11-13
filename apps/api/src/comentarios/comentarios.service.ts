import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Comentario } from '@aptio/db';
import { type CursoDoc, pantallasDe } from '@aptio/schema/revision';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { CorreoService } from '../correo/correo.service.js';
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
 * HU-1403 · Un comentario nuevo del revisor del cliente avisa por correo al equipo del curso (cierra SUP-155) sin
 * esperar el envío: un fallo del correo se registra y el comentario queda publicado igual.
 */
@Injectable()
export class ComentariosService {
  private readonly log = new Logger('Comentarios');
  /** Último aviso enviado, para que las pruebas lo esperen. */
  avisoPendiente: Promise<void> = Promise.resolve();

  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly cursos: CursosService,
    private readonly correo: CorreoService,
    private readonly config: ConfigService,
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
    if (u.rol === 'REVISOR_CLIENTE') {
      this.avisoPendiente = this.avisarEquipo(c, curso.proyectoId).catch((e: unknown) => {
        this.log.error(`No se pudo avisar el comentario ${c.id}: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
    return aDto(c);
  }

  /** Al equipo del curso: quien creó el proyecto y diseño instruccional de la organización, si están activos (SUP-158). */
  private async avisarEquipo(c: ConAutores, proyectoId: string): Promise<void> {
    const proyecto = await this.bd.proyecto.findUniqueOrThrow({ where: { id: proyectoId }, select: { id: true, nombre: true, organizacionId: true, creadoPorId: true } });
    const equipo = await this.bd.usuario.findMany({
      where: {
        organizacionId: proyecto.organizacionId, activo: true, rol: { not: 'REVISOR_CLIENTE' },
        OR: [{ id: proyecto.creadoPorId }, { rol: 'DISENADOR_INSTRUCCIONAL' }],
      },
      select: { email: true },
      orderBy: { email: 'asc' },
    });
    const web = this.config.get<string>('WEB_URL') ?? 'http://localhost:5173';
    const enlace = `${web}/proyectos/${proyecto.id}/revision?pantalla=${encodeURIComponent(c.pantallaId)}`;
    await Promise.all(equipo.map((d) => this.correo.enviar({
      para: d.email,
      asunto: `Aptio SCORM · Nuevo comentario del cliente en «${proyecto.nombre}»`,
      texto: `Hola:\n\n${c.autor.nombre} (revisión del cliente) comentó la pantalla ${c.pantallaId} de «${proyecto.nombre}»:\n\n${c.texto}\n\nRevísalo y resuélvelo en Revisión:\n${enlace}`,
    }).catch((e: unknown) => this.log.error(`No se pudo avisar el comentario ${c.id} a ${d.email}: ${e instanceof Error ? e.message : String(e)}`))));
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
