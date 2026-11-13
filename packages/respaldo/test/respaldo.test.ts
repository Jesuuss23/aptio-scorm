// HU-1403 · La copia contra PostgreSQL y LocalStack reales: exitosa (volcado, objetos y manifiesto, con auditoría),
// fallida (queda FALLIDO con su error y sin carpeta a medias) y la purga de lo que pasó los 14 días.
import { Almacen, configDesdeEnv } from '@aptio/almacen';
import { prisma } from '@aptio/db';
import { DeleteBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { carpetaDe } from '../src/carpetas.js';
import { crearRespaldo, purgarRespaldos } from '../src/respaldo.js';
import { asegurarBucket, borrarCarpeta, carpetas, leer, listar } from '../src/s3.js';

const hay = Boolean(process.env.DATABASE_URL && process.env.AWS_ENDPOINT);
const sufijo = Math.random().toString(36).slice(2, 8);
const recursos = `aptio-prueba-recursos-${sufijo}`;
const respaldos = `aptio-prueba-respaldos-${sufijo}`;

describe.skipIf(!hay && !process.env.CI)('copia de seguridad (HU-1403)', () => {
  const almacen = new Almacen({ ...configDesdeEnv(), bucket: recursos });
  const ids: string[] = [];

  beforeAll(async () => {
    await asegurarBucket(almacen.s3, recursos);
    await almacen.subir('proyectos/p1/manual.pdf', '%PDF-1.4 manual', 'application/pdf');
    await almacen.subir('kits/k1/logo con espacio.svg', '<svg/>', 'image/svg+xml');
  });

  afterAll(async () => {
    for (const b of [recursos, respaldos]) {
      await borrarCarpeta(almacen.s3, b, '').catch(() => 0);
      await almacen.s3.send(new DeleteBucketCommand({ Bucket: b })).catch(() => undefined);
    }
    await prisma.auditoria.deleteMany({ where: { entidadId: { in: ids } } });
    await prisma.respaldo.deleteMany({ where: { id: { in: ids } } });
  });

  it('copia la base y los objetos, con manifiesto y auditoría', async () => {
    const r = await crearRespaldo({ prisma, almacen, databaseUrl: process.env.DATABASE_URL!, bucketRespaldos: respaldos, origen: 'manual' });
    ids.push(r.id);
    expect(r).toMatchObject({ estado: 'EXITOSO', origen: 'manual', objetos: 2, bucket: respaldos, error: null });
    expect(Number(r.tamanoBytes)).toBeGreaterThan(1000);
    expect(r.duracionMs).toBeGreaterThanOrEqual(0);
    const carpeta = carpetaDe(r.fecha);
    const claves = (await listar(almacen.s3, respaldos, `${carpeta}/`)).map((o) => o.clave).sort();
    expect(claves).toEqual([
      `${carpeta}/base.dump`, `${carpeta}/manifiesto.json`, `${carpeta}/objetos/kits/k1/logo con espacio.svg`, `${carpeta}/objetos/proyectos/p1/manual.pdf`,
    ]);
    const manifiesto = JSON.parse(new TextDecoder().decode(await leer(almacen.s3, respaldos, `${carpeta}/manifiesto.json`)));
    expect(manifiesto).toMatchObject({ version: 1, respaldoId: r.id, bucketOrigen: recursos, volcado: 'base.dump' });
    // pg_dump en formato propio empieza con «PGDMP».
    expect(new TextDecoder().decode((await leer(almacen.s3, respaldos, `${carpeta}/base.dump`)).slice(0, 5))).toBe('PGDMP');
    expect(await prisma.auditoria.findFirst({ where: { accion: 'RESPALDO_CREADO', entidadId: r.id } })).toMatchObject({ entidad: 'Respaldo' });
  });

  it('si pg_dump falla queda FALLIDO con su error y sin carpeta a medias', async () => {
    const url = process.env.DATABASE_URL!.replace(/\/[^/?]+(\?|$)/, `/no_existe_${sufijo}$1`);
    const ahora = new Date(Date.now() + 1000);
    const r = await crearRespaldo({ prisma, almacen, databaseUrl: url, bucketRespaldos: respaldos, ahora });
    ids.push(r.id);
    expect(r.estado).toBe('FALLIDO');
    expect(r.error).toMatch(/pg_dump/);
    expect(await listar(almacen.s3, respaldos, `${carpetaDe(ahora)}/`)).toHaveLength(0);
    expect(await prisma.auditoria.count({ where: { accion: 'RESPALDO_FALLIDO', entidadId: r.id } })).toBe(1);
  });

  it('la purga borra las carpetas de más de 14 días y marca sus copias como EXPIRADO', async () => {
    const ahora = new Date();
    const vieja = new Date(ahora.getTime() - 15 * 24 * 3600_000);
    const casi = new Date(ahora.getTime() - 13 * 24 * 3600_000);
    for (const f of [vieja, casi]) {
      await almacen.s3.send(new PutObjectCommand({ Bucket: respaldos, Key: `${carpetaDe(f)}/manifiesto.json`, Body: '{}' }));
      ids.push((await prisma.respaldo.create({ data: { fecha: f, estado: 'EXITOSO', bucket: respaldos } })).id);
    }
    const r = await purgarRespaldos({ prisma, almacen, bucketRespaldos: respaldos, ahora });
    expect(r.carpetas).toBe(1);
    const quedan = await carpetas(almacen.s3, respaldos);
    expect(quedan).not.toContain(`${carpetaDe(vieja)}/`);
    expect(quedan).toContain(`${carpetaDe(casi)}/`);
    const filas = await prisma.respaldo.findMany({ where: { id: { in: ids.slice(-2) } }, orderBy: { fecha: 'asc' } });
    expect(filas.map((f) => f.estado)).toEqual(['EXPIRADO', 'EXITOSO']);
    expect(filas[0]!.expiradoEn).toEqual(ahora);
  });
});
