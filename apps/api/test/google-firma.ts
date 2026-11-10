// Firma id_tokens de prueba como lo haría Google (RS256), con una clave propia publicada como JWKS.
import { createSign, generateKeyPairSync } from 'node:crypto';

export function emisorDePrueba(kid = 'clave-prueba') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return {
    jwks: { keys: [jwk] },
    firmar(datos: Record<string, unknown>, cabecera: Record<string, unknown> = {}) {
      const cuerpo = `${b64({ alg: 'RS256', kid, typ: 'JWT', ...cabecera })}.${b64(datos)}`;
      return `${cuerpo}.${createSign('RSA-SHA256').update(cuerpo).sign(privateKey).toString('base64url')}`;
    },
  };
}
