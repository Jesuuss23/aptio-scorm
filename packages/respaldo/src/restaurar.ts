// HU-1403 · Restaurar una copia (CP-108): baja el volcado y los objetos de la copia elegida y los deja en una base y un
// bucket de destino dichos de forma explícita. Nunca restaura sobre la base o el bucket en uso, ni sobre una base con
// tablas: así no se pisa producción por accidente.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '@aptio/db';
import { ARCHIVO_MANIFIESTO, binarioPg, CARPETA_OBJETOS, elegirCarpeta, entornoPg, mismaBase } from './carpetas.js';
import { ejecutar, type Manifiesto } from './respaldo.js';
import { asegurarBucket, carpetas, copiar, leer } from './s3.js';

export class ErrorRestauracion extends Error {}

export interface OpcionesRestaurar {
  s3: S3Client;
  claveKms: string;
  bucketRespaldos: string;
  /** Día de Lima (`AAAA-MM-DD`, la última copia completa de ese día) o el nombre de la carpeta. */
  cuando: string;
  destino: { databaseUrl?: string; bucket?: string };
  /** La base y el bucket en uso: el destino no puede ser ninguno de los dos. */
  enUso: { databaseUrl?: string; bucket?: string };
  env?: NodeJS.ProcessEnv;
}

/** Revisa el destino antes de tocar nada. */
export function validarDestino(o: Pick<OpcionesRestaurar, 'destino' | 'enUso' | 'bucketRespaldos'>): { databaseUrl: string; bucket: string } {
  const { databaseUrl, bucket } = o.destino;
  if (!databaseUrl) throw new ErrorRestauracion('Falta la base de destino (--base postgresql://…)');
  if (!bucket) throw new ErrorRestauracion('Falta el bucket de destino (--bucket nombre)');
  entornoPg(databaseUrl);
  if (o.enUso.databaseUrl && mismaBase(databaseUrl, o.enUso.databaseUrl)) {
    throw new ErrorRestauracion('La base de destino es la que está en uso (DATABASE_URL): elige una base nueva');
  }
  if (bucket === o.enUso.bucket) throw new ErrorRestauracion('El bucket de destino es el que está en uso (S3_BUCKET_NAME): elige uno nuevo');
  if (bucket === o.bucketRespaldos) throw new ErrorRestauracion('El bucket de destino no puede ser el de respaldos');
  return { databaseUrl, bucket };
}

export interface Restaurado {
  carpeta: string;
  respaldoId: string;
  objetos: number;
  bytes: number;
}

export async function restaurarRespaldo(o: OpcionesRestaurar): Promise<Restaurado> {
  const destino = validarDestino(o);
  const carpeta = elegirCarpeta(await carpetas(o.s3, o.bucketRespaldos), o.cuando);
  if (!carpeta) throw new ErrorRestauracion(`No hay una copia de «${o.cuando}» en el bucket ${o.bucketRespaldos}`);
  let manifiesto: Manifiesto;
  try {
    manifiesto = JSON.parse(new TextDecoder().decode(await leer(o.s3, o.bucketRespaldos, `${carpeta}/${ARCHIVO_MANIFIESTO}`))) as Manifiesto;
  } catch {
    throw new ErrorRestauracion(`La copia ${carpeta} no terminó (no tiene manifiesto): elige otra`);
  }

  const base = new PrismaClient({ datasources: { db: { url: destino.databaseUrl } } });
  const temporal = await mkdtemp(join(tmpdir(), 'aptio-restaurar-'));
  try {
    const [fila] = await base.$queryRaw<{ tablas: number }[]>`select count(*)::int as tablas from information_schema.tables where table_schema = 'public'`;
    if ((fila?.tablas ?? 0) > 0) throw new ErrorRestauracion('La base de destino no está vacía: crea una base nueva para restaurar');

    const archivo = join(temporal, manifiesto.volcado);
    await writeFile(archivo, await leer(o.s3, o.bucketRespaldos, `${carpeta}/${manifiesto.volcado}`));
    const pg = entornoPg(destino.databaseUrl);
    // pg_restore no toma PGDATABASE: el nombre va en --dbname (sin la clave, que sigue en PGPASSWORD).
    await ejecutar(binarioPg('pg_restore', o.env), ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${pg.PGDATABASE}`, archivo], pg);

    await asegurarBucket(o.s3, destino.bucket);
    const prefijo = `${carpeta}/${CARPETA_OBJETOS}`;
    await copiar(o.s3, o.bucketRespaldos, destino.bucket, manifiesto.objetos.map((x) => ({ ...x, clave: `${prefijo}${x.clave}` })), (k) => k.slice(prefijo.length), o.claveKms);

    // El volcado se hizo con la copia aún en curso: en la base restaurada queda como la copia exitosa que es.
    const bytes = manifiesto.bytesVolcado + manifiesto.objetos.reduce((n, x) => n + x.bytes, 0);
    await base.respaldo.updateMany({
      where: { id: manifiesto.respaldoId },
      data: { estado: 'EXITOSO', claveVolcado: `${carpeta}/${manifiesto.volcado}`, objetos: manifiesto.objetos.length, tamanoBytes: BigInt(bytes) },
    });
    return { carpeta, respaldoId: manifiesto.respaldoId, objetos: manifiesto.objetos.length, bytes };
  } finally {
    await base.$disconnect();
    await rm(temporal, { recursive: true, force: true });
  }
}
