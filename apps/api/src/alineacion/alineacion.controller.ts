import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiConflictResponse, ApiCookieAuth, ApiOkResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { AlineacionCambioDto, AlineacionInformeDto } from './alineacion.dto.js';
import { AlineacionService } from './alineacion.service.js';

/** HU-1001 · Alineación pedagógica (PNT-18). Editan administración y diseño instruccional; diseño gráfico y producción ven. */
@ApiTags('Alineación y navegación')
@ApiCookieAuth('sesion')
@Controller('cursos/:cursoId/alineacion')
export class AlineacionController {
  constructor(private readonly alineacion: AlineacionService) {}

  @Get()
  @Roles(...EQUIPO)
  @ApiOkResponse({ type: AlineacionInformeDto, description: 'Calculado desde el documento; sin costo de IA' })
  informe(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string): Promise<AlineacionInformeDto> {
    return this.alineacion.informe(u, id);
  }

  @Patch()
  @Roles('ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL')
  @ApiOkResponse({ type: AlineacionInformeDto, description: 'Cambia el nivel de Bloom y devuelve el informe con la versión nueva' })
  @ApiConflictResponse({ description: 'VERSION_CAMBIO: otra persona guardó cambios en el curso' })
  @ApiUnprocessableEntityResponse({ description: 'NIVEL_NO_APLICA: el objetivo, la pantalla o la pregunta no existe' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Body() dto: AlineacionCambioDto): Promise<AlineacionInformeDto> {
    return this.alineacion.cambiar(u, id, dto);
  }
}
