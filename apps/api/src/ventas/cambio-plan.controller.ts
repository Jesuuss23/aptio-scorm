import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadGatewayResponse, ApiBody, ApiConflictResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiResponse, ApiServiceUnavailableResponse, ApiTags,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PermitidoSuspendida, Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { CambioPlanDto, CambioPlanEntradaDto, PagoPruebaCambioDto, SuscripcionOrgDto, TokenCambioDto } from './cambio-plan.dto.js';
import { CambioPlanService } from './cambio-plan.service.js';
import { CobranzaOrgDto, FiltroSuscripcionesDto, PagoPruebaRenovacionDto, PagoRenovacionDto, ReintentoRenovacionDto, SuscripcionesVentasDto, TokenRenovacionDto } from './cobranza.dto.js';
import { CobranzaService } from './cobranza.service.js';
import { SuscripcionesService } from './suscripciones.service.js';

/** HU-1706 · La suscripción de la organización: cambio de plan con prorrateo y cancelación (REQ-086, CP-147, RN-18-7). */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el administrador de la organización' })
@Controller('organizacion/suscripcion')
@Roles('ADMINISTRADOR')
// HU-1708 · Con la cuenta suspendida, el administrador igual paga, cambia de plan o cancela.
@PermitidoSuspendida()
export class SuscripcionOrgController {
  constructor(private readonly cambios: CambioPlanService, private readonly suscripciones: SuscripcionesService, private readonly cobranza: CobranzaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: SuscripcionOrgDto, description: 'Plan, período, cancelación, bajada programada y los planes publicados' })
  @ApiNotFoundResponse({ description: 'SIN_SUSCRIPCION' })
  suscripcion(@UsuarioActual() u: UsuarioSesion): Promise<SuscripcionOrgDto> {
    return this.cambios.suscripcion(u);
  }

  @Post('cambio')
  @HttpCode(200)
  @ApiBody({ type: CambioPlanEntradaDto })
  @ApiOkResponse({ type: CambioPlanDto, description: 'VISTA_PREVIA con el prorrateo; PROGRAMADO (bajada) o PENDIENTE (subida, con el pago). Auditoría PLAN_CAMBIO_PROGRAMADO o PLAN_CAMBIO_INICIADO' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO (plan no publicado, el mismo, a medida o sin precio en ese ciclo y moneda) o SUSCRIPCION_CANCELADA' })
  @ApiConflictResponse({ description: 'PERIODO_VENCIDO' })
  @ApiNotFoundResponse({ description: 'SIN_SUSCRIPCION' })
  @ApiServiceUnavailableResponse({ description: 'PAGO_NO_DISPONIBLE' })
  @ApiBadGatewayResponse({ description: 'PASARELA_NO_RESPONDE: el cambio queda RECHAZADO' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Body() cuerpo: Record<string, unknown>): Promise<CambioPlanDto> {
    return this.cambios.cambiar(u, cuerpo);
  }

  @Get('cambios/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CambioPlanDto, description: 'Para consultar hasta que la pasarela confirme' })
  @ApiNotFoundResponse({ description: 'El cambio no existe o es de otra organización' })
  cambio(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<CambioPlanDto> {
    return this.cambios.cambio(u, id);
  }

  @Post('cambios/:id/pago-prueba')
  @HttpCode(200)
  @ApiBody({ type: PagoPruebaCambioDto })
  @ApiOkResponse({ type: CambioPlanDto, description: 'Solo con SITIO_ENTORNO=pruebas: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza' })
  @ApiNotFoundResponse({ description: 'Sin pasarela de pruebas, o el cambio no existe o no es de esa pasarela' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: no es una tarjeta de prueba' })
  pagarPrueba(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() cuerpo: Record<string, unknown>): Promise<CambioPlanDto> {
    return this.suscripciones.pagarPruebaCambio(u, id, cuerpo?.tarjeta);
  }

  @Post('cambios/:id/token')
  @HttpCode(202)
  @ApiBody({ type: TokenCambioDto })
  @ApiResponse({ status: 202, type: CambioPlanDto, description: 'Culqi creó el cargo; el cambio sigue pendiente hasta su webhook firmado' })
  @ApiResponse({ status: 402, description: 'PAGO_RECHAZADO' })
  @ApiConflictResponse({ description: 'PAGO_RESUELTO' })
  @ApiNotFoundResponse({ description: 'El cambio no existe o su pasarela no usa formulario' })
  enviarToken(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() cuerpo: Record<string, unknown>): Promise<CambioPlanDto> {
    return this.suscripciones.enviarTokenCambio(u, id, cuerpo?.token);
  }

  @Post('renovacion/pago')
  @HttpCode(200)
  @ApiOkResponse({ type: PagoRenovacionDto, description: 'HU-1708 · «Pagar ahora»: el pago del total de la renovación en la pasarela; se aplica con el webhook firmado. Auditoría RENOVACION_PAGO_INICIADO' })
  @ApiConflictResponse({ description: 'SIN_PAGO_PENDIENTE' })
  @ApiNotFoundResponse({ description: 'SIN_SUSCRIPCION' })
  @ApiServiceUnavailableResponse({ description: 'PAGO_NO_DISPONIBLE' })
  @ApiBadGatewayResponse({ description: 'PASARELA_NO_RESPONDE' })
  pagarRenovacion(@UsuarioActual() u: UsuarioSesion): Promise<PagoRenovacionDto> {
    return this.cobranza.pagar(u);
  }

  @Post('renovacion/pago-prueba')
  @HttpCode(200)
  @ApiBody({ type: PagoPruebaRenovacionDto })
  @ApiOkResponse({ type: PagoRenovacionDto, description: 'Solo con SITIO_ENTORNO=pruebas: 4111 1111 1111 1111 aprueba (reactiva la cuenta) y 4000 0000 0000 0002 rechaza' })
  @ApiConflictResponse({ description: 'SIN_PAGO_PENDIENTE' })
  @ApiNotFoundResponse({ description: 'Sin pasarela de pruebas, o la renovación no es de esa pasarela' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: no es una tarjeta de prueba' })
  pagarPruebaRenovacion(@UsuarioActual() u: UsuarioSesion, @Body() cuerpo: Record<string, unknown>): Promise<PagoRenovacionDto> {
    return this.suscripciones.pagarPruebaRenovacion(u, cuerpo?.tarjeta);
  }

  @Post('renovacion/token')
  @HttpCode(202)
  @ApiBody({ type: TokenRenovacionDto })
  @ApiResponse({ status: 202, type: PagoRenovacionDto, description: 'Culqi creó el cargo; la renovación sigue pendiente hasta su webhook firmado' })
  @ApiResponse({ status: 402, description: 'PAGO_RECHAZADO' })
  @ApiConflictResponse({ description: 'SIN_PAGO_PENDIENTE' })
  @ApiNotFoundResponse({ description: 'La renovación no se paga con un formulario' })
  enviarTokenRenovacion(@UsuarioActual() u: UsuarioSesion, @Body() cuerpo: Record<string, unknown>): Promise<PagoRenovacionDto> {
    return this.suscripciones.enviarTokenRenovacion(u, cuerpo?.token);
  }

  @Post('cancelar')
  @HttpCode(200)
  @ApiOkResponse({ type: SuscripcionOrgDto, description: 'Se cancelará al fin del período pagado, sin devolución. Auditoría SUSCRIPCION_CANCELACION_PEDIDA' })
  @ApiConflictResponse({ description: 'SUSCRIPCION_CANCELADA: ya terminó' })
  @ApiNotFoundResponse({ description: 'SIN_SUSCRIPCION' })
  cancelar(@UsuarioActual() u: UsuarioSesion): Promise<SuscripcionOrgDto> {
    return this.cambios.cancelar(u);
  }

  @Post('reanudar')
  @HttpCode(200)
  @ApiOkResponse({ type: SuscripcionOrgDto, description: '«Seguir con mi plan»: quita la cancelación y la bajada programada. Auditoría SUSCRIPCION_REANUDADA' })
  @ApiConflictResponse({ description: 'SUSCRIPCION_CANCELADA: ya terminó' })
  @ApiNotFoundResponse({ description: 'SIN_SUSCRIPCION' })
  reanudar(@UsuarioActual() u: UsuarioSesion): Promise<SuscripcionOrgDto> {
    return this.cambios.reanudar(u);
  }
}

/** HU-1708 · El aviso global de cobranza (PNT-36): cualquier usuario de la organización, también con la cuenta suspendida. */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@Controller('organizacion/cobranza')
export class CobranzaOrgController {
  constructor(private readonly cobranza: CobranzaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CobranzaOrgDto, description: 'AL_DIA, PAGO_PENDIENTE o SUSPENDIDA (solo lectura), con el total y dónde regularizar' })
  estado(@UsuarioActual() u: UsuarioSesion): Promise<CobranzaOrgDto> {
    return this.cobranza.estado(u);
  }
}

/** HU-1708 · Ventas › Suscripciones (REQ-088): el estado de cobro de cada organización. Solo el superadmin, con auditoría. */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('ventas/suscripciones')
@Roles('SUPERADMIN')
export class SuscripcionesVentasController {
  constructor(private readonly cobranza: CobranzaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: SuscripcionesVentasDto, description: 'Las 200 que vencen antes primero, con el filtro por estado y la renovación abierta' })
  listar(@Query() f: FiltroSuscripcionesDto): Promise<SuscripcionesVentasDto> {
    return this.cobranza.listar({ estado: f.estado });
  }

  @Post(':id/reintentar')
  @HttpCode(202)
  @ApiResponse({ status: 202, type: ReintentoRenovacionDto, description: '«Reintentar ahora»: un intento fuera del calendario (no lo adelanta). Auditoría RENOVACION_REINTENTO_PEDIDO' })
  @ApiNotFoundResponse({ description: 'La suscripción no existe' })
  @ApiConflictResponse({ description: 'SIN_PAGO_PENDIENTE' })
  @ApiServiceUnavailableResponse({ description: 'COLA_NO_DISPONIBLE' })
  reintentar(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<ReintentoRenovacionDto> {
    return this.cobranza.reintentar(u, id);
  }
}
