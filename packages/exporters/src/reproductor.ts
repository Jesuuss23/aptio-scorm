// El reproductor único empaquetado (`aptio-reproductor.js`) que va dentro de cada paquete, el mismo de la vista previa.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { construir } from '@aptio/player/construir';

let cache: Promise<string> | null = null;

/** Empaqueta el reproductor una vez por proceso y devuelve su código. */
export function codigoReproductor(): Promise<string> {
  cache ??= (async () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'aptio-reproductor-'));
    try {
      return readFileSync(await construir(join(carpeta, 'aptio-reproductor.js')), 'utf8');
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  })().catch((e: unknown) => {
    cache = null;
    throw e;
  });
  return cache;
}
