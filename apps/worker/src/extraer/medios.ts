// HU-0305 · Audio de un video o audio del cliente con ffmpeg: duración y tramos en FLAC mono de 16 kHz para la
// transcripción. Supuesto SUP-28: ffmpeg y ffprobe están instalados en la imagen del worker.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { TramoAudio } from '@aptio/ai';

const ejecutar = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

export interface Medios {
  /** Corta el audio del archivo en tramos de `segundos` y devuelve también la duración total. */
  tramos(archivo: Uint8Array, segundos: number): Promise<{ duracionS: number; tramos: TramoAudio[] }>;
}

async function duracion(ruta: string): Promise<number> {
  const salida = await ejecutar('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', ruta]).catch(() => ({ stdout: '' }));
  const s = Number.parseFloat(salida.stdout.trim());
  if (!Number.isFinite(s) || s <= 0) throw new Error('El archivo no tiene audio legible');
  return s;
}

export const mediosFfmpeg: Medios = {
  async tramos(archivo, segundos) {
    const dir = await mkdtemp(join(tmpdir(), 'aptio-medios-'));
    try {
      const ruta = join(dir, 'original');
      await writeFile(ruta, archivo);
      const duracionS = await duracion(ruta);
      const tramos: TramoAudio[] = [];
      for (let desde = 0; desde < duracionS; desde += segundos) {
        // Un resto de menos de 1 s (relleno del códec) va con el tramo anterior en vez de formar uno propio.
        const resto = duracionS - desde;
        const largo = resto - segundos < 1 ? resto : segundos;
        // Sin video (-vn), un canal, 16 kHz, FLAC a la salida estándar.
        const { stdout } = await ejecutar('ffmpeg', ['-v', 'error', '-ss', String(desde), '-t', String(largo), '-i', ruta, '-vn', '-ac', '1', '-ar', '16000', '-f', 'flac', 'pipe:1'], { encoding: 'buffer', maxBuffer: MAX_BUFFER })
          .catch(() => { throw new Error('No se pudo extraer el audio del archivo (¿el video tiene sonido?)'); });
        tramos.push({ audio: new Uint8Array(stdout), desdeS: desde, duracionS: largo });
      }
      return { duracionS, tramos };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};
