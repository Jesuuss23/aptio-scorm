// HU-0108 · Ingreso con Google solo para correos invitados (ADR-009): nunca crea cuentas (CP-008), exige el correo
// verificado por Google (CP-009) y vincula la cuenta por correo la primera vez (CP-007).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JsonWebKey } from 'node:crypto';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { AuthService } from './auth.service.js';
import { ConfigSesion } from './config-sesion.js';
import {
  aleatorio, type EstadoIda, firmarEstado, GOOGLE_JWKS, GOOGLE_TOKEN, iguales, leerEstado, RechazoGoogle, urlAutorizacion, verificarIdToken,
} from './google-oidc.js';

/** La ida y vuelta a Google debe completarse en 10 minutos. */
export const VIGENCIA_IDA_MS = 10 * 60 * 1000;
const CACHE_CLAVES_MS = 60 * 60 * 1000;
type Jwk = JsonWebKey & { kid?: string };

@Injectable()
export class GoogleService {
  private readonly log = new Logger('Google');
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  readonly redirectUri: string;
  private claves: { lista: Jwk[]; hasta: number } | null = null;
  /** Se reemplaza en las pruebas para simular a Google. */
  pedir: typeof fetch = (...a) => fetch(...a);

  constructor(
    config: ConfigService,
    private readonly sesion: ConfigSesion,
    private readonly auth: AuthService,
    private readonly baseDatos: BaseDatosService,
  ) {
    this.clientId = config.get<string>('GOOGLE_CLIENT_ID') || undefined;
    this.clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET') || undefined;
    this.redirectUri = config.get<string>('GOOGLE_REDIRECT_URI') || `${this.sesion.urlWeb}/api/v1/auth/google/callback`;
  }

  get disponible(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /** Arma la redirección a Google y el estado (state, nonce y verificador PKCE) que se guarda en una cookie firmada. */
  iniciar(ahora = Date.now()): { url: string; cookie: string; expira: Date } {
    if (!this.disponible) throw new RechazoGoogle('google_no_disponible', 'Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET');
    const estado: EstadoIda = { state: aleatorio(), nonce: aleatorio(), verificador: aleatorio(), exp: ahora + VIGENCIA_IDA_MS };
    return {
      url: urlAutorizacion({ clientId: this.clientId!, redirectUri: this.redirectUri, ...estado }),
      cookie: firmarEstado(estado, this.sesion.secreto),
      expira: new Date(estado.exp),
    };
  }

  /** La vuelta de Google: valida el estado, canjea el código, verifica el id_token y abre la sesión del usuario invitado. */
  async completar(q: { code?: string; state?: string; error?: string }, cookie: string | undefined) {
    if (!this.disponible) throw new RechazoGoogle('google_no_disponible', 'Google no está configurado');
    if (q.error) throw new RechazoGoogle('google_cancelado', `Google respondió ${q.error}`);
    const estado = leerEstado(cookie, this.sesion.secreto);
    if (!estado || !q.state || !iguales(q.state, estado.state)) throw new RechazoGoogle('google_fallo', 'state ausente, vencido o distinto');
    if (!q.code) throw new RechazoGoogle('google_fallo', 'falta el código');

    const idToken = await this.canjear(q.code, estado.verificador);
    let identidad;
    try {
      identidad = verificarIdToken(idToken, await this.clavesGoogle(), { clientId: this.clientId!, nonce: estado.nonce });
    } catch (e) {
      // Google rota sus claves: si el kid no está en la caché, se vuelve a pedir una vez.
      if (!(e instanceof RechazoGoogle) || e.message !== 'clave de firma desconocida') throw e;
      identidad = verificarIdToken(idToken, await this.clavesGoogle(true), { clientId: this.clientId!, nonce: estado.nonce });
    }
    if (!identidad.emailVerificado) {
      await this.auth.auditar(null, null, 'GOOGLE_RECHAZADO', { email: identidad.email, motivo: 'correo_no_verificado' });
      throw new RechazoGoogle('correo_no_verificado', `${identidad.email} no está verificado en Google`);
    }

    const bd = this.baseDatos.cliente;
    const porSub = await bd.usuario.findUnique({ where: { googleSub: identidad.sub } });
    const u = porSub ?? (await bd.usuario.findUnique({ where: { email: identidad.email } }));
    // Sin invitación no hay cuenta; tampoco si el correo ya está vinculado a otra cuenta de Google.
    if (!u || !u.activo || (u.googleSub && u.googleSub !== identidad.sub)) {
      await this.auth.auditar(u?.id ?? null, u?.organizacionId ?? null, 'GOOGLE_RECHAZADO', { email: identidad.email, motivo: 'sin_acceso' });
      throw new RechazoGoogle('sin_acceso', `${identidad.email} no tiene acceso`);
    }
    if (!u.googleSub) {
      await bd.usuario.update({ where: { id: u.id }, data: { googleSub: identidad.sub, emailVerificado: true } });
      await this.auth.auditar(u.id, u.organizacionId, 'GOOGLE_VINCULADA');
    }
    return this.auth.abrirSesion({ ...u, googleSub: identidad.sub }, 'google');
  }

  private async canjear(code: string, verificador: string): Promise<string> {
    let res: Response;
    try {
      res = await this.pedir(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, code_verifier: verificador, client_id: this.clientId!, client_secret: this.clientSecret!,
          redirect_uri: this.redirectUri, grant_type: 'authorization_code',
        }),
      });
    } catch (e) {
      throw new RechazoGoogle('google_fallo', `sin conexión con Google: ${(e as Error).message}`);
    }
    const cuerpo = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
    if (!res.ok || !cuerpo.id_token) throw new RechazoGoogle('google_fallo', `canje rechazado (${res.status} ${cuerpo.error ?? ''})`);
    return cuerpo.id_token;
  }

  private async clavesGoogle(renovar = false): Promise<Jwk[]> {
    if (!renovar && this.claves && this.claves.hasta > Date.now()) return this.claves.lista;
    const res = await this.pedir(GOOGLE_JWKS).catch((e: Error) => {
      throw new RechazoGoogle('google_fallo', `no se pudieron leer las claves de Google: ${e.message}`);
    });
    if (!res.ok) throw new RechazoGoogle('google_fallo', `claves de Google: ${res.status}`);
    const { keys } = (await res.json()) as { keys: Jwk[] };
    this.claves = { lista: keys, hasta: Date.now() + CACHE_CLAVES_MS };
    return keys;
  }

  registrarRechazo(e: RechazoGoogle) {
    this.log.warn(`Ingreso con Google rechazado (${e.motivo}): ${e.message}`);
  }
}
