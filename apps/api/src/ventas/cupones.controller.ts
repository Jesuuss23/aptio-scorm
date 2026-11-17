import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBody, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { CuponDto, CuponEntradaDto, CuponesDto } from './cupones.dto.js';
import { CuponesService } from './cupones.service.js';

/** HU-1709 · Cupones y convenios (REQ-089, PNT-37): la pestaña Cupones de Ventas › Facturación. Sin borrar: se ocultan. */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('ventas/cupones')
@Roles('SUPERADMIN')
export class CuponesController {
  constructor(private readonly cupones: CuponesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CuponesDto, description: 'Por orden y código, con los usos, el beneficio y el estado (activo, programado, vencido, agotado u oculto)' })
  listar(): Promise<CuponesDto> {
    return this.cupones.listar();
  }

  @Post()
  @HttpCode(201)
  @ApiBody({ type: CuponEntradaDto })
  @ApiCreatedResponse({ type: CuponDto, description: 'Auditoría CUPON_CREADO' })
  @ApiConflictResponse({ description: 'CODIGO_EN_USO' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  crear(@UsuarioActual() u: UsuarioSesion, @Body() cuerpo: Record<string, unknown>): Promise<CuponDto> {
    return this.cupones.crear(u, cuerpo);
  }

  @Patch(':id')
  @ApiBody({ type: CuponEntradaDto, description: 'Solo los campos que cambian (los usos no se editan)' })
  @ApiOkResponse({ type: CuponDto, description: 'Auditoría CUPON_ACTUALIZADO con lo que cambió' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'CODIGO_EN_USO' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO' })
  editar(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() cuerpo: Record<string, unknown>): Promise<CuponDto> {
    return this.cupones.editar(u, id, cuerpo);
  }
}
