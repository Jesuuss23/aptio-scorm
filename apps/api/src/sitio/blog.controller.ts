import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { BlogCambioDto, BlogSitioDto, OrdenCategoriasBlogDto, VisibilidadBlogDto } from './blog.dto.js';
import { BlogService } from './blog.service.js';

/** HU-1511 · Sitio web › Blog (REQ-070, PNT-28): solo el superadmin; 403 al resto y 401 sin sesión. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('sitio/blog')
@Roles('SUPERADMIN')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @ApiOkResponse({ type: BlogSitioDto })
  ver(): Promise<BlogSitioDto> {
    return this.blog.ver();
  }

  @Patch()
  @ApiOkResponse({ type: BlogSitioDto, description: 'Con otra URL, la copia anterior se borra y se pide sincronizar' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con los campos (detalles) o SIN_CAMBIOS' })
  actualizar(@UsuarioActual() u: UsuarioSesion, @Body() dto: BlogCambioDto): Promise<BlogSitioDto> {
    return this.blog.actualizar(u, dto);
  }

  @Post('sincronizar')
  @HttpCode(202)
  @ApiAcceptedResponse({ schema: { type: 'object', properties: { encolado: { type: 'boolean' } } }, description: 'El worker lee WordPress en segundos; GET /sitio/blog muestra el resultado' })
  @ApiUnprocessableEntityResponse({ description: 'SIN_URL' })
  @ApiServiceUnavailableResponse({ description: 'COLAS_NO_DISPONIBLES' })
  sincronizar(@UsuarioActual() u: UsuarioSesion): Promise<{ encolado: boolean }> {
    return this.blog.sincronizar(u);
  }

  @Patch('categorias')
  @ApiOkResponse({ type: BlogSitioDto })
  @ApiUnprocessableEntityResponse({ description: 'ORDEN_INVALIDO: faltan, sobran o se repiten' })
  ordenar(@UsuarioActual() u: UsuarioSesion, @Body() dto: OrdenCategoriasBlogDto): Promise<BlogSitioDto> {
    return this.blog.ordenar(u, dto.orden);
  }

  @Patch('categorias/:id')
  @ApiOkResponse({ type: BlogSitioDto })
  @ApiNotFoundResponse({ description: 'La categoría no existe en la copia' })
  categoria(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseIntPipe) id: number, @Body() dto: VisibilidadBlogDto): Promise<BlogSitioDto> {
    return this.blog.categoria(u, id, dto.visible);
  }

  @Patch('articulos/:id')
  @ApiOkResponse({ type: BlogSitioDto })
  @ApiNotFoundResponse({ description: 'El artículo no existe en la copia' })
  articulo(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseIntPipe) id: number, @Body() dto: VisibilidadBlogDto): Promise<BlogSitioDto> {
    return this.blog.articulo(u, id, dto.visible);
  }
}
