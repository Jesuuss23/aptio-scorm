import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { CrmCambioDto, CrmDto, PruebaCrmDto } from './crm.dto.js';
import { CrmService } from './crm.service.js';

/** HU-1602 · Captación › Leads y CRM: conexiones, mapeo y webhook firmado (REQ-075, PNT-34). Solo el superadmin. */
@ApiTags('Captación')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('captacion/crm')
@Roles('SUPERADMIN')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CrmDto })
  estado(): Promise<CrmDto> {
    return this.crm.estado();
  }

  @Patch()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CrmDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO (con `detalles`), FALTA_CLAVE o FALTA_URL' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Body() dto: CrmCambioDto): Promise<CrmDto> {
    return this.crm.cambiar(u, dto);
  }

  @Post('webhook/secreto')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CrmDto })
  regenerar(@UsuarioActual() u: UsuarioSesion): Promise<CrmDto> {
    return this.crm.regenerarSecreto(u);
  }

  @Post(':tipo/probar')
  @HttpCode(200)
  @ApiOkResponse({ type: PruebaCrmDto, description: '`ok` false con el motivo si el CRM o el webhook no respondieron bien' })
  @ApiNotFoundResponse({ description: 'La conexión no existe' })
  @ApiUnprocessableEntityResponse({ description: 'FALTA_URL o FALTA_SECRETO del webhook' })
  probar(@UsuarioActual() u: UsuarioSesion, @Param('tipo') tipo: string): Promise<PruebaCrmDto> {
    return this.crm.probar(u, tipo);
  }
}
