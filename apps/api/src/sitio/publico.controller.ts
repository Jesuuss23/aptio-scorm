import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Publico } from '../comun/roles.js';
import { ConsultaPaginaPublicaDto, PaginaPublicaDto } from './sitio.dto.js';
import { SitioService } from './sitio.service.js';

/** HU-1502 · Sitio público sin sesión (CP-110): solo lo publicado. Límite de 60 peticiones por minuto por IP. */
@ApiTags('Sitio público')
@ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES: más de 60 peticiones por minuto desde la misma IP' })
@Controller('publico')
@Publico()
export class PublicoController {
  constructor(private readonly sitio: SitioService) {}

  @Get('paginas')
  @ApiOkResponse({ type: PaginaPublicaDto })
  @ApiNotFoundResponse({ description: 'No existe, o está en borrador o programada (CP-110)' })
  pagina(@Query() q: ConsultaPaginaPublicaDto): Promise<PaginaPublicaDto> {
    return this.sitio.publica(q.ruta, q.idioma ?? 'es');
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiProduces('application/xml')
  @ApiOkResponse({ description: 'Sitemap con las páginas publicadas', schema: { type: 'string' } })
  sitemap(): Promise<string> {
    return this.sitio.sitemap();
  }
}
