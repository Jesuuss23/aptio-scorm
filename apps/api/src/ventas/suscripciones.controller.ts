import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiServiceUnavailableResponse, ApiTags, ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Publico } from '../comun/roles.js';
import { CheckoutCreadoDto, CheckoutEntradaDto, EstadoCheckoutDto, PagoPruebaDto, WebhookRecibidoDto } from './suscripciones.dto.js';
import { CABECERA_FIRMA, SuscripcionesService } from './suscripciones.service.js';

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
  @ApiCreatedResponse({ type: CheckoutCreadoDto, description: 'La solicitud pendiente con el resumen (IGV 18 %) y la pasarela que cobra' })
  @ApiNotFoundResponse({ description: 'PLAN_NO_DISPONIBLE: no se publica, está oculto, es ficticio en producción o es a medida' })
  @ApiConflictResponse({ description: 'CORREO_EN_USO: el correo ya es de un usuario (inicia sesión)' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  @ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES: más de 10 checkouts en 10 minutos desde la misma IP' })
  @ApiServiceUnavailableResponse({ description: 'PAGO_NO_DISPONIBLE: no hay pasarela en este entorno (producción hasta la HU-1704)' })
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
}

/** HU-1703 · Los eventos de las pasarelas (RN-18-3): firmados con HMAC sobre el cuerpo tal como llega, sin sesión. */
@ApiTags('Ventas')
@Controller('webhooks/pago')
@Publico()
export class WebhooksPagoController {
  constructor(private readonly suscripciones: SuscripcionesService) {}

  @Post(':pasarela')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Aptio-Firma', required: true, description: '`sha256=` y el HMAC-SHA256 en hexadecimal del cuerpo con el secreto de la pasarela' })
  @ApiOkResponse({ type: WebhookRecibidoDto, description: 'Procesado, o repetido (`duplicado: true`, sin crear nada)' })
  @ApiUnauthorizedResponse({ description: 'FIRMA_NO_VALIDA' })
  @ApiNotFoundResponse({ description: 'Pasarela desconocida en este entorno, o el pago no existe' })
  @ApiUnprocessableEntityResponse({ description: 'EVENTO_NO_VALIDO' })
  recibir(@Param('pasarela') pasarela: string, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<WebhookRecibidoDto> {
    res.setHeader('Cache-Control', 'no-store');
    return this.suscripciones.recibirWebhook(pasarela, req.body as Buffer | undefined, req.get(CABECERA_FIRMA));
  }
}
