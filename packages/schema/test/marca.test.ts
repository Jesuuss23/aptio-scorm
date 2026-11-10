import { describe, expect, it } from 'vitest';
import {
  contraste, DISPOSICIONES, erroresDefinicion, FAMILIAS_KIT, FUENTES_KIT, KIT_INICIAL, modeloBase, modelosParaGenerar, revisarPaleta, revisarPersonaje,
} from '../src/marca.js';

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

describe('pantallas modelo', () => {
  it('cada disposición tiene un modelo base válido en celular y escritorio', () => {
    for (const d of DISPOSICIONES) expect({ d, errores: erroresDefinicion(d, modeloBase(d)) }).toEqual({ d, errores: [] });
  });

  it('rechaza zonas ajenas, repetidas, fuera del lienzo o con colores fuera del kit', () => {
    const base = modeloBase('idea');
    const malo = {
      ...base,
      celular: [...base.celular, { zona: 'video', x: 0, y: 0, ancho: 10, alto: 10 }, { zona: 'titulo', x: 90, y: 0, ancho: 20, alto: 10, color: 'rosado' }],
    };
    const errores = erroresDefinicion('idea', malo);
    expect(errores).toContain('celular: la zona «video» no es de la disposición idea');
    expect(errores).toContain('celular: la zona «titulo» está repetida');
    expect(errores).toContain('celular: la zona «titulo» debe caber en el lienzo (porcentajes de 0 a 100)');
    expect(errores).toContain('celular: la zona «titulo» usa un color fuera del kit');
    expect(erroresDefinicion('otra', base)).toEqual(['Disposición desconocida: otra']);
    expect(erroresDefinicion('idea', { fondo: 'fondo', celular: base.celular })).toEqual(['Faltan las zonas de escritorio']);
  });

  it('CP-025 · el generador usa la pantalla modelo activa del cliente', () => {
    const modelos = modelosParaGenerar([
      { id: 'm1', disposicion: 'idea', nombre: 'Idea + ilustración', definicion: modeloBase('idea'), activa: true, orden: 0 },
      { id: 'm2', disposicion: 'quiz', nombre: 'Quiz apagado', definicion: modeloBase('quiz'), activa: false, orden: 0 },
    ]);
    expect(modelos).toHaveLength(DISPOSICIONES.length);
    expect(modelos.find((m) => m.disposicion === 'idea')).toMatchObject({ origen: 'cliente', nombre: 'Idea + ilustración', modeloId: 'm1' });
    expect(modelos.find((m) => m.disposicion === 'quiz')).toMatchObject({ origen: 'base' });
  });

  it('CP-026 · sin pantallas modelo se usan las del estilo base', () => {
    const modelos = modelosParaGenerar([]);
    expect(modelos.map((m) => m.disposicion)).toEqual([...DISPOSICIONES]);
    expect(modelos.every((m) => m.origen === 'base')).toBe(true);
  });
});
