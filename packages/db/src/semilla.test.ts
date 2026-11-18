import { describe, expect, it } from 'vitest';
import { CLAVE_DESARROLLO, permisoSemilla } from './semilla.js';

describe('A1 · la semilla en producción', () => {
  it('en local usa la clave de desarrollo y la puede mostrar', () => {
    expect(permisoSemilla({ produccion: false, hayDatos: true })).toEqual({ clave: CLAVE_DESARROLLO, avisoClave: `de desarrollo: ${CLAVE_DESARROLLO}` });
  });

  it('con SEED_CLAVE la usa y nunca la muestra', () => {
    const p = permisoSemilla({ produccion: false, clave: 'otra-clave-local', hayDatos: true });
    expect(p.clave).toBe('otra-clave-local');
    expect(p.avisoClave).not.toContain('otra-clave-local');
  });

  it('en producción exige SEED_CLAVE larga y distinta de la de desarrollo', () => {
    expect(() => permisoSemilla({ produccion: true, hayDatos: false })).toThrow(/exige SEED_CLAVE/);
    expect(() => permisoSemilla({ produccion: true, clave: '   ', hayDatos: false })).toThrow(/exige SEED_CLAVE/);
    expect(() => permisoSemilla({ produccion: true, clave: 'corta', hayDatos: false })).toThrow(/al menos 16/);
    expect(() => permisoSemilla({ produccion: true, clave: CLAVE_DESARROLLO, hayDatos: false })).toThrow(/desarrollo/);
    expect(() => permisoSemilla({ produccion: true, clave: 'x'.repeat(16), hayDatos: false })).not.toThrow();
  });

  it('en producción no corre sobre una base con datos (no borra nada real)', () => {
    expect(() => permisoSemilla({ produccion: true, clave: 'una-clave-larga-y-aleatoria', hayDatos: true })).toThrow(/base vacía/);
    expect(permisoSemilla({ produccion: true, clave: 'una-clave-larga-y-aleatoria', hayDatos: false }).avisoClave).toBe('la de SEED_CLAVE (no se muestra)');
  });
});
