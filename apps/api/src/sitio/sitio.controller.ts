import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiOkResponse, ApiTags,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { PaginaSitioCambioDto, PaginaSitioDto, PaginaSitioEntradaDto } from './sitio.dto.js';
import { SitioService } from './sitio.service.js';

/**
 * HU-1501 y HU-1502 · Sitio web (M16, ADR-011): todas las rutas `/sitio/*` son solo del superadmin de plataforma. El
 * administrador de cada organización y el resto de los roles reciben 403 (CP-109); sin sesión, 401.
 */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma (CP-109)' })
@Controller('sitio/paginas')
@Roles('SUPERADMIN')
export class SitioController {
  constructor(private readonly sitio: SitioService) {}

  @Get()
  @ApiOkResponse({ type: PaginaSitioDto, isArray: true })
  paginas(): Promise<PaginaSitioDto[]> {
    return this.sitio.listar();
  }

  @Post()
  @ApiCreatedResponse({ type: PaginaSitioDto })
  @ApiConflictResponse({ description: 'RUTA_EN_USO' })
  @ApiUnprocessableEntityResponse({ description: 'Ruta, título o fecha no válidos' })
  crear(@UsuarioActual() u: UsuarioSesion, @Body() dto: PaginaSitioEntradaDto): Promise<PaginaSitioDto> {
    return this.sitio.crear(u, dto);
  }

  @Patch(':paginaId')
  @ApiOkResponse({ type: PaginaSitioDto })
  @ApiConflictResponse({ description: 'RUTA_EN_USO' })
  @ApiUnprocessableEntityResponse({ description: 'RUTA_PUBLICADA, PUBLICAR_EN_PASADO, PUBLICAR_EN_REQUERIDO o PUBLICAR_EN_SIN_PROGRAMAR' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('paginaId', ParseUUIDPipe) id: string, @Body() dto: PaginaSitioCambioDto): Promise<PaginaSitioDto> {
    return this.sitio.cambiar(u, id, dto);
  }

  @Delete(':paginaId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrada' })
  @ApiUnprocessableEntityResponse({ description: 'PAGINA_NO_BORRADOR' })
  borrar(@UsuarioActual() u: UsuarioSesion, @Param('paginaId', ParseUUIDPipe) id: string): Promise<void> {
    return this.sitio.borrar(u, id);
  }
}
