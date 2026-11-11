// HU-1202 · Perfiles de la Entrega y peso legible del paquete.
import { describe, expect, it } from 'vitest';
import { mb, megas, PERFILES } from './entrega';

describe('entrega', () => {
  it('ofrece los 5 perfiles del contrato, cada uno con su recomendación', () => {
    expect(PERFILES.map((p) => p.id)).toEqual(['generico', 'moodle', 'blackboard', 'chamilo', 'canvas']);
    expect(PERFILES.every((p) => p.recomendacion.length > 40)).toBe(true);
  });

  it('muestra el peso en KB o MB', () => {
    expect(megas(null)).toBe('—');
    expect(megas(200)).toBe('1 KB');
    expect(megas(512_000)).toBe('500 KB');
    expect(megas(15_518_924)).toBe('14.8 MB');
  });

  it('HU-1201 · el peso estimado en MB lleva un decimal como máximo', () => {
    expect(mb(300.04)).toBe('300');
    expect(mb(14.83)).toBe('14.8');
    expect(mb(1234.5)).toBe('1,234.5');
  });
});
