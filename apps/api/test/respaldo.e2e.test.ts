// HU-1403 · CP-108 · Restauración: una copia real (pg_dump y los objetos de S3 en LocalStack) se restaura con
// `pnpm respaldo:restaurar` en una base y un bucket nuevos, y la API levantada sobre ellos responde con esos datos
// (salud, ingreso, proyectos y curso). El script se niega a restaurar sobre la base en uso.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Almacen, configDesdeEnv } from '@aptio/almacen';
import { hashearClave, prisma, PrismaClient, Rol } from '@aptio/db';
import { asegurarBucket, borrarBucket, carpetaDe, crearRespaldo } from '@aptio/respaldo';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hay = Boolean(process.env.DATABASE_URL && process.env.AWS_ENDPOINT);
const sufijo = Math.random().toString(36).slice(2, 8);
const CLAVE = 'clave-de-prueba-123';
const EMAIL = `admin-${sufijo}@cp108.test`;
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const API = fileURLToPath(new URL('../', import.meta.url));
const recursos = `aptio-prueba-cp108-${sufijo}`;
const respaldos = `aptio-prueba-cp108-respaldos-${sufijo}`;
const destino = `aptio-prueba-cp108-restaurado-${sufijo}`;
const baseNueva = `aptio_cp108_${sufijo}`;
const urlNueva = () => process.env.DATABASE_URL!.replace(/\/[^/?]+(\?|$)/, `/${baseNueva}$1`);
const loto = JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));

const puertoLibre = () => new Promise<number>((listo) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address() as { port: number };
    s.close(() => listo(port));
  });
});

/** `pnpm respaldo:restaurar …` desde la raíz del repositorio, como lo corre una persona. */
const restaurar = (args: string[]) => promisify(execFile)('pnpm', ['--silent', 'respaldo:restaurar', ...args], {
  cwd: RAIZ, env: { ...process.env, S3_BUCKET_NAME: recursos, S3_BUCKET_RESPALDOS: respaldos }, timeout: 120_000,
}).then((r) => ({ codigo: 0, salida: r.stdout + r.stderr }), (e: { code?: number; stdout?: string; stderr?: string }) => ({ codigo: e.code ?? 1, salida: `${e.stdout ?? ''}${e.stderr ?? ''}` }));

