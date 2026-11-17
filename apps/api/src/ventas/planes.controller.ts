import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Publico, Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { AjustesPlanesDto, OrdenPlanesDto, PlanDto, PlanEntradaDto, PlanesDto, PlanPublicoDto } from './planes.dto.js';
import { PlanesService } from './planes.service.js';

/** HU-1702 · Ventas › Planes (REQ-082, PNT-35). Solo el superadmin. Sin borrar: un plan se oculta. */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('ventas/planes')
@Roles('SUPERADMIN')
export class PlanesController {
  constructor(private readonly planes: PlanesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PlanesDto })
  listar(): Promise<PlanesDto> {
    return this.planes.listar();
  }

  @Post()
  @ApiCreatedResponse({ type: PlanDto, description: 'Nace oculto salvo que llegue `visible: true`. Auditoría PLAN_CREADO' })
  @ApiConflictResponse({ description: 'SLUG_EN_USO' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  crear(@UsuarioActual() u: UsuarioSesion, @Body() dto: PlanEntradaDto): Promise<PlanDto> {
    return this.planes.crear(u, dto);
  }

  @Get('ajustes')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AjustesPlanesDto })
  ajustes(): Promise<AjustesPlanesDto> {
    return this.planes.leerAjustes();
  }

  @Put('ajustes')
  @ApiOkResponse({ type: AjustesPlanesDto, description: 'Auditoría PLAN_AJUSTES_ACTUALIZADOS' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO' })
  guardarAjustes(@UsuarioActual() u: UsuarioSesion, @Body() dto: AjustesPlanesDto): Promise<AjustesPlanesDto> {
    return this.planes.guardarAjustes(u, dto);
  }

  @Put('orden')
  @ApiOkResponse({ type: PlanesDto, description: 'Auditoría PLAN_ORDEN_CAMBIADO' })
  @ApiUnprocessableEntityResponse({ description: 'ORDEN_INCOMPLETO: faltan planes o se repiten' })
  ordenar(@UsuarioActual() u: UsuarioSesion, @Body() dto: OrdenPlanesDto): Promise<PlanesDto> {
    return this.planes.ordenar(u, dto.ids);
  }

  @Patch(':id')
  @ApiOkResponse({ type: PlanDto, description: 'Al destacarlo, los demás dejan de estarlo. Auditoría PLAN_EDITADO' })
  @ApiNotFoundResponse({ description: 'El plan no existe' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO, o SLUG_FIJO si cambia el identificador' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanEntradaDto): Promise<PlanDto> {
    return this.planes.cambiar(u, id, dto);
  }
}

/** HU-1702 · El plan publicado, sin sesión: lo usa el resumen del pago (CP-141) y da 404 si está oculto (CP-142). */
@ApiTags('Sitio público')
@Controller('publico/planes')
@Publico()
export class PlanesPublicoController {
  constructor(private readonly planes: PlanesService) {}

  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PlanPublicoDto })
  @ApiNotFoundResponse({ description: 'No existe, está oculto o la versión publicada no muestra planes' })
  publico(@Param('slug') slug: string): Promise<PlanPublicoDto> {
    return this.planes.publico(slug);
  }
}
