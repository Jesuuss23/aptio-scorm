import { describe, expect, it } from 'vitest';
import { isoALima, limaAIso, minimoProgramable, RUTA_SITIO } from './sitio-paginas';

describe('Sitio web › Páginas (HU-1502)', () => {
  it('pasa la hora de Lima del selector a ISO con zona y de vuelta', () => {
    expect(limaAIso('2026-11-20T09:00')).toBe('2026-11-20T09:00:00-05:00');
    expect(limaAIso('')).toBeNull();
    expect(limaAIso('20/11/2026 09:00')).toBeNull();
    expect(isoALima('2026-11-20T14:00:00.000Z')).toBe('2026-11-20T09:00');
    expect(isoALima(new Date(limaAIso('2026-12-31T23:30')!).toISOString())).toBe('2026-12-31T23:30');
  });

  it('el mínimo programable es el minuto siguiente, en Lima', () => {
    expect(minimoProgramable(new Date('2026-11-13T13:31:40Z'))).toBe('2026-11-13T08:32');
  });

  it('acepta las mismas rutas que la API', () => {
    expect(['/', '/precios', '/sectores/mineria-y-energia', '/a1'].filter((r) => !RUTA_SITIO.test(r))).toEqual([]);
    expect(['precios', '/Precios', '/precios/', '//', '/a_b', '/-a', '/a--b'].filter((r) => RUTA_SITIO.test(r))).toEqual([]);
  });
});