describe.skipIf(!hay && !process.env.CI)('CP-108 · restauración de una copia (HU-1403)', () => {
  const almacen = new Almacen({ ...configDesdeEnv(), bucket: recursos });
  const ids = { org: '', proyecto: '', curso: '', respaldo: '' };
  let api: ChildProcess | undefined;
  let carpeta = '';

  beforeAll(async () => {
    ids.org = (await prisma.organizacion.create({ data: { nombre: 'Org CP-108', slug: `cp108-${sufijo}` } })).id;
    const cliente = (await prisma.cliente.create({ data: { organizacionId: ids.org, nombre: 'Minera Andina' } })).id;
    const admin = await prisma.usuario.create({
      data: { nombre: 'Admin CP-108', email: EMAIL, rol: Rol.ADMINISTRADOR, organizacionId: ids.org, hashClave: await hashearClave(CLAVE), emailVerificado: true },
    });
    ids.proyecto = (await prisma.proyecto.create({ data: { organizacionId: ids.org, clienteId: cliente, nombre: `LOTO de la noche ${sufijo}`, creadoPorId: admin.id } })).id;
    ids.curso = (await prisma.curso.create({ data: { organizacionId: ids.org, proyectoId: ids.proyecto, versionEsquema: '0.2.0', documento: loto } })).id;
    await asegurarBucket(almacen.s3, recursos);
    await almacen.subir(`organizaciones/${ids.org}/logo.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml');
    await prisma.$executeRawUnsafe(`create database "${baseNueva}"`);
  }, 60_000);

  afterAll(async () => {
    api?.kill('SIGTERM');
    await prisma.$executeRawUnsafe(`drop database if exists "${baseNueva}" with (force)`).catch(() => undefined);
    for (const b of [recursos, respaldos, destino]) await borrarBucket(almacen.s3, b);
    await prisma.auditoria.deleteMany({ where: { entidadId: ids.respaldo } });
    await prisma.respaldo.deleteMany({ where: { id: ids.respaldo } });
    await prisma.curso.deleteMany({ where: { id: ids.curso } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: ids.org } });
    await prisma.usuario.deleteMany({ where: { organizacionId: ids.org } });
    await prisma.cliente.deleteMany({ where: { organizacionId: ids.org } });
    await prisma.organizacion.deleteMany({ where: { id: ids.org } });
  }, 60_000);

  it('dado una copia de la noche anterior, se hace con pg_dump y los objetos de S3', async () => {
    const r = await crearRespaldo({ prisma, almacen, databaseUrl: process.env.DATABASE_URL!, bucketRespaldos: respaldos, ahora: new Date(Date.now() - 6 * 3600_000) });
    ids.respaldo = r.id;
    expect(r).toMatchObject({ estado: 'EXITOSO', objetos: 1, error: null });
    carpeta = carpetaDe(r.fecha);
  }, 120_000);

  it('el script nunca restaura sobre la base en uso, ni sin destino', async () => {
    const enUso = await restaurar([carpeta, '--base', process.env.DATABASE_URL!, '--bucket', destino]);
    expect(enUso.codigo).not.toBe(0);
    expect(enUso.salida).toContain('La base de destino es la que está en uso');
    const sinBucket = await restaurar([carpeta, '--base', urlNueva()]);
    expect(sinBucket.salida).toContain('Falta el bucket de destino');
    const sinCopia = await restaurar(['2001-01-01', '--base', urlNueva(), '--bucket', destino]);
    expect(sinCopia.salida).toContain('No hay una copia de «2001-01-01»');
  }, 120_000);

  it('cuando la restauro en un entorno de prueba, el sistema funciona con los datos de esa copia', async () => {
    const r = await restaurar([carpeta, '--base', urlNueva(), '--bucket', destino]);
    expect(r.salida).toContain(`Copia ${carpeta} restaurada`);
    expect(r.codigo).toBe(0);

    // La copia quedó como exitosa también en la base restaurada, y el objeto está en el bucket nuevo.
    const restaurada = new PrismaClient({ datasources: { db: { url: urlNueva() } } });
    expect(await restaurada.respaldo.findUnique({ where: { id: ids.respaldo } })).toMatchObject({ estado: 'EXITOSO', objetos: 1 });
    await restaurada.$disconnect();
    const enDestino = new Almacen({ ...configDesdeEnv(), bucket: destino });
    expect(new TextDecoder().decode(await enDestino.leer(`organizaciones/${ids.org}/logo.svg`))).toContain('<svg');

    // La API sobre la base y el bucket restaurados.
    const puerto = await puertoLibre();
    api = spawn(process.execPath, ['--enable-source-maps', '--import', '@swc-node/register/esm-register', 'src/main.ts'], {
      cwd: API, env: { ...process.env, DATABASE_URL: urlNueva(), S3_BUCKET_NAME: destino, API_PORT: String(puerto), NODE_ENV: 'test' }, stdio: 'ignore',
    });
    const url = `http://localhost:${puerto}/api/v1`;
    let salud: Response | null = null;
    for (let i = 0; i < 120 && !salud?.ok; i++) {
      salud = await fetch(`${url}/salud`).catch(() => null);
      if (!salud?.ok) await new Promise((r2) => setTimeout(r2, 250));
    }
    expect(salud?.status).toBe(200);
    expect(await salud!.json()).toMatchObject({ estado: 'ok', baseDatos: 'ok' });

    const ingreso = await fetch(`${url}/auth/ingresar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, clave: CLAVE }) });
    expect(ingreso.status).toBe(200);
    const cookie = ingreso.headers.get('set-cookie')!.split(';')[0]!;
    const proyectos = await fetch(`${url}/proyectos`, { headers: { cookie } });
    expect(proyectos.status).toBe(200);
    expect(JSON.stringify(await proyectos.json())).toContain(`LOTO de la noche ${sufijo}`);
    const curso = await fetch(`${url}/proyectos/${ids.proyecto}/curso`, { headers: { cookie } });
    expect(curso.status).toBe(200);
    expect((await curso.json()).documento.titulo).toEqual(loto.titulo);
  }, 180_000);
});
