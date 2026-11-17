import { Body, Controller, Delete, Get, Header, HttpCode, HttpException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import {
  ApiBody, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiExcludeEndpoint, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags,
  ApiTooManyRequestsResponse, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { leerAjustesSitio } from '@aptio/db';
import { textoFechaCita } from '@aptio/schema/agenda';
import { ajustesPublicados } from '@aptio/schema/sitio-ajustes';
import { ARCHIVO_AGENDA_JSON, cabecerasSitio, type EstadoPaginaCita, opcionesRenderDesdeEnv, renderizarCita, RUTA_CITA } from '@aptio/sitio';
import { Publico, Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { BASE_SITIO } from '../sitio/sitio-publico.controller.js';
import {
  AgendaDto, AjustesAgendaCambioDto, AjustesAgendaDto, AsesorDto, AsesorEntradaDto, CambioCitaDto, CancelacionDto, CancelacionEntradaDto, CitaDto, CitasDto, ConsultaCitasDto,
  OrdenTiposDto, ReservaEntradaDto, ReservaRecibidaDto, TipoReunionDto, TipoReunionEntradaDto,
} from './agenda.dto.js';
import { AgendaService } from './agenda.service.js';

const ipDe = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'desconocida';

/** HU-1605 · Captación › Agendamiento (REQ-078, PNT-33, RN-17-5). Solo el superadmin. */
@ApiTags('Captación')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('captacion/agenda')
@Roles('SUPERADMIN')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AgendaDto })
  ver(): Promise<AgendaDto> {
    return this.agenda.ver();
  }

  @Patch()
  @ApiOkResponse({ type: AjustesAgendaDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  cambiarAjustes(@UsuarioActual() u: UsuarioSesion, @Body() dto: AjustesAgendaCambioDto): Promise<AjustesAgendaDto> {
    return this.agenda.cambiarAjustes(u, dto);
  }

  @Post('tipos')
  @ApiCreatedResponse({ type: TipoReunionDto, description: 'Se crea apagado salvo que llegue `visible: true`' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  crearTipo(@UsuarioActual() u: UsuarioSesion, @Body() dto: TipoReunionEntradaDto): Promise<TipoReunionDto> {
    return this.agenda.crearTipo(u, dto);
  }

  @Put('tipos/orden')
  @ApiOkResponse({ type: [TipoReunionDto] })
  @ApiUnprocessableEntityResponse({ description: 'ORDEN_INCOMPLETO: faltan tipos o se repiten' })
  ordenarTipos(@UsuarioActual() u: UsuarioSesion, @Body() dto: OrdenTiposDto): Promise<TipoReunionDto[]> {
    return this.agenda.ordenarTipos(u, dto.ids);
  }

  @Patch('tipos/:id')
  @ApiOkResponse({ type: TipoReunionDto })
  @ApiNotFoundResponse({ description: 'El tipo no existe' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  cambiarTipo(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TipoReunionEntradaDto): Promise<TipoReunionDto> {
    return this.agenda.cambiarTipo(u, id, dto);
  }

  @Delete('tipos/:id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrado; el resto se reordena sin huecos' })
  @ApiNotFoundResponse({ description: 'El tipo no existe' })
  @ApiConflictResponse({ description: 'TIPO_CON_CITAS: tiene citas; se apaga en vez de borrarlo' })
  borrarTipo(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.agenda.borrarTipo(u, id);
  }

  @Post('asesores')
  @ApiCreatedResponse({ type: AsesorDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  crearAsesor(@UsuarioActual() u: UsuarioSesion, @Body() dto: AsesorEntradaDto): Promise<AsesorDto> {
    return this.agenda.crearAsesor(u, dto);
  }

  @Patch('asesores/:id')
  @ApiOkResponse({ type: AsesorDto })
  @ApiNotFoundResponse({ description: 'El asesor no existe' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  cambiarAsesor(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AsesorEntradaDto): Promise<AsesorDto> {
    return this.agenda.cambiarAsesor(u, id, dto);
  }

  @Delete('asesores/:id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrado' })
  @ApiNotFoundResponse({ description: 'El asesor no existe' })
  @ApiConflictResponse({ description: 'ASESOR_CON_CITAS: tiene citas; se apaga en vez de borrarlo' })
  borrarAsesor(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.agenda.borrarAsesor(u, id);
  }

  @Get('citas')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CitasDto, description: 'De la más próxima a la más lejana, hasta 500' })
  citas(@Query() q: ConsultaCitasDto): Promise<CitasDto> {
    return this.agenda.citas(q);
  }

  @Patch('citas/:id')
  @ApiOkResponse({ type: CitaDto })
  @ApiNotFoundResponse({ description: 'La cita no existe' })
  @ApiConflictResponse({ description: 'CITA_NO_ACTIVA: no se puede pasar a ese estado' })
  @ApiUnprocessableEntityResponse({ description: 'CITA_FUTURA: realizada o no asistió solo después de su inicio' })
  cambiarCita(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CambioCitaDto): Promise<CitaDto> {
    return this.agenda.cambiarCita(u, id, dto.estado);
  }
}

/**
 * HU-1605 · Entradas públicas del agendador, sin sesión. `POST /publico/citas` y `/publico/citas/cancelar` (JSON, con
 * el límite general de `/publico/*` y el propio). En el sitio, documentados a mano en openapi.yaml como el resto de
 * `/s/*`: `GET /s/_agenda.json` en vivo (la CDN lo guarda 15 s; la reserva vuelve a comprobar la franja) y la página del
 * enlace de cancelación `GET` y `POST /s/_cita`, que funciona sin JavaScript. Este módulo se registra antes que el del
 * sitio para que su `GET` no lo tome la ruta comodín `/s/*`.
 */
@ApiTags('Sitio público')
@Controller()
@Publico()
export class AgendaPublicoController {
  constructor(private readonly agenda: AgendaService, private readonly baseDatos: BaseDatosService) {}

  @Post('publico/citas')
  @HttpCode(201)
  @ApiBody({ type: ReservaEntradaDto })
  @ApiCreatedResponse({ type: ReservaRecibidaDto })
  @ApiConflictResponse({ description: 'FRANJA_OCUPADA: otro visitante tomó la franja (CP-135)' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO (con `detalles`), TIPO_NO_DISPONIBLE o FRANJA_NO_VALIDA' })
  @ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES: más de 5 en 10 minutos desde la misma IP' })
  async reservar(@Body() cuerpo: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<ReservaRecibidaDto> {
    res.setHeader('Cache-Control', 'no-store');
    return this.agenda.reservar(cuerpo, ipDe(req), `/${BASE_SITIO}`);
  }

  @Post('publico/citas/cancelar')
  @HttpCode(200)
  @ApiBody({ type: CancelacionEntradaDto })
  @ApiOkResponse({ type: CancelacionDto })
  @ApiNotFoundResponse({ description: 'CITA_NO_ENCONTRADA' })
  @ApiConflictResponse({ description: 'CITA_NO_ACTIVA o CITA_YA_EMPEZO' })
  @ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES' })
  async cancelar(@Body() cuerpo: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<CancelacionDto> {
    res.setHeader('Cache-Control', 'no-store');
    const r = await this.agenda.cancelarPorToken(cuerpo?.token, ipDe(req));
    return { cancelada: true, texto: r.texto };
  }

  @Get(`${BASE_SITIO}/${ARCHIVO_AGENDA_JSON}`)
  @ApiExcludeEndpoint()
  async agendaPublica(@Query('tipo') tipo: unknown, @Query('idioma') idioma: unknown, @Req() req: Request, @Res() res: Response): Promise<void> {
    const datos = await this.agenda.publica(tipo, idioma === 'en' ? 'en' : 'es', ipDe(req));
    res.set({ 'Cache-Control': 'public, max-age=0, s-maxage=15', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.status(200).send(JSON.stringify(datos));
  }

  /** La página del enlace de cancelación: muestra la cita y un botón para confirmar (no cancela al abrirla). */
  @Get(`${BASE_SITIO}/${RUTA_CITA}`)
  @ApiExcludeEndpoint()
  async paginaCita(@Query('t') token: unknown, @Res() res: Response): Promise<void> {
    const c = await this.agenda.porToken(token);
    const idioma = c?.idioma === 'en' ? 'en' : 'es';
    const d: EstadoPaginaCita = !c ? { estado: 'no_encontrada' }
      : c.estado !== 'confirmada' ? { estado: 'inactiva' }
        : c.inicio.getTime() <= Date.now() ? { estado: 'empezada' }
          : { estado: 'activa', token: token as string, tipo: idioma === 'en' && c.tipo.nombreEn ? c.tipo.nombreEn : c.tipo.nombreEs, texto: textoFechaCita(c.inicio, idioma) };
    await this.enviarPagina(res, d, idioma, c ? 200 : 404);
  }

  @Post(`${BASE_SITIO}/${RUTA_CITA}`)
  @ApiExcludeEndpoint()
  async confirmarCancelacion(@Body() cuerpo: Record<string, unknown>, @Req() req: Request, @Res() res: Response): Promise<void> {
    const idiomaPedido = cuerpo?.idioma === 'en' ? 'en' : 'es';
    try {
      const r = await this.agenda.cancelarPorToken(cuerpo?.t, ipDe(req));
      const idioma = r.cita.idioma === 'en' ? 'en' : 'es';
      await this.enviarPagina(res, { estado: 'cancelada', tipo: idioma === 'en' && r.cita.tipo.nombreEn ? r.cita.tipo.nombreEn : r.cita.tipo.nombreEs, texto: r.texto }, idioma, 200);
    } catch (e) {
      if (!(e instanceof HttpException)) throw e;
      const codigo = (e.getResponse() as { codigo?: string }).codigo;
      if (e.getStatus() === 429) throw e;
      const estado = codigo === 'CITA_YA_EMPEZO' ? 'empezada' : codigo === 'CITA_NO_ACTIVA' ? 'inactiva' : 'no_encontrada';
      await this.enviarPagina(res, { estado }, idiomaPedido, e.getStatus());
    }
  }

  private async enviarPagina(res: Response, d: EstadoPaginaCita, idioma: 'es' | 'en', estado: number): Promise<void> {
    const ajustes = await leerAjustesSitio(this.baseDatos.cliente);
    const html = renderizarCita(ajustes ? { sitio: ajustesPublicados(ajustes) } : null, opcionesRenderDesdeEnv(), d, idioma);
    res.set({ ...cabecerasSitio('404', html), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    res.removeHeader('ETag');
    res.status(estado).send(html);
  }
}
