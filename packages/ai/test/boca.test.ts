// HU-0702 · Marcas de boca: regla simulada del caso LOTO y lectura de la salida de Rhubarb.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bocasDeRhubarb, bocasSimuladas, BocaNoDisponible, normalizarBocas } from '../src/boca.js';

const caso = (f: string) => JSON.parse(readFileSync(new URL(`../casos/loto/salidas/${f}`, import.meta.url), 'utf8'));

describe('bocas simuladas', () => {
  it('con 65 ms por letra dan las mismas marcas que el caso LOTO para p03', () => {
    const p03 = (caso('06-voz-es.json').narraciones as { pantallaId: string; texto: string; duracionMs: number }[]).find((n) => n.pantallaId === 'p03')!;
    expect(bocasSimuladas(p03.texto, p03.duracionMs)).toEqual(caso('07-boca-p03.json').bocas);
  });

  it('se reparten en la duración real del audio y terminan en reposo', () => {
    const b = bocasSimuladas('Mamá', 1000);
    expect(b).toEqual([[0, 'A'], [250, 'D'], [500, 'A'], [750, 'D'], [1000, 'X']]);
    expect(bocasSimuladas('', 800)).toEqual([[0, 'X']]);
    expect(bocasSimuladas('Sí.', 300)).toEqual([[0, 'B'], [200, 'X'], [300, 'X']]);
  });
});

describe('salida de Rhubarb', () => {
  it('convierte segundos a ms, junta repetidas y cierra en X al final del audio', () => {
    const salida = JSON.stringify({
      metadata: { soundFile: 'p01.wav', duration: 1.2 },
      mouthCues: [
        { start: 0, end: 0.12, value: 'X' }, { start: 0.12, end: 0.3, value: 'B' }, { start: 0.3, end: 0.41, value: 'B' },
        { start: 0.41, end: 0.65, value: 'D' }, { start: 0.65, end: 0.9, value: 'G' }, { start: 0.9, end: 1.2, value: 'X' },
      ],
    });
    expect(bocasDeRhubarb(salida, 1200)).toEqual([[0, 'X'], [120, 'B'], [410, 'D'], [650, 'G'], [900, 'X'], [1200, 'X']]);
  });

  it('una salida rota o con una boca desconocida es un error claro', () => {
    expect(() => bocasDeRhubarb('no es json', 1000)).toThrow(BocaNoDisponible);
    expect(() => bocasDeRhubarb(JSON.stringify({ mouthCues: [{ start: 0, end: 1, value: 'Z' }] }), 1000)).toThrow(/desconocida/);
  });

  it('las marcas más allá del audio se descartan', () => {
    expect(normalizarBocas([[0, 'B'], [900, 'D'], [1500, 'C']], 1000)).toEqual([[0, 'B'], [900, 'D'], [1000, 'X']]);
  });
});
