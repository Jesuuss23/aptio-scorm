import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { RedireccionCambioDto, RedireccionEntradaDto, RedireccionSitioDto, SeoCambioDto, SeoSitioDto } from './seo.dto.js';
import { SeoService } from './seo.service.js';

const ERRORES_REDIRECCION = 'REDIRECCION_INVALIDA, REDIRECCION_A_SI_MISMA, REDIRECCION_EN_BUCLE, REDIRECCION_EN_CADENA o REDIRECCION_PISA_PAGINA, con los campos (detalles)';

/** HU-1512 · Sitio web › SEO (REQ-071, PNT-29): solo el superadmin; 403 al resto y 401 sin sesión. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('sitio/seo')
@Roles('SUPERADMIN')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get()
  @ApiOkResponse({ type: SeoSitioDto })
  ver(): Promise<SeoSitioDto> {
    return this.seo.ver();
  }

  @Patch()
  @ApiOkResponse({ type: SeoSitioDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con la línea de cada error (detalles)' })
  actualizar(@UsuarioActual() u: UsuarioSesion, @Body() dto: SeoCambioDto): Promise<SeoSitioDto> {
    return this.seo.actualizar(u, dto.robotsExtra);
  }

  @Post('redirecciones')
  @ApiCreatedResponse({ type: RedireccionSitioDto })
  @ApiConflictResponse({ description: 'REDIRECCION_REPETIDA: ya hay una desde ese origen' })
  @ApiUnprocessableEntityResponse({ description: `${ERRORES_REDIRECCION}, o LIMITE_REDIRECCIONES` })
  crear(@UsuarioActual() u: UsuarioSesion, @Body() dto: RedireccionEntradaDto): Promise<RedireccionSitioDto> {
    return this.seo.crearRedireccion(u, dto);
  }

  @Patch('redirecciones/:redireccionId')
  @ApiOkResponse({ type: RedireccionSitioDto })
  @ApiNotFoundResponse({ description: 'La redirección no existe' })
  @ApiConflictResponse({ description: 'REDIRECCION_REPETIDA' })
  @ApiUnprocessableEntityResponse({ description: ERRORES_REDIRECCION })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('redireccionId', ParseUUIDPipe) id: string, @Body() dto: RedireccionCambioDto): Promise<RedireccionSitioDto> {
    return this.seo.cambiarRedireccion(u, id, dto);
  }

  @Delete('redirecciones/:redireccionId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrada' })
  @ApiNotFoundResponse({ description: 'La redirección no existe' })
  borrar(@UsuarioActual() u: UsuarioSesion, @Param('redireccionId', ParseUUIDPipe) id: string): Promise<void> {
    return this.seo.borrarRedireccion(u, id);
  }
}
