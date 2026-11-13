import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { idiomaDeFila } from '@aptio/schema/sitio-contenido';
import {
  ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { ConsultaNavegacionDto, EnlaceSitioCambioDto, EnlaceSitioDto, EnlaceSitioEntradaDto, NavegacionSitioDto, OrdenEnlacesDto } from './navegacion.dto.js';
import { NavegacionService } from './navegacion.service.js';

/** HU-1506 · Menú principal y pie de página (REQ-066, PNT-25): solo el superadmin; 403 al resto y 401 sin sesión. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma (CP-109)' })
@Controller('sitio/navegacion')
@Roles('SUPERADMIN')
export class NavegacionController {
  constructor(private readonly navegacion: NavegacionService) {}

  @Get()
  @ApiOkResponse({ type: NavegacionSitioDto, description: 'Menú y pie completos, visibles y ocultos, por orden' })
  listar(@Query() q: ConsultaNavegacionDto): Promise<NavegacionSitioDto> {
    return this.navegacion.listar(idiomaDeFila({ idioma: q.idioma ?? null }));
  }

  @Post()
  @ApiCreatedResponse({ type: EnlaceSitioDto, description: 'Al final de su grupo y oculto (RN-16-2)' })
  @ApiUnprocessableEntityResponse({ description: 'DATOS_NO_VALIDOS (texto o ruta) o UBICACION_INVALIDA (menú con padre, nieto en el pie, columna inexistente o de otro idioma)' })
  agregar(@UsuarioActual() u: UsuarioSesion, @Body() dto: EnlaceSitioEntradaDto): Promise<EnlaceSitioDto> {
    return this.navegacion.agregar(u, dto);
  }

  @Patch()
  @ApiOkResponse({ type: EnlaceSitioDto, isArray: true, description: 'El grupo en el orden nuevo' })
  @ApiUnprocessableEntityResponse({ description: 'ORDEN_INVALIDO: faltan, sobran, se repiten o son de otro grupo' })
  ordenar(@UsuarioActual() u: UsuarioSesion, @Body() dto: OrdenEnlacesDto): Promise<EnlaceSitioDto[]> {
    return this.navegacion.ordenar(u, dto.zona, dto.padreId ?? null, dto.orden, idiomaDeFila({ idioma: dto.idioma ?? null }));
  }

  @Patch(':enlaceId')
  @ApiOkResponse({ type: EnlaceSitioDto })
  @ApiNotFoundResponse({ description: 'El enlace no existe' })
  @ApiUnprocessableEntityResponse({ description: 'DATOS_NO_VALIDOS o SIN_CAMBIOS' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('enlaceId', ParseUUIDPipe) id: string, @Body() dto: EnlaceSitioCambioDto): Promise<EnlaceSitioDto> {
    return this.navegacion.cambiar(u, id, dto);
  }

  @Delete(':enlaceId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrado (una columna, con sus enlaces); los hermanos se reordenan sin huecos' })
  @ApiNotFoundResponse({ description: 'El enlace no existe' })
  borrar(@UsuarioActual() u: UsuarioSesion, @Param('enlaceId', ParseUUIDPipe) id: string): Promise<void> {
    return this.navegacion.borrar(u, id);
  }
}
