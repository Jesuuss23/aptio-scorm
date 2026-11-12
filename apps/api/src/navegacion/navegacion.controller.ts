import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiConflictResponse, ApiCookieAuth, ApiOkResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { NavegacionCambioDto, NavegacionDto } from './navegacion.dto.js';
import { NavegacionService } from './navegacion.service.js';

/** HU-1103 · Navegación (PNT-17). Editan administración y diseño instruccional; diseño gráfico y producción ven. */
@ApiTags('Alineación y navegación')
@ApiCookieAuth('sesion')
@Controller('cursos/:cursoId/navegacion')
export class NavegacionController {
  constructor(private readonly navegacion: NavegacionService) {}

  @Get()
  @Roles(...EQUIPO)
  @ApiOkResponse({ type: NavegacionDto })
  ver(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string): Promise<NavegacionDto> {
    return this.navegacion.ver(u, id);
  }

  @Put()
  @Roles('ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL')
  @ApiOkResponse({ type: NavegacionDto, description: 'Guarda patrón y reglas con una versión nueva; patronPreferidoDelCliente = true lo guarda en el kit' })
  @ApiConflictResponse({ description: 'VERSION_CAMBIO: otra persona guardó cambios en el curso' })
  @ApiUnprocessableEntityResponse({ description: 'Valores fuera del esquema, CURSO_NO_VALIDO o SIN_KIT' })
  guardar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Body() dto: NavegacionCambioDto): Promise<NavegacionDto> {
    return this.navegacion.guardar(u, id, dto);
  }
}
