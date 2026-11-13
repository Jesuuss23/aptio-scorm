import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { OperacionDto, RespaldoSolicitadoDto } from './operacion.dto.js';
import { OperacionService } from './operacion.service.js';

/** HU-1403 · Empresa › Operación: solo administración ve el estado y pide una copia de seguridad. */
@ApiTags('Plataforma')
@ApiCookieAuth('sesion')
@Controller('operacion')
@Roles('ADMINISTRADOR')
export class OperacionController {
  constructor(private readonly operacion: OperacionService) {}

  @Get()
  @ApiOkResponse({ type: OperacionDto })
  ver(@UsuarioActual() u: UsuarioSesion): Promise<OperacionDto> {
    return this.operacion.ver(u);
  }

  @Post('respaldar')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: RespaldoSolicitadoDto })
  respaldar(@UsuarioActual() u: UsuarioSesion): Promise<RespaldoSolicitadoDto> {
    return this.operacion.respaldar(u);
  }
}
