import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { KitDto, KitEntradaDto, PersonajeEntradaDto } from './kit.dto.js';
import { KitService } from './kit.service.js';

/** Permisos de docs/14-modulos.md: el productor ve el kit, el revisor del cliente no. */
@ApiTags('Clientes y kits')
@ApiCookieAuth('sesion')
@Controller('clientes/:clienteId/kit')
@Roles('ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR')
export class KitController {
  constructor(private readonly kits: KitService) {}

  @Get()
  @ApiOkResponse({ type: KitDto })
  ver(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) clienteId: string): Promise<KitDto> {
    return this.kits.ver(u, clienteId);
  }

  @Put()
  @Roles('ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO')
  @ApiOkResponse({ type: KitDto })
  guardar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() dto: KitEntradaDto,
  ): Promise<KitDto> {
    return this.kits.guardar(u, clienteId, dto);
  }

  @Put('personaje')
  @Roles('ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO')
  @ApiOkResponse({ type: KitDto })
  guardarPersonaje(
    @UsuarioActual() u: UsuarioSesion,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() dto: PersonajeEntradaDto,
  ): Promise<KitDto> {
    return this.kits.guardarPersonaje(u, clienteId, dto);
  }
}
