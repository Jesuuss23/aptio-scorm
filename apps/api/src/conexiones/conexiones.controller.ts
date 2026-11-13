import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { ConexionEntradaDto, ConexionesIADto, ConexionIADto, PruebaProveedorDto } from './conexiones.dto.js';
import { ConexionesService } from './conexiones.service.js';

/** HU-1304 · Empresa › Conexiones IA (PNT-23): solo administración ve, cambia y prueba las conexiones. */
@ApiTags('Conexiones IA')
@ApiCookieAuth('sesion')
@Controller('conexiones-ia')
@Roles('ADMINISTRADOR')
export class ConexionesController {
  constructor(private readonly conexiones: ConexionesService) {}

  @Get()
  @ApiOkResponse({ type: ConexionesIADto })
  listar(@UsuarioActual() u: UsuarioSesion): Promise<ConexionesIADto> {
    return this.conexiones.listar(u);
  }

  @Put(':tarea')
  @ApiOkResponse({ type: ConexionIADto })
  guardar(@UsuarioActual() u: UsuarioSesion, @Param('tarea') tarea: string, @Body() dto: ConexionEntradaDto): Promise<ConexionIADto> {
    return this.conexiones.guardar(u, tarea, dto);
  }

  @Post(':tarea/probar')
  @HttpCode(200)
  @ApiOkResponse({ type: PruebaProveedorDto })
  probar(@UsuarioActual() u: UsuarioSesion, @Param('tarea') tarea: string): Promise<PruebaProveedorDto> {
    return this.conexiones.probar(u, tarea);
  }
}
