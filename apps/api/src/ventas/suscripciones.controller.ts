import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadGatewayResponse, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiResponse, ApiServiceUnavailableResponse, ApiTags,
  ApiTooManyRequestsResponse, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Publico } from '../comun/roles.js';
import { CheckoutCreadoDto, CheckoutEntradaDto, EstadoCheckoutDto, PagoPruebaDto, TokenPagoDto, WebhookRecibidoDto } from './suscripciones.dto.js';
import { SuscripcionesService } from './suscripciones.service.js';

const ipDe = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'desconocida';

/** HU-1703 · El checkout de `/pago` (REQ-083, CP-143), sin sesión. */
@ApiTags('Sitio público')
@Controller('publico/checkout')
@Publico()
export class CheckoutPublicoController {
  constructor(private readonly suscripciones: SuscripcionesService) {}

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiBody({ type: CheckoutEntradaDto })
  @ApiCreatedResponse({ type: CheckoutCreadoDto, description: 'La solicitud pendiente con el resumen (IGV 18 %), la pasarela que cobra esa moneda y cómo se paga' })
  @ApiNotFoundResponse({ description: 'PLAN_NO_DISPONIBLE: no se publica, está oculto, es ficticio en producción o es a medida' })
  @ApiConflictResponse({ description: 'CORREO_EN_USO: el correo ya es de un usuario (inicia sesión)' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles` (también si el plan no se cobra en dólares)' })
  @ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES: más de 10 checkouts en 10 minutos desde la misma IP' })
  @ApiServiceUnavailableResponse({ description: 'PAGO_NO_DISPONIBLE: ninguna pasarela visible y activa cobra esa moneda' })
  @ApiBadGatewayResponse({ description: 'PASARELA_NO_RESPONDE: la pasarela no inició el pago (la solicitud queda rechazada)' })
  crear(@Body() cuerpo: Record<string, unknown>, @Req() req: Request): Promise<CheckoutCreadoDto> {
    return this.suscripciones.crearCheckout(cuerpo, ipDe(req));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EstadoCheckoutDto, description: 'El estado del pago, para consultar hasta que la pasarela confirme' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO' })
  estado(@Param('id', ParseUUIDPipe) id: string): Promise<EstadoCheckoutDto> {
    return this.suscripciones.estado(id);
  }

  @Post(':id/pago-prueba')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiBody({ type: PagoPruebaDto })
  @ApiOkResponse({ type: EstadoCheckoutDto, description: 'La pasarela de pruebas firma el evento y lo procesa como el webhook' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: el pago no existe o la pasarela de pruebas no está disponible (solo con SITIO_ENTORNO=pruebas)' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: no es una tarjeta de prueba' })
  pagarPrueba(@Param('id', ParseUUIDPipe) id: string, @Body() cuerpo: Record<string, unknown>): Promise<EstadoCheckoutDto> {
    return this.suscripciones.pagarPrueba(id, cuerpo?.tarjeta);
  }

  @Post(':id/token')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiBody({ type: TokenPagoDto })
  @ApiResponse({ status: 202, type: EstadoCheckoutDto, description: 'HU-1704 · La pasarela creó el cargo con el token: el pago sigue pendiente hasta su webhook firmado' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: el pago no existe o su pasarela no usa formulario incrustado' })
  @ApiConflictResponse({ description: 'PAGO_RESUELTO: el pago ya no está pendiente' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: falta el token' })
  @ApiResponse({ status: 402, description: 'PAGO_RECHAZADO: la pasarela rechazó el cargo al crearlo (con su mensaje para el visitante)' })
  enviarToken(@Param('id', ParseUUIDPipe) id: string, @Body() cuerpo: Record<string, unknown>): Promise<EstadoCheckoutDto> {
    return this.suscripciones.enviarToken(id, cuerpo?.token);
  }
}

/**
 * HU-1703 · HU-1704 · Los eventos de las pasarelas (RN-18-3, CP-144, CP-145): firmados sobre el cuerpo tal como llega,
 * sin sesión. Cada pasarela trae su cabecera: `X-Aptio-Firma` (pruebas), `Stripe-Signature` (stripe) y
 * `X-Culqi-Signature` (culqi, formato por confirmar en su sandbox, SUP-294).
 */
@ApiTags('Ventas')
@Controller('webhooks/pago')
@Publico()
export class WebhooksPagoController {
  constructor(private readonly suscripciones: SuscripcionesService) {}

  @Post(':pasarela')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Aptio-Firma', required: false, description: 'pruebas: `sha256=` y el HMAC-SHA256 en hexadecimal del cuerpo' })
  @ApiHeader({ name: 'Stripe-Signature', required: false, description: 'stripe: `t=<segundos>,v1=<HMAC-SHA256 de "t.cuerpo">`, con 5 minutos de tolerancia' })
  @ApiHeader({ name: 'X-Culqi-Signature', required: false, description: 'culqi: HMAC-SHA256 en hexadecimal del cuerpo (supuesto SUP-294)' })
  @ApiOkResponse({ type: WebhookRecibidoDto, description: 'Procesado, repetido (`duplicado: true`) o ignorado (`ignorado: true`), sin crear nada en los dos últimos' })
  @ApiUnauthorizedResponse({ description: 'FIRMA_NO_VALIDA: no cambia ninguna suscripción ni cobro' })
  @ApiNotFoundResponse({ description: 'Pasarela desconocida o sin sus variables en este entorno, o el pago no existe' })
  @ApiUnprocessableEntityResponse({ description: 'EVENTO_NO_VALIDO' })
  recibir(@Param('pasarela') pasarela: string, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<WebhookRecibidoDto> {
    res.setHeader('Cache-Control', 'no-store');
    return this.suscripciones.recibirWebhook(pasarela, req.body as Buffer | undefined, req.headers);
  }
}
