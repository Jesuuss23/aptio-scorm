import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Roles } from '../comun/roles.js';
import { PaginaSitioDto } from './sitio.dto.js';

/**
 * HU-1501 · Sitio web (M16, ADR-011): todas las rutas `/sitio/*` son solo del superadmin de plataforma. El
 * administrador de cada organización y el resto de los roles reciben 403 (CP-109).
 */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@Controller('sitio')
@Roles('SUPERADMIN')
export class SitioController {
  @Get('paginas')
  @ApiOkResponse({ type: PaginaSitioDto, isArray: true, description: 'Páginas del sitio comercial. Vacía hasta la HU-1502.' })
  @ApiUnauthorizedResponse({ description: 'Sin sesión' })
  @ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma (CP-109)' })
  paginas(): PaginaSitioDto[] {
    return [];
  }
}
