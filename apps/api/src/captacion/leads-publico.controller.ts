import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiExcludeEndpoint, ApiTags, ApiTooManyRequestsResponse, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { leerAjustesSitio } from '@aptio/db';
import { ajustesPublicados } from '@aptio/schema/sitio-ajustes';
import { normalizarPagina } from '@aptio/schema/leads';
import { cabecerasSitio, opcionesRenderDesdeEnv, renderizarErrorFormulario, RUTA_GRACIAS, RUTA_LEAD } from '@aptio/sitio';
import { Publico } from '../comun/roles.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { BASE_SITIO } from '../sitio/sitio-publico.controller.js';
import { LeadEntradaDto, LeadRecibidoDto } from './leads.dto.js';
import { LeadsService } from './leads.service.js';

const ipDe = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'desconocida';

/**
 * HU-1601 · Entradas públicas de leads (RN-17-1), sin sesión. `POST /publico/leads` es la del popup, el chatbot, el
 * agendador y la suscripción (JSON). `POST /s/_lead` es la del formulario de contacto del sitio, que funciona sin
 * JavaScript: responde 303 a la página de gracias, o una página con los errores. Las dos responden lo mismo con el
 * campo trampa lleno y no dicen si el correo ya existía.
 */
@ApiTags('Sitio público')
@Controller()
@Publico()
export class LeadsPublicoController {
  constructor(private readonly leads: LeadsService, private readonly baseDatos: BaseDatosService) {}

  @Post('publico/leads')
  @HttpCode(201)
  @ApiBody({ type: LeadEntradaDto })
  @ApiCreatedResponse({ type: LeadRecibidoDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  @ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES: más de 5 envíos en 10 minutos desde la misma IP' })
  async recibir(@Body() cuerpo: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LeadRecibidoDto> {
    res.setHeader('Cache-Control', 'no-store');
    await this.leads.capturar(cuerpo, ipDe(req), `/${BASE_SITIO}`);
    return { recibido: true };
  }

  @Post(`${BASE_SITIO}/${RUTA_LEAD}`)
  @ApiExcludeEndpoint()
  async formulario(@Body() cuerpo: Record<string, unknown>, @Req() req: Request, @Res() res: Response): Promise<void> {
    const base = `/${BASE_SITIO}`;
    const idioma = cuerpo?.idioma === 'en' ? 'en' : 'es';
    try {
      await this.leads.capturar(cuerpo, ipDe(req), base);
      res.set('Cache-Control', 'no-store').redirect(303, `${base}${idioma === 'en' ? '/en' : ''}/${RUTA_GRACIAS}`);
    } catch (e) {
      if (!(e instanceof HttpException) || (e.getStatus() !== 422 && e.getStatus() !== 429)) throw e;
      const r = e.getResponse() as { detalles?: { mensaje: string }[]; reintentarEn?: number };
      const ajustes = await leerAjustesSitio(this.baseDatos.cliente);
      const html = renderizarErrorFormulario(ajustes ? { sitio: ajustesPublicados(ajustes) } : null, opcionesRenderDesdeEnv(), {
        errores: (r.detalles ?? []).map((d) => d.mensaje), volverA: normalizarPagina(cuerpo?.paginaFormulario, base), demasiados: e.getStatus() === HttpStatus.TOO_MANY_REQUESTS,
      }, idioma);
      res.set({ ...cabecerasSitio('404', html), 'Cache-Control': 'private, no-store', ...(r.reintentarEn ? { 'Retry-After': String(r.reintentarEn) } : {}) });
      res.removeHeader('ETag');
      res.status(e.getStatus()).send(html);
    }
  }
}
