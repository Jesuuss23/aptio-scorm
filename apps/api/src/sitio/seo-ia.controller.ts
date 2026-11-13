import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { PreguntaIaCambioDto, PreguntaIaDto, PreguntaIaEntradaDto, PropuestaIaDto, PropuestasPedidasDto, SeoIaCambioDto, SeoIaDto } from './seo-ia.dto.js';
import { SeoIaService } from './seo-ia.service.js';

/** HU-1513 · Sitio web › SEO para IA (REQ-072, PNT-30): solo el superadmin; 403 al resto y 401 sin sesión. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('sitio/seo-ia')
@Roles('SUPERADMIN')
export class SeoIaController {
  constructor(private readonly seoIa: SeoIaService) {}

  @Get()
  @ApiOkResponse({ type: SeoIaDto })
  ver(): Promise<SeoIaDto> {
    return this.seoIa.ver();
  }

  @Patch()
  @ApiOkResponse({ type: SeoIaDto })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO (llms.txt con HTML o de más de 20 000 caracteres, o un rastreador fuera del catálogo) o SIN_CAMBIOS' })
  actualizar(@UsuarioActual() u: UsuarioSesion, @Body() dto: SeoIaCambioDto): Promise<SeoIaDto> {
    return this.seoIa.actualizar(u, dto);
  }

  @Post('preguntas')
  @ApiCreatedResponse({ type: PreguntaIaDto })
  @ApiConflictResponse({ description: 'PREGUNTA_REPETIDA' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO o LIMITE_PREGUNTAS (hasta 50)' })
  crearPregunta(@UsuarioActual() u: UsuarioSesion, @Body() dto: PreguntaIaEntradaDto): Promise<PreguntaIaDto> {
    return this.seoIa.crearPregunta(u, dto.pregunta);
  }

  @Patch('preguntas/:preguntaId')
  @ApiOkResponse({ type: PreguntaIaDto })
  @ApiNotFoundResponse({ description: 'La pregunta no existe' })
  @ApiConflictResponse({ description: 'PREGUNTA_REPETIDA' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO (texto, asistente o marca) o SIN_CAMBIOS' })
  cambiarPregunta(@UsuarioActual() u: UsuarioSesion, @Param('preguntaId', ParseUUIDPipe) id: string, @Body() dto: PreguntaIaCambioDto): Promise<PreguntaIaDto> {
    return this.seoIa.cambiarPregunta(u, id, dto);
  }

  @Delete('preguntas/:preguntaId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrada' })
  @ApiNotFoundResponse({ description: 'La pregunta no existe' })
  borrarPregunta(@UsuarioActual() u: UsuarioSesion, @Param('preguntaId', ParseUUIDPipe) id: string): Promise<void> {
    return this.seoIa.borrarPregunta(u, id);
  }

  @Post('proponer')
  @HttpCode(200)
  @ApiOkResponse({ type: PropuestasPedidasDto, description: 'IA-19 respondió y su salida validó: las propuestas nuevas quedan pendientes' })
  @ApiUnprocessableEntityResponse({ description: 'SIN_PREGUNTAS (no hay preguntas objetivo), LIMITE_GASTO (la plataforma llegó a su límite del mes) o MODELO_SIN_TARIFA' })
  @ApiBadGatewayResponse({ description: 'PROPUESTA_NO_VALIDA (la salida no validó tras 3 intentos; nada se guarda) o IA_NO_DISPONIBLE' })
  proponer(@UsuarioActual() u: UsuarioSesion): Promise<PropuestasPedidasDto> {
    return this.seoIa.proponer(u);
  }

  @Post('propuestas/:propuestaId/borrador')
  @HttpCode(200)
  @ApiOkResponse({ type: PropuestaIaDto, description: 'CP-127 · Se creó la página en borrador o la pregunta oculta; nada se publica' })
  @ApiNotFoundResponse({ description: 'La propuesta no existe' })
  @ApiConflictResponse({ description: 'PROPUESTA_RESUELTA (ya tiene borrador o se descartó) o RUTA_EN_USO' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO: la propuesta ya no cumple las reglas del sitio' })
  crearBorrador(@UsuarioActual() u: UsuarioSesion, @Param('propuestaId', ParseUUIDPipe) id: string): Promise<PropuestaIaDto> {
    return this.seoIa.crearBorrador(u, id);
  }

  @Post('propuestas/:propuestaId/descartar')
  @HttpCode(200)
  @ApiOkResponse({ type: PropuestaIaDto })
  @ApiNotFoundResponse({ description: 'La propuesta no existe' })
  @ApiConflictResponse({ description: 'PROPUESTA_RESUELTA' })
  descartar(@UsuarioActual() u: UsuarioSesion, @Param('propuestaId', ParseUUIDPipe) id: string): Promise<PropuestaIaDto> {
    return this.seoIa.descartar(u, id);
  }
}
