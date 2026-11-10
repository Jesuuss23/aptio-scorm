import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiConflictResponse, ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { CambioResultadoDto } from './curso.dto.js';
import { AplicarPropuestaDto, CursoRestauradoDto, FiltroPropuestasDto, PropuestaDto, PropuestaSolicitudDto, Trabajo202Dto } from './propuesta.dto.js';
import { PropuestasService } from './propuestas.service.js';

/** HU-0504 · Propuestas de la IA. Piden, aplican y descartan los que editan pantallas; el revisor del cliente solo mira. */
@ApiTags('Asistente IA')
@ApiCookieAuth('sesion')
@Controller()
@Roles(...EQUIPO)
export class PropuestasController {
  constructor(private readonly propuestas: PropuestasService) {}

  @Post('cursos/:cursoId/propuestas')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: Trabajo202Dto, description: 'Encola IA-16; la propuesta aparece en GET /cursos/{id}/propuestas cuando el trabajo termina' })
  pedir(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Body() dto: PropuestaSolicitudDto): Promise<Trabajo202Dto> {
    return this.propuestas.pedir(u, id, dto);
  }

  @Get('cursos/:cursoId/propuestas')
  @ApiOkResponse({ type: PropuestaDto, isArray: true })
  listar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Query() f: FiltroPropuestasDto): Promise<PropuestaDto[]> {
    return this.propuestas.listar(u, id, f);
  }

  @Post('propuestas/:propuestaId/aplicar')
  @HttpCode(200)
  @ApiOkResponse({ type: CambioResultadoDto, description: 'Crea una versión del curso; la pantalla vuelve a borrador' })
  @ApiConflictResponse({ description: 'PROPUESTA_VENCIDA: la pantalla cambió desde la versión base (RN-05-4) · PROPUESTA_RESUELTA' })
  aplicar(@UsuarioActual() u: UsuarioSesion, @Param('propuestaId', ParseUUIDPipe) id: string, @Body() dto: AplicarPropuestaDto): Promise<CambioResultadoDto> {
    return this.propuestas.aplicar(u, id, dto);
  }

  @Post('propuestas/:propuestaId/descartar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  descartar(@UsuarioActual() u: UsuarioSesion, @Param('propuestaId', ParseUUIDPipe) id: string): Promise<void> {
    return this.propuestas.descartar(u, id);
  }

  @Post('cursos/:cursoId/versiones/:version/restaurar')
  @HttpCode(200)
  @ApiTags('Curso')
  @ApiOkResponse({ type: CursoRestauradoDto, description: 'Crea una versión nueva con motivo «restauración»; conserva la narración actual' })
  restaurar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number): Promise<CursoRestauradoDto> {
    return this.propuestas.restaurar(u, id, version);
  }
}
