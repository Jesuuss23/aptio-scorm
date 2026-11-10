// HU-0108 · Verificación del id_token de Google y del estado de la ida (sin base de datos).
import { describe, expect, it } from 'vitest';
import { desafioPkce, firmarEstado, leerEstado, RechazoGoogle, urlAutorizacion, verificarIdToken } from '../src/auth/google-oidc.js';
import { emisorDePrueba } from './google-firma.js';

const CLIENTE = 'cliente-prueba.apps.googleusercontent.com';
const ahora = Date.UTC(2026, 10, 10, 12);
const base = {
  iss: 'https://accounts.google.com', aud: CLIENTE, sub: '1234567890', email: 'Ana@Minera.pe', email_verified: true,
  name: 'Ana Pérez', nonce: 'n-1', iat: ahora / 1000, exp: ahora / 1000 + 3600,
};
const google = emisorDePrueba();
const motivo = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return e instanceof RechazoGoogle ? `${e.motivo}: ${e.message}` : 'otro error';
  }
  return 'aceptado';
};
const verificar = (token: string, nonce = 'n-1') => verificarIdToken(token, google.jwks.keys, { clientId: CLIENTE, nonce }, ahora);

describe('id_token de Google', () => {
  it('acepta un token firmado por Google para nuestro cliente y normaliza el correo', () => {
    expect(verificar(google.firmar(base))).toEqual({ sub: '1234567890', email: 'ana@minera.pe', emailVerificado: true, nombre: 'Ana Pérez' });
  });

  it('informa email_verified = false para que no ingrese (CP-009)', () => {
    expect(verificar(google.firmar({ ...base, email_verified: false })).emailVerificado).toBe(false);
  });

  it('rechaza firma ajena, alg none, otra audiencia, otro emisor, vencido y nonce distinto', () => {
    const otro = emisorDePrueba();
    expect(motivo(() => verificar(otro.firmar(base)))).toBe('google_fallo: firma no válida');
    const [h, p] = google.firmar(base).split('.');
    const sinFirma = `${Buffer.from(JSON.stringify({ alg: 'none', kid: 'clave-prueba' })).toString('base64url')}.${p}.`;
    expect(motivo(() => verificar(sinFirma))).toBe('google_fallo: algoritmo no admitido: none');
    const alterado = `${h}.${Buffer.from(JSON.stringify({ ...base, email: 'jefe@minera.pe' })).toString('base64url')}.${google.firmar(base).split('.')[2]}`;
    expect(motivo(() => verificar(alterado))).toBe('google_fallo: firma no válida');
    expect(motivo(() => verificar(google.firmar({ ...base, aud: 'otra-app' })))).toBe('google_fallo: audiencia no válida');
    expect(motivo(() => verificar(google.firmar({ ...base, iss: 'https://evil.example' })))).toBe('google_fallo: emisor no válido');
    expect(motivo(() => verificar(google.firmar({ ...base, exp: ahora / 1000 - 120 })))).toBe('google_fallo: id_token vencido');
    expect(motivo(() => verificar(google.firmar(base), 'otro-nonce'))).toBe('google_fallo: nonce no coincide');
    expect(motivo(() => verificar(google.firmar(base, { kid: 'desconocida' })))).toBe('google_fallo: clave de firma desconocida');
  });
});

describe('ida a Google', () => {
  it('pide código con PKCE S256, state y nonce', () => {
    const url = new URL(urlAutorizacion({ clientId: CLIENTE, redirectUri: 'http://localhost:5173/api/v1/auth/google/callback', state: 's', nonce: 'n', verificador: 'v'.repeat(43) }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code', scope: 'openid email profile', state: 's', nonce: 'n', code_challenge_method: 'S256', code_challenge: desafioPkce('v'.repeat(43)),
    });
  });

  it('el estado viaja firmado y vence', () => {
    const e = { state: 's', nonce: 'n', verificador: 'v', exp: ahora + 600_000 };
    const cookie = firmarEstado(e, 'secreto');
    expect(leerEstado(cookie, 'secreto', ahora)).toEqual(e);
    expect(leerEstado(cookie, 'otro-secreto', ahora)).toBeNull();
    expect(leerEstado(cookie, 'secreto', ahora + 600_001)).toBeNull();
    expect(leerEstado(`${cookie.split('.')[0]}x.${cookie.split('.')[1]}`, 'secreto', ahora)).toBeNull();
  });
});
