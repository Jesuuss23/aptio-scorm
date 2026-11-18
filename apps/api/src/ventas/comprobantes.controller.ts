import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile } from '@nestjs/common';
import {
  ApiBody, ApiConflictResponse, ApiCookieAuth, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiServiceUnavailableResponse, ApiTags,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Publico, Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import {
  ComprobanteDto, ComprobantesDto, DatosFiscalesDto, DatosFiscalesEntradaDto, EventoOseRecibidoDto, FiltroComprobantesDto, ReenvioComprobanteDto,
} from './comprobantes.dto.js';
import { ComprobantesService, type FormatoComprobante } from './comprobantes.service.js';

/** HU-1707 · Ventas › Facturación (REQ-087, PNT-37): los comprobantes electrónicos. Solo el superadmin, con auditoría. */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('ventas/comprobantes')
@Roles('SUPERADMIN')
export class ComprobantesController {
  constructor(private readonly comprobantes: ComprobantesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ComprobantesDto, description: 'Los 200 más recientes, con el filtro por estado SUNAT' })
  listar(@Query() f: FiltroComprobantesDto): Promise<ComprobantesDto> {
    return this.comprobantes.listar({ estado: f.estado });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ComprobanteDto })
  @ApiNotFoundResponse({ description: 'El comprobante no existe' })
  obtener(@Param('id', ParseUUIDPipe) id: string): Promise<ComprobanteDto> {
    return this.comprobantes.obtener(id);
  }

  @Get(':id/pdf')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'La representación impresa. Auditoría COMPROBANTE_DESCARGADO' })
  @ApiNotFoundResponse({ description: 'El comprobante no existe, o ARCHIVO_PENDIENTE: aún no se generó' })
  pdf(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return this.descargar(u, id, 'pdf', res);
  }

  @Get(':id/xml')
  @ApiProduces('application/xml')
  @ApiOkResponse({ description: 'El XML UBL 2.1 (con Mifact, el firmado). Auditoría COMPROBANTE_DESCARGADO' })
  @ApiNotFoundResponse({ description: 'El comprobante no existe, o ARCHIVO_PENDIENTE: aún no se generó' })
  xml(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return this.descargar(u, id, 'xml', res);
  }

  @Get(':id/cdr')
  @ApiProduces('application/xml')
  @ApiOkResponse({ description: 'HU-1712 · La constancia de recepción de SUNAT (CDR) que devuelve Mifact. Auditoría COMPROBANTE_DESCARGADO' })
  @ApiNotFoundResponse({ description: 'El comprobante no existe, o ARCHIVO_PENDIENTE: SUNAT aún no lo acepta (o el proveedor no entrega CDR)' })
  cdr(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    return this.descargar(u, id, 'cdr', res);
  }

  @Post(':id/reenviar')
  @HttpCode(200)
  @ApiBody({ type: ReenvioComprobanteDto })
  @ApiOkResponse({ type: ComprobanteDto, description: 'CP-149 · Receptor corregido y reenviado con el mismo número: queda PENDIENTE hasta que responda el OSE. Auditoría COMPROBANTE_REENVIADO' })
  @ApiNotFoundResponse({ description: 'El comprobante no existe' })
  @ApiConflictResponse({ description: 'COMPROBANTE_NO_REENVIABLE: ya aceptado o rechazado (con Mifact, también el observado)' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: una factura exige un RUC válido; una boleta de más de S/ 700, el DNI; el correo debe ser válido' })
  @ApiServiceUnavailableResponse({ description: 'COLA_NO_DISPONIBLE' })
  reenviar(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() cuerpo: Record<string, unknown>): Promise<ComprobanteDto> {
    return this.comprobantes.reenviar(u, id, cuerpo);
  }

  private async descargar(u: UsuarioSesion, id: string, formato: FormatoComprobante, res: Response): Promise<StreamableFile> {
    const a = await this.comprobantes.archivo(u, id, formato);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${a.nombre.replace(/[^\w.-]/g, '_')}"`);
    return new StreamableFile(a.contenido, { type: a.mime });
  }
}

/** HU-1707 · Los datos fiscales del emisor (Ventas › Facturación › Datos fiscales). Solo el superadmin. */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('ventas/datos-fiscales')
@Roles('SUPERADMIN')
export class DatosFiscalesController {
  constructor(private readonly comprobantes: ComprobantesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: DatosFiscalesDto, description: 'Emisor, series, proveedor OSE, ambiente y detracción. Nunca secretos' })
  obtener(): Promise<DatosFiscalesDto> {
    return this.comprobantes.datosFiscales();
  }

  @Put()
  @ApiBody({ type: DatosFiscalesEntradaDto })
  @ApiOkResponse({ type: DatosFiscalesDto, description: 'Auditoría DATOS_FISCALES_ACTUALIZADOS' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: RUC, series (con su letra y distintas), proveedor (disponible en este entorno), ambiente, detracción, ubigeo, anexo, cuenta o código SPOT' })
  guardar(@UsuarioActual() u: UsuarioSesion, @Body() cuerpo: Record<string, unknown>): Promise<DatosFiscalesDto> {
    return this.comprobantes.guardarDatosFiscales(u, cuerpo);
  }
}

/** HU-1707 · El aviso asíncrono del OSE: firmado sobre el cuerpo tal como llega, sin sesión. */
@ApiTags('Ventas')
@Controller('webhooks/ose')
@Publico()
export class WebhooksOseController {
  constructor(private readonly comprobantes: ComprobantesService) {}

  @Post(':proveedor')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Aptio-Firma', required: true, description: 'pruebas: `sha256=` y el HMAC-SHA256 en hexadecimal del cuerpo con OSE_PRUEBAS_SECRETO_WEBHOOK' })
  @ApiOkResponse({ type: EventoOseRecibidoDto, description: 'Procesado o repetido (`duplicado: true`, sin cambios)' })
  @ApiUnauthorizedResponse({ description: 'FIRMA_NO_VALIDA: no cambia ningún comprobante' })
  @ApiNotFoundResponse({ description: 'Proveedor desconocido, no disponible en este entorno o sin webhook (Mifact se consulta cada 10 minutos), o el comprobante no existe' })
  @ApiUnprocessableEntityResponse({ description: 'EVENTO_NO_VALIDO' })
  recibir(@Param('proveedor') proveedor: string, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<EventoOseRecibidoDto> {
    res.setHeader('Cache-Control', 'no-store');
    return this.comprobantes.recibirWebhook(proveedor, req.body as Buffer | undefined, req.headers);
  }
}
