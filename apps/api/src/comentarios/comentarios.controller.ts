import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { ComentarioDto, ComentarioEntradaDto, ResolverComentarioDto } from './comentarios.dto.js';
import { ComentariosService } from './comentarios.service.js';

/** HU-0506 · Comentarios del revisor del cliente y del equipo por pantalla (M05, PNT-20). */
@ApiTags('Revisión')
@ApiCookieAuth('sesion')
@Controller()
export class ComentariosController {
  constructor(private readonly comentarios: ComentariosService) {}

  @Get('cursos/:cursoId/comentarios')
  @Roles(...EQUIPO, 'REVISOR_CLIENTE')
  @ApiOkResponse({ type: ComentarioDto, isArray: true })
  listar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) cursoId: string): Promise<ComentarioDto[]> {
    return this.comentarios.listar(u, cursoId);
  }

  @Post('cursos/:cursoId/comentarios')
  @Roles(...EQUIPO, 'REVISOR_CLIENTE')
  @ApiCreatedResponse({ type: ComentarioDto })
  comentar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) cursoId: string, @Body() dto: ComentarioEntradaDto): Promise<ComentarioDto> {
    return this.comentarios.comentar(u, cursoId, dto);
  }

  @Patch('comentarios/:comentarioId')
  @Roles(...EQUIPO)
  @ApiOkResponse({ type: ComentarioDto, description: 'Resolver o reabrir; el texto no se edita' })
  resolver(@UsuarioActual() u: UsuarioSesion, @Param('comentarioId', ParseUUIDPipe) id: string, @Body() dto: ResolverComentarioDto): Promise<ComentarioDto> {
    return this.comentarios.resolver(u, id, dto.resuelto);
  }
}
