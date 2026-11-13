// HU-1403 · Empresa › Operación (M15): solo administración (401 sin sesión, 403 al resto); errores por proveedor de su
// organización en 24 h y 7 días, colas, tiempo y costo por etapa, y las copias de seguridad; «Respaldar ahora» encola la
// copia en `mantenimiento`, con auditoría, y 409 si ya hay una pendiente. PostgreSQL y Redis reales.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { COLA_MANTENIMIENTO, crearCola, ID_RESPALDO_MANUAL, opcionesRedis, prefijoColas } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { Queue, Worker } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@operacion.test`;
process.env.COLAS_PREFIJO = `prueba-operacion-${sufijo}`;
const hace = (h: number) => new Date(Date.now() - h * 3600_000);

describe.skipIf(!hayBase && !process.env.CI)('operación y copias (HU-1403)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const orgs: string[] = [];
  const respaldos: string[] = [];
  const cookies: Record<string, string> = {};
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send({}),
  });

  beforeAll(async () => {
    const org = (await prisma.organizacion.create({ data: { nombre: 'Org operación', slug: `operacion-${sufijo}` } })).id;
    const otra = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `operacion-otra-${sufijo}` } })).id;
    orgs.push(org, otra);
    const cliente = (await prisma.cliente.create({ data: { organizacionId: org, nombre: 'Minera' } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (n: string, rol: Rol, organizacionId = org, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre: n, email: correo(n), rol, organizacionId, hashClave, emailVerificado: true, ...extra } });
    const admin = await crear('admin', Rol.ADMINISTRADOR);
    await crear('di', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('revisor', Rol.REVISOR_CLIENTE, org, { clienteId: cliente });
    const proyecto = (await prisma.proyecto.create({ data: { organizacionId: org, clienteId: cliente, nombre: 'LOTO', creadoPorId: admin.id } })).id;

    const trabajo = (organizacionId: string, proveedor: string, estado: 'COMPLETADO' | 'ERROR', creadoEn: Date, error: string | null = null) => ({
      organizacionId, tarea: 'IA-01', tipo: 'TEXTO' as const, proveedor, modelo: 'm', estado, creadoEn, error,
    });
    await prisma.trabajoIA.createMany({
      data: [
        trabajo(org, 'anthropic', 'ERROR', hace(2), '429 rate limit'),
        trabajo(org, 'anthropic', 'ERROR', hace(72), 'Salida no válida tras 3 intentos'),
        trabajo(org, 'anthropic', 'COMPLETADO', hace(5)),
        trabajo(org, 'anthropic', 'ERROR', hace(3), 'LIMITE_GASTO: la tarea «Resumen, estructura y guion» llegó a su límite'),
        trabajo(org, 'google', 'ERROR', hace(24 * 10), 'viejo: fuera de los 7 días'),
        // De otra organización: no se ve.
        trabajo(otra, 'elevenlabs', 'ERROR', hace(1), '401 clave'),
      ],
    });
    const gen = await prisma.generacion.create({
      data: {
        organizacionId: org, proyectoId: proyecto, iniciadoPorId: admin.id, parametros: {},
        etapas: {
          create: [
            { etapa: 'RESUMEN_MATERIAL', orden: 1, estado: 'COMPLETADO', inicio: hace(10), fin: new Date(hace(10).getTime() + 60_000), costoUsd: 0.4 },
            { etapa: 'OBJETIVOS_ESTRUCTURA', orden: 2, estado: 'ERROR', inicio: hace(9), fin: hace(9), costoUsd: 0 },
          ],
        },
      },
    });
    void gen;
    for (const [fecha, estado] of [[hace(30), 'EXITOSO'], [hace(24 * 20), 'EXPIRADO']] as const) {
      respaldos.push((await prisma.respaldo.create({ data: { fecha, estado, origen: 'programado', tamanoBytes: 123_456n, duracionMs: 4200, objetos: 7 } })).id);
    }

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['admin', 'di', 'productor', 'revisor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    const q = new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
    await q.obliterate({ force: true });
    await q.close();
    const ia = crearCola('ia');
    await ia.obliterate({ force: true });
    await ia.close();
    await prisma.respaldo.deleteMany({ where: { id: { in: respaldos } } });
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@operacion.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  });

  it('solo administración: 401 sin sesión y 403 a los demás roles', async () => {
    await request(servidor).get('/api/v1/operacion').expect(401);
    await request(servidor).post('/api/v1/operacion/respaldar').expect(401);
    for (const n of ['di', 'productor', 'revisor']) {
      await como(n).get('/operacion').expect(403);
      await como(n).post('/operacion/respaldar').expect(403);
    }
    const r = await como('admin').get('/operacion');
    expect(r.status).toBe(200);
  });

  it('errores por proveedor de su organización en 24 h y 7 días, fallos de cola, etapas y copias', async () => {
    // Un fallo de la cola sin TrabajoIA (p. ej. un paquete) cuenta como «cola:ia»; uno de otra organización, no.
    const ia = crearCola('ia');
    const fallidos = new Promise<void>((listo) => {
      let n = 0;
      const w = new Worker('ia', async () => { throw new Error('ENOSPC: sin espacio'); }, { connection: opcionesRedis(), prefix: prefijoColas() });
      w.on('failed', () => { if (++n === 2) void w.close().then(listo); });
    });
    for (const [id, organizacionId] of [[`fallo-${sufijo}`, orgs[0]], [`fallo-otra-${sufijo}`, orgs[1]]] as const) {
      await ia.add('X', { trabajoId: id, organizacionId: organizacionId!, tarea: 'X' }, { jobId: id, attempts: 1 });
    }
    await fallidos;
    await ia.close();

    const { body } = await como('admin').get('/operacion').expect(200);
    const anthropic = body.errores.porProveedor.find((f: { proveedor: string }) => f.proveedor === 'anthropic');
    expect(anthropic).toMatchObject({ errores24h: 1, errores7d: 2, trabajos7d: 4, detenidosPorLimite7d: 1, ultimoError: { mensaje: '429 rate limit' } });
    expect(body.errores.porProveedor.map((f: { proveedor: string }) => f.proveedor).sort()).toEqual(['anthropic', 'cola:ia']);
    expect(body.errores.porProveedor.find((f: { proveedor: string }) => f.proveedor === 'cola:ia')).toMatchObject({ errores7d: 1, ultimoError: { mensaje: 'ENOSPC: sin espacio' } });
    expect(body.colas.map((c: { nombre: string }) => c.nombre)).toEqual(['ia', 'voz', 'media', 'export', 'mantenimiento']);
    expect(body.colas.find((c: { nombre: string }) => c.nombre === 'ia')).toMatchObject({ fallidos: 2, pendientes: 0, activos: 0 });
    expect(body.etapas.porEtapa).toHaveLength(11);
    expect(body.etapas.porEtapa[0]).toMatchObject({ etapa: 'RESUMEN_MATERIAL', ejecuciones: 1, duracionPromedioMs: 60_000, costoPromedioUsd: 0.4 });
    expect(body.etapas.porEtapa[1]).toMatchObject({ etapa: 'OBJETIVOS_ESTRUCTURA', ejecuciones: 0 });
    expect(body.respaldos).toMatchObject({ retencionDias: 14 });
    const mia = body.respaldos.lista.find((r: { id: string }) => r.id === respaldos[0]);
    expect(mia).toMatchObject({ estado: 'EXITOSO', origen: 'programado', tamanoBytes: 123_456, duracionMs: 4200, objetos: 7, error: null });
    // La de hace 20 días ya no se lista.
    expect(body.respaldos.lista.some((r: { id: string }) => r.id === respaldos[1])).toBe(false);
    expect(body.respaldos.ultimoExitoso).not.toBeNull();
  });

  it('«Respaldar ahora» encola la copia manual con auditoría y responde 409 si ya hay una pendiente', async () => {
    expect((await como('admin').post('/operacion/respaldar').expect(202)).body).toEqual({ encolado: true });
    const q = new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
    const job = await q.getJob(ID_RESPALDO_MANUAL);
    expect(job).toMatchObject({ name: 'respaldar', data: { origen: 'manual', solicitadoPorId: expect.any(String) } });
    expect(await job!.getState()).toBe('waiting');
    expect((await como('admin').post('/operacion/respaldar').expect(409)).body).toMatchObject({ codigo: 'RESPALDO_EN_CURSO' });
    const { body } = await como('admin').get('/operacion').expect(200);
    expect(body.colas.find((c: { nombre: string }) => c.nombre === 'mantenimiento')).toMatchObject({ pendientes: 1 });
    await q.close();
    expect(await prisma.auditoria.count({ where: { organizacionId: orgs[0]!, accion: 'RESPALDO_SOLICITADO' } })).toBe(1);
  });
});
