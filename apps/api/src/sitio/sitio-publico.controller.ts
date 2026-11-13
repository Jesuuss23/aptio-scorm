import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { cabecerasSitio, noModificado, resolverPedido } from '@aptio/sitio';
import type { Request, Response } from 'express';
import { Publico, type UsuarioSesion } from '../comun/roles.js';
import { AjustesService } from './ajustes.service.js';
import { type Respuesta, SitioPublicoService } from './sitio-publico.service.js';

/** Dónde se sirve el sitio, fuera del prefijo de la API. */
export const BASE_SITIO = 's';

/**
 * HU-1508 · Sitio público pre-renderizado (REQ-109, DA-08), sin sesión: `GET /s/*` entrega el HTML de la versión
 * vigente, con ETag (304 si el navegador ya lo tiene) y la página 404 en HTML. Documentado a mano en openapi.yaml.
 * HU-1509 · Con el modo mantenimiento activo, 503 con la página de aviso para todos menos el superadmin (CP-121).
 */
@ApiExcludeController()
@Controller()
@Publico()
export class SitioPublicoController {
  constructor(private readonly sitio: SitioPublicoService, private readonly ajustes: AjustesService) {}

  @Get([BASE_SITIO, `${BASE_SITIO}/{*ruta}`])
  async servir(@Req() req: Request & { usuario?: UsuarioSesion }, @Res() res: Response): Promise<void> {
    const ruta = req.path.slice(BASE_SITIO.length + 1) || '/';
    const pedido = resolverPedido(ruta);
    // HU-1509 · CP-121 · En mantenimiento los visitantes ven el aviso (503) en cualquier ruta; las fuentes y la marca se
    // siguen sirviendo para dibujarlo. El superadmin con sesión ve el sitio, sin caché compartida y con un aviso arriba.
    const ajustes = await this.ajustes.paraSitio();
    const enMantenimiento = ajustes.mantenimiento.activo && pedido?.tipo !== 'fuente' && pedido?.tipo !== 'marca';
    const superadmin = req.usuario?.rol === 'SUPERADMIN';
    if (enMantenimiento && !superadmin) {
      this.enviar(req, res, this.sitio.mantenimiento(ajustes));
      return;
    }
    const r = await this.sitio.servir(pedido);
    if (enMantenimiento && (r.tipo === 'pagina' || r.tipo === '404')) {
      const html = new TextDecoder().decode(r.cuerpo).replace('<body>', `<body><p class="aviso-pruebas" role="status">${AVISO_SUPERADMIN}</p>`);
      this.enviar(req, res, { ...r, cuerpo: new TextEncoder().encode(html) }, true);
      return;
    }
    this.enviar(req, res, r, enMantenimiento);
  }

  private enviar(req: Request, res: Response, r: Respuesta, privada = false): void {
    const cab = cabecerasSitio(r.tipo, r.cuerpo, { archivo: r.archivo, privada });
    res.set(cab);
    if (r.estado === 200 && noModificado(req.get('if-none-match'), cab.ETag!)) {
      res.status(304).end();
      return;
    }
    res.status(r.estado).send(Buffer.from(r.cuerpo));
  }
}

/** Lo que ve arriba el superadmin mientras el sitio está en mantenimiento. */
export const AVISO_SUPERADMIN = 'Modo mantenimiento activo: los visitantes ven el aviso «Volvemos pronto». Tú ves el sitio porque iniciaste sesión como superadmin.';
