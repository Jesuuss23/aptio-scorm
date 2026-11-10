import { Body, Controller, Get, HttpStatus, Param, ParseArrayPipe, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { GlosarioTerminoDto, PronunciacionTerminoDto } from './glosario.dto.js';
import { GlosarioService } from './glosario.service.js';

const lista = <T>(items: new () => T) =>
  new ParseArrayPipe({ items, whitelist: true, forbidNonWhitelisted: true, errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

/**
 * HU-0205: el productor registra el glosario y la pronunciación (la historia es suya); también los editan
 * administración y diseño, que editan el kit. El revisor del cliente no entra.
 */
@ApiTags('Clientes y kits')
@ApiCookieAuth('sesion')
@Controller('clientes/:clienteId')
@Roles(...EQUIPO)
export class GlosarioController {
  constructor(private readonly glosario: GlosarioService) {}

  @Get('glosario')
  @ApiOkResponse({ type: GlosarioTerminoDto, isArray: true })
  verGlosario(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) clienteId: string): Promise<GlosarioTerminoDto[]> {
    return this.glosario.glosario(u, clienteId);
  }

  @Put('glosario')
  @ApiBody({ type: GlosarioTerminoDto, isArray: true })
  @ApiOkResponse({ type: GlosarioTerminoDto, isArray: true, description: 'Las traducciones que usan un término cambiado vuelven a PENDIENTE' })
  reemplazarGlosario(
    @UsuarioActual() u: UsuarioSesion,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body(lista(GlosarioTerminoDto)) terminos: GlosarioTerminoDto[],
  ): Promise<GlosarioTerminoDto[]> {
    return this.glosario.reemplazarGlosario(u, clienteId, terminos);
  }

  @Get('pronunciacion')
  @ApiOkResponse({ type: PronunciacionTerminoDto, isArray: true })
  verPronunciacion(@UsuarioActual() u: UsuarioSesion, @Param('clienteId', ParseUUIDPipe) clienteId: string): Promise<PronunciacionTerminoDto[]> {
    return this.glosario.pronunciacion(u, clienteId);
  }

  @Put('pronunciacion')
  @ApiBody({ type: PronunciacionTerminoDto, isArray: true })
  @ApiOkResponse({ type: PronunciacionTerminoDto, isArray: true, description: 'Las narraciones que usan un término cambiado quedan DESACTUALIZADAS' })
  reemplazarPronunciacion(
    @UsuarioActual() u: UsuarioSesion,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body(lista(PronunciacionTerminoDto)) terminos: PronunciacionTerminoDto[],
  ): Promise<PronunciacionTerminoDto[]> {
    return this.glosario.reemplazarPronunciacion(u, clienteId, terminos);
  }
}
