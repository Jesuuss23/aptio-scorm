// OCR con tesseract.js en español e inglés. Los datos de idioma vienen en paquetes npm (sin descargas en tiempo de ejecución).
import { mkdtempSync, symlinkSync,copyFileSync, } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import type { Ocr } from './tipos.js';

const requerir = createRequire(import.meta.url);

/** tesseract.js lee todos los idiomas de una sola carpeta: se juntan con enlaces en una carpeta temporal. */
function carpetaIdiomas(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aptio-ocr-'));

for (const idioma of ['spa', 'eng']) {
  const { langPath } = requerir(`@tesseract.js-data/${idioma}`) as { langPath: string };
  const origen = join(langPath, `${idioma}.traineddata.gz`);
  const destino = join(dir, `${idioma}.traineddata.gz`);
  try {
    symlinkSync(origen, destino, 'file');
  } catch {
    copyFileSync(origen, destino);
  }
}
  return dir;
}

let trabajador: Promise<Worker> | null = null;

/** OCR compartido por el proceso; se crea al primer uso. */
export const ocrTesseract: Ocr = async (png) => {
  trabajador ??= (async () => {
    const dir = carpetaIdiomas();
    return createWorker(['spa', 'eng'], 1, { langPath: dir, cachePath: dir, gzip: true });
  })();
  const { data } = await (await trabajador).recognize(Buffer.from(png));
  return data.text.replace(/[ \t]+\n/g, '\n').trim();
};

export async function cerrarOcr(): Promise<void> {
  if (!trabajador) return;
  const w = await trabajador;
  trabajador = null;
  await w.terminate();
}
