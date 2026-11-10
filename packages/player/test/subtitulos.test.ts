// HU-0801 · Lectura del WebVTT y frase de cada momento del audio.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cueEn, leerVtt } from '../src/subtitulos.ts';

const P03 = readFileSync(new URL('../../ai/casos/loto/salidas/08-subtitulos-p03-es.vtt', import.meta.url), 'utf8');

describe('subtítulos en el reproductor', () => {
  it('lee el VTT del caso LOTO', () => {
    expect(leerVtt(P03)).toEqual([
      { inicioMs: 0, finMs: 2210, texto: 'Soy Ana, supervisora de seguridad.' },
      { inicioMs: 2275, finMs: 6305, texto: 'Te voy a mostrar cómo protegerte cuando intervengas un equipo.' },
    ]);
  });

  it('elige la frase según el momento del audio, sin parpadear entre frases', () => {
    const cues = leerVtt(P03);
    expect(cueEn(cues, 0)?.texto).toBe('Soy Ana, supervisora de seguridad.');
    expect(cueEn(cues, 2240)?.texto).toBe('Soy Ana, supervisora de seguridad.');
    expect(cueEn(cues, 2300)?.texto).toMatch(/^Te voy a mostrar/);
    expect(cueEn(cues, 7000)).toBeUndefined();
  });

  it('muestra texto plano: desescapa entidades y quita etiquetas; sin cabecera no lee nada', () => {
    expect(leerVtt('WEBVTT\r\n\r\n00:01.000 --> 00:02.500 align:center\r\n<b>A</b> &amp; &lt;b&gt;\r\nsegunda\r\n')).toEqual([
      { inicioMs: 1000, finMs: 2500, texto: 'A & <b>\nsegunda' },
    ]);
    expect(leerVtt('1\n00:00:00.000 --> 00:00:01.000\nHola')).toEqual([]);
    expect(leerVtt('WEBVTT\n\n00:00:02.000 --> 00:00:01.000\nAl revés\n')).toEqual([]);
  });
});
