import { HttpException, HttpStatus, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { hashearClave, verificarClave, type Prisma, type Usuario } from '@aptio/db';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { CorreoService } from '../correo/correo.service.js';
import { aUsuarioDto, type UsuarioDto } from '../usuarios/usuario.dto.js';
import { ConfigSesion } from './config-sesion.js';
import { firmarSesion } from './sesion.js';
import { TokensService } from './tokens.service.js';

export const INTENTOS_MAXIMOS = 5; // RN-01-1
export const BLOQUEO_MS = 15 * 60 * 1000;
export const PEDIDOS_CLAVE_POR_HORA = 3;

// Hash de relleno: se verifica cuando el correo no existe para que la respuesta tarde lo mismo.
const HASH_RELLENO = hashearClave('clave-de-relleno-que-nunca-coincide');

@Injectable()
export class AuthService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly tokens: TokensService,
    private readonly correo: CorreoService,
    private readonly config: ConfigSesion,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** CP-004 / CP-005. Devuelve la sesión firmada y el usuario. */
  async ingresar(emailBruto: string, clave: string): Promise<{ token: string; expira: Date; usuario: UsuarioDto }> {
    const email = emailBruto.trim().toLowerCase();
    const u = await this.bd.usuario.findUnique({ where: { email } });
    const ahora = new Date();

    if (u?.bloqueadoHasta && u.bloqueadoHasta > ahora) {
      throw new HttpException(
        { codigo: 'CUENTA_BLOQUEADA', mensaje: 'Cuenta bloqueada por intentos fallidos. Intenta de nuevo en 15 minutos.' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const correcta = await verificarClave(u?.hashClave ?? (await HASH_RELLENO), clave);
    if (!u || !u.activo || !u.hashClave || !correcta) {
      if (u) await this.registrarFallo(u.id, u.intentosFallidos);
      throw new HttpException({ codigo: 'CREDENCIALES', mensaje: 'Correo o clave incorrectos' }, HttpStatus.UNAUTHORIZED);
    }

    return this.abrirSesion(u, 'clave');
  }

  /** Firma la sesión de un usuario ya autenticado (con clave o con Google) y registra el ingreso. */
  async abrirSesion(u: Usuario, metodo: 'clave' | 'google'): Promise<{ token: string; expira: Date; usuario: UsuarioDto }> {
    const ahora = new Date();
    await this.bd.usuario.update({
      where: { id: u.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoIngreso: ahora },
    });
    await this.auditar(u.id, u.organizacionId, 'INGRESO', metodo === 'google' ? { metodo } : undefined);
    const expira = new Date(ahora.getTime() + this.config.ttlMs);
    const token = firmarSesion({ u: u.id, v: u.versionSesion, exp: expira.getTime() }, this.config.secreto);
    return { token, expira, usuario: aUsuarioDto(u) };
  }

  private async registrarFallo(usuarioId: string, intentosPrevios: number): Promise<void> {
    const intentos = intentosPrevios + 1;
    const bloquear = intentos >= INTENTOS_MAXIMOS;
    await this.bd.usuario.update({
      where: { id: usuarioId },
      data: bloquear
        ? { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + BLOQUEO_MS) }
        : { intentosFallidos: intentos },
    });
    if (bloquear) await this.auditar(usuarioId, null, 'CUENTA_BLOQUEADA');
  }

  /** CP-011: responde igual exista o no el correo. Máximo 3 pedidos por hora. */
  async pedirCambioClave(emailBruto: string): Promise<void> {
    const email = emailBruto.trim().toLowerCase();
    const u = await this.bd.usuario.findUnique({ where: { email } });
    if (!u || !u.activo) return;
    if ((await this.tokens.contarRecientes(u.id, 'RESTABLECER_CLAVE')) >= PEDIDOS_CLAVE_POR_HORA) return;
    const token = await this.tokens.crear(u.id, 'RESTABLECER_CLAVE');
    await this.correo.enviar({
      para: u.email,
      asunto: 'Cambia tu clave de Aptio SCORM',
      texto: `Hola ${u.nombre}:\n\nPara crear una clave nueva abre este enlace (vale 60 minutos y un solo uso):\n${this.enlace(token)}\n\nSi no lo pediste, ignora este correo.`,
    });
  }

  /**
   * Crea la clave desde una invitación o la restablece (CP-010, CP-011, CP-012).
   * Cierra las demás sesiones del usuario al subir su versión de sesión.
   */
  async restablecerClave(token: string, clave: string): Promise<void> {
    const t = await this.tokens.consumir(token);
    if (!t) {
      throw new UnprocessableEntityException({
        codigo: 'ENLACE_NO_VALIDO',
        mensaje: 'Enlace no válido o vencido. Pide uno nuevo.',
      });
    }
    const u = await this.bd.usuario.update({
      where: { id: t.usuarioId },
      data: {
        hashClave: await hashearClave(clave),
        emailVerificado: true,
        intentosFallidos: 0,
        bloqueadoHasta: null,
        versionSesion: { increment: 1 },
      },
    });
    await this.auditar(u.id, u.organizacionId, t.tipo === 'INVITACION' ? 'INVITACION_ACEPTADA' : 'CLAVE_RESTABLECIDA');
  }

  enlace(token: string): string {
    return `${this.config.urlWeb}/clave?token=${encodeURIComponent(token)}`;
  }

  async auditar(usuarioId: string | null, organizacionId: string | null, accion: string, datos?: object) {
    await this.bd.auditoria.create({
      data: { usuarioId, organizacionId, accion, entidad: 'Usuario', entidadId: usuarioId, ...(datos ? { datos: datos as Prisma.InputJsonValue } : {}) },
    });
  }
}
