// HU-0608 · Marcas de palabra por letras (SUP-47), imán a palabras o a décimas, tiempos escalonados y duración (RN-06-7).
import { describe, expect, it } from 'vitest';
import { duracionPantalla, imantar, marcasPalabra, palabraEn, tiemposElementos } from '../src/tiempos.js';

// p08 del caso LOTO: 83 caracteres con la voz simulada (65 ms por carácter: 5395 ms).
const P08 = 'Después de apagar puede quedar energía residual: presión, carga o un resorte tenso.';

describe('tiempos de la línea de tiempo', () => {
  it('reparte la voz por letras: cada palabra empieza donde empieza su primera letra', () => {
    const m = marcasPalabra(P08, 5395);
    expect(m).toHaveLength(13);
    expect(m[0]).toEqual({ indice: 0, texto: 'Después', inicioS: 0, finS: 0.455 });
    const residual = m[6]!;
    expect(residual.texto).toBe('residual:');
    expect(residual.inicioS).toBeCloseTo((P08.indexOf('residual') * 5395) / P08.length / 1000, 3);
    expect(m.at(-1)!.finS).toBeCloseTo(5.395, 3);
    expect(marcasPalabra('  ', 1000)).toEqual([]);
    expect(marcasPalabra(P08, 0)).toEqual([]);
  });

  it('la palabra que suena es la última que empezó; antes y después de la voz, ninguna', () => {
    const m = marcasPalabra(P08, 5395);
    expect(palabraEn(m, m[6]!.inicioS + 0.01)?.indice).toBe(6);
    expect(palabraEn(m, 0)?.indice).toBe(0);
    expect(palabraEn(m, 9)).toBeUndefined();
  });

  it('CP-064 · se imanta a la palabra a menos de 0,25 s y la deja como ancla; con Alt o lejos, a décimas', () => {
    const m = marcasPalabra(P08, 5395);
    const residual = m[6]!;
    expect(imantar(residual.inicioS + 0.2, m)).toEqual({ s: Math.round(residual.inicioS * 100) / 100, anclaPalabra: 6 });
    expect(imantar(residual.inicioS + 0.2, m, true)).toEqual({ s: Math.round((residual.inicioS + 0.2) * 10) / 10 });
    expect(imantar(7.04, m)).toEqual({ s: 7 });
    expect(imantar(-1, [])).toEqual({ s: 0 });
  });

  it('RN-06-9 · sin tiempo, los elementos entran escalonados de a 0,3 s; con tiempo, en el suyo', () => {
    expect(tiemposElementos(['a', 'b', 'c'], { c: { retardoS: 2, finS: 4 } })).toEqual([
      { id: 'a', inicioS: 0, finS: null, definido: false },
      { id: 'b', inicioS: 0.3, finS: null, definido: false },
      { id: 'c', inicioS: 2, finS: 4, definido: true },
    ]);
  });

  it('RN-06-7 · la pantalla dura lo que la voz + 1 s, o hasta que sale el último elemento', () => {
    expect(duracionPantalla(5395)).toBe(6.4);
    expect(duracionPantalla(5395, { a: { finS: 9 } })).toBe(9);
    expect(duracionPantalla(5395, { a: { retardoS: 8 } })).toBe(9);
    expect(duracionPantalla(undefined)).toBe(3);
  });
});
