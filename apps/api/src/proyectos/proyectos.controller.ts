import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EQUIPO } from '../comun/organizacion.js';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { MaterialDto, MaterialEntradaDto } from './material.dto.js';
import { MaterialesService } from './materiales.service.js';
import { FiltroProyectosDto, ProyectoCambioDto, ProyectoDto, ProyectoEntradaDto } from './proyecto.dto.js';
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
