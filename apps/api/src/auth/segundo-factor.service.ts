// HU-1515 · Segundo factor del superadmin (SUP-167, ADR-011): configurar la aplicación autenticadora, verificar el
// código de 6 dígitos o un código de recuperación, y recién ahí abrir la sesión (CP-160, CP-161).
import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Usuario } from '@aptio/db';
import QRCode from 'qrcode';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { AuthService, cuentaBloqueada, type Ingreso } from './auth.service.js';
import { ConfigSesion } from './config-sesion.js';
import { leerSesion } from './sesion.js';
import {
  cifrar,
  descifrar,
  hashCodigoRecuperacion,
  normalizarCodigoRecuperacion,
  nuevoSecreto,
  nuevosCodigosRecuperacion,
  uriOtpauth,
  verificarCodigo,
} from './totp.js';

const desafioNoValido = () =>
  new HttpException({ codigo: 'DESAFIO_NO_VALIDO', mensaje: 'El paso del segundo factor venció. Vuelve a ingresar.' }, HttpStatus.UNAUTHORIZED);
const codigoIncorrecto = () => new HttpException({ codigo: 'CODIGO_INCORRECTO', mensaje: 'Código incorrecto' }, HttpStatus.UNAUTHORIZED);

export interface Configuracion {
  secreto: string;
  uri: string;
  qrSvg: string;
}

@Injectable()
export class SegundoFactorService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly auth: AuthService,
    private readonly config: ConfigSesion,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** El superadmin del desafío, si la cookie es válida, no venció y nada cambió desde la clave. */
  async usuarioDelDesafio(token: string | undefined): Promise<Usuario> {
    const datos = leerSesion(token, this.config.secretoDesafio);
    if (!datos) throw desafioNoValido();
    const u = await this.bd.usuario.findUnique({ where: { id: datos.u } });
    if (!u || !u.activo || u.rol !== 'SUPERADMIN' || u.versionSesion !== datos.v) throw desafioNoValido();
    if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) throw cuentaBloqueada();
    return u;
  }

  estado(u: Usuario): { segundoFactor: 'verificar' | 'configurar'; email: string } {
    return { segundoFactor: u.totpSecretoCifrado ? 'verificar' : 'configurar', email: u.email };
  }

  /** Secreto nuevo pendiente de confirmar, con su QR. Solo mientras el segundo factor no está activo. */
  async configurar(u: Usuario): Promise<Configuracion> {
    if (u.totpSecretoCifrado) {
      throw new ConflictException({ codigo: 'SEGUNDO_FACTOR_ACTIVO', mensaje: 'El segundo factor ya está configurado' });
    }
    const secreto = nuevoSecreto();
    await this.bd.usuario.update({ where: { id: u.id }, data: { totpPendienteCifrado: cifrar(secreto, this.config.claveTotp) } });
    const uri = uriOtpauth(secreto, u.email);
    const qrSvg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    return { secreto, uri, qrSvg };
  }

  /** CP-160 · El primer código correcto activa el segundo factor, entrega los 10 códigos de recuperación y abre la sesión. */
  async confirmar(u: Usuario, codigo: string): Promise<Ingreso & { codigosRecuperacion: string[] }> {
    if (u.totpSecretoCifrado) {
      throw new ConflictException({ codigo: 'SEGUNDO_FACTOR_ACTIVO', mensaje: 'El segundo factor ya está configurado' });
    }
    if (!u.totpPendienteCifrado) {
      throw new ConflictException({ codigo: 'SIN_CONFIGURACION', mensaje: 'Primero escanea el código QR' });
    }
    const paso = verificarCodigo(descifrar(u.totpPendienteCifrado, this.config.claveTotp), codigo, Date.now(), null);
    if (paso === null) return this.fallo(u);

    const codigos = nuevosCodigosRecuperacion();
    const activado = await this.bd.$transaction(async (tx) => {
      // Solo confirma si el secreto pendiente sigue siendo el que se verificó (dos confirmaciones a la vez: gana una).
      const r = await tx.usuario.updateMany({
        where: { id: u.id, totpSecretoCifrado: null, totpPendienteCifrado: u.totpPendienteCifrado },
        data: { totpSecretoCifrado: u.totpPendienteCifrado, totpPendienteCifrado: null, totpActivoDesde: new Date(), totpUltimoPaso: paso },
      });
      if (r.count !== 1) return false;
      await tx.codigoRecuperacion.deleteMany({ where: { usuarioId: u.id } });
      await tx.codigoRecuperacion.createMany({
        data: codigos.map((c) => ({ usuarioId: u.id, hash: hashCodigoRecuperacion(c, this.config.claveTotp) })),
      });
      return true;
    });
    if (!activado) throw new ConflictException({ codigo: 'SEGUNDO_FACTOR_ACTIVO', mensaje: 'El segundo factor ya está configurado' });
    await this.auth.auditar(u.id, u.organizacionId, 'SEGUNDO_FACTOR_ACTIVADO');
    return { ...(await this.auth.abrirSesion(u, 'segundo_factor')), codigosRecuperacion: codigos };
  }

  /** CP-161 · Código de la aplicación (una sola vez por paso) o código de recuperación (una sola vez). */
  async verificar(u: Usuario, entrada: { codigo?: string; codigoRecuperacion?: string }): Promise<Ingreso & { codigosRestantes?: number }> {
    if (!u.totpSecretoCifrado) {
      throw new ConflictException({ codigo: 'SIN_SEGUNDO_FACTOR', mensaje: 'Primero configura el segundo factor' });
    }
    if (entrada.codigo) {
      const paso = verificarCodigo(descifrar(u.totpSecretoCifrado, this.config.claveTotp), entrada.codigo, Date.now(), u.totpUltimoPaso);
      if (paso === null) return this.fallo(u);
      // El paso aceptado se guarda solo si es posterior al último: el mismo código no entra dos veces.
      const r = await this.bd.usuario.updateMany({
        where: { id: u.id, OR: [{ totpUltimoPaso: null }, { totpUltimoPaso: { lt: paso } }] },
        data: { totpUltimoPaso: paso },
      });
      if (r.count !== 1) return this.fallo(u);
      return this.auth.abrirSesion(u, 'segundo_factor');
    }
    if (entrada.codigoRecuperacion && normalizarCodigoRecuperacion(entrada.codigoRecuperacion).length === 10) {
      const hash = hashCodigoRecuperacion(entrada.codigoRecuperacion, this.config.claveTotp);
      const r = await this.bd.codigoRecuperacion.updateMany({ where: { usuarioId: u.id, hash, usadoEn: null }, data: { usadoEn: new Date() } });
      if (r.count !== 1) return this.fallo(u);
      const restantes = await this.bd.codigoRecuperacion.count({ where: { usuarioId: u.id, usadoEn: null } });
      await this.auth.auditar(u.id, u.organizacionId, 'CODIGO_RECUPERACION_USADO', { restantes });
      return { ...(await this.auth.abrirSesion(u, 'segundo_factor')), codigosRestantes: restantes };
    }
    return this.fallo(u);
  }

  /** Un código equivocado cuenta como un intento fallido de ingreso: 5 bloquean la cuenta 15 minutos. */
  private async fallo(u: Usuario): Promise<never> {
    await this.auth.auditar(u.id, u.organizacionId, 'SEGUNDO_FACTOR_FALLIDO');
    await this.auth.registrarFallo(u.id, u.intentosFallidos);
    throw codigoIncorrecto();
  }
}
