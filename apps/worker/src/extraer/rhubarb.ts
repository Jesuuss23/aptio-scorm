// HU-0702 · Marcas de boca con Rhubarb Lip Sync 1.13 (MIT) desde el audio de la narración (RN-07-2, SUP-35).
// Rhubarb lee WAV u OGG: ffmpeg pasa el MP3 de Google a WAV mono de 16 kHz. El reconocedor «phonetic» no depende del
// idioma, por eso sirve para español. Corre en el worker, sin red ni costo.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { BocaNoDisponible, bocasDeRhubarb, type CalculadorBocas, calculadorSimulado } from '@aptio/ai';

const ejecutar = promisify(execFile);

export function calculadorRhubarb(ruta = 'rhubarb'): CalculadorBocas {
  return async ({ audio, mime, duracionMs }) => {
    const dir = await mkdtemp(join(tmpdir(), 'aptio-boca-'));
    try {
      const original = join(dir, mime === 'audio/mpeg' ? 'original.mp3' : 'original.wav');
      const wav = join(dir, 'narracion.wav');
      await writeFile(original, audio);
      await ejecutar('ffmpeg', ['-v', 'error', '-y', '-i', original, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav])
        .catch(() => { throw new BocaNoDisponible('No se pudo convertir el audio para calcular la boca (¿está ffmpeg instalado?)'); });
      const { stdout } = await ejecutar(ruta, ['-q', '-r', 'phonetic', '-f', 'json', '--extendedShapes', 'GHX', wav], { maxBuffer: 16 * 1024 * 1024 })
        .catch((e: NodeJS.ErrnoException) => {
          throw new BocaNoDisponible(e.code === 'ENOENT' ? `Rhubarb Lip Sync no está instalado en el worker (RHUBARB_PATH=${ruta})` : `Rhubarb no pudo leer el audio: ${e.message}`);
        });
      return { bocas: bocasDeRhubarb(stdout, duracionMs), metodo: 'rhubarb' };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

/** Simulado por defecto (sin red, determinista); en modo real, Rhubarb desde `RHUBARB_PATH` o el PATH. */
export function calculadorBocasDesdeEntorno(env: NodeJS.ProcessEnv): CalculadorBocas {
  if ((env.PROVEEDORES_MODO ?? 'simulado') === 'simulado') return calculadorSimulado;
  return calculadorRhubarb(env.RHUBARB_PATH || 'rhubarb');
}
