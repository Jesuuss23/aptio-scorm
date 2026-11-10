// HU-0305 · Transcripción de video y audio del cliente con marcas de tiempo (docs/01-arquitectura.md: proveedor de voz a
// texto). Google Speech-to-Text por defecto; sin clave, el modo simulado arma fragmentos de relleno con los tiempos reales
// del archivo para probar el flujo sin costo.

/** Un fragmento de la transcripción: desde y hasta en segundos (con un decimal). */
export interface SegmentoTranscripcion {
  desde: number;
  hasta: number;
  texto: string;
  /** El texto parece dar órdenes a la IA: se trata como dato y se avisa (HU-1402). */
  posibleInstruccion?: boolean;
}

/** Un tramo del audio ya convertido a FLAC mono de 16 kHz, con su inicio dentro del archivo. */
export interface TramoAudio {
  audio: Uint8Array;
  desdeS: number;
  duracionS: number;
}

export interface ProveedorTranscripcion {
  nombre: string;
  modelo: string;
  transcribir(tramo: TramoAudio, idioma: string): Promise<SegmentoTranscripcion[]>;
}

export class TranscripcionNoDisponible extends Error {}

/** Google Speech-to-Text v1 `speech:recognize` acepta hasta 1 minuto por pedido: el worker corta tramos de 55 s. */
export const SEGUNDOS_POR_TRAMO = 55;

/**
 * USD por minuto de audio. Supuesto SUP-28: tarifa de lista de Google Speech-to-Text v1 que no se ha verificado contra la
 * cuenta del cliente; se corrige aquí cuando el responsable la confirme.
 */
export const TARIFA_TRANSCRIPCION_USD_MINUTO: Record<string, number> = { google: 0.016, simulado: 0 };

export function costoTranscripcion(proveedor: string, segundos: number): number {
  return Math.round(((TARIFA_TRANSCRIPCION_USD_MINUTO[proveedor] ?? 0) * segundos / 60) * 10_000) / 10_000;
}

const decimal = (s: number) => Math.round(s * 10) / 10;
const segundos = (t: string | undefined) => Number.parseFloat((t ?? '0s').replace(/s$/, '')) || 0;

/** Google Speech-to-Text, API REST v1 `speech:recognize` con clave de API y tiempos por palabra. */
export function transcriptorGoogle(opciones: { apiKey: string; modelo?: string; fetch?: typeof fetch }): ProveedorTranscripcion {
  const f = opciones.fetch ?? fetch;
  const modelo = opciones.modelo ?? 'latest_long';
  return {
    nombre: 'google', modelo,
    async transcribir(tramo, idioma) {
      const r = await f(`https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(opciones.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { encoding: 'FLAC', sampleRateHertz: 16_000, audioChannelCount: 1, languageCode: idioma, model: modelo, enableWordTimeOffsets: true, enableAutomaticPunctuation: true },
          audio: { content: Buffer.from(tramo.audio).toString('base64') },
        }),
      });
      if (!r.ok) throw new TranscripcionNoDisponible(`Google Speech-to-Text respondió ${r.status}`);
      const cuerpo = (await r.json()) as { results?: { alternatives?: { transcript?: string; words?: { startTime?: string; endTime?: string }[] }[]; resultEndTime?: string }[] };
      let anterior = 0;
      return (cuerpo.results ?? []).flatMap((res) => {
        const alt = res.alternatives?.[0];
        const texto = alt?.transcript?.trim();
        if (!texto) return [];
        // Cada resultado es una frase: va desde su primera palabra hasta la última (o hasta el fin del resultado).
        const desde = alt?.words?.length ? segundos(alt.words[0]!.startTime) : anterior;
        const hasta = alt?.words?.length ? segundos(alt.words.at(-1)!.endTime) : segundos(res.resultEndTime);
        anterior = hasta;
        return [{ desde: decimal(tramo.desdeS + desde), hasta: decimal(tramo.desdeS + Math.max(hasta, desde)), texto }];
      });
    },
  };
}

/** Modo simulado: un fragmento cada 10 s con el tiempo real del tramo; el texto dice que no hubo transcripción. */
export const transcriptorSimulado: ProveedorTranscripcion = {
  nombre: 'simulado', modelo: 'simulado',
  async transcribir(tramo) {
    const salida: SegmentoTranscripcion[] = [];
    for (let t = 0; t < tramo.duracionS; t += 10) {
      const desde = decimal(tramo.desdeS + t);
      salida.push({ desde, hasta: decimal(tramo.desdeS + Math.min(t + 10, tramo.duracionS)), texto: `Fragmento simulado desde ${desde} s: sin proveedor de transcripción, aquí iría lo que se dice.` });
    }
    return salida;
  },
};

/** En modo real sin clave no se inventa texto: el material queda en error con el motivo. */
export function transcriptorDesdeEntorno(entorno: NodeJS.ProcessEnv): ProveedorTranscripcion {
  if ((entorno.PROVEEDORES_MODO ?? 'simulado') === 'simulado') return transcriptorSimulado;
  if (!entorno.GOOGLE_STT_API_KEY) {
    return {
      nombre: 'google', modelo: '-',
      transcribir: async () => { throw new TranscripcionNoDisponible('Falta la clave de Google Speech-to-Text (GOOGLE_STT_API_KEY)'); },
    };
  }
  return transcriptorGoogle({ apiKey: entorno.GOOGLE_STT_API_KEY, ...(entorno.GOOGLE_STT_MODELO ? { modelo: entorno.GOOGLE_STT_MODELO } : {}) });
}
