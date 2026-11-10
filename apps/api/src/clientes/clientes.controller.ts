import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { ClienteCambioDto, ClienteDto, ClienteEntradaDto } from './cliente.dto.js';
import { ClientesService } from './clientes.service.js';

/** Quién registra y edita clientes (SUP-13). */
const EDITAN = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR'] as const;

@ApiTags('Clientes y kits')
@ApiCookieAuth('sesion')
@Controller('clientes')
@Roles(...EQUIPO, 'REVISOR_CLIENTE')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiQuery({ name: 'buscar', required: false })
  @ApiOkResponse({ type: ClienteDto, isArray: true })
  listar(@UsuarioActual() u: UsuarioSesion, @Query('buscar') buscar?: string): Promise<ClienteDto[]> {
    return this.clientes.listar(u, buscar);
  }

  @Post()
  @Roles(...EDITAN)
  @ApiCreatedResponse({ type: ClienteDto })
  crear(@UsuarioActual() u: UsuarioSesion, @Body() dto: ClienteEntradaDto): Promise<ClienteDto> {
    return this.clientes.crear(u, dto);
  }

  @Get(':clienteId')
  @ApiOkResponse({ type: ClienteDto })
  ver(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) id: string): Promise<ClienteDto> {
    return this.clientes.ver(u, id);
  }

  @Patch(':clienteId')
  @Roles(...EDITAN)
  @ApiOkResponse({ type: ClienteDto })
  actualizar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('clienteId', ParseUUIDPipe) id: string,
    @Body() dto: ClienteCambioDto,
  ): Promise<ClienteDto> {
    return this.clientes.actualizar(u, id, dto);
  }
}
