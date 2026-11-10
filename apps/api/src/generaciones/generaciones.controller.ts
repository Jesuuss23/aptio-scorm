// HU-0401 y HU-0408 · Rutas de la generación: lanzar, ver (también en vivo por SSE), cancelar y continuar.
import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Sse, type MessageEvent,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiOkResponse, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { filter, interval, map, merge, type Observable } from 'rxjs';
import { ETAPAS } from '@aptio/schema/generacion';
import { EQUIPO, organizacionDe } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { EventosService } from '../trabajos/eventos.service.js';
import { EtapaResultadoDto, GeneracionDto, GeneracionEntradaDto, NarracionSolicitudDto, RegeneracionDto } from './generacion.dto.js';
import { GeneracionesService } from './generaciones.service.js';

/** Lanzan, cancelan y continúan administración, diseño instruccional y producción (docs/14-modulos.md, M04). */
const CREAN = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR'] as const;
const LATIDO_MS = 15_000;

@ApiTags('Generación')
@ApiCookieAuth('sesion')
@Controller()
@Roles(...EQUIPO, 'REVISOR_CLIENTE')
export class GeneracionesController {
  constructor(
    private readonly generaciones: GeneracionesService,
    private readonly eventos: EventosService,
  ) {}

  @Post('proyectos/:proyectoId/generaciones')
  @Roles(...CREAN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: GeneracionDto, description: 'Una generación activa por proyecto (409 GENERACION_ACTIVA)' })
  lanzar(@UsuarioActual() u: UsuarioSesion, @Param('proyectoId', ParseUUIDPipe) id: string, @Body() dto: GeneracionEntradaDto): Promise<GeneracionDto> {
    return this.generaciones.lanzar(u, id, dto);
  }

  @Post('cursos/:cursoId/narraciones/regenerar')
  @Roles(...EQUIPO)
  @ApiTags('Personaje y voz')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: RegeneracionDto, description: 'HU-0703: continúa las etapas 6 y 7 de la última generación. 409 GENERACION_ACTIVA, 422 SIN_VOZ o IDIOMA_NO_DISPONIBLE' })
  regenerar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Body() dto: NarracionSolicitudDto): Promise<RegeneracionDto> {
    return this.generaciones.regenerarNarraciones(u, id, dto);
  }

  @Get('proyectos/:proyectoId/generaciones')
  @ApiOkResponse({ type: GeneracionDto, isArray: true, description: 'Las 10 más recientes, de la más nueva a la más antigua' })
  listar(@UsuarioActual() u: UsuarioSesion, @Param('proyectoId', ParseUUIDPipe) id: string): Promise<GeneracionDto[]> {
    return this.generaciones.listar(u, id);
  }

  @Get('generaciones/:generacionId')
  @ApiOkResponse({ type: GeneracionDto })
  ver(@UsuarioActual() u: UsuarioSesion, @Param('generacionId', ParseUUIDPipe) id: string): Promise<GeneracionDto> {
    return this.generaciones.ver(u, id);
  }

  @Get('generaciones/:generacionId/etapas/:etapa')
  @ApiParam({ name: 'etapa', enum: ETAPAS })
  @ApiOkResponse({ type: EtapaResultadoDto, description: 'Una etapa que no existe responde 404' })
  verEtapa(
    @UsuarioActual() u: UsuarioSesion,
    @Param('generacionId', ParseUUIDPipe) id: string,
    @Param('etapa') etapa: string,
  ): Promise<EtapaResultadoDto> {
    return this.generaciones.etapa(u, id, etapa);
  }

  @Post('generaciones/:generacionId/cancelar')
  @Roles(...CREAN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: GeneracionDto, description: 'Conserva las etapas terminadas (CP-045)' })
  cancelar(@UsuarioActual() u: UsuarioSesion, @Param('generacionId', ParseUUIDPipe) id: string): Promise<GeneracionDto> {
    return this.generaciones.cancelar(u, id);
  }

  @Post('generaciones/:generacionId/continuar')
  @Roles(...CREAN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: GeneracionDto, description: 'Retoma desde la etapa con error o cancelada (HU-0408)' })
  continuar(@UsuarioActual() u: UsuarioSesion, @Param('generacionId', ParseUUIDPipe) id: string): Promise<GeneracionDto> {
    return this.generaciones.continuar(u, id);
  }

  /** Avance en vivo: event `etapa` con EventoTrabajo (tarea = etapa) y `latido` cada 15 s. */
  @Sse('generaciones/:generacionId/eventos')
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Flujo SSE: event `etapa` con EventoTrabajo; event `latido` cada 15 s' })
  async flujo(@UsuarioActual() u: UsuarioSesion, @Param('generacionId', ParseUUIDPipe) id: string): Promise<Observable<MessageEvent>> {
    await this.generaciones.acceso(u, id);
    const eventos = await this.eventos.flujo(organizacionDe(u));
    return merge(
      eventos.pipe(
        filter((e) => e.trabajoId === id),
        map((e): MessageEvent => ({ type: 'etapa', id: `${e.tarea}:${e.estado}:${e.progreso}`, data: e })),
      ),
      interval(LATIDO_MS).pipe(map((): MessageEvent => ({ type: 'latido', data: {} }))),
    );
  }
}
