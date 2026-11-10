import { describe, expect, it } from 'vitest';
import { contraste, FAMILIAS_KIT, FUENTES_KIT, KIT_INICIAL, revisarPaleta, revisarPersonaje } from '../src/marca.js';

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

describe('personaje', () => {
  const completo = ['personaje', 'cabeza', 'ojos_abiertos', 'ojos_cerrados', 'cejas', 'bocas',
    ...['neutral', 'explicando', 'celebrando', 'advirtiendo', 'pensando'].map((p) => `pose_${p}`),
    ...'ABCDEFGHX'.split('').map((b) => `boca_${b}`)];

  it('CP-023 · sin la boca G marca «G falta» y la reemplaza por B', () => {
    const r = revisarPersonaje({ ids: completo.filter((i) => i !== 'boca_G'), viewBox: '0 0 300 400', bytes: 5000 });
    expect(r.bocasFaltantes).toEqual(['G']);
    expect(r.reemplazos).toEqual({ G: 'B' });
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual(['G falta: se usa la B hasta que se agregue']);
    expect(r.poses).toContain('neutral');
  });

  it('un personaje completo no tiene avisos; sin bocas obligatorias o muy pesado no se puede usar', () => {
    expect(revisarPersonaje({ ids: completo, viewBox: '0 0 300 400', bytes: 5000 })).toMatchObject({ bocasFaltantes: [], errores: [], avisos: [] });
    const sinA = revisarPersonaje({ ids: completo.filter((i) => i !== 'boca_A'), viewBox: '0 0 300 400', bytes: 300 * 1024 });
    expect(sinA.errores).toEqual(['Falta la capa obligatoria «boca_A»', 'Pesa 300 KB; el máximo es 200 KB']);
    expect(revisarPersonaje({ ids: completo, viewBox: '0 0 400 400', bytes: 150 * 1024 }).avisos).toHaveLength(2);
  });
});
