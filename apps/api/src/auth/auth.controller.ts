import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { Publico, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { aUsuarioDto, UsuarioDto } from '../usuarios/usuario.dto.js';
import { IngresoDto, NuevaClaveDto, SesionDto, SolicitudClaveDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { ConfigSesion } from './config-sesion.js';
import { COOKIE_SESION } from './sesion.js';

@ApiTags('Acceso')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigSesion,
    private readonly baseDatos: BaseDatosService,
  ) {}

  @Post('auth/ingresar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SesionDto, description: 'Crea la cookie httpOnly `sesion`' })
  async ingresar(@Body() dto: IngresoDto, @Res({ passthrough: true }) res: Response): Promise<SesionDto> {
    const { token, expira, usuario } = await this.auth.ingresar(dto.email, dto.clave);
    res.cookie(COOKIE_SESION, token, {
      httpOnly: true,
      secure: this.config.cookieSegura,
      sameSite: 'lax',
      path: '/',
      expires: expira,
    });
    return { usuario, expira: expira.toISOString() };
  }

  @Post('auth/salir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('sesion')
  @ApiNoContentResponse()
  salir(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(COOKIE_SESION, { path: '/' });
  }

  @Post('auth/clave/olvido')
  @Publico()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'Siempre 202, exista o no el correo' })
  async olvido(@Body() dto: SolicitudClaveDto): Promise<void> {
    await this.auth.pedirCambioClave(dto.email);
  }

  @Post('auth/clave/restablecer')
  @Publico()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async restablecer(@Body() dto: NuevaClaveDto): Promise<void> {
    await this.auth.restablecerClave(dto.token, dto.clave);
  }

  @Get('yo')
  @ApiCookieAuth('sesion')
  @ApiOkResponse({ type: UsuarioDto })
  async yo(@UsuarioActual() sesion: UsuarioSesion): Promise<UsuarioDto> {
    const u = await this.baseDatos.cliente.usuario.findUniqueOrThrow({ where: { id: sesion.id } });
    return aUsuarioDto(u);
  }
}
