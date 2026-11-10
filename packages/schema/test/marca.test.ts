import { describe, expect, it } from 'vitest';
import { contraste, FAMILIAS_KIT, FUENTES_KIT, KIT_INICIAL, revisarPaleta } from '../src/marca.js';

describe('marca del kit', () => {
  it('calcula el contraste WCAG', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contraste('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(contraste('#9AA0A6', '#FFFFFF')).toBeCloseTo(2.64, 2);
    expect(() => contraste('azul', '#FFFFFF')).toThrow('Color no válido');
  });

  it('CP-021 · texto #9AA0A6 sobre blanco advierte contraste menor a 4,5:1', () => {
    const r = revisarPaleta({ ...KIT_INICIAL.paleta, texto: '#9AA0A6', fondo: '#FFFFFF' });
    expect(r.cumpleAA).toBe(false);
    expect(r.textoFondo).toBe(2.64);
    expect(r.advertencias[0]).toMatchObject({ codigo: 'CONTRASTE_BAJO', colores: ['texto', 'fondo'] });
    expect(r.advertencias[0]!.mensaje).toContain('2,6:1');
  });

  it('el kit inicial cumple AA y usa fuentes de la lista cerrada', () => {
    expect(revisarPaleta(KIT_INICIAL.paleta)).toMatchObject({ cumpleAA: true, advertencias: [] });
    expect(FAMILIAS_KIT).toContain(KIT_INICIAL.tipografias.titulos);
    expect(FAMILIAS_KIT).toContain(KIT_INICIAL.tipografias.textos);
    expect(FUENTES_KIT.every((f) => f.licencia === 'OFL-1.1')).toBe(true);
  });
});
