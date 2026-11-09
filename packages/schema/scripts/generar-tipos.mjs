// Genera src/curso.generado.ts desde esquemas/curso-v0.schema.json.
// Uso: pnpm --filter @aptio/schema generar   ·   --comprobar falla si el archivo no está al día.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'src/curso.generado.ts');
const esquema = JSON.parse(readFileSync(join(raiz, 'esquemas/curso-v0.schema.json'), 'utf8'));

export async function generar() {
  return compile(esquema, 'Curso', {
    bannerComment:
      '/* Archivo generado desde esquemas/curso-v0.schema.json con `pnpm --filter @aptio/schema generar`. No editar a mano. */',
    additionalProperties: false,
    unreachableDefinitions: true,
    style: { singleQuote: true, printWidth: 120 },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const codigo = await generar();
  if (process.argv.includes('--comprobar')) {
    if (readFileSync(destino, 'utf8') !== codigo) {
      console.error('✗ src/curso.generado.ts no está al día: ejecuta `pnpm --filter @aptio/schema generar`');
      process.exit(1);
    }
    console.log('✓ Tipos al día con el esquema');
  } else {
    writeFileSync(destino, codigo);
    console.log('✓ src/curso.generado.ts generado');
  }
}
