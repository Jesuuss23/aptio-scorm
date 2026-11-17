import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UnprocessableEntityException } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiExcludeEndpoint, ApiForbiddenResponse, ApiOkResponse, ApiQuery, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { esBot, esPeriodoResumen, PERIODO_POR_DEFECTO, PERIODOS_RESUMEN } from '@aptio/schema/resumen-sitio';
import { RUTA_VISITA } from '@aptio/sitio';
import type { Request, Response } from 'express';
import { Publico, Roles, type UsuarioSesion } from '../comun/roles.js';
import { ResumenSitioDto, VisitaSitioDto } from './resumen.dto.js';
import { ResumenService } from './resumen.service.js';
import { BASE_SITIO } from './sitio-publico.controller.js';

/** HU-1607 · Sitio web › Resumen (REQ-080, PNT-24, CP-138): solo el superadmin. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('sitio/resumen')
@Roles('SUPERADMIN')
export class ResumenController {
  constructor(private readonly resumen: ResumenService) {}

  @Get()
  @ApiQuery({ name: 'periodo', required: false, enum: PERIODOS_RESUMEN, description: '7d, 30d (por defecto) o 90d, en hora de Lima' })
  @ApiOkResponse({ type: ResumenSitioDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: el período es 7d, 30d o 90d' })
  ver(@Query('periodo') periodo?: string): Promise<ResumenSitioDto> {
    const p = periodo ?? PERIODO_POR_DEFECTO;
    if (!esPeriodoResumen(p)) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: 'El período es 7d, 30d o 90d' });
    return this.resumen.resumen(p);
  }
}

/**
 * HU-1607 · `POST /s/_visita`, sin sesión y fuera del prefijo de la API (documentado a mano en openapi.yaml): la vista
 * anónima de una página que manda `_visita.js`. Siempre 204 (salvo 429 por el límite), cuente o no, para no dar pistas.
 */
@ApiTags('Sitio público')
@Controller(BASE_SITIO)
@Publico()
export class VisitasPublicoController {
  constructor(private readonly resumen: ResumenService) {}

  @Post(RUTA_VISITA)
  @HttpCode(204)
  @ApiExcludeEndpoint()
  @ApiBody({ type: VisitaSitioDto })
  async visita(@Body() cuerpo: Record<string, unknown>, @Req() req: Request & { usuario?: UsuarioSesion }, @Res({ passthrough: true }) res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const agente = req.get('user-agent');
    await this.resumen.registrar(cuerpo, { ip: req.ip ?? req.socket.remoteAddress ?? 'desconocida', agente, superadmin: req.usuario?.rol === 'SUPERADMIN', bot: esBot(agente) });
  }
}
