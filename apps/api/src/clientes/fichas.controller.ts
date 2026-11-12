// HU-1204 · Rutas de las fichas de compatibilidad del LMS de un cliente.
import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { FichaCompatibilidadDto, FichaCompatibilidadEntradaDto } from './ficha.dto.js';
import { FichasService } from './fichas.service.js';

/** Registran fichas los mismos que exportan; el resto del equipo las ve; el revisor del cliente, no (403). */
const REGISTRAN = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR'] as const;

@ApiTags('Clientes y kits')
@ApiCookieAuth('sesion')
@Controller('clientes/:clienteId/fichas-lms')
@Roles(...EQUIPO)
export class FichasController {
  constructor(private readonly fichas: FichasService) {}

  @Get()
  @ApiOkResponse({ type: FichaCompatibilidadDto, isArray: true, description: 'De la más nueva a la más vieja' })
  listar(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) id: string): Promise<FichaCompatibilidadDto[]> {
    return this.fichas.listar(u, id);
  }

  @Post()
  @Roles(...REGISTRAN)
  @ApiCreatedResponse({ type: FichaCompatibilidadDto, description: '422 si faltan datos o el informe de diagnóstico no es un objeto JSON' })
  crear(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) id: string, @Body() dto: FichaCompatibilidadEntradaDto): Promise<FichaCompatibilidadDto> {
    return this.fichas.crear(u, id, dto);
  }
}
