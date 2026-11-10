import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { AprobacionDto, CambioResultadoDto, FiltroObservacionesDto, ObservacionDto, PantallaCambioDto } from './curso.dto.js';
import { CursosService } from './cursos.service.js';

/** docs/14-modulos.md: editan pantallas todos los del equipo; aprueban administración y diseño instruccional. */
const APRUEBAN = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL'] as const;

@ApiTags('Revisión')
@ApiCookieAuth('sesion')
@Controller('cursos/:cursoId')
@Roles(...EQUIPO)
export class CursosController {
  constructor(private readonly cursos: CursosService) {}

  @Get('observaciones')
  @Roles(...EQUIPO, 'REVISOR_CLIENTE')
  @ApiOkResponse({ type: ObservacionDto, isArray: true })
  observaciones(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Query() f: FiltroObservacionesDto): Promise<ObservacionDto[]> {
    return this.cursos.observaciones(u, id, f);
  }

  @Patch('pantallas/:pantallaId')
  @ApiOkResponse({ type: CambioResultadoDto, description: 'La pantalla vuelve a borrador (RN-05-2). 409 si la versión cambió.' })
  editar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Param('pantallaId') pantallaId: string, @Body() dto: PantallaCambioDto): Promise<CambioResultadoDto> {
    return this.cursos.editar(u, id, pantallaId, dto);
  }

  @Post('pantallas/aprobar')
  @HttpCode(200)
  @Roles(...APRUEBAN)
  @ApiOkResponse({ type: CambioResultadoDto, description: 'soloSinObservaciones = aprobar las que no tienen observaciones abiertas' })
  aprobarVarias(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Body() dto: AprobacionDto): Promise<CambioResultadoDto> {
    return this.cursos.aprobarVarias(u, id, dto);
  }

  @Post('pantallas/:pantallaId/aprobar')
  @HttpCode(200)
  @Roles(...APRUEBAN)
  @ApiOkResponse({ type: CambioResultadoDto })
  @ApiConflictResponse({ description: 'OBSERVACIONES_BLOQUEAN: la pantalla tiene observaciones que bloquean la entrega (RN-05-1)' })
  aprobarUna(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Param('pantallaId') pantallaId: string): Promise<CambioResultadoDto> {
    return this.cursos.aprobarUna(u, id, pantallaId);
  }
}
