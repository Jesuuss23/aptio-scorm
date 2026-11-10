import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { MuestraVozDto, MuestraVozResultadoDto } from './voz.dto.js';
import { VozService } from './voz.service.js';

@ApiTags('Personaje y voz')
@ApiCookieAuth('sesion')
@Controller('voz')
@Roles(...EQUIPO)
export class VozController {
  constructor(private readonly voz: VozService) {}

  @Post('muestra')
  @HttpCode(200)
  @ApiOkResponse({ type: MuestraVozResultadoDto, description: '503 VOZ_NO_DISPONIBLE si la voz no está configurada o no respondió' })
  muestra(@UsuarioActual() u: UsuarioSesion, @Body() dto: MuestraVozDto): Promise<MuestraVozResultadoDto> {
    return this.voz.muestra(u, dto);
  }
}
