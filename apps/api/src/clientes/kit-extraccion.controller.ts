import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { Trabajo202Dto } from '../cursos/propuesta.dto.js';
import { ExtraerKitEntradaDto, PropuestaKitDto } from './kit-extraccion.dto.js';
import { KitExtraccionService } from './kit-extraccion.service.js';

/** HU-0206 · Proponer el kit desde un curso anterior o un manual de marca. Lo hace quien edita el kit. */
@ApiTags('Clientes y kits')
@ApiCookieAuth('sesion')
@Controller('clientes/:clienteId/kit')
@Roles('ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO')
export class KitExtraccionController {
  constructor(private readonly extraccion: KitExtraccionService) {}

  @Post('extraer')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: Trabajo202Dto, description: 'Encola IA-18 v2: lee el ZIP o el PDF sin ejecutar nada y propone el kit; el kit no cambia' })
  extraer(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) clienteId: string, @Body() dto: ExtraerKitEntradaDto): Promise<Trabajo202Dto> {
    return this.extraccion.extraer(u, clienteId, dto);
  }

  @Get('propuesta')
  @ApiOkResponse({ type: PropuestaKitDto })
  propuesta(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) clienteId: string): Promise<PropuestaKitDto> {
    return this.extraccion.propuesta(u, clienteId);
  }

  @Delete('propuesta')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'La propuesta deja de ofrecerse; el kit no cambia' })
  descartar(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) clienteId: string): Promise<void> {
    return this.extraccion.descartar(u, clienteId);
  }
}
