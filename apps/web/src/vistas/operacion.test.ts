import { describe, expect, it } from 'vitest';
import { bytes, duracion } from './operacion';

describe('formatos de Operación (HU-1403)', () => {
  it('tamaño en base 1024', () => {
    expect(bytes(null)).toBe('—');
    expect(bytes(512)).toBe('512 B');
    expect(bytes(1536)).toBe('1.5 KB');
    expect(bytes(5 * 1024 ** 3)).toBe('5 GB');
  });

  it('duración legible', () => {
    expect(duracion(null)).toBe('—');
    expect(duracion(950)).toBe('950 ms');
    expect(duracion(42_000)).toBe('42 s');
    expect(duracion(65_000)).toBe('1 min 5 s');
    expect(duracion(120_000)).toBe('2 min');
    expect(duracion(3_725_000)).toBe('1 h 2 min');
  });
});
