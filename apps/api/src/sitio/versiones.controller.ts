import { Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { VersionPublicadaDto, VersionSitioDto, VersionesSitioDto, VistaPreviaPaginaDto } from './versiones.dto.js';
import { VersionesService } from './versiones.service.js';

/** HU-1507 · Publicar cambios, versiones, restaurar y vista previa (REQ-068, RN-16-5): solo el superadmin. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma (CP-109)' })
@Controller('sitio')
@Roles('SUPERADMIN')
export class VersionesController {
  constructor(private readonly versiones: VersionesService) {}

  @Post('publicar')
  @HttpCode(201)
  @ApiCreatedResponse({ type: VersionPublicadaDto, description: 'La versión nueva con el sitio completo' })
  @ApiConflictResponse({ description: 'FICTICIOS_VISIBLES: en producción, con la lista (RN-16-3)' })
  publicar(@UsuarioActual() u: UsuarioSesion): Promise<VersionPublicadaDto> {
    return this.versiones.publicar(u);
  }

  @Get('versiones')
  @ApiOkResponse({ type: VersionesSitioDto })
  listar(): Promise<VersionesSitioDto> {
    return this.versiones.listar();
  }

  @Post('versiones/:numero/restaurar')
  @HttpCode(201)
  @ApiCreatedResponse({ type: VersionSitioDto, description: 'La versión nueva, con la instantánea de la restaurada (CP-119)' })
  @ApiNotFoundResponse({ description: 'La versión no existe' })
  @ApiConflictResponse({ description: 'FICTICIOS_VISIBLES: en producción, si la versión guarda ficticios' })
  @ApiUnprocessableEntityResponse({ description: 'VERSION_ACTUAL: ya es la que ve el sitio' })
  restaurar(@UsuarioActual() u: UsuarioSesion, @Param('numero', ParseIntPipe) numero: number): Promise<VersionSitioDto> {
    return this.versiones.restaurar(u, numero);
  }

  @Get('paginas/:paginaId/vista-previa')
  @ApiOkResponse({ type: VistaPreviaPaginaDto })
  @ApiNotFoundResponse({ description: 'La página no existe' })
  vistaPrevia(@Param('paginaId', ParseUUIDPipe) id: string): Promise<VistaPreviaPaginaDto> {
    return this.versiones.vistaPrevia(id);
  }
}
