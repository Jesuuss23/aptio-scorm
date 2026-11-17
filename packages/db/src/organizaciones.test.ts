// HU-1701 · CP-140 · Migración: con los datos actuales de AulasEducativas, al aplicar la migración quedan en la
// organización «AulasEducativas» sin pérdida. Cada prueba usa su propia base temporal (no toca la de desarrollo):
// aplica las migraciones con `prisma migrate deploy`, como en la nube, y revisa con `verificar-organizaciones`.
// Necesita PostgreSQL con permiso para crear bases; sin DATABASE_URL se omite.
import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizacionDeIds, SLUG_ORGANIZACION_BASE, TABLAS_ORGANIZACION, verificarOrganizaciones } from './organizaciones.js';

const ejecutar = promisify(execFile);
const URL_BASE = process.env.DATABASE_URL;
const PAQUETE = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRACIONES = join(PAQUETE, 'prisma', 'migrations');
const MIGRACION = '20261117050000_organizacion_base';
const BIN = (n: string) => join(PAQUETE, 'node_modules', '.bin', n);

/** URL de otra base en el mismo servidor. */
const urlDe = (nombre: string) => {
  const u = new URL(URL_BASE!);
  u.pathname = `/${nombre}`;
  return u.toString();
};

const conBase = Boolean(URL_BASE);
const sufijo = `${process.pid}_${Date.now().toString(36)}`;
const bases: string[] = [];
const temporales: string[] = [];
let admin: PrismaClient;

async function nuevaBase(nombre: string): Promise<string> {
  const n = `aptio_cp140_${nombre}_${sufijo}`;
  await admin.$executeRawUnsafe(`CREATE DATABASE "${n}"`);
  bases.push(n);
  return urlDe(n);
}

/** `prisma migrate deploy` con todas las migraciones o sin la de esta historia (para tener la base de antes). */
async function desplegar(url: string, { sinLaNueva = false } = {}) {
  let schema = join(PAQUETE, 'prisma', 'schema.prisma');
  if (sinLaNueva) {
    const dir = mkdtempSync(join(tmpdir(), 'aptio-cp140-'));
    temporales.push(dir);
    cpSync(schema, join(dir, 'schema.prisma'));
    cpSync(MIGRACIONES, join(dir, 'migrations'), { recursive: true });
    rmSync(join(dir, 'migrations', MIGRACION), { recursive: true });
    schema = join(dir, 'schema.prisma');
  }
  await ejecutar(BIN('prisma'), ['migrate', 'deploy', '--schema', schema], { cwd: PAQUETE, env: { ...process.env, DATABASE_URL: url } });
}

/** Filas de todas las tablas de la base (menos el registro de migraciones). */
async function conteos(bd: PrismaClient): Promise<Record<string, number>> {
  const tablas = await bd.$queryRawUnsafe<{ t: string }[]>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY 1`);
  const r: Record<string, number> = {};
  for (const { t } of tablas) {
    const [fila] = await bd.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}"`);
    r[t] = Number(fila?.n ?? 0);
  }
  return r;
}

const verificar = (url: string) =>
  ejecutar(BIN('tsx'), ['prisma/verificar-organizaciones.ts'], { cwd: PAQUETE, env: { ...process.env, DATABASE_URL: url } })
    .then((r) => ({ codigo: 0, salida: r.stdout, error: r.stderr }))
    .catch((e: { code: number; stdout: string; stderr: string }) => ({ codigo: e.code, salida: e.stdout, error: e.stderr }));

