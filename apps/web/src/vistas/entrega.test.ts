// HU-1202 · Perfiles de la Entrega y peso legible del paquete.
import { describe, expect, it } from 'vitest';
import { megas, PERFILES } from './entrega';

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
});
