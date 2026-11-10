// HU-0702 · Boca que toca en cada instante del audio y regla de avance con narración.
import { describe, expect, it } from 'vitest';
import { bocaEn } from '../src/boca.ts';
import { aplanar, motivoBloqueo } from '../src/navegacion.ts';
import { readFileSync } from 'node:fs';
import type { CursoReproductor } from '../src/tipos.ts';

const marcas: [number, string][] = [[0, 'B'], [65, 'E'], [130, 'B'], [195, 'X'], [260, 'D'], [6305, 'X']];

describe('bocaEn', () => {
  it('devuelve la última marca que ya empezó', () => {
    expect(bocaEn(marcas, 0)).toBe('B');
    expect(bocaEn(marcas, 64)).toBe('B');
    expect(bocaEn(marcas, 65)).toBe('E');
    expect(bocaEn(marcas, 3000)).toBe('D');
    expect(bocaEn(marcas, 9000)).toBe('X');
  });
  it('antes de la primera marca o sin marcas, reposo', () => {
    expect(bocaEn([[100, 'A']], 50)).toBe('X');
    expect(bocaEn([], 50)).toBe('X');
  });
});

describe('Siguiente al terminar la narración (SUP-32)', () => {
  const loto = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoReproductor;
  const pantallas = aplanar(loto);
  const avance = (narracionPendiente: boolean) => ({ actual: 2, maxima: 2, resultados: new Map(), narracionPendiente });
  it('no deja avanzar mientras falte escuchar la narración, pero sí volver', () => {
    expect(motivoBloqueo(pantallas, avance(true), 'condiciones', 3)).toBe('narracion');
    expect(motivoBloqueo(pantallas, avance(true), 'condiciones', 1)).toBeNull();
    expect(motivoBloqueo(pantallas, avance(false), 'condiciones', 3)).toBeNull();
    expect(motivoBloqueo(pantallas, avance(true), 'libre', 3)).toBeNull();
  });
});
