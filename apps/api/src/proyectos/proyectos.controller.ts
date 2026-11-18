import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { MaterialDto, MaterialEntradaDto } from './material.dto.js';
import { MaterialesService } from './materiales.service.js';
import { CursoDto, EntregaProyectoDto, FiltroProyectosDto, ProyectoCambioDto, ProyectoDto, ProyectoEntradaDto } from './proyecto.dto.js';
import { ProyectosService } from './proyectos.service.js';

/** docs/14-modulos.md: crean y editan proyectos administración, diseño instruccional y producción. */
const CREAN = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR'] as const;

@ApiTags('Proyectos')
@ApiCookieAuth('sesion')
@Controller('proyectos')
@Roles(...EQUIPO, 'REVISOR_CLIENTE')
export class ProyectosController {
  constructor(
    private readonly proyectos: ProyectosService,
    private readonly materiales: MaterialesService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ProyectoDto, isArray: true, description: 'El revisor del cliente solo ve los de su cliente' })
  listar(@UsuarioActual() u: UsuarioSesion, @Query() filtro: FiltroProyectosDto): Promise<ProyectoDto[]> {
    return this.proyectos.listar(u, filtro);
  }

  @Post()
  @Roles(...CREAN)
  @ApiCreatedResponse({ type: ProyectoDto })
  crear(@UsuarioActual() u: UsuarioSesion, @Body() dto: ProyectoEntradaDto): Promise<ProyectoDto> {
    return this.proyectos.crear(u, dto);
  }

  @Get(':proyectoId')
  @ApiOkResponse({ type: ProyectoDto })
  ver(@UsuarioActual() u: UsuarioSesion, @Param('proyectoId', ParseUUIDPipe) id: string): Promise<ProyectoDto> {
    return this.proyectos.ver(u, id);
  }

  @Patch(':proyectoId')
  @Roles(...CREAN)
  @ApiOkResponse({ type: ProyectoDto })
  actualizar(@UsuarioActual() u: UsuarioSesion, @Param('proyectoId', ParseUUIDPipe) id: string, @Body() dto: ProyectoCambioDto): Promise<ProyectoDto> {
    return this.proyectos.actualizar(u, id, dto);
  }

  @Delete(':proyectoId')
  @Roles(...CREAN)
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Pasa a ARCHIVADO; no borra' })
  archivar(@UsuarioActual() u: UsuarioSesion, @Param('proyectoId', ParseUUIDPipe) id: string): Promise<void> {
    return this.proyectos.archivar(u, id);
  }

  @Post(':proyectoId/entregar')
  @Roles(...CREAN)
  @HttpCode(200)
  @ApiOkResponse({ type: EntregaProyectoDto, description: 'Pasa a ENTREGADO y programa el borrado de los documentos del cliente (HU-1404, CP-104)' })
  @ApiConflictResponse({ description: 'YA_ENTREGADO, ESTADO_NO_VALIDO (no está en revisión) o SIN_EXPORTACION (aún no hay un paquete exportado)' })
  entregar(@UsuarioActual() u: UsuarioSesion, @Param('proyectoId', ParseUUIDPipe) id: string): Promise<EntregaProyectoDto> {
    return this.proyectos.entregar(u, id);
  }

  @Get(':proyectoId/curso')
  @ApiOkResponse({ type: CursoDto, description: 'ETag = versión del curso. 404 si aún no se generaron las pantallas.' })
  async curso(@UsuarioActual() u: UsuarioSesion, @Param('proyectoId', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<CursoDto> {
    const c = await this.proyectos.curso(u, id);
    res.setHeader('ETag', `"${c.version}"`);
    return c;
  }

  @Get(':proyectoId/materiales')
  @ApiOkResponse({ type: MaterialDto, isArray: true })
  listarMateriales(@UsuarioActual() u: UsuarioSesion, @Param('proyectoId', ParseUUIDPipe) id: string): Promise<MaterialDto[]> {
    return this.materiales.listar(u, id);
  }

  @Post(':proyectoId/materiales')
  @Roles(...CREAN)
  @ApiCreatedResponse({ type: MaterialDto, description: 'Con archivo, encola la extracción de texto por página (cola media)' })
  agregarMaterial(@UsuarioActual() u: UsuarioSesion, @Param('proyectoId', ParseUUIDPipe) id: string, @Body() dto: MaterialEntradaDto): Promise<MaterialDto> {
    return this.materiales.agregar(u, id, dto);
  }
}
