import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse, ApiBody, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiResponse, ApiServiceUnavailableResponse,
  ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { CompraAdicionalesEntradaDto, CompraCapsulasDto, CuotaDto, PagoPruebaCompraDto, TokenCompraDto } from './cuotas.dto.js';
import { CuotasService } from './cuotas.service.js';
import { SuscripcionesService } from './suscripciones.service.js';

/** HU-1705 · La cuota de cápsulas de la organización y la compra de adicionales (REQ-085, CP-146, RN-18-6). */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@Controller('organizacion/cuota')
@Roles(...EQUIPO)
export class CuotaController {
  constructor(private readonly cuotas: CuotasService, private readonly suscripciones: SuscripcionesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CuotaDto, description: 'La ventana mensual vigente: usadas, incluidas, adicionales y disponibles' })
  @ApiForbiddenResponse({ description: 'Solo el equipo de una organización' })
  cuota(@UsuarioActual() u: UsuarioSesion): Promise<CuotaDto> {
    return this.cuotas.cuota(u);
  }

  @Post('adicionales')
  @Roles('ADMINISTRADOR')
  @HttpCode(201)
  @ApiBody({ type: CompraAdicionalesEntradaDto })
  @ApiCreatedResponse({ type: CompraCapsulasDto, description: 'Compra pendiente con cómo sigue el pago. Auditoría CAPSULAS_COMPRA_INICIADA' })
  @ApiForbiddenResponse({ description: 'Solo el administrador de la organización' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO (de 1 a 10), SIN_SUSCRIPCION, CUOTA_ILIMITADA o SIN_ADICIONALES' })
  @ApiServiceUnavailableResponse({ description: 'PAGO_NO_DISPONIBLE: ninguna pasarela cobra la moneda de la suscripción' })
  @ApiBadGatewayResponse({ description: 'PASARELA_NO_RESPONDE: la compra queda RECHAZADA' })
  comprar(@UsuarioActual() u: UsuarioSesion, @Body() cuerpo: Record<string, unknown>): Promise<CompraCapsulasDto> {
    return this.cuotas.comprar(u, cuerpo);
  }

  @Get('adicionales/:id')
  @Roles('ADMINISTRADOR')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CompraCapsulasDto, description: 'Para consultar hasta que la pasarela confirme' })
  @ApiNotFoundResponse({ description: 'La compra no existe o es de otra organización' })
  compra(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<CompraCapsulasDto> {
    return this.cuotas.compra(u, id);
  }

  @Post('adicionales/:id/pago-prueba')
  @Roles('ADMINISTRADOR')
  @HttpCode(200)
  @ApiBody({ type: PagoPruebaCompraDto })
  @ApiOkResponse({ type: CompraCapsulasDto, description: 'Solo con SITIO_ENTORNO=pruebas: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza' })
  @ApiNotFoundResponse({ description: 'Sin pasarela de pruebas, o la compra no existe o no es de esa pasarela' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: no es una tarjeta de prueba' })
  pagarPrueba(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() cuerpo: Record<string, unknown>): Promise<CompraCapsulasDto> {
    return this.suscripciones.pagarPruebaCompra(u, id, cuerpo?.tarjeta);
  }

  @Post('adicionales/:id/token')
  @Roles('ADMINISTRADOR')
  @HttpCode(202)
  @ApiBody({ type: TokenCompraDto })
  @ApiResponse({ status: 202, type: CompraCapsulasDto, description: 'Culqi creó el cargo; la compra sigue pendiente hasta su webhook firmado' })
  @ApiResponse({ status: 402, description: 'PAGO_RECHAZADO' })
  @ApiConflictResponse({ description: 'PAGO_RESUELTO' })
  @ApiNotFoundResponse({ description: 'La compra no existe o su pasarela no usa formulario' })
  enviarToken(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() cuerpo: Record<string, unknown>): Promise<CompraCapsulasDto> {
    return this.suscripciones.enviarTokenCompra(u, id, cuerpo?.token);
  }
}
