import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { UsuarioCambioDto, UsuarioDto, UsuarioEntradaDto } from './usuario.dto.js';
import { UsuariosService } from './usuarios.service.js';

@ApiTags('Acceso')
@ApiCookieAuth('sesion')
@Controller('usuarios')
@Roles('ADMINISTRADOR')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @ApiOkResponse({ type: UsuarioDto, isArray: true })
  listar(@UsuarioActual() admin: UsuarioSesion): Promise<UsuarioDto[]> {
    return this.usuarios.listar(admin);
  }

  @Post()
  @ApiCreatedResponse({ type: UsuarioDto, description: 'Crea el usuario y le envía la invitación por correo' })
  invitar(@UsuarioActual() admin: UsuarioSesion, @Body() dto: UsuarioEntradaDto): Promise<UsuarioDto> {
    return this.usuarios.invitar(admin, dto);
  }

  @Patch(':usuarioId')
  @ApiOkResponse({ type: UsuarioDto })
  actualizar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('usuarioId', ParseUUIDPipe) id: string,
    @Body() dto: UsuarioCambioDto,
  ): Promise<UsuarioDto> {
    return this.usuarios.actualizar(admin, id, dto);
  }
}
