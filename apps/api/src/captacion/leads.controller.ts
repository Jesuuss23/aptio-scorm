import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { ConsultaLeadsDto, FiltroLeadsDto, LeadCambioDto, LeadDto, ListaLeadsDto } from './leads.dto.js';
import { LeadsService } from './leads.service.js';

/** HU-1601 · Captación › Leads y CRM (REQ-074, PNT-34): solo el superadmin; 403 al resto y 401 sin sesión. */
@ApiTags('Captación')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('captacion/leads')
@Roles('SUPERADMIN')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ApiOkResponse({ type: ListaLeadsDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: origen, etapa o paginación fuera de rango' })
  listar(@Query() q: ConsultaLeadsDto): Promise<ListaLeadsDto> {
    return this.leads.listar(q);
  }

  @Get('exportar.csv')
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV UTF-8 con los filtros aplicados (hasta 5000 leads); celdas neutralizadas contra fórmulas' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async exportar(@UsuarioActual() u: UsuarioSesion, @Query() f: FiltroLeadsDto, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { csv } = await this.leads.exportar(u, f);
    res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  }

  @Patch(':leadId')
  @ApiOkResponse({ type: LeadDto })
  @ApiNotFoundResponse({ description: 'El lead no existe' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: etapa fuera del catálogo' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('leadId', ParseUUIDPipe) id: string, @Body() dto: LeadCambioDto): Promise<LeadDto> {
    return this.leads.cambiarEtapa(u, id, dto.etapa);
  }
}
