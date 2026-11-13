import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { MedicionDto, MedicionEntradaDto, ParametrosNegocioDto, ParametrosNegocioRespuestaDto, RentabilidadConsultaDto, RentabilidadDto } from './negocio.dto.js';
import { NegocioService } from './negocio.service.js';

/** HU-1303 · Rentabilidad y mediciones (M13). Administración edita los parámetros; diseño instruccional los ve y registra mediciones. */
@ApiTags('Costos y rentabilidad')
@ApiCookieAuth('sesion')
@Controller('negocio')
@Roles('ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL')
export class NegocioController {
  constructor(private readonly negocio: NegocioService) {}

  @Get('parametros')
  @ApiOkResponse({ type: ParametrosNegocioRespuestaDto })
  parametros(@UsuarioActual() u: UsuarioSesion): Promise<ParametrosNegocioRespuestaDto> {
    return this.negocio.parametros(u);
  }

  @Put('parametros')
  @Roles('ADMINISTRADOR')
  @ApiOkResponse({ type: ParametrosNegocioRespuestaDto })
  guardar(@UsuarioActual() u: UsuarioSesion, @Body() dto: ParametrosNegocioDto): Promise<ParametrosNegocioRespuestaDto> {
    return this.negocio.guardar(u, dto);
  }

  @Get('rentabilidad')
  @ApiOkResponse({ type: RentabilidadDto })
  rentabilidad(@UsuarioActual() u: UsuarioSesion, @Query() q: RentabilidadConsultaDto): Promise<RentabilidadDto> {
    return this.negocio.rentabilidad(u, q.fuente ?? 'supuestos');
  }

  @Get('mediciones')
  @ApiOkResponse({ type: [MedicionDto] })
  mediciones(@UsuarioActual() u: UsuarioSesion): Promise<MedicionDto[]> {
    return this.negocio.mediciones(u);
  }

  @Post('mediciones')
  @ApiCreatedResponse({ type: MedicionDto })
  registrar(@UsuarioActual() u: UsuarioSesion, @Body() dto: MedicionEntradaDto): Promise<MedicionDto> {
    return this.negocio.registrar(u, dto);
  }

  @Delete('mediciones/:id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borra una medición registrada por error' })
  borrar(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.negocio.borrar(u, id);
  }
}
