import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ApiBadGatewayResponse, ApiConflictResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { CobrosService } from './cobros.service.js';
import { CambioPasarelaDto, CobroDto, CobrosDto, FiltroCobrosDto, OrdenPasarelasDto, PasarelaDto, PasarelasDto } from './pasarelas.dto.js';
import { PasarelasService } from './pasarelas.service.js';

/** HU-1704 · Ventas › Pasarelas (REQ-084, PNT-37). Solo el superadmin. Sin llaves ni secretos: viven en variables de entorno. */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('ventas/pasarelas')
@Roles('SUPERADMIN')
export class PasarelasController {
  constructor(private readonly pasarelas: PasarelasService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PasarelasDto, description: 'En orden, con si está activa y los nombres de las variables que faltan' })
  listar(): Promise<PasarelasDto> {
    return this.pasarelas.listar();
  }

  @Put('orden')
  @ApiOkResponse({ type: PasarelasDto, description: 'Auditoría PASARELAS_ORDEN_CAMBIADO' })
  @ApiUnprocessableEntityResponse({ description: 'ORDEN_INCOMPLETO: faltan pasarelas o se repiten' })
  ordenar(@UsuarioActual() u: UsuarioSesion, @Body() dto: OrdenPasarelasDto): Promise<PasarelasDto> {
    return this.pasarelas.ordenar(u, dto.codigos);
  }

  @Patch(':codigo')
  @ApiOkResponse({ type: PasarelaDto, description: 'Mostrar u ocultar, nombre y modo. Auditoría PASARELA_EDITADA' })
  @ApiNotFoundResponse({ description: 'La pasarela no existe' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO (la de pruebas no admite el modo producción)' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('codigo') codigo: string, @Body() dto: CambioPasarelaDto): Promise<PasarelaDto> {
    return this.pasarelas.cambiar(u, codigo, dto);
  }
}

/** HU-1704 · Los cobros aprobados y el reembolso de un pago aprobado sin alta (SUP-291). Solo el superadmin. */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('ventas/cobros')
@Roles('SUPERADMIN')
export class CobrosController {
  constructor(private readonly cobros: CobrosService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CobrosDto, description: 'Los 200 más recientes' })
  listar(@Query() f: FiltroCobrosDto): Promise<CobrosDto> {
    return this.cobros.listar({ estado: f.estado, sinAlta: f.sinAlta === undefined ? undefined : f.sinAlta === 'true' });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CobroDto })
  @ApiNotFoundResponse({ description: 'El cobro no existe' })
  obtener(@Param('id', ParseUUIDPipe) id: string): Promise<CobroDto> {
    return this.cobros.obtener(id);
  }

  @Post(':id/reembolsar')
  @HttpCode(200)
  @ApiOkResponse({ type: CobroDto, description: 'La pasarela devolvió el dinero: REEMBOLSADO. Auditoría COBRO_REEMBOLSADO (la nota de crédito llega con la HU-1707)' })
  @ApiNotFoundResponse({ description: 'El cobro no existe' })
  @ApiConflictResponse({ description: 'COBRO_CON_SUSCRIPCION (se devuelve al cancelar) o COBRO_YA_REEMBOLSADO' })
  @ApiBadGatewayResponse({ description: 'PASARELA_NO_RESPONDE: el cobro sigue APROBADO. Auditoría COBRO_REEMBOLSO_FALLIDO' })
  reembolsar(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<CobroDto> {
    return this.cobros.reembolsar(u, id);
  }
}
