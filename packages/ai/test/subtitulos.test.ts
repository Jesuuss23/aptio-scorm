// HU-0801 · Subtítulos WebVTT: tiempos por letras sobre la duración del audio (SUP-37).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aVtt, MS_POR_CARACTER_SIMULADO, subtitulosDeNarracion, tiempoVtt } from '../src/index.js';

const P03 = 'Soy Ana, supervisora de seguridad. Te voy a mostrar cómo protegerte cuando intervengas un equipo.';

describe('subtítulos de una narración', () => {
  it('con la voz simulada, p03 da exactamente el VTT del caso LOTO', () => {
    const esperado = readFileSync(new URL('../casos/loto/salidas/08-subtitulos-p03-es.vtt', import.meta.url), 'utf8');
    expect(aVtt(subtitulosDeNarracion(P03, P03.length * MS_POR_CARACTER_SIMULADO))).toBe(esperado);
  });

  it('una frase de más de 84 caracteres se parte en la coma y cada trozo cabe en 2 líneas', () => {
    const texto = 'Antes de intervenir cualquier equipo con energía peligrosa, aísla todas las fuentes y coloca tu candado personal en cada punto. Listo.';
    const s = subtitulosDeNarracion(texto, 10_000);
    expect(s.map((x) => x.texto)).toEqual([
      'Antes de intervenir cualquier equipo con energía peligrosa,',
      'aísla todas las fuentes y coloca tu candado personal en cada punto.',
      'Listo.',
    ]);
    expect(s.every((x) => x.texto.length <= 84)).toBe(true);
    // Los tiempos avanzan sin solaparse y el último termina con el audio.
    for (let i = 1; i < s.length; i++) expect(s[i]!.inicioMs).toBeGreaterThanOrEqual(s[i - 1]!.finMs);
    expect(s.at(-1)!.finMs).toBe(10_000);
  });

  it('sin coma, parte entre palabras', () => {
    const texto = `${'palabra '.repeat(15)}final`;
    const s = subtitulosDeNarracion(texto, 5000);
    expect(s.length).toBe(2);
    expect(s.every((x) => x.texto.length <= 84 && !x.texto.startsWith(' ') && !x.texto.endsWith(' '))).toBe(true);
    expect(s.map((x) => x.texto).join(' ')).toBe(texto);
  });

  it('preguntas, exclamaciones y espacios de más', () => {
    expect(subtitulosDeNarracion('  ¿Listo?   ¡Vamos!  ', 1000).map((x) => x.texto)).toEqual(['¿Listo?', '¡Vamos!']);
    expect(subtitulosDeNarracion('', 1000)).toEqual([]);
    expect(subtitulosDeNarracion('Hola.', 0)).toEqual([]);
  });

  it('escapa lo que WebVTT interpretaría y escribe las horas', () => {
    expect(aVtt([{ inicioMs: 0, finMs: 1000, texto: 'A <b> & C --> D' }])).toContain('A &lt;b&gt; &amp; C --&gt; D');
    expect(tiempoVtt(3_723_004)).toBe('01:02:03.004');
  });
});
