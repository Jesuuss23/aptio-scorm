// CP-014 en el código fuente: los estilos solo declaran tamaños de letra de la escala.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ESCALA_TIPOGRAFICA, iniciales } from '../src/index.js';

const leer = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

describe('sistema visual', () => {
  it('tokens.css define exactamente los 6 tamaños de la escala', () => {
    const tamanos = [...leer('tokens.css').matchAll(/--(?:texto-\w+|titulo-\w+|dato):\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(tamanos).toEqual([...ESCALA_TIPOGRAFICA]);
  });

  it('estilos.css no escribe tamaños de letra a mano', () => {
    const declaraciones = [...leer('estilos.css').matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(declaraciones.length).toBeGreaterThan(0);
    for (const d of declaraciones) expect(d).toMatch(/^var\(--(texto-(xs|sm|base)|titulo-(panel|pagina)|dato)\)$/);
  });

  it('calcula las iniciales del usuario', () => {
    expect(iniciales('Diseño instruccional')).toBe('DI');
    expect(iniciales('  ana ')).toBe('A');
  });
});
