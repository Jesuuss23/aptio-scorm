import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { ConsultaLeadsDto, FiltroLeadsDto, LeadCambioDto, LeadDto, ListaLeadsDto, TitularEliminacionDto, TitularEliminadoDto } from './leads.dto.js';
import { SincronizacionDto } from './crm.dto.js';
import { CrmService } from './crm.service.js';
import { LeadsService } from './leads.service.js';

/** HU-1601 · Captación › Leads y CRM (REQ-074, PNT-34): solo el superadmin; 403 al resto y 401 sin sesión. */
@ApiTags('Captación')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('captacion/leads')
@Roles('SUPERADMIN')
export class LeadsController {
  constructor(private readonly leads: LeadsService, private readonly crm: CrmService) {}

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

  /** SUP-237 · Borrar los datos de una persona a su pedido (Ley 29733). Va antes de `:leadId` para no confundirse. */
  @Post('eliminar-titular')
  @HttpCode(200)
  @ApiOkResponse({ type: TitularEliminadoDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: correo o motivo' })
  eliminarTitular(@UsuarioActual() u: UsuarioSesion, @Body() dto: TitularEliminacionDto): Promise<TitularEliminadoDto> {
    return this.leads.eliminarTitular(u, dto);
  }

  @Patch(':leadId')
  @ApiOkResponse({ type: LeadDto })
  @ApiNotFoundResponse({ description: 'El lead no existe' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: etapa fuera del catálogo' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('leadId', ParseUUIDPipe) id: string, @Body() dto: LeadCambioDto): Promise<LeadDto> {
    return this.leads.cambiarEtapa(u, id, dto.etapa);
  }

  /** HU-1602 · «Reintentar»: vuelve a encolar el lead en las conexiones activas que no lo tienen enviado (RN-17-2). */
  @Post(':leadId/sincronizar')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: SincronizacionDto })
  @ApiNotFoundResponse({ description: 'El lead no existe' })
  @ApiUnprocessableEntityResponse({ description: 'SIN_CONEXIONES: no hay ninguna conexión activa' })
  @ApiServiceUnavailableResponse({ description: 'COLA_NO_DISPONIBLE: Redis no respondió' })
  async sincronizar(@UsuarioActual() u: UsuarioSesion, @Param('leadId', ParseUUIDPipe) id: string): Promise<SincronizacionDto> {
    return { encolados: await this.crm.sincronizar(u, id) };
  }
}
