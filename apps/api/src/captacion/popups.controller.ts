import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, Res } from '@nestjs/common';
import {
  ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiExcludeEndpoint, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ARCHIVO_POPUPS_JSON, RUTA_EVENTO_POPUP } from '@aptio/sitio';
import { Publico, Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { BASE_SITIO } from '../sitio/sitio-publico.controller.js';
import { EventoPopupDto, OrdenPopupsDto, PopupDto, PopupEntradaDto, PopupsDto } from './popups.dto.js';
import { PopupsService } from './popups.service.js';

/** HU-1603 · Captación › Popups (REQ-076, PNT-31, RN-17-3). Solo el superadmin. */
@ApiTags('Captación')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('captacion/popups')
@Roles('SUPERADMIN')
export class PopupsController {
  constructor(private readonly popups: PopupsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PopupsDto })
  listar(): Promise<PopupsDto> {
    return this.popups.listar();
  }

  @Post()
  @ApiCreatedResponse({ type: PopupDto, description: 'Se crea apagado salvo que llegue `visible: true`' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  crear(@UsuarioActual() u: UsuarioSesion, @Body() dto: PopupEntradaDto): Promise<PopupDto> {
    return this.popups.crear(u, dto);
  }

  @Put('orden')
  @ApiOkResponse({ type: PopupsDto })
  @ApiUnprocessableEntityResponse({ description: 'ORDEN_INCOMPLETO: faltan popups o se repiten' })
  ordenar(@UsuarioActual() u: UsuarioSesion, @Body() dto: OrdenPopupsDto): Promise<PopupsDto> {
    return this.popups.ordenar(u, dto.ids);
  }

  @Patch(':id')
  @ApiOkResponse({ type: PopupDto })
  @ApiNotFoundResponse({ description: 'El popup no existe' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PopupEntradaDto): Promise<PopupDto> {
    return this.popups.cambiar(u, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrado; el resto se reordena sin huecos' })
  @ApiNotFoundResponse({ description: 'El popup no existe' })
  borrar(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.popups.borrar(u, id);
  }

  @Post(':id/reiniciar')
  @HttpCode(200)
  @ApiOkResponse({ type: PopupDto, description: 'Impresiones y conversiones vuelven a 0' })
  @ApiNotFoundResponse({ description: 'El popup no existe' })
  reiniciar(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<PopupDto> {
    return this.popups.reiniciar(u, id);
  }
}

/**
 * Los popups en el sitio pre-renderizado, sin sesión; documentados a mano en openapi.yaml (como el resto de `/s/*`).
 * HU-1603 · CP-132 · `GET /s/_popups.json` en vivo (la CDN lo guarda 30 s: apagar un popup vale en menos de un minuto
 * sin republicar) y `POST /s/_popup` con las impresiones y los clics. Este módulo se registra antes que el del sitio
 * para que su `GET` no lo tome la ruta comodín `/s/*`.
 */
@ApiTags('Sitio público')
@Controller(BASE_SITIO)
@Publico()
export class PopupsPublicoController {
  constructor(private readonly popups: PopupsService) {}

  @Get(ARCHIVO_POPUPS_JSON)
  @ApiExcludeEndpoint()
  async lista(@Res() res: Response): Promise<void> {
    const popups = await this.popups.publicos();
    res.set({ 'Cache-Control': 'public, max-age=0, s-maxage=30', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.status(200).send(JSON.stringify({ popups }));
  }

  @Post(RUTA_EVENTO_POPUP)
  @HttpCode(204)
  @ApiExcludeEndpoint()
  @ApiBody({ type: EventoPopupDto })
  async evento(@Body() cuerpo: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    await this.popups.registrar(cuerpo?.popupId, cuerpo?.evento, req.ip ?? req.socket.remoteAddress ?? 'desconocida');
  }
}