describe.skipIf(!conBase)('CP-140 · migración a la organización AulasEducativas', () => {
  beforeAll(() => {
    admin = new PrismaClient({ datasourceUrl: urlDe('postgres') });
  });
  afterAll(async () => {
    for (const b of bases) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${b}" WITH (FORCE)`);
    await admin.$disconnect();
    for (const d of temporales) rmSync(d, { recursive: true, force: true });
  });

  it('la migración es la última y solo agrega', () => {
    expect(readdirSync(MIGRACIONES).filter((d) => /^\d{14}_/.test(d)).sort().at(-1)).toBe(MIGRACION);
  });

  it('con los datos actuales sembrados, todo queda en AulasEducativas con los mismos conteos y 0 huérfanas', async () => {
    const url = await nuevaBase('sembrada');
    await desplegar(url, { sinLaNueva: true });
    await ejecutar(BIN('tsx'), ['prisma/seed.ts'], { cwd: PAQUETE, env: { ...process.env, DATABASE_URL: url } });
    const bd = new PrismaClient({ datasourceUrl: url });
    try {
      const antes = await conteos(bd);
      expect(antes.Cliente).toBeGreaterThan(0);
      expect(antes.Proyecto).toBeGreaterThan(0);

      await desplegar(url);
      expect(await conteos(bd)).toEqual(antes);
      const orgs = await bd.organizacion.findMany();
      expect(orgs.map((o) => [o.slug, o.nombre, o.estado])).toEqual([[SLUG_ORGANIZACION_BASE, 'AulasEducativas', 'ACTIVA']]);

      const v = await verificarOrganizaciones(bd);
      expect(v.inconsistencias).toEqual([]);
      // Todo lo que tiene organización está en AulasEducativas; sin organización, solo lo de plataforma.
      const opcionales = new Set<string>(TABLAS_ORGANIZACION.filter((t) => t.opcional).map((t) => t.tabla));
      expect(v.conteos.filter((c) => c.organizacionId && c.slug !== SLUG_ORGANIZACION_BASE)).toEqual([]);
      expect(v.conteos.filter((c) => !c.organizacionId && !opcionales.has(c.tabla))).toEqual([]);
      expect(v.conteos.find((c) => c.tabla === 'Usuario' && !c.organizacionId)?.filas).toBe(1); // el superadmin

      const cli = await verificar(url);
      expect(cli.codigo).toBe(0);
      expect(cli.salida).toContain('Íntegro: 0 filas huérfanas');
    } finally {
      await bd.$disconnect();
    }
  }, 180_000);

  it('en una base vacía crea la organización base, y repetir la migración no cambia nada', async () => {
    const url = await nuevaBase('vacia');
    await desplegar(url);
    const bd = new PrismaClient({ datasourceUrl: url });
    try {
      const [org] = await bd.organizacion.findMany();
      expect(org?.slug).toBe(SLUG_ORGANIZACION_BASE);
      await ejecutar(BIN('prisma'), ['db', 'execute', '--file', join(MIGRACIONES, MIGRACION, 'migration.sql'), '--url', url], { cwd: PAQUETE });
      const despues = await bd.organizacion.findMany();
      expect(despues).toEqual([org]);
    } finally {
      await bd.$disconnect();
    }
  }, 180_000);

  it('verificar-organizaciones sale con 1 si hay un cruce entre organizaciones, y ubica cada id en su organización', async () => {
    const url = await nuevaBase('cruce');
    await desplegar(url);
    const bd = new PrismaClient({ datasourceUrl: url });
    try {
      const a = await bd.organizacion.findUniqueOrThrow({ where: { slug: SLUG_ORGANIZACION_BASE } });
      const b = await bd.organizacion.create({ data: { nombre: 'Otra productora', slug: 'otra-productora' } });
      const cliente = await bd.cliente.create({ data: { organizacionId: a.id, nombre: 'Cliente A', kit: { create: { estilo: 'Corporativo', paleta: {}, tipografias: {}, voces: {} } } }, include: { kit: true } });
      const usuario = await bd.usuario.create({ data: { organizacionId: b.id, nombre: 'B', email: 'b@otra.test', rol: 'PRODUCTOR' } });
      const proyecto = await bd.proyecto.create({ data: { organizacionId: b.id, clienteId: cliente.id, nombre: 'Cruzado', creadoPorId: usuario.id } });

      const ubicados = await organizacionDeIds(bd, [cliente.id, cliente.kit!.id, proyecto.id, 'no-es-uuid', '00000000-0000-4000-8000-000000000000']);
      expect(ubicados.map((x) => [x.entidad, x.organizacionId]).sort()).toEqual([['Cliente', a.id], ['KitMarca', a.id], ['Proyecto', b.id]].sort());

      const v = await verificarOrganizaciones(bd);
      expect(v.integra).toBe(false);
      expect(v.inconsistencias).toEqual([{ regla: 'Proyecto: cliente de otra organización', filas: 1 }]);
      const cli = await verificar(url);
      expect(cli.codigo).toBe(1);
      expect(cli.error).toContain('Proyecto: cliente de otra organización: 1');
    } finally {
      await bd.$disconnect();
    }
  }, 180_000);
});
