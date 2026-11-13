import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { BloquesService } from './bloques.service.js';
import { BloqueSitioCambioDto, BloqueSitioDto, BloqueSitioEntradaDto, OrdenBloquesDto } from './sitio.dto.js';

/** HU-1503 · Bloques de una página (REQ-066, PNT-26): solo el superadmin; 403 al resto y 401 sin sesión. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma (CP-109)' })
@ApiNotFoundResponse({ description: 'La página o el bloque no existen' })
@Controller('sitio/paginas/:paginaId/bloques')
@Roles('SUPERADMIN')
export class BloquesController {
  constructor(private readonly bloques: BloquesService) {}

  @Get()
  @ApiOkResponse({ type: BloqueSitioDto, isArray: true, description: 'Visibles y ocultos, por orden' })
  listar(@Param('paginaId', ParseUUIDPipe) paginaId: string): Promise<BloqueSitioDto[]> {
    return this.bloques.listar(paginaId);
  }

  @Post()
  @ApiCreatedResponse({ type: BloqueSitioDto, description: 'Al final y oculto (RN-16-2)' })
  @ApiUnprocessableEntityResponse({ description: 'Tipo fuera del catálogo o AJUSTES_GRANDES' })
  agregar(@UsuarioActual() u: UsuarioSesion, @Param('paginaId', ParseUUIDPipe) paginaId: string, @Body() dto: BloqueSitioEntradaDto): Promise<BloqueSitioDto> {
    return this.bloques.agregar(u, paginaId, dto);
  }

  @Patch()
  @ApiOkResponse({ type: BloqueSitioDto, isArray: true, description: 'Bloques en el orden nuevo (CP-113)' })
  @ApiUnprocessableEntityResponse({ description: 'ORDEN_INVALIDO: faltan, sobran o se repiten bloques' })
  ordenar(@UsuarioActual() u: UsuarioSesion, @Param('paginaId', ParseUUIDPipe) paginaId: string, @Body() dto: OrdenBloquesDto): Promise<BloqueSitioDto[]> {
    return this.bloques.ordenar(u, paginaId, dto.orden);
  }

  @Patch(':bloqueId')
  @ApiOkResponse({ type: BloqueSitioDto, description: 'Mostrado u ocultado; los ajustes se conservan (CP-112)' })
  cambiar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('paginaId', ParseUUIDPipe) paginaId: string,
    @Param('bloqueId', ParseUUIDPipe) bloqueId: string,
    @Body() dto: BloqueSitioCambioDto,
  ): Promise<BloqueSitioDto> {
    return this.bloques.cambiar(u, paginaId, bloqueId, dto.visible);
  }

  @Delete(':bloqueId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrado; el resto se reordena sin huecos' })
  borrar(@UsuarioActual() u: UsuarioSesion, @Param('paginaId', ParseUUIDPipe) paginaId: string, @Param('bloqueId', ParseUUIDPipe) bloqueId: string): Promise<void> {
    return this.bloques.borrar(u, paginaId, bloqueId);
  }
}
