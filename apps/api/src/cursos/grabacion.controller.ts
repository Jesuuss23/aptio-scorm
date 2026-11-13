import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiOkResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { AudioClienteDto, GrabacionEntradaDto, GrabacionResultadoDto, LimpiezaResultadoDto, RelocucionEntradaDto } from './grabacion.dto.js';
import { GrabacionService } from './grabacion.service.js';

/** HU-0704 · Audio del cliente en Personaje y voz: solo el equipo (el revisor del cliente recibe 403). */
@ApiTags('Personaje y voz')
@ApiCookieAuth('sesion')
@Controller()
@Roles(...EQUIPO)
export class GrabacionController {
  constructor(private readonly grabacion: GrabacionService) {}

  @Get('cursos/:cursoId/audios-cliente')
  @ApiOkResponse({ type: AudioClienteDto, isArray: true, description: 'Audios del cliente del proyecto ya transcritos, con su URL y la de su versión limpia' })
  audios(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string): Promise<AudioClienteDto[]> {
    return this.grabacion.listar(u, id);
  }

  @Post('cursos/:cursoId/narraciones/:pantallaId/grabacion')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: GrabacionResultadoDto, description: 'La narración en español pasa a la grabación (una versión); el worker deja su MP3, su boca y sus subtítulos' })
  @ApiUnprocessableEntityResponse({ description: 'AUTORIZACION_REQUERIDA sin la autorización del cliente (RN-07-4); AUDIO_NO_VALIDO si el audio no es del proyecto, no está listo o no tiene transcripción' })
  usar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Param('pantallaId') pantallaId: string, @Body() dto: GrabacionEntradaDto): Promise<GrabacionResultadoDto> {
    return this.grabacion.usar(u, id, pantallaId, dto);
  }

  @Post('cursos/:cursoId/narraciones/:pantallaId/relocutar')
  @HttpCode(200)
  @ApiOkResponse({ type: GrabacionResultadoDto, description: 'La transcripción pasa al texto de la narración con la voz del kit y se regenera en cascada; `textoAnterior` sirve para Deshacer' })
  relocutar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Param('pantallaId') pantallaId: string, @Body() dto: RelocucionEntradaDto): Promise<GrabacionResultadoDto> {
    return this.grabacion.relocutar(u, id, pantallaId, dto);
  }

  @Post('materiales/:materialId/limpiar')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: LimpiezaResultadoDto, description: 'Reduce el ruido y normaliza a −16 LUFS en un audio nuevo; el original no se pisa (REQ-024)' })
  limpiar(@UsuarioActual() u: UsuarioSesion, @Param('materialId', ParseUUIDPipe) id: string): Promise<LimpiezaResultadoDto> {
    return this.grabacion.limpiar(u, id);
  }
}
