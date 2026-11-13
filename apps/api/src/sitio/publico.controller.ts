import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Publico } from '../comun/roles.js';
import { ConsultaPaginaPublicaDto, PaginaPublicaDto } from './sitio.dto.js';
import { idiomaDeFila } from '@aptio/schema/sitio-contenido';
import { ConsultaNavegacionDto, NavegacionPublicadaDto } from './navegacion.dto.js';
import { NavegacionService } from './navegacion.service.js';
import { SitioService } from './sitio.service.js';

/** HU-1502 · Sitio público sin sesión (CP-110): solo lo publicado. Límite de 60 peticiones por minuto por IP. */
@ApiTags('Sitio público')
@ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES: más de 60 peticiones por minuto desde la misma IP' })
@Controller('publico')
@Publico()
export class PublicoController {
  constructor(private readonly sitio: SitioService, private readonly navegacion: NavegacionService) {}

  @Get('paginas')
  @ApiOkResponse({ type: PaginaPublicaDto })
  @ApiNotFoundResponse({ description: 'No existe, o está en borrador o programada (CP-110)' })
  pagina(@Query() q: ConsultaPaginaPublicaDto): Promise<PaginaPublicaDto> {
    return this.sitio.publica(q.ruta, q.idioma ?? 'es');
  }

  /** HU-1506 · CP-118: menú y pie con solo lo visible. La cabecera y el menú de celular usan la misma lista. HU-1510 · Por idioma. */
  @Get('navegacion')
  @ApiOkResponse({ type: NavegacionPublicadaDto })
  navegacionPublica(@Query() q: ConsultaNavegacionDto): Promise<NavegacionPublicadaDto> {
    return this.navegacion.publica(idiomaDeFila({ idioma: q.idioma ?? null }));
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiProduces('application/xml')
  @ApiOkResponse({ description: 'Sitemap con las páginas publicadas', schema: { type: 'string' } })
  sitemap(): Promise<string> {
    return this.sitio.sitemap();
  }
}
