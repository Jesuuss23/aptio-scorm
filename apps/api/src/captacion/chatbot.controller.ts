import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import {
  ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiExcludeEndpoint, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ARCHIVO_CHATBOT_JSON } from '@aptio/sitio';
import { Publico, Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { BASE_SITIO } from '../sitio/sitio-publico.controller.js';
import {
  AjustesChatbotCambioDto, AjustesChatbotDto, ChatbotDto, ChatEntradaDto, ChatRespuestaDto, ConsultaConversacionesDto, ConversacionesDto, FuenteChatDto, FuenteChatEntradaDto,
  OrdenRapidasDto, RapidaChatDto, RapidaChatEntradaDto,
} from './chatbot.dto.js';
import { ChatbotService } from './chatbot.service.js';

const ipDe = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'desconocida';

/** HU-1604 · Captación › Chatbot (REQ-077, PNT-32, RN-17-4). Solo el superadmin; cada cambio queda en la auditoría. */
@ApiTags('Captación')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('captacion/chatbot')
@Roles('SUPERADMIN')
export class ChatbotController {
  constructor(private readonly chatbot: ChatbotService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ChatbotDto })
  ver(): Promise<ChatbotDto> {
    return this.chatbot.ver();
  }

  @Patch()
  @ApiOkResponse({ type: AjustesChatbotDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  cambiarAjustes(@UsuarioActual() u: UsuarioSesion, @Body() dto: AjustesChatbotCambioDto): Promise<AjustesChatbotDto> {
    return this.chatbot.cambiarAjustes(u, dto);
  }

  @Post('rapidas')
  @ApiCreatedResponse({ type: RapidaChatDto, description: 'Se crea visible y al final, salvo que llegue `visible: false`' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO (con `detalles`) o DEMASIADAS_RAPIDAS' })
  crearRapida(@UsuarioActual() u: UsuarioSesion, @Body() dto: RapidaChatEntradaDto): Promise<RapidaChatDto> {
    return this.chatbot.crearRapida(u, dto);
  }

  @Put('rapidas/orden')
  @ApiOkResponse({ type: [RapidaChatDto] })
  @ApiUnprocessableEntityResponse({ description: 'ORDEN_INCOMPLETO: faltan respuestas o se repiten' })
  ordenarRapidas(@UsuarioActual() u: UsuarioSesion, @Body() dto: OrdenRapidasDto): Promise<RapidaChatDto[]> {
    return this.chatbot.ordenarRapidas(u, dto.ids);
  }

  @Patch('rapidas/:id')
  @ApiOkResponse({ type: RapidaChatDto })
  @ApiNotFoundResponse({ description: 'La respuesta rápida no existe' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  cambiarRapida(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RapidaChatEntradaDto): Promise<RapidaChatDto> {
    return this.chatbot.cambiarRapida(u, id, dto);
  }

  @Delete('rapidas/:id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrada; el resto se reordena sin huecos' })
  @ApiNotFoundResponse({ description: 'La respuesta rápida no existe' })
  borrarRapida(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.chatbot.borrarRapida(u, id);
  }

  @Post('fuentes')
  @ApiCreatedResponse({ type: FuenteChatDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO (con `detalles`) o DEMASIADAS_FUENTES' })
  crearFuente(@UsuarioActual() u: UsuarioSesion, @Body() dto: FuenteChatEntradaDto): Promise<FuenteChatDto> {
    return this.chatbot.crearFuente(u, dto);
  }

  @Patch('fuentes/:id')
  @ApiOkResponse({ type: FuenteChatDto })
  @ApiNotFoundResponse({ description: 'La fuente no existe' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  cambiarFuente(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FuenteChatEntradaDto): Promise<FuenteChatDto> {
    return this.chatbot.cambiarFuente(u, id, dto);
  }

  @Delete('fuentes/:id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrada' })
  @ApiNotFoundResponse({ description: 'La fuente no existe' })
  borrarFuente(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.chatbot.borrarFuente(u, id);
  }

  @Get('conversaciones')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ConversacionesDto, description: 'Las de los últimos 90 días (las vencidas se borran al leer), de la más reciente a la más antigua' })
  conversaciones(@Query() q: ConsultaConversacionesDto): Promise<ConversacionesDto> {
    return this.chatbot.conversaciones(q);
  }
}

/**
 * HU-1604 · Entradas públicas del chatbot, sin sesión. `POST /publico/chat` (JSON, con el límite general de
 * `/publico/*` y el propio de 10 por minuto). En el sitio, documentado a mano en openapi.yaml como el resto de `/s/*`:
 * `GET /s/_chatbot.json` en vivo (la CDN lo guarda 30 s: apagarlo vale sin republicar). Este módulo se registra antes
 * que el del sitio para que su `GET` no lo tome la ruta comodín `/s/*`.
 */
@ApiTags('Sitio público')
@Controller()
@Publico()
export class ChatbotPublicoController {
  constructor(private readonly chatbot: ChatbotService) {}

  @Post('publico/chat')
  @HttpCode(200)
  @ApiBody({ type: ChatEntradaDto })
  @ApiOkResponse({ type: ChatRespuestaDto, description: 'La respuesta de IA-20 con sus fuentes, o «no lo sé» con «Agendar demo» y «Hablar con una persona» (CP-133)' })
  @ApiNotFoundResponse({ description: 'CHATBOT_OCULTO' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO con el campo de cada error en `detalles`' })
  @ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES: más de 10 mensajes por minuto desde la misma IP' })
  async conversar(@Body() cuerpo: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<ChatRespuestaDto> {
    res.setHeader('Cache-Control', 'no-store');
    return this.chatbot.conversar(cuerpo, ipDe(req));
  }

  @Get(`${BASE_SITIO}/${ARCHIVO_CHATBOT_JSON}`)
  @ApiExcludeEndpoint()
  async publico(@Query('idioma') idioma: unknown, @Res() res: Response): Promise<void> {
    const datos = await this.chatbot.publico(idioma === 'en' ? 'en' : 'es');
    res.set({ 'Cache-Control': 'public, max-age=0, s-maxage=30', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.status(200).send(JSON.stringify(datos));
  }
}
