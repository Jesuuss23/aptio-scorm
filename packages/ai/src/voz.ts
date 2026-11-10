// Proveedores de voz (ADR-010, decisión 8): Google Text-to-Speech por defecto. Aquí solo la síntesis de una
// muestra; la narración completa, la boca y los subtítulos llegan con M07 (S4).

export interface PedidoVoz {
  ssml: string;
  idioma: 'es' | 'en';
  voz: string;
  velocidad?: number;
}

export interface AudioVoz {
  audio: Uint8Array;
  mime: string;
  proveedor: string;
  modelo: string;
  caracteres: number;
  simulada: boolean;
}

export class VozNoDisponible extends Error {}

/** Código de idioma de la voz: «es-US-Neural2-A» → «es-US». */
export function idiomaDeVoz(voz: string, idioma: 'es' | 'en'): string {
  const m = /^([a-z]{2,3}-[A-Z]{2})-/.exec(voz);
  return m ? m[1]! : idioma === 'es' ? 'es-US' : 'en-US';
}

/** Google Cloud Text-to-Speech, API REST v1 `text:synthesize` con clave de API. */
export async function sintetizarGoogle(pedido: PedidoVoz, opciones: { apiKey: string; fetch?: typeof fetch }): Promise<AudioVoz> {
  const f = opciones.fetch ?? fetch;
  const r = await f(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(opciones.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { ssml: pedido.ssml },
      voice: { languageCode: idiomaDeVoz(pedido.voz, pedido.idioma), name: pedido.voz },
      audioConfig: { audioEncoding: 'MP3', speakingRate: pedido.velocidad ?? 1 },
    }),
  });
  if (!r.ok) throw new VozNoDisponible(`Google Text-to-Speech respondió ${r.status}`);
  const cuerpo = (await r.json()) as { audioContent?: string };
  if (!cuerpo.audioContent) throw new VozNoDisponible('Google Text-to-Speech no devolvió audio');
  return {
    audio: Uint8Array.from(Buffer.from(cuerpo.audioContent, 'base64')),
    mime: 'audio/mpeg', proveedor: 'google', modelo: pedido.voz, caracteres: pedido.ssml.length, simulada: false,
  };
}

/** Modo simulado: medio segundo de silencio en WAV, para probar el flujo sin proveedor ni costo. */
export function vozSimulada(pedido: PedidoVoz): AudioVoz {
  const muestras = 8000 / 2;
  const datos = new Uint8Array(44 + muestras);
  const v = new DataView(datos.buffer);
  const texto = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  texto(0, 'RIFF'); v.setUint32(4, 36 + muestras, true); texto(8, 'WAVE'); texto(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); texto(36, 'data'); v.setUint32(40, muestras, true);
  datos.fill(128, 44);
  return { audio: datos, mime: 'audio/wav', proveedor: 'simulado', modelo: pedido.voz, caracteres: pedido.ssml.length, simulada: true };
}
