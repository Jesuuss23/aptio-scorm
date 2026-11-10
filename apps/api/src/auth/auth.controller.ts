import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiExcludeEndpoint, ApiFoundResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { Publico, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { aUsuarioDto, UsuarioDto } from '../usuarios/usuario.dto.js';
import { IngresoDto, NuevaClaveDto, SesionDto, SolicitudClaveDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { ConfigSesion } from './config-sesion.js';
import { RechazoGoogle } from './google-oidc.js';
import { GoogleService } from './google.service.js';
import { COOKIE_SESION } from './sesion.js';

const COOKIE_GOOGLE = 'google_oidc';
const RUTA_GOOGLE = '/api/v1/auth/google';

@ApiTags('Acceso')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigSesion,
    private readonly baseDatos: BaseDatosService,
    private readonly google: GoogleService,
  ) {}

  private ponerSesion(res: Response, token: string, expira: Date) {
    res.cookie(COOKIE_SESION, token, { httpOnly: true, secure: this.config.cookieSegura, sameSite: 'lax', path: '/', expires: expira });
  }

  @Post('auth/ingresar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SesionDto, description: 'Crea la cookie httpOnly `sesion`' })
  async ingresar(@Body() dto: IngresoDto, @Res({ passthrough: true }) res: Response): Promise<SesionDto> {
    const { token, expira, usuario } = await this.auth.ingresar(dto.email, dto.clave);
    this.ponerSesion(res, token, expira);
    return { usuario, expira: expira.toISOString() };
  }

  /** HU-0108: lleva a Google con state, nonce y PKCE; si Google no está configurado vuelve a la web con el motivo. */
  @Get('auth/google')
  @Publico()
  @ApiFoundResponse({ description: 'Redirige a Google, o a /ingresar?error=google_no_disponible' })
  irAGoogle(@Res() res: Response): void {
    try {
      const { url, cookie, expira } = this.google.iniciar();
      res.cookie(COOKIE_GOOGLE, cookie, { httpOnly: true, secure: this.config.cookieSegura, sameSite: 'lax', path: RUTA_GOOGLE, expires: expira });
      res.redirect(302, url);
    } catch (e) {
      this.volverConError(res, e);
    }
  }

  /** Vuelta de Google: abre la sesión del usuario invitado y lleva a la web; si no, a /ingresar con el motivo (CP-007 a CP-009). */
  @Get('auth/google/callback')
  @Publico()
  @ApiExcludeEndpoint()
  async volverDeGoogle(
    @Query() q: { code?: string; state?: string; error?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.clearCookie(COOKIE_GOOGLE, { path: RUTA_GOOGLE });
    try {
      const { token, expira } = await this.google.completar(
        { ...(typeof q.code === 'string' ? { code: q.code } : {}), ...(typeof q.state === 'string' ? { state: q.state } : {}), ...(typeof q.error === 'string' ? { error: q.error } : {}) },
        req.cookies?.[COOKIE_GOOGLE] as string | undefined,
      );
      this.ponerSesion(res, token, expira);
      res.redirect(302, `${this.config.urlWeb}/`);
    } catch (e) {
      this.volverConError(res, e);
    }
  }

  private volverConError(res: Response, e: unknown) {
    if (!(e instanceof RechazoGoogle)) throw e;
    this.google.registrarRechazo(e);
    res.redirect(302, `${this.config.urlWeb}/ingresar?error=${e.motivo}`);
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
