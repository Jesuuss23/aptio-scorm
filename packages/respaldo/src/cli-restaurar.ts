// HU-1403 · `pnpm respaldo:restaurar <fecha> --base postgresql://… --bucket nombre` (CP-108).
// <fecha> es un día de Lima (AAAA-MM-DD, la última copia completa de ese día) o el nombre de la carpeta de la copia.
// La base de destino debe existir y estar vacía; el bucket se crea si no existe. Nunca la base ni el bucket en uso.
import { config } from 'dotenv';
import { Almacen, configDesdeEnv } from '@aptio/almacen';
import { bucketRespaldosDesdeEnv } from './carpetas.js';
import { ErrorRestauracion, restaurarRespaldo } from './restaurar.js';

config({ path: ['.env', '../db/.env', 'packages/db/.env'], quiet: true });

function leerArgs(argv: string[]): { cuando?: string; base?: string; bucket?: string } {
  const salida: { cuando?: string; base?: string; bucket?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (a === '--base' || a === '--bucket') {
      const valor = argv[++i];
      if (valor) salida[a === '--base' ? 'base' : 'bucket'] = valor;
    } else if (a.startsWith('--base=')) salida.base = a.slice(7);
    else if (a.startsWith('--bucket=')) salida.bucket = a.slice(9);
    else if (!salida.cuando) salida.cuando = a;
  }
  return salida;
}

const args = leerArgs(process.argv.slice(2));
if (!args.cuando) {
  console.error('Uso: pnpm respaldo:restaurar <AAAA-MM-DD | carpeta> --base postgresql://… --bucket nombre');
  process.exit(2);
}
const almacen = new Almacen(configDesdeEnv());
try {
  const r = await restaurarRespaldo({
    s3: almacen.s3, claveKms: almacen.config.claveKms, bucketRespaldos: bucketRespaldosDesdeEnv(), cuando: args.cuando,
    destino: { ...(args.base ? { databaseUrl: args.base } : {}), ...(args.bucket ? { bucket: args.bucket } : {}) },
    enUso: { ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}), bucket: almacen.config.bucket },
  });
  console.log(`Copia ${r.carpeta} restaurada: base lista y ${r.objetos} objetos en ${args.bucket} (${r.bytes} bytes).`);
} catch (e) {
  console.error(e instanceof ErrorRestauracion ? e.message : `No se pudo restaurar: ${(e as Error).message}`);
  process.exit(1);
}
