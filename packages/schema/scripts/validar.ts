// Valida un curso desde la terminal. Uso: pnpm --filter @aptio/schema validar <ruta.json>
// (sin ruta valida ejemplos/ejemplo-capsula.json). Sale con código 1 si hay errores.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validarCurso } from '../src/index.js';

const ruta = process.argv[2]
  ? resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2])
  : new URL('../ejemplos/ejemplo-capsula.json', import.meta.url);
const { valido, errores, advertencias } = validarCurso(JSON.parse(readFileSync(ruta, 'utf8')));
if (!valido) {
  console.error(`✗ ${errores.length} error(es):`);
  for (const e of errores) console.error('  - ' + e);
  process.exit(1);
}
console.log('✓ El curso es válido según el esquema v0.2 y las reglas adicionales.');
if (advertencias.length) {
  console.log(`Advertencias para exportar (${advertencias.length}):`);
  for (const a of advertencias) console.log('  - ' + a);
}
