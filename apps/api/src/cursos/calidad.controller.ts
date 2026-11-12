import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiConflictResponse, ApiCookieAuth, ApiOkResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { CalidadService } from './calidad.service.js';
import { ObservacionCambioDto, ObservacionDto } from './curso.dto.js';
import { Trabajo202Dto } from './propuesta.dto.js';

/** HU-0505 · Control de calidad (M05). Lo pide y lo descarta el equipo; el revisor del cliente solo ve las observaciones. */
@ApiTags('Revisión')
@ApiCookieAuth('sesion')
@Controller()
@Roles(...EQUIPO)
export class CalidadController {
  constructor(private readonly calidad: CalidadService) {}

  @Post('cursos/:cursoId/control-calidad')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: Trabajo202Dto, description: 'Encola IA-12: reglas y revisión de la IA por lotes de 10 pantallas' })
  @ApiConflictResponse({ description: 'CALIDAD_EN_CURSO: ya hay una revisión en cola o en curso' })
  revisar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string): Promise<Trabajo202Dto> {
    return this.calidad.revisar(u, id);
  }

  @Patch('observaciones/:observacionId')
  @ApiOkResponse({ type: ObservacionDto, description: 'Descarta (resuelta: true) o reabre una observación de la IA' })
  @ApiUnprocessableEntityResponse({ description: 'OBSERVACION_DE_REGLA: las de reglas desaparecen al corregir la pantalla' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('observacionId', ParseUUIDPipe) id: string, @Body() dto: ObservacionCambioDto): Promise<ObservacionDto> {
    return this.calidad.cambiar(u, id, dto);
  }
}
