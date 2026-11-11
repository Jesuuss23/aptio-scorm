// HU-0608 · Línea de tiempo: arrastres con imán (CP-064, CP-065), pistas de boca y subtítulos, zoom y regla.
import { marcasPalabra } from '@aptio/schema/tiempos';
import { describe, expect, it } from 'vitest';
import { arrastrar, formatoS, marcasRegla, tramosBoca, tramosSubtitulos, zoomAjustado, zoomSiguiente } from './linea-tiempo';

const P08 = 'Después de apagar puede quedar energía residual: presión, carga o un resorte tenso.';
const marcas = marcasPalabra(P08, 5395);
const residual = marcas[6]!;

describe('línea de tiempo del editor', () => {
  it('CP-064 · arrastrar el cuerpo cerca de «residual» se imanta a ella y la ancla; la salida se corre igual', () => {
    const x = { inicioS: 0.3, finS: null };
    expect(arrastrar(x, 'cuerpo', residual.inicioS - 0.3 + 0.15, marcas, 6.4)).toEqual({ retardoS: Math.round(residual.inicioS * 100) / 100, finS: undefined, anclaPalabra: 6 });
    const conSalida = arrastrar({ inicioS: 0.3, finS: 2.3 }, 'cuerpo', residual.inicioS - 0.3, marcas, 6.4);
    expect(conSalida.finS).toBeCloseTo(conSalida.retardoS! + 2, 2);
    // Con Alt no se imanta a palabras: a décimas y sin ancla.
    expect(arrastrar(x, 'cuerpo', 2.04, marcas, 6.4, true)).toEqual({ retardoS: 2.3, finS: undefined, anclaPalabra: undefined });
  });

  it('el borde izquierdo no pasa de la salida ni de 0; el cuerpo no sale de la pantalla', () => {
    expect(arrastrar({ inicioS: 1, finS: 2 }, 'inicio', 5, [], 6.4).retardoS).toBe(1.9);
    expect(arrastrar({ inicioS: 1, finS: null }, 'inicio', -3, [], 6.4).retardoS).toBe(0);
    expect(arrastrar({ inicioS: 1, finS: null }, 'cuerpo', 30, [], 6.4).retardoS).toBe(6.3);
  });

  it('CP-065 · el borde derecho de una barra sin salida, a los 4 s, deja finS = 4 y no toca la entrada ni el ancla', () => {
    expect(arrastrar({ inicioS: 0.6, finS: null }, 'fin', 4 - 6.4, marcas, 6.4)).toEqual({ finS: 4 });
    expect(arrastrar({ inicioS: 0.6, finS: 4 }, 'fin', -9, marcas, 6.4)).toEqual({ finS: 0.7 });
    // Más allá del final, la pantalla dura hasta esa salida (RN-06-7).
    expect(arrastrar({ inicioS: 0.6, finS: null }, 'fin', 2, marcas, 6.4)).toEqual({ finS: 8.4 });
  });

  it('la boca dura de una marca a la siguiente y junta las iguales; los subtítulos van en segundos', () => {
    expect(tramosBoca([[0, 'X'], [100, 'B'], [200, 'B'], [300, 'X']], 500)).toEqual([
      { boca: 'X', inicioS: 0, finS: 0.1 }, { boca: 'B', inicioS: 0.1, finS: 0.3 }, { boca: 'X', inicioS: 0.3, finS: 0.5 },
    ]);
    expect(tramosSubtitulos([{ inicioMs: 0, finMs: 2275, texto: 'Hola.' }])).toEqual([{ texto: 'Hola.', inicioS: 0, finS: 2.275 }]);
  });

  it('zoom entre 40 y 320 px por segundo, Ajustar al ancho, regla cada medio segundo', () => {
    expect(zoomSiguiente(110, 1)).toBe(138);
    expect(zoomSiguiente(40, -1)).toBe(40);
    expect(zoomAjustado(800, 6.4)).toBe(125);
    expect(marcasRegla(1.4)).toEqual([{ s: 0, entero: true }, { s: 0.5, entero: false }, { s: 1, entero: true }]);
    expect(formatoS(2)).toBe('2,0 s');
  });
});
