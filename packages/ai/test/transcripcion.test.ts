// HU-0305 · Transcripción con marcas de tiempo: el pedido a Google Speech-to-Text, los tiempos de cada frase con el
// inicio del tramo, el modo simulado y el costo por minuto.
import { describe, expect, it } from 'vitest';
import { costoTranscripcion, transcriptorDesdeEntorno, transcriptorGoogle, transcriptorSimulado } from '../src/transcripcion.js';

const tramo = { audio: new Uint8Array([1, 2, 3]), desdeS: 55, duracionS: 25 };

describe('transcripción', () => {
  it('pide FLAC de 16 kHz con tiempos por palabra y suma el inicio del tramo a cada frase', async () => {
    let pedido: { url: string; cuerpo: { config: Record<string, unknown>; audio: { content: string } } } | null = null;
    const falso = (async (url: string, init: RequestInit) => {
      pedido = { url, cuerpo: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({
        results: [
          { alternatives: [{ transcript: ' Primero, corta la energía. ', words: [{ startTime: '0.400s', endTime: '0.900s' }, { startTime: '1s', endTime: '2.250s' }] }] },
          { alternatives: [{ transcript: 'Luego coloca tu candado.' }], resultEndTime: '6.5s' },
          { alternatives: [{ transcript: '' }] },
        ],
      }));
    }) as unknown as typeof fetch;
    const s = await transcriptorGoogle({ apiKey: 'clave de prueba', fetch: falso }).transcribir(tramo, 'es-US');
    expect(s).toEqual([
      { desde: 55.4, hasta: 57.3, texto: 'Primero, corta la energía.' },
      { desde: 57.3, hasta: 61.5, texto: 'Luego coloca tu candado.' },
    ]);
    expect(pedido!.url).toBe('https://speech.googleapis.com/v1/speech:recognize?key=clave%20de%20prueba');
    expect(pedido!.cuerpo.config).toMatchObject({ encoding: 'FLAC', sampleRateHertz: 16000, languageCode: 'es-US', enableWordTimeOffsets: true });
    expect(pedido!.cuerpo.audio.content).toBe('AQID');
  });

  it('un error del proveedor se informa con su código', async () => {
    const falla = (async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    await expect(transcriptorGoogle({ apiKey: 'x', fetch: falla }).transcribir(tramo, 'es-US')).rejects.toThrow('Google Speech-to-Text respondió 403');
  });

  it('el modo simulado arma un fragmento cada 10 s con los tiempos reales y dice que es simulado', async () => {
    const s = await transcriptorSimulado.transcribir(tramo, 'es-US');
    expect(s.map((x) => [x.desde, x.hasta])).toEqual([[55, 65], [65, 75], [75, 80]]);
    expect(s[0]!.texto).toContain('simulado');
  });

  it('elige el proveedor según el entorno y no inventa texto sin clave en modo real', async () => {
    expect(transcriptorDesdeEntorno({}).nombre).toBe('simulado');
    expect(transcriptorDesdeEntorno({ PROVEEDORES_MODO: 'real', GOOGLE_STT_API_KEY: 'k' }).nombre).toBe('google');
    await expect(transcriptorDesdeEntorno({ PROVEEDORES_MODO: 'real' }).transcribir(tramo, 'es-US')).rejects.toThrow('GOOGLE_STT_API_KEY');
  });

  it('cuesta por minuto de audio según el proveedor; el simulado no cuesta', () => {
    expect(costoTranscripcion('google', 150)).toBe(0.04);
    expect(costoTranscripcion('simulado', 150)).toBe(0);
  });
});
