import { hash, verify } from '@node-rs/argon2';

// Parámetros mínimos recomendados por OWASP para argon2id (19 MiB, 2 iteraciones, 1 hilo).
// `algorithm: 2` es Argon2id en @node-rs/argon2.
const OPCIONES = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Devuelve el hash argon2id de una clave para guardarlo en `Usuario.hashClave`. */
export function hashearClave(clave: string): Promise<string> {
  return hash(clave, OPCIONES);
}

/** Compara una clave con su hash. Nunca lanza por un hash mal formado: devuelve false. */
export async function verificarClave(hashGuardado: string, clave: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, clave);
  } catch {
    return false;
  }
}
