// HU-0704 · Audio del cliente: subtítulos desde los segmentos reales, texto de la transcripción, hash de la grabación y
// elección entre el audio original y el limpio.
import { describe, expect, it } from 'vitest';
import { audioAUsar, esGrabacion, hashGrabacion, rotuloGrabacion, subtitulosDeSegmentos, textoDeTranscripcion } from '../src/grabacion.js';

const segmentos = [
  { desde: 0.4, hasta: 2.1, texto: 'Antes de intervenir un equipo,' },
  { desde: 2.1, hasta: 4.0, texto: '  bloquea   todas sus fuentes de energía. ' },
];

describe('grabación del cliente', () => {
  it('el texto de la narración une los segmentos, en orden y sin espacios de más', () => {
    expect(textoDeTranscripcion([...segmentos].reverse())).toBe('Antes de intervenir un equipo, bloquea todas sus fuentes de energía.');
    expect(textoDeTranscripcion(null)).toBe('');
    expect(textoDeTranscripcion([{ desde: 1, hasta: 1, texto: 'x' }, { desde: 0, hasta: 1, texto: '  ' }])).toBe('');
  });

  it('los subtítulos conservan el tiempo real de cada segmento', () => {
    expect(subtitulosDeSegmentos(segmentos, 4200)).toEqual([
      { inicioMs: 400, finMs: 2100, texto: 'Antes de intervenir un equipo,' },
      { inicioMs: 2100, finMs: 4000, texto: 'bloquea todas sus fuentes de energía.' },
    ]);
  });

  it('un segmento largo se parte y su tiempo se reparte por letras; nada pasa de la duración del audio', () => {
    const largo = 'Coloca tu candado personal en el dispositivo de aislamiento, y luego verifica la energía cero con el probador antes de tocar.';
    const subs = subtitulosDeSegmentos([{ desde: 1, hasta: 9, texto: largo }], 7000);
    expect(subs.length).toBe(2);
    expect(subs.every((s) => s.texto.length <= 84)).toBe(true);
    expect(subs[0]!.inicioMs).toBe(1000);
    expect(subs[0]!.finMs).toBe(subs[1]!.inicioMs);
    expect(subs.at(-1)!.finMs).toBe(7000);
    expect(subs.map((s) => s.texto).join(' ')).toBe(largo);
    expect(subtitulosDeSegmentos(segmentos, 0)).toEqual([]);
  });

  it('el hash depende del texto y del audio usado, y cumple el patrón del esquema', () => {
    const a = hashGrabacion('Hola equipo', 'r-original');
    expect(a).toMatch(/^[a-f0-9]{16}$/);
    expect(hashGrabacion('  Hola   equipo ', 'r-original')).toBe(a);
    expect(hashGrabacion('Hola equipo', 'r-limpio')).not.toBe(a);
    expect(hashGrabacion('Hola equipos', 'r-original')).not.toBe(a);
  });

  it('elige el audio limpio solo si se pidió y existe', () => {
    expect(audioAUsar({ original: 'o', limpio: 'l' }, 'limpio')).toEqual({ recursoId: 'l', version: 'limpio' });
    expect(audioAUsar({ original: 'o', limpio: 'l' })).toEqual({ recursoId: 'o', version: 'original' });
    expect(audioAUsar({ original: 'o' }, 'limpio')).toEqual({ recursoId: 'o', version: 'original' });
  });

  it('reconoce la pista de una grabación y arma su rótulo', () => {
    expect(esGrabacion({ voz: { proveedor: 'cliente' } })).toBe(true);
    expect(esGrabacion({ voz: { proveedor: 'google' } })).toBe(false);
    expect(esGrabacion(undefined)).toBe(false);
    expect(rotuloGrabacion('Grabacion_gerente.wav', 134)).toBe('Grabacion_gerente.wav · 2:14 min');
    expect(rotuloGrabacion('x.wav')).toBe('x.wav');
  });
});

describe('pista de una grabación', () => {
  it('queda pendiente, con la voz del cliente, la autorización y el hash del audio usado', async () => {
    const { pistaDeGrabacion } = await import('../src/grabacion.js');
    const datos = { materialId: 'm-1', recursoOrigenId: 'r-limpio', version: 'limpio' as const, autorizadoPor: 'Ana Ríos', autorizadoEn: '2026-11-13T10:00:00.000Z' };
    expect(pistaDeGrabacion(datos, 'Hola equipo')).toEqual({
      estado: 'pendiente', voz: { proveedor: 'cliente', voz: 'grabacion' }, hashTexto: hashGrabacion('Hola equipo', 'r-limpio'), grabacion: datos,
    });
  });
});
