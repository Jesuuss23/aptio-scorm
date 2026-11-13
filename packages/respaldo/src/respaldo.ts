// HU-1403 · La copia de seguridad diaria (03:00 de Lima, o «Respaldar ahora»): volcado de PostgreSQL con pg_dump y
// copia de todos los objetos del bucket de recursos al bucket de respaldos, en una carpeta por copia con su manifiesto.
// Queda en `Respaldo` (exitoso o fallido, tamaño y duración) y en Auditoría. La purga borra lo de más de 14 días.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Almacen } from '@aptio/almacen';
import type { PrismaClient, Respaldo } from '@aptio/db';
import {
  ARCHIVO_MANIFIESTO, ARCHIVO_VOLCADO, binarioPg, CARPETA_OBJETOS, carpetaDe, entornoPg, fechaDeCarpeta, limiteRetencion,
  RETENCION_DIAS,
} from './carpetas.js';
import { asegurarBucket, borrarCarpeta, carpetas, copiar, listar, subirArchivo, subirTexto } from './s3.js';

/** Lo que guarda cada copia para poder restaurarse sin la base (que es justo lo que se perdió). */
export interface Manifiesto {
  version: 1;
  respaldoId: string;
  carpeta: string;
  fecha: string;
  bucketOrigen: string;
  volcado: string;
  bytesVolcado: number;
  objetos: { clave: string; bytes: number }[];
}

/** Corre un programa y falla con las últimas líneas de su salida de error. */
export function ejecutar(programa: string, args: string[], env: Record<string, string>): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const p = spawn(programa, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    p.stderr.on('data', (d: Buffer) => {
      error = (error + d.toString()).slice(-2000);
    });
    p.on('error', (e) => rechazar(new Error(`No se pudo ejecutar ${programa}: ${e.message}`)));
    p.on('close', (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`${programa} terminó con código ${codigo}: ${error.trim()}`))));
  });
}

export interface OpcionesRespaldo {
  prisma: PrismaClient;
  almacen: Almacen;
  databaseUrl: string;
  bucketRespaldos: string;
  origen?: 'programado' | 'manual';
  solicitadoPorId?: string | null;
  ahora?: Date;
  env?: NodeJS.ProcessEnv;
}

/** Hace una copia completa. No lanza: si algo falla, la copia queda FALLIDO con su error y se borra lo subido a medias. */
export async function crearRespaldo(o: OpcionesRespaldo): Promise<Respaldo> {
  const inicio = o.ahora ?? new Date();
  const { s3, config } = o.almacen;
  const carpeta = carpetaDe(inicio);
  const respaldo = await o.prisma.respaldo.create({
    data: { fecha: inicio, origen: o.origen ?? 'programado', solicitadoPorId: o.solicitadoPorId ?? null, bucket: o.bucketRespaldos, ubicacion: `${carpeta}/` },
  });
  const temporal = await mkdtemp(join(tmpdir(), 'aptio-respaldo-'));
  const t0 = Date.now();
  try {
    await asegurarBucket(s3, o.bucketRespaldos);
    const archivo = join(temporal, ARCHIVO_VOLCADO);
    await ejecutar(binarioPg('pg_dump', o.env), ['--format=custom', '--no-owner', '--no-privileges', `--file=${archivo}`], entornoPg(o.databaseUrl));
    const bytesVolcado = await subirArchivo(s3, o.bucketRespaldos, `${carpeta}/${ARCHIVO_VOLCADO}`, archivo, config.claveKms);
    const objetos = await listar(s3, config.bucket);
    await copiar(s3, config.bucket, o.bucketRespaldos, objetos, (k) => `${carpeta}/${CARPETA_OBJETOS}${k}`, config.claveKms);
    const manifiesto: Manifiesto = {
      version: 1, respaldoId: respaldo.id, carpeta, fecha: inicio.toISOString(), bucketOrigen: config.bucket,
      volcado: ARCHIVO_VOLCADO, bytesVolcado, objetos,
    };
    // El manifiesto va al final: una carpeta sin manifiesto es una copia que no terminó y no se restaura.
    await subirTexto(s3, o.bucketRespaldos, `${carpeta}/${ARCHIVO_MANIFIESTO}`, JSON.stringify(manifiesto), config.claveKms);
    const tamanoBytes = bytesVolcado + objetos.reduce((n, x) => n + x.bytes, 0);
    const listo = await o.prisma.respaldo.update({
      where: { id: respaldo.id },
      data: { estado: 'EXITOSO', claveVolcado: `${carpeta}/${ARCHIVO_VOLCADO}`, objetos: objetos.length, tamanoBytes: BigInt(tamanoBytes), duracionMs: Date.now() - t0 },
    });
    await o.prisma.auditoria.create({
      data: {
        usuarioId: o.solicitadoPorId ?? null, accion: 'RESPALDO_CREADO', entidad: 'Respaldo', entidadId: respaldo.id,
        datos: { origen: listo.origen, carpeta, objetos: objetos.length, tamanoBytes },
      },
    });
    return listo;
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 2000);
    await borrarCarpeta(s3, o.bucketRespaldos, `${carpeta}/`).catch(() => 0);
    const fallido = await o.prisma.respaldo.update({ where: { id: respaldo.id }, data: { estado: 'FALLIDO', error, duracionMs: Date.now() - t0 } });
    await o.prisma.auditoria.create({
      data: { usuarioId: o.solicitadoPorId ?? null, accion: 'RESPALDO_FALLIDO', entidad: 'Respaldo', entidadId: respaldo.id, datos: { origen: fallido.origen, carpeta, error } },
    });
    return fallido;
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}

export interface OpcionesPurga {
  prisma: PrismaClient;
  almacen: Almacen;
  bucketRespaldos: string;
  ahora?: Date;
  dias?: number;
}

/** Borra del bucket las carpetas de más de 14 días y marca sus copias como EXPIRADO. */
export async function purgarRespaldos(o: OpcionesPurga): Promise<{ carpetas: number; objetos: number; registros: number }> {
  const ahora = o.ahora ?? new Date();
  const limite = limiteRetencion(ahora, o.dias ?? RETENCION_DIAS);
  let borradas = 0;
  let objetos = 0;
  for (const c of await carpetas(o.almacen.s3, o.bucketRespaldos).catch(() => [] as string[])) {
    const fecha = fechaDeCarpeta(c);
    if (!fecha || fecha >= limite) continue;
    objetos += await borrarCarpeta(o.almacen.s3, o.bucketRespaldos, c);
    borradas++;
  }
  const { count } = await o.prisma.respaldo.updateMany({
    where: { fecha: { lt: limite }, estado: { in: ['EXITOSO', 'FALLIDO'] } },
    data: { estado: 'EXPIRADO', expiradoEn: ahora },
  });
  if (borradas || count) {
    await o.prisma.auditoria.create({
      data: { accion: 'RESPALDOS_PURGADOS', entidad: 'Respaldo', datos: { carpetas: borradas, objetos, registros: count, antesDe: limite.toISOString() } },
    });
  }
  return { carpetas: borradas, objetos, registros: count };
}
