import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { cabecerasSitio, noModificado, resolverPedido } from '@aptio/sitio';
import type { Request, Response } from 'express';
import { Publico } from '../comun/roles.js';
import { SitioPublicoService } from './sitio-publico.service.js';

/** Dónde se sirve el sitio, fuera del prefijo de la API. */
export const BASE_SITIO = 's';

/**
 * HU-1508 · Sitio público pre-renderizado (REQ-109, DA-08), sin sesión: `GET /s/*` entrega el HTML de la versión
 * vigente, con ETag (304 si el navegador ya lo tiene) y la página 404 en HTML. Documentado a mano en openapi.yaml.
 */
@ApiExcludeController()
@Controller()
@Publico()
export class SitioPublicoController {
  constructor(private readonly sitio: SitioPublicoService) {}

  @Get([BASE_SITIO, `${BASE_SITIO}/{*ruta}`])
  async servir(@Req() req: Request, @Res() res: Response): Promise<void> {
    const ruta = req.path.slice(BASE_SITIO.length + 1) || '/';
    const r = await this.sitio.servir(resolverPedido(ruta));
    this.enviar(req, res, r.estado, r.tipo, r.cuerpo);
  }

  private enviar(req: Request, res: Response, estado: number, tipo: Parameters<typeof cabecerasSitio>[0], cuerpo: Uint8Array | string): void {
    const cab = cabecerasSitio(tipo, cuerpo);
    res.set(cab);
    if (estado === 200 && noModificado(req.get('if-none-match'), cab.ETag!)) {
      res.status(304).end();
      return;
    }
    res.status(estado).send(typeof cuerpo === 'string' ? cuerpo : Buffer.from(cuerpo));
  }
}
