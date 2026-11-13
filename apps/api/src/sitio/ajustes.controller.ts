import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseEnumPipe, Patch, Post, Put, Req } from '@nestjs/common';
import {
  ApiBody, ApiConsumes, ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiPayloadTooLargeResponse, ApiTags, ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { TIPOS_MARCA, type TipoMarca } from '@aptio/schema/sitio-ajustes';
import type { Request } from 'express';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { AjustesSitioCambioDto, AjustesSitioDto, ComprobacionDominioDto } from './ajustes.dto.js';
import { AjustesService } from './ajustes.service.js';

const tipoMarca = new ParseEnumPipe(Object.fromEntries(TIPOS_MARCA.map((t) => [t, t])), { exceptionFactory: () => new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El archivo de marca es logo o favicon' }) });

/** HU-1509 · Configuración › Ajustes del sitio (REQ-073, PNT-38): solo el superadmin. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('sitio/ajustes')
@Roles('SUPERADMIN')
export class AjustesController {
  constructor(private readonly ajustes: AjustesService) {}

  @Get()
  @ApiOkResponse({ type: AjustesSitioDto })
  ver(): Promise<AjustesSitioDto> {
    return this.ajustes.ver();
  }

  @Patch()
  @ApiOkResponse({ type: AjustesSitioDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con los campos (detalles) o SIN_CAMBIOS' })
  actualizar(@UsuarioActual() u: UsuarioSesion, @Body() dto: AjustesSitioCambioDto): Promise<AjustesSitioDto> {
    return this.ajustes.actualizar(u, dto);
  }

  @Put('marca/:tipo')
  @ApiConsumes('image/svg+xml', 'image/png')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({ type: AjustesSitioDto })
  @ApiPayloadTooLargeResponse({ description: 'Más de 200 KB' })
  @ApiUnprocessableEntityResponse({ description: 'ARCHIVO_NO_VALIDO' })
  subirMarca(@UsuarioActual() u: UsuarioSesion, @Param('tipo', tipoMarca) tipo: TipoMarca, @Req() req: Request): Promise<AjustesSitioDto> {
    return this.ajustes.subirMarca(u, tipo, (req.get('content-type') ?? '').split(';')[0]!.trim(), req.body);
  }

  @Delete('marca/:tipo')
  @ApiOkResponse({ type: AjustesSitioDto })
  quitarMarca(@UsuarioActual() u: UsuarioSesion, @Param('tipo', tipoMarca) tipo: TipoMarca): Promise<AjustesSitioDto> {
    return this.ajustes.quitarMarca(u, tipo);
  }

  @Post('correo-prueba')
  @HttpCode(200)
  @ApiOkResponse({ schema: { type: 'object', properties: { para: { type: 'string' } } } })
  @ApiUnprocessableEntityResponse({ description: 'SIN_CORREO_LEADS' })
  correoPrueba(@UsuarioActual() u: UsuarioSesion): Promise<{ para: string }> {
    return this.ajustes.correoPrueba(u);
  }

  @Post('dominio/comprobar')
  @HttpCode(200)
  @ApiOkResponse({ type: ComprobacionDominioDto })
  @ApiUnprocessableEntityResponse({ description: 'SIN_DOMINIO' })
  comprobarDominio(): Promise<ComprobacionDominioDto> {
    return this.ajustes.comprobarDominio();
  }
}
