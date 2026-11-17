import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse, ApiBody, ApiConflictResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiResponse, ApiServiceUnavailableResponse, ApiTags,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { CambioPlanDto, CambioPlanEntradaDto, PagoPruebaCambioDto, SuscripcionOrgDto, TokenCambioDto } from './cambio-plan.dto.js';
import { CambioPlanService } from './cambio-plan.service.js';
import { SuscripcionesService } from './suscripciones.service.js';

/** HU-1706 · La suscripción de la organización: cambio de plan con prorrateo y cancelación (REQ-086, CP-147, RN-18-7). */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el administrador de la organización' })
@Controller('organizacion/suscripcion')
@Roles('ADMINISTRADOR')
export class SuscripcionOrgController {
  constructor(private readonly cambios: CambioPlanService, private readonly suscripciones: SuscripcionesService) {}

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
