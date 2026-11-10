import { describe, expect, it, vi } from 'vitest';
import { costoVoz, duracionAudio, idiomaDeVoz, sintetizadorDesdeEntorno, sintetizarGoogle, textoHablado, VozNoDisponible, vozSimulada } from '../src/voz.js';

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

  it('la voz simulada dura lo que diría la voz: 65 ms por carácter hablado, según la velocidad', () => {
    expect(textoHablado(pedido.ssml)).toBe('Aplica el lo-to.');
    const r = vozSimulada(pedido);
    expect(duracionAudio(r.audio, r.mime)).toBe(Math.round((16 * 65) / 1.1));
    expect(vozSimulada(pedido).audio).toEqual(r.audio);
    expect(duracionAudio(vozSimulada({ ...pedido, ssml: '<speak>Sí</speak>' }).audio, 'audio/wav')).toBe(500);
  });

  it('mide la duración de un MP3 por sus cuadros (MPEG1 44,1 kHz y MPEG2 24 kHz como el de Google), con ID3', () => {
    const cuadros = (cabecera: number[], largo: number, n: number) => {
      const b = new Uint8Array(largo * n);
      for (let i = 0; i < n; i++) b.set(cabecera, i * largo);
      return b;
    };
    expect(duracionAudio(cuadros([0xff, 0xfb, 0x90, 0x00], 417, 10), 'audio/mpeg')).toBe(261);
    const google = cuadros([0xff, 0xf3, 0x44, 0x00], 96, 100);
    const id3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5]);
    expect(duracionAudio(new Uint8Array([...id3, ...google]), 'audio/mpeg')).toBe(2400);
    expect(duracionAudio(new TextEncoder().encode('mp3'), 'audio/mpeg')).toBeNull();
    expect(duracionAudio(new Uint8Array(10), 'audio/ogg')).toBeNull();
  });

  it('SUP-34: el costo sale de los caracteres y la familia de la voz; el simulado no cuesta', () => {
    expect(costoVoz(1_000_000, 'es-US-Neural2-A', 'google')).toBe(16);
    expect(costoVoz(2000, 'es-US-Chirp3-HD-Aoede', 'google')).toBe(0.06);
    expect(costoVoz(2000, 'es-US-Neural2-A', 'simulado')).toBe(0);
  });

  it('sin clave de Google en modo real, la voz no está disponible; en simulado responde sin red', async () => {
    await expect(sintetizadorDesdeEntorno({ PROVEEDORES_MODO: 'real' })(pedido)).rejects.toThrow(VozNoDisponible);
    expect((await sintetizadorDesdeEntorno({})(pedido)).simulada).toBe(true);
  });
});
