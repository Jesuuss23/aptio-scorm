import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Res, StreamableFile } from '@nestjs/common';
import {
  ApiBody, ApiConflictResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PermitidoSuspendida, Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { DatosFacturacionDto, DatosFacturacionEntradaDto, FacturacionOrgDto, MedioPagoDto, MedioPagoEntradaDto } from './facturacion-org.dto.js';
import { FacturacionOrgService } from './facturacion-org.service.js';

/**
 * HU-1711 · Portal de facturación de la organización (REQ-091, CP-153, PNT-40). Solo el administrador y solo lo de su
 * organización. Con la cuenta suspendida también entra: puede descargar y corregir sus datos (HU-1708).
 */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el administrador de la organización' })
@Controller('organizacion')
@Roles('ADMINISTRADOR')
@PermitidoSuspendida()
export class FacturacionOrgController {
  constructor(private readonly facturacion: FacturacionOrgService) {}

  @Get('facturacion')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: FacturacionOrgDto })
  resumen(@UsuarioActual() u: UsuarioSesion): Promise<FacturacionOrgDto> {
    return this.facturacion.resumen(u);
  }

  @Put('facturacion/datos')
  @ApiBody({ type: DatosFacturacionEntradaDto })
  @ApiOkResponse({ type: DatosFacturacionDto, description: 'Rige para los comprobantes nuevos. Auditoría DATOS_FACTURACION_ACTUALIZADOS' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: la factura exige un RUC válido; el correo debe ser válido' })
  guardarDatos(@UsuarioActual() u: UsuarioSesion, @Body() cuerpo: Record<string, unknown>): Promise<DatosFacturacionDto> {
    return this.facturacion.guardarDatos(u, cuerpo);
  }

  @Post('facturacion/medio-pago')
  @HttpCode(200)
  @ApiBody({ type: MedioPagoEntradaDto })
  @ApiOkResponse({ type: MedioPagoDto, description: 'Con la pasarela de pruebas: guarda los 4 últimos dígitos. Auditoría MEDIO_PAGO_ACTUALIZADO' })
  @ApiNotFoundResponse({ description: 'SIN_SUSCRIPCION' })
  @ApiConflictResponse({ description: 'MEDIO_NO_EDITABLE: con Stripe o Culqi el cobro sigue por enlace (SUP-319)' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: solo una tarjeta de prueba, sin CVV' })
  cambiarMedio(@UsuarioActual() u: UsuarioSesion, @Body() cuerpo: Record<string, unknown>): Promise<MedioPagoDto> {
    return this.facturacion.cambiarMedio(u, cuerpo);
  }

  @Get('comprobantes/:id/pdf')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'CP-153 · La representación impresa. Auditoría COMPROBANTE_DESCARGADO' })
  @ApiNotFoundResponse({ description: 'El comprobante no existe o es de otra organización, o ARCHIVO_PENDIENTE' })
  pdf(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return this.descargar(u, id, 'pdf', res);
  }

  @Get('comprobantes/:id/xml')
  @ApiProduces('application/xml')
  @ApiOkResponse({ description: 'CP-153 · El XML UBL 2.1. Auditoría COMPROBANTE_DESCARGADO' })
  @ApiNotFoundResponse({ description: 'El comprobante no existe o es de otra organización, o ARCHIVO_PENDIENTE' })
  xml(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return this.descargar(u, id, 'xml', res);
  }

  private async descargar(u: UsuarioSesion, id: string, formato: 'pdf' | 'xml', res: Response): Promise<StreamableFile> {
    const a = await this.facturacion.archivo(u, id, formato);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${a.nombre.replace(/[^\w.-]/g, '_')}"`);
    return new StreamableFile(a.contenido, { type: a.mime });
  }
}
