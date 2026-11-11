// CP-085 · El reproductor empaquetado pesa menos de 300 KB comprimido y expone el mismo `montar` que usa la vista previa.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { construir } from '../scripts/construir.mjs';

describe('paquete del reproductor (CP-085)', () => {
  it('pesa menos de 300 KB comprimido y deja AptioReproductor.montar', async () => {
    const archivo: string = await construir(join(mkdtempSync(join(tmpdir(), 'aptio-player-')), 'aptio-reproductor.js'));
    const codigo = readFileSync(archivo);
    expect(gzipSync(codigo).length).toBeLessThan(300 * 1024);
    const ventana: { AptioReproductor?: { montar: unknown; version: string } } = {};
    runInNewContext(codigo.toString(), { window: ventana });
    expect(typeof ventana.AptioReproductor?.montar).toBe('function');
  }, 30_000);
});
