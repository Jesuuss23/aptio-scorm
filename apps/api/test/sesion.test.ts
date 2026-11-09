import { describe, expect, it } from 'vitest';
import { firmarSesion, leerSesion } from '../src/auth/sesion.js';

const SECRETO = 'secreto-de-prueba-con-largo-suficiente';

describe('cookie de sesión firmada', () => {
  const datos = { u: 'usuario-1', v: 0, exp: 2_000 };

  it('se lee con el mismo secreto antes de vencer', () => {
    expect(leerSesion(firmarSesion(datos, SECRETO), SECRETO, 1_000)).toEqual(datos);
  });

  it('rechaza otro secreto, una firma alterada o una sesión vencida', () => {
    const token = firmarSesion(datos, SECRETO);
    expect(leerSesion(token, 'otro-secreto', 1_000)).toBeNull();
    expect(leerSesion(`${token.slice(0, -2)}xx`, SECRETO, 1_000)).toBeNull();
    expect(leerSesion(token, SECRETO, 3_000)).toBeNull();
    expect(leerSesion('basura', SECRETO, 1_000)).toBeNull();
  });
});
