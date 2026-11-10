import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { FiltroRecursosDto, RecursoDto, SubidaSolicitudDto, SubidaUrlDto } from './recurso.dto.js';
import { RecursosService } from './recursos.service.js';

@ApiTags('Recursos')
@ApiCookieAuth('sesion')
@Controller('recursos')
@Roles(...EQUIPO, 'REVISOR_CLIENTE')
export class RecursosController {
  constructor(private readonly recursos: RecursosService) {}

  @Post('subidas')
  @Roles(...EQUIPO)
  @ApiCreatedResponse({ type: SubidaUrlDto })
  pedirSubida(@UsuarioActual() u: UsuarioSesion, @Body() dto: SubidaSolicitudDto): Promise<SubidaUrlDto> {
    return this.recursos.pedirSubida(u, dto);
  }

  @Post('subidas/:subidaId/confirmar')
  @Roles(...EQUIPO)
  @ApiCreatedResponse({ type: RecursoDto })
  confirmar(@UsuarioActual() u: UsuarioSesion, @Param('subidaId', ParseUUIDPipe) id: string): Promise<RecursoDto> {
    return this.recursos.confirmar(u, id);
  }

  @Get()
  @ApiOkResponse({ type: RecursoDto, isArray: true })
  listar(@UsuarioActual() u: UsuarioSesion, @Query() filtro: FiltroRecursosDto): Promise<RecursoDto[]> {
    return this.recursos.listar(u, filtro);
  }

  @Get(':recursoId')
  @ApiOkResponse({ type: RecursoDto })
  ver(@UsuarioActual() u: UsuarioSesion, @Param('recursoId', ParseUUIDPipe) id: string): Promise<RecursoDto> {
    return this.recursos.ver(u, id);
  }
}
