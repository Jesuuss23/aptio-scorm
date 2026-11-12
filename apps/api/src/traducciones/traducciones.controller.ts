import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { Trabajo202Dto } from '../cursos/propuesta.dto.js';
import { FiltroTraduccionesDto, TraduccionCambioDto, TraduccionDto } from './traduccion.dto.js';
import { TraduccionesService } from './traducciones.service.js';

/** HU-0802 · Idiomas (PNT-11). El equipo traduce y revisa; el revisor del cliente solo consulta. */
@ApiTags('Idiomas')
@ApiCookieAuth('sesion')
@Controller()
@Roles(...EQUIPO)
export class TraduccionesController {
  constructor(private readonly traducciones: TraduccionesService) {}

  @Get('cursos/:cursoId/traducciones')
  @Roles(...EQUIPO, 'REVISOR_CLIENTE')
  @ApiOkResponse({ type: TraduccionDto, isArray: true })
  listar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Query() f: FiltroTraduccionesDto): Promise<TraduccionDto[]> {
    return this.traducciones.listar(u, id, f);
  }

  @Post('cursos/:cursoId/traducciones/traducir')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: Trabajo202Dto, description: 'Encola IA-10 con el glosario del cliente; no toca lo REVISADA' })
  traducir(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string): Promise<Trabajo202Dto> {
    return this.traducciones.traducir(u, id);
  }

  @Patch('traducciones/:traduccionId')
  @ApiOkResponse({ type: TraduccionDto, description: 'Editar el inglés crea una versión del curso; el texto queda REVISADA' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('traduccionId', ParseUUIDPipe) id: string, @Body() dto: TraduccionCambioDto): Promise<TraduccionDto> {
    return this.traducciones.cambiar(u, id, dto);
  }
}
