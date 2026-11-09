import { describe, expect, it } from 'vitest';
import { hashearClave, verificarClave } from './clave.js';

describe('clave (argon2id)', () => {
  it('genera un hash argon2id que no contiene la clave', async () => {
    const h = await hashearClave('una-clave-de-prueba');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(h).not.toContain('una-clave-de-prueba');
  });

  it('verifica la clave correcta y rechaza otra', async () => {
    const h = await hashearClave('correcta');
    expect(await verificarClave(h, 'correcta')).toBe(true);
    expect(await verificarClave(h, 'incorrecta')).toBe(false);
  });

  it('devuelve false con un hash mal formado', async () => {
    expect(await verificarClave('texto-plano', 'texto-plano')).toBe(false);
  });
});
