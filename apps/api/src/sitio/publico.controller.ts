import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Publico } from '../comun/roles.js';
import { ConsultaPaginaPublicaDto, PaginaPublicaDto } from './sitio.dto.js';
import { idiomaDeFila } from '@aptio/schema/sitio-contenido';
import { ConsultaNavegacionDto, NavegacionPublicadaDto } from './navegacion.dto.js';
import { NavegacionService } from './navegacion.service.js';
import { BlogPublicoDto, ConsultaBlogPublicoDto } from './blog.dto.js';
import { BlogService } from './blog.service.js';
import { SitioService } from './sitio.service.js';

/** HU-1502 · Sitio público sin sesión (CP-110): solo lo publicado. Límite de 60 peticiones por minuto por IP. */
@ApiTags('Sitio público')
@ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES: más de 60 peticiones por minuto desde la misma IP' })
@Controller('publico')
@Publico()
export class PublicoController {
  constructor(private readonly sitio: SitioService, private readonly navegacion: NavegacionService, private readonly blog: BlogService) {}

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

  /** HU-1511 · CP-123 y CP-155: los filtros con su número y los artículos visibles de uno, sin categorías ni artículos ocultos. */
  @Get('blog')
  @ApiOkResponse({ type: BlogPublicoDto })
  @ApiNotFoundResponse({ description: 'La categoría no existe o está oculta' })
  blogPublico(@Query() q: ConsultaBlogPublicoDto): Promise<BlogPublicoDto> {
    return this.blog.publico(q.categoria);
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiProduces('application/xml')
  @ApiOkResponse({ description: 'Sitemap con las páginas publicadas', schema: { type: 'string' } })
  sitemap(): Promise<string> {
    return this.sitio.sitemap();
  }
}
