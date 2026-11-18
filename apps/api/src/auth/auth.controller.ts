import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiExcludeEndpoint, ApiExtraModels, ApiFoundResponse, ApiNoContentResponse, ApiOkResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { PermitidoSuspendida, Publico, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { aUsuarioDto, UsuarioDto } from '../usuarios/usuario.dto.js';
import {
  CodigoTotpDto,
  ConfiguracionSegundoFactorDto,
  DesafioDto,
  EstadoSegundoFactorDto,
  IngresoDto,
  NuevaClaveDto,
  SesionConCodigosDto,
  SesionDto,
  SesionRecuperacionDto,
  SolicitudClaveDto,
  VerificacionSegundoFactorDto,
} from './auth.dto.js';
import { AuthService, type Desafio } from './auth.service.js';
import { ConfigSesion } from './config-sesion.js';
import { RechazoGoogle } from './google-oidc.js';
import { GoogleService } from './google.service.js';
import { type Configuracion, SegundoFactorService } from './segundo-factor.service.js';
import { COOKIE_SESION } from './sesion.js';

const COOKIE_GOOGLE = 'google_oidc';
const RUTA_GOOGLE = '/api/v1/auth/google';
/** HU-1515 · Cookie del paso del segundo factor: solo viaja a sus rutas y no sirve como sesión. */
const COOKIE_DESAFIO = 'segundo_factor';
const RUTA_DESAFIO = '/api/v1/auth/segundo-factor';

@ApiTags('Acceso')
@ApiExtraModels(SesionDto, DesafioDto)
@Controller()
// HU-1708 · Sigue disponible con la cuenta suspendida (solo lectura).
@PermitidoSuspendida()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigSesion,
    private readonly baseDatos: BaseDatosService,
    private readonly google: GoogleService,
    private readonly segundoFactor: SegundoFactorService,
  ) {}

  private ponerSesion(res: Response, token: string, expira: Date) {
    res.cookie(COOKIE_SESION, token, { httpOnly: true, secure: this.config.cookieSegura, sameSite: 'lax', path: '/', expires: expira });
  }

  @Post('auth/ingresar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Crea la cookie httpOnly `sesion`; al superadmin, en cambio, la cookie `segundo_factor` y le pide el código (HU-1515)',
    schema: { oneOf: [{ $ref: getSchemaPath(SesionDto) }, { $ref: getSchemaPath(DesafioDto) }] },
  })
  async ingresar(@Body() dto: IngresoDto, @Res({ passthrough: true }) res: Response): Promise<SesionDto | DesafioDto> {
    const r = await this.auth.ingresar(dto.email, dto.clave);
    if (r.tipo === 'desafio') {
      this.ponerDesafio(res, r);
      return { segundoFactor: r.segundoFactor, expira: r.expira.toISOString() };
    }
    this.ponerSesion(res, r.token, r.expira);
    return { usuario: r.usuario, expira: r.expira.toISOString() };
  }

  private ponerDesafio(res: Response, d: Desafio) {
    res.cookie(COOKIE_DESAFIO, d.token, { httpOnly: true, secure: this.config.cookieSegura, sameSite: 'strict', path: RUTA_DESAFIO, expires: d.expira });
  }

  /** Abre la sesión y borra el desafío. */
  private cerrarDesafio(res: Response, token: string, expira: Date) {
    res.clearCookie(COOKIE_DESAFIO, { path: RUTA_DESAFIO });
    this.ponerSesion(res, token, expira);
  }

  private desafio(req: Request) {
    return this.segundoFactor.usuarioDelDesafio(req.cookies?.[COOKIE_DESAFIO] as string | undefined);
  }

  /** HU-1515 · Qué falta: escribir el código o configurar la aplicación por primera vez. */
  @Get('auth/segundo-factor')
  @Publico()
  @ApiOkResponse({ type: EstadoSegundoFactorDto })
  async estadoSegundoFactor(@Req() req: Request): Promise<EstadoSegundoFactorDto> {
    return this.segundoFactor.estado(await this.desafio(req));
  }

  /** HU-1515 · Secreto y código QR para la aplicación autenticadora (solo mientras no está configurado). */
  @Post('auth/segundo-factor/configurar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ConfiguracionSegundoFactorDto })
  async configurarSegundoFactor(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<Configuracion> {
    res.setHeader('Cache-Control', 'no-store');
    return this.segundoFactor.configurar(await this.desafio(req));
  }

  /** HU-1515 · CP-160: el primer código activa el segundo factor, abre la sesión y entrega los códigos de recuperación. */
  @Post('auth/segundo-factor/confirmar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SesionConCodigosDto })
  async confirmarSegundoFactor(@Body() dto: CodigoTotpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SesionConCodigosDto> {
    const { token, expira, usuario, codigosRecuperacion } = await this.segundoFactor.confirmar(await this.desafio(req), dto.codigo);
    res.setHeader('Cache-Control', 'no-store');
    this.cerrarDesafio(res, token, expira);
    return { usuario, expira: expira.toISOString(), codigosRecuperacion };
  }

  /** HU-1515 · CP-161: código de la aplicación o de recuperación; recién aquí se abre la sesión del superadmin. */
  @Post('auth/segundo-factor')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SesionRecuperacionDto })
  async verificarSegundoFactor(@Body() dto: VerificacionSegundoFactorDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SesionRecuperacionDto> {
    const r = await this.segundoFactor.verificar(await this.desafio(req), {
      ...(dto.codigo ? { codigo: dto.codigo } : {}),
      ...(dto.codigoRecuperacion ? { codigoRecuperacion: dto.codigoRecuperacion } : {}),
    });
    this.cerrarDesafio(res, r.token, r.expira);
    return { usuario: r.usuario, expira: r.expira.toISOString(), ...(r.codigosRestantes !== undefined ? { codigosRestantes: r.codigosRestantes } : {}) };
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
      const r = await this.google.completar(
        { ...(typeof q.code === 'string' ? { code: q.code } : {}), ...(typeof q.state === 'string' ? { state: q.state } : {}), ...(typeof q.error === 'string' ? { error: q.error } : {}) },
        req.cookies?.[COOKIE_GOOGLE] as string | undefined,
      );
      if (r.tipo === 'desafio') {
        // HU-1515 · Google no basta para el superadmin: sigue con el segundo factor.
        this.ponerDesafio(res, r);
        res.redirect(302, `${this.config.urlWeb}/ingresar/segundo-factor`);
        return;
      }
      this.ponerSesion(res, r.token, r.expira);
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
