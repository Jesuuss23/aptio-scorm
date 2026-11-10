// Empaqueta el reproductor en un solo archivo para los paquetes SCORM y HTML (HU-1101). El peso comprimido se revisa en
// test/paquete.test.ts (CP-085: menos de 300 KB).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));

export async function construir(salida = `${raiz}dist/aptio-reproductor.js`) {
  await build({
    entryPoints: [`${raiz}src/global.ts`],
    outfile: salida,
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    legalComments: 'none',
    logLevel: 'warning',
  });
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const archivo = await construir();
  console.log(`Reproductor empaquetado en ${archivo}`);
}
