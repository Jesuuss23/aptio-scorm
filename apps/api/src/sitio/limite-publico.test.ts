import { describe, expect, it } from 'vitest';
import { grupoDe } from './limite-publico.js';

describe('M1 y B2 · qué peticiones cuentan para el límite por IP', () => {
  it('la API pública, en cualquier método', () => {
    expect(grupoDe('GET', '/api/v1/publico/planes/productora')).toBe('publico');
    expect(grupoDe('POST', '/api/v1/publico/checkout?x=1')).toBe('publico');
  });

  it('los formularios del sitio sin JavaScript, solo al enviarse', () => {
    for (const r of ['/s/_lead', '/s/_cita', '/s/_popup', '/s/_visita', '/S/_LEAD/']) expect(grupoDe('POST', r)).toBe('publico');
    expect(grupoDe('GET', '/s/_cita?tipo=1')).toBeNull();
    expect(grupoDe('GET', '/s/precios')).toBeNull();
  });

  it('el ingreso, el segundo factor y la clave olvidada', () => {
    for (const r of ['/api/v1/auth/ingresar', '/api/v1/auth/segundo-factor', '/api/v1/auth/segundo-factor/configurar', '/api/v1/auth/segundo-factor/confirmar', '/api/v1/auth/clave/olvido', '/api/v1/auth/clave/restablecer']) {
      expect(grupoDe('POST', r)).toBe('ingreso');
    }
    expect(grupoDe('GET', '/api/v1/auth/segundo-factor')).toBeNull();
    expect(grupoDe('POST', '/api/v1/auth/salir')).toBeNull();
    expect(grupoDe('POST', '/api/v1/auth/ingresarx')).toBeNull();
    expect(grupoDe('GET', '/api/v1/proyectos')).toBeNull();
  });
});
