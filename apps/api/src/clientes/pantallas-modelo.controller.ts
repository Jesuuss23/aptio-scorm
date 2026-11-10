import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { PantallaModeloDto, PantallaModeloEntradaDto } from './pantalla-modelo.dto.js';
import { PantallasModeloService } from './pantallas-modelo.service.js';

/** Permisos de docs/14-modulos.md: las diseñan diseño gráfico y administración; diseño instruccional y producción las ven. */
const DISENAN = ['ADMINISTRADOR', 'DISENADOR_GRAFICO'] as const;

@ApiTags('Clientes y kits')
@ApiCookieAuth('sesion')
@Controller('clientes/:clienteId/kit/pantallas-modelo')
@Roles('ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR')
export class PantallasModeloController {
  constructor(private readonly modelos: PantallasModeloService) {}

  @Get()
  @ApiQuery({ name: 'activas', required: false, type: Boolean })
  @ApiOkResponse({ type: PantallaModeloDto, isArray: true })
  listar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Query('activas') activas?: string,
  ): Promise<PantallaModeloDto[]> {
    return this.modelos.listar(u, clienteId, activas === 'true');
  }

  @Post()
  @Roles(...DISENAN)
  @ApiCreatedResponse({ type: PantallaModeloDto })
  crear(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) clienteId: string, @Body() dto: PantallaModeloEntradaDto): Promise<PantallaModeloDto> {
    return this.modelos.crear(u, clienteId, dto);
  }

  @Put(':modeloId')
  @Roles(...DISENAN)
  @ApiOkResponse({ type: PantallaModeloDto })
  editar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Param('modeloId', ParseUUIDPipe) id: string,
    @Body() dto: PantallaModeloEntradaDto,
  ): Promise<PantallaModeloDto> {
    return this.modelos.editar(u, clienteId, id, dto);
  }

  @Delete(':modeloId')
  @Roles(...DISENAN)
  @HttpCode(204)
  @ApiNoContentResponse()
  desactivar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Param('modeloId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.modelos.desactivar(u, clienteId, id);
  }
}
