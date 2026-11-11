// HU-1202 · Rutas de la entrega (M12): exportar, historial y descarga. HU-1201: validar antes de exportar.
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { ExportacionDto, ExportacionEntradaDto, ValidacionDto } from './exportacion.dto.js';
import { ExportacionesService } from './exportaciones.service.js';

/** Exportan administración, diseño instruccional y producción; el revisor del cliente no (403). */
const EXPORTAN = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR'] as const;

@ApiTags('Entrega')
@ApiCookieAuth('sesion')
@Controller()
@Roles(...EQUIPO)
export class ExportacionesController {
  constructor(private readonly exportaciones: ExportacionesService) {}

  @Post('cursos/:cursoId/validar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ValidacionDto, description: 'Nunca bloquea por tamaño (RN-12-2). Los errores de esquema vienen en `errores`. 422 FORMATO_NO_DISPONIBLE o IDIOMA_NO_DISPONIBLE' })
  validar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Body() dto: ExportacionEntradaDto): Promise<ValidacionDto> {
    return this.exportaciones.validar(u, id, dto);
  }

  @Post('cursos/:cursoId/exportaciones')
  @Roles(...EXPORTAN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: ExportacionDto, description: 'En cola, ligada a la versión actual del curso. 422 ESQUEMA_NO_VALIDO, FORMATO_NO_DISPONIBLE o IDIOMA_NO_DISPONIBLE' })
  exportar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string, @Body() dto: ExportacionEntradaDto): Promise<ExportacionDto> {
    return this.exportaciones.exportar(u, id, dto);
  }

  @Get('cursos/:cursoId/exportaciones')
  @ApiOkResponse({ type: ExportacionDto, isArray: true, description: 'Historial, de la más nueva a la más antigua (50 como máximo)' })
  listar(@UsuarioActual() u: UsuarioSesion, @Param('cursoId', ParseUUIDPipe) id: string): Promise<ExportacionDto[]> {
    return this.exportaciones.listar(u, id);
  }

  @Get('exportaciones/:exportacionId')
  @ApiOkResponse({ type: ExportacionDto, description: 'descargaUrl firmada por 15 minutos, solo en COMPLETADO' })
  ver(@UsuarioActual() u: UsuarioSesion, @Param('exportacionId', ParseUUIDPipe) id: string): Promise<ExportacionDto> {
    return this.exportaciones.ver(u, id);
  }
}
