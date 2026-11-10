import { createHash } from 'node:crypto';

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

/** Milisegundos por carácter de la voz simulada: la misma cuenta que el caso LOTO grabado (`06-voz-es.json`). */
export const MS_POR_CARACTER_SIMULADO = 65;

/** Lo que dirá la voz, sin etiquetas SSML (el alias de `<sub>` reemplaza al texto escrito). */
export function textoHablado(ssml: string): string {
  return ssml
    .replace(/<sub\s+alias="([^"]*)"\s*>[\s\S]*?<\/sub>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim();
}

/**
 * Modo simulado: silencio en WAV (8 kHz, 8 bits) con la duración que tendría la voz (65 ms por carácter, mínimo medio
 * segundo), para probar el flujo sin proveedor ni costo. Es determinista: el mismo texto da el mismo audio.
 */
export function vozSimulada(pedido: PedidoVoz): AudioVoz {
  const ms = Math.max(500, Math.round(textoHablado(pedido.ssml).length * MS_POR_CARACTER_SIMULADO / (pedido.velocidad ?? 1)));
  const muestras = Math.round((8000 * ms) / 1000);
  const datos = new Uint8Array(44 + muestras);
  const v = new DataView(datos.buffer);
  const texto = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  texto(0, 'RIFF'); v.setUint32(4, 36 + muestras, true); texto(8, 'WAVE'); texto(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); texto(36, 'data'); v.setUint32(40, muestras, true);
  datos.fill(128, 44);
  return { audio: datos, mime: 'audio/wav', proveedor: 'simulado', modelo: pedido.voz, caracteres: pedido.ssml.length, simulada: true };
}

// ---------- Duración del audio (HU-0701): la da el archivo, no una estimación ----------

const KBPS_MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const KBPS_MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const HZ: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Duración en ms de un MP3 (capa III) sumando sus cuadros; salta la etiqueta ID3v2. null si no hay cuadros. */
function duracionMp3(b: Uint8Array): number | null {
  let i = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 && b.length > 10) {
    i = 10 + (((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f));
  }
  let segundos = 0;
  let cuadros = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1]! & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const version = (b[i + 1]! >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const capa = (b[i + 1]! >> 1) & 0x03; // 1 = capa III
    const indiceBitrate = (b[i + 2]! >> 4) & 0x0f;
    const indiceHz = (b[i + 2]! >> 2) & 0x03;
    const relleno = (b[i + 2]! >> 1) & 0x01;
    const hz = HZ[version]?.[indiceHz];
    const kbps = (version === 3 ? KBPS_MPEG1_L3 : KBPS_MPEG2_L3)[indiceBitrate];
    if (capa !== 1 || !hz || !kbps) {
      i++;
      continue;
    }
    const muestras = version === 3 ? 1152 : 576;
    const largo = Math.floor(((muestras / 8) * kbps * 1000) / hz) + relleno;
    segundos += muestras / hz;
    cuadros++;
    i += largo;
  }
  return cuadros ? Math.round(segundos * 1000) : null;
}

/** Duración en ms de un WAV PCM: bytes de datos / bytes por segundo. */
function duracionWav(b: Uint8Array): number | null {
  if (b.length < 44) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const porSegundo = v.getUint32(28, true);
  let i = 12;
  while (i + 8 <= b.length) {
    const id = String.fromCharCode(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!);
    const largo = v.getUint32(i + 4, true);
    if (id === 'data') return porSegundo ? Math.round((Math.min(largo, b.length - i - 8) / porSegundo) * 1000) : null;
    i += 8 + largo + (largo % 2);
  }
  return null;
}

/** Duración en ms de un audio MP3 o WAV; null si el formato no se reconoce. */
export function duracionAudio(audio: Uint8Array, mime: string): number | null {
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return duracionWav(audio);
  if (mime === 'audio/mpeg') return duracionMp3(audio);
  return null;
}

// ---------- Costo (decisión 12) ----------

/**
 * USD por millón de caracteres de Google Text-to-Speech por familia de voz. Supuesto SUP-34: tarifas de lista que no
 * se han verificado contra la facturación de Google; se confirman antes del piloto.
 */
export const TARIFA_VOZ_USD_MILLON = { 'Chirp3-HD': 30, Neural2: 16, otra: 16 } as const;

export function costoVoz(caracteres: number, voz: string, proveedor: string): number {
  if (proveedor === 'simulado') return 0;
  const tarifa = voz.includes('Chirp3-HD') ? TARIFA_VOZ_USD_MILLON['Chirp3-HD'] : voz.includes('Neural2') ? TARIFA_VOZ_USD_MILLON.Neural2 : TARIFA_VOZ_USD_MILLON.otra;
  return Math.round((caracteres / 1_000_000) * tarifa * 1_000_000) / 1_000_000;
}

export type Sintetizador = (pedido: PedidoVoz) => Promise<AudioVoz>;

/** El sintetizador del entorno: simulado por defecto; Google con `GOOGLE_TTS_API_KEY` cuando el modo es real. */
export function sintetizadorDesdeEntorno(env: NodeJS.ProcessEnv): Sintetizador {
  if ((env.PROVEEDORES_MODO ?? 'simulado') === 'simulado') return async (p) => vozSimulada(p);
  return async (p) => {
    const apiKey = env.GOOGLE_TTS_API_KEY;
    if (!apiKey) throw new VozNoDisponible('La voz de Google no está configurada en este entorno (GOOGLE_TTS_API_KEY)');
    return sintetizarGoogle(p, { apiKey });
  };
}

/**
 * RN-07-1 · Hash que liga el audio a lo que se dijo: texto, voz, velocidad y los términos del diccionario aplicados
 * («LOTO=lo-to»). Si cualquiera cambia, la narración queda desactualizada (HU-0703). Sin términos da lo mismo que el
 * hash que guarda la etapa 4.
 */
export function hashNarracion(texto: string, voz: string, velocidad = 1, pronunciaciones: { escrito: string; pronunciado: string }[] = []): string {
  const terminos = pronunciaciones.map((t) => `${t.escrito.trim().toLocaleLowerCase('es')}=${t.pronunciado.trim()}`).sort();
  return createHash('sha256').update(`${texto}|${voz}|${velocidad}${terminos.length ? `|${terminos.join(';')}` : ''}`).digest('hex');
}
