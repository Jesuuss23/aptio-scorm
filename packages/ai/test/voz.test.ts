import { describe, expect, it, vi } from 'vitest';
import { idiomaDeVoz, sintetizarGoogle, VozNoDisponible, vozSimulada } from '../src/voz.js';

const pedido = { ssml: '<speak>Aplica el <sub alias="lo-to">LOTO</sub>.</speak>', idioma: 'es' as const, voz: 'es-US-Neural2-A', velocidad: 1.1 };

describe('voz', () => {
  it('CP-027: envía a Google el SSML con la pronunciación del diccionario', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ audioContent: Buffer.from('mp3').toString('base64') }), { status: 200 }));
    const r = await sintetizarGoogle(pedido, { apiKey: 'clave-de-prueba', fetch: f });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize?key=clave-de-prueba');
    expect(JSON.parse(init.body as string)).toEqual({
      input: { ssml: pedido.ssml },
      voice: { languageCode: 'es-US', name: 'es-US-Neural2-A' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.1 },
    });
    expect(new TextDecoder().decode(r.audio)).toBe('mp3');
    expect(r).toMatchObject({ mime: 'audio/mpeg', proveedor: 'google', simulada: false });
  });

  it('informa un error del proveedor sin devolver audio', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('{}', { status: 403 }));
    await expect(sintetizarGoogle(pedido, { apiKey: 'x', fetch: f })).rejects.toThrow(VozNoDisponible);
  });

  it('el modo simulado devuelve un WAV válido', () => {
    const r = vozSimulada(pedido);
    expect(new TextDecoder().decode(r.audio.slice(0, 4))).toBe('RIFF');
    expect(r.simulada).toBe(true);
    expect(idiomaDeVoz('en-US-Chirp3-HD-Aoede', 'en')).toBe('en-US');
    expect(idiomaDeVoz('rara', 'en')).toBe('en-US');
  });
});
