import {
  Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Sse,
  type MessageEvent,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { interval, map, merge, type Observable } from 'rxjs';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { EventosService } from './eventos.service.js';
import { TrabajoDto, TrabajoSimuladoDto } from './trabajo.dto.js';
import { TrabajosService } from './trabajos.service.js';

/** Roles del equipo de producción: el revisor del cliente no ve los trabajos de toda la organización. */
const EQUIPO = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR'] as const;
const LATIDO_MS = 15_000;

function organizacion(u: UsuarioSesion): string {
  if (!u.organizacionId) throw new ForbiddenException('Esta acción es de una organización');
  return u.organizacionId;
}

@ApiTags('Plataforma')
@ApiCookieAuth('sesion')
@Controller()
@Roles(...EQUIPO)
export class TrabajosController {
  constructor(
    private readonly trabajos: TrabajosService,
    private readonly eventos: EventosService,
  ) {}

  @Post('trabajos/simulados')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: TrabajoDto, description: 'Encola un trabajo con salidas grabadas del caso LOTO. Solo con PROVEEDORES_MODO=simulado.' })
  simulado(@UsuarioActual() u: UsuarioSesion, @Body() dto: TrabajoSimuladoDto): Promise<TrabajoDto> {
    if ((process.env.PROVEEDORES_MODO ?? 'simulado') !== 'simulado') throw new NotFoundException();
    return this.trabajos.encolarSimulado(organizacion(u), dto.tarea);
  }

  @Get('trabajos/:trabajoId')
  @ApiOkResponse({ type: TrabajoDto })
  ver(@UsuarioActual() u: UsuarioSesion, @Param('trabajoId', ParseUUIDPipe) id: string): Promise<TrabajoDto> {
    return this.trabajos.ver(organizacion(u), id);
  }

  /** CP-016: avance de los trabajos de la organización en vivo. Eventos `trabajo` y un `latido` cada 15 s. */
  @Sse('eventos')
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Flujo SSE: event `trabajo` con EventoTrabajo; event `latido` cada 15 s' })
  async flujo(@UsuarioActual() u: UsuarioSesion): Promise<Observable<MessageEvent>> {
    const eventos = await this.eventos.flujo(organizacion(u));
    return merge(
      eventos.pipe(map((e): MessageEvent => ({ type: 'trabajo', id: `${e.trabajoId}:${e.progreso}:${e.estado}`, data: e }))),
      interval(LATIDO_MS).pipe(map((): MessageEvent => ({ type: 'latido', data: {} }))),
    );
  }
}
