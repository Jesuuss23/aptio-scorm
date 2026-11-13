// HU-1304 · Conexiones IA (PNT-23, RN-13-2, RN-13-3): lista cerrada de tareas con proveedor, modelo, clave «sí o no»,
// costo estimado, gasto del mes de Lima y límite; solo administración ve, cambia y prueba. Ninguna respuesta lleva una
// clave. Cada organización tiene las suyas. PostgreSQL real; la prueba de conexión corre en modo simulado.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { TAREAS_CONEXION } from '@aptio/schema/conexiones';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@conexiones.test`;
// Claves falsas del entorno: ninguna puede aparecer en una respuesta.
const SECRETOS = { ANTHROPIC_API_KEY: `sk-ant-falsa-${sufijo}`, ELEVENLABS_API_KEY: `eleven-falsa-${sufijo}` };

describe.skipIf(!hayBase && !process.env.CI)('conexiones IA (HU-1304)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const orgs: string[] = [];
  const cookies: Record<string, string> = {};
  const antes = { ...process.env };
  const como = (quien: string) => ({
    get: () => request(servidor).get('/api/v1/conexiones-ia').set('Cookie', cookies[quien]!),
    put: (tarea: string, datos: object) => request(servidor).put(`/api/v1/conexiones-ia/${tarea}`).set('Cookie', cookies[quien]!).send(datos),
    probar: (tarea: string) => request(servidor).post(`/api/v1/conexiones-ia/${tarea}/probar`).set('Cookie', cookies[quien]!),
  });
  const sinSecretos = (cuerpo: unknown) => {
    const texto = JSON.stringify(cuerpo);
    for (const s of Object.values(SECRETOS)) expect(texto).not.toContain(s);
    expect(texto).not.toMatch(/apiKey|api_key|"clave"/i);
  };

  beforeAll(async () => {
    Object.assign(process.env, SECRETOS, { PROVEEDORES_MODO: 'simulado' });
    delete process.env.GOOGLE_TTS_API_KEY;
    const org = (await prisma.organizacion.create({ data: { nombre: 'Org conexiones', slug: `conexiones-${sufijo}` } })).id;
    const otra = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `conexiones-otra-${sufijo}` } })).id;
    orgs.push(org, otra);
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = org, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...extra } });
    await crear('admin', Rol.ADMINISTRADOR);
    await crear('di', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('ajeno', Rol.ADMINISTRADOR, otra);
    const cliente = (await prisma.cliente.create({ data: { organizacionId: org, nombre: 'Minera Andina' } })).id;
    await crear('revisor', Rol.REVISOR_CLIENTE, org, { clienteId: cliente });
    // Gasto de este mes: texto y voz (y uno de otra organización, que no cuenta).
    await prisma.trabajoIA.createMany({
      data: [
        { organizacionId: org, tarea: 'IA-04', tipo: 'TEXTO', proveedor: 'anthropic', modelo: 'claude-opus-5-5', costoUsd: 4.5, estado: 'COMPLETADO' },
        { organizacionId: org, tarea: 'VOZ', tipo: 'VOZ', proveedor: 'google', modelo: 'es-US-Neural2-A', costoUsd: 1.25, estado: 'COMPLETADO' },
        { organizacionId: otra, tarea: 'IA-04', tipo: 'TEXTO', proveedor: 'anthropic', modelo: 'claude-opus-5-5', costoUsd: 99, estado: 'COMPLETADO' },
      ],
    });

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['admin', 'di', 'productor', 'revisor', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    process.env = antes;
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@conexiones.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  });

  it('solo administración ve, cambia y prueba las conexiones (403 al resto)', async () => {
    for (const quien of ['di', 'productor', 'revisor']) {
      expect((await como(quien).get()).status).toBe(403);
      expect((await como(quien).put('texto', { modelo: 'claude-sonnet-5-5' })).status).toBe(403);
      expect((await como(quien).probar('texto')).status).toBe(403);
    }
    expect((await request(servidor).get('/api/v1/conexiones-ia')).status).toBe(401);
  });

  it('lista las 8 tareas con el entorno por defecto, la clave sí o no y el gasto del mes', async () => {
    const r = await como('admin').get().expect(200);
    sinSecretos(r.body);
    expect(r.body.conexiones.map((c: { tarea: string }) => c.tarea)).toEqual([...TAREAS_CONEXION]);
    expect(r.body).toMatchObject({ modo: 'simulado', gastoMesUsd: 5.75, limiteTotalUsd: null, mes: expect.stringMatching(/^\d{4}-\d{2}$/) });
    const de = (t: string) => r.body.conexiones.find((c: { tarea: string }) => c.tarea === t);
    expect(de('TEXTO')).toMatchObject({ proveedor: 'anthropic', claveConfigurada: true, gastoMesUsd: 4.5, limiteGastoMensualUsd: null, limiteAlcanzado: false, configurada: false, costoEstimadoScormUsd: 0.9, fijo: false });
    // Google sin clave en este entorno; Azure se ofrece como próximamente.
    expect(de('VOZ')).toMatchObject({ proveedor: 'google', claveConfigurada: false, gastoMesUsd: 1.25, voces: {} });
    expect(de('VOZ').opciones).toContainEqual({ proveedor: 'azure', nombre: 'Azure Speech', proximamente: true });
    expect(de('BOCA')).toMatchObject({ fijo: true, proveedor: 'rhubarb' });
  });

  it('cambia proveedor, voz por idioma y límite, con auditoría y sin devolver claves', async () => {
    const r = await como('admin').put('voz', { proveedor: 'elevenlabs', voces: { es: 'voz-es-123', en: 'voz-en-456' }, limiteGastoMensualUsd: 1.25 }).expect(200);
    sinSecretos(r.body);
    expect(r.body).toMatchObject({
      tarea: 'VOZ', proveedor: 'elevenlabs', modelo: 'eleven_multilingual_v2', voces: { es: 'voz-es-123', en: 'voz-en-456' }, claveConfigurada: true,
      limiteGastoMensualUsd: 1.25, gastoMesUsd: 1.25, limiteAlcanzado: true, configurada: true,
    });
    const fila = await prisma.configProveedor.findFirstOrThrow({ where: { organizacionId: orgs[0]!, tarea: 'VOZ' } });
    sinSecretos(fila);
    expect(await prisma.auditoria.findFirst({ where: { organizacionId: orgs[0]!, accion: 'CONEXION_IA_GUARDADA', entidadId: fila.id } })).toMatchObject({ datos: { tarea: 'VOZ', proveedor: 'elevenlabs' } });

    // Un modelo de texto sin tarifa, Azure (próximamente) o un campo de clave se rechazan con 422.
    expect((await como('admin').put('texto', { modelo: 'gpt-inventado' }).expect(422)).body).toMatchObject({ codigo: 'MODELO_NO_VALIDO' });
    expect((await como('admin').put('voz', { proveedor: 'azure' }).expect(422)).body).toMatchObject({ codigo: 'PROVEEDOR_NO_VALIDO' });
    await como('admin').put('texto', { apiKey: 'sk-otra' }).expect(422);
    await como('admin').put('texto', { limiteGastoMensualUsd: -1 }).expect(422);
    await como('admin').put('inventada', { modelo: 'x' }).expect(404);

    const t = await como('admin').put('TEXTO', { modelo: 'claude-sonnet-5-5', limiteGastoMensualUsd: 20 }).expect(200);
    expect(t.body).toMatchObject({ modelo: 'claude-sonnet-5-5', limiteGastoMensualUsd: 20, limiteAlcanzado: false });
    const lista = await como('admin').get().expect(200);
    expect(lista.body.limiteTotalUsd).toBe(21.25);
    // null quita el límite.
    expect((await como('admin').put('voz', { limiteGastoMensualUsd: null }).expect(200)).body).toMatchObject({ limiteGastoMensualUsd: null, limiteAlcanzado: false, proveedor: 'elevenlabs' });
  });

  it('cada organización tiene sus conexiones y su gasto', async () => {
    const r = await como('ajeno').get().expect(200);
    expect(r.body.gastoMesUsd).toBe(99);
    expect(r.body.conexiones.every((c: { configurada: boolean }) => !c.configurada)).toBe(true);
    expect(r.body.conexiones.find((c: { tarea: string }) => c.tarea === 'TEXTO').modelo).not.toBe('claude-sonnet-5-5');
  });

  it('probar responde en modo simulado sin registrar nada en TrabajoIA', async () => {
    const antesCuenta = await prisma.trabajoIA.count({ where: { organizacionId: orgs[0]! } });
    const r = await como('admin').probar('texto').expect(200);
    sinSecretos(r.body);
    expect(r.body).toMatchObject({ ok: true, modo: 'simulado', mensaje: 'simulado, OK', proveedor: 'anthropic', modelo: 'claude-sonnet-5-5' });
    expect(r.body.latenciaMs).toBeGreaterThanOrEqual(0);
    expect((await como('admin').probar('voz').expect(200)).body).toMatchObject({ ok: true, proveedor: 'elevenlabs' });
    await como('admin').probar('inventada').expect(404);
    expect(await prisma.trabajoIA.count({ where: { organizacionId: orgs[0]! } })).toBe(antesCuenta);
  });

  it('en modo real sin clave, probar dice qué variable falta sin llamar a nadie', async () => {
    process.env.PROVEEDORES_MODO = 'real';
    try {
      await como('admin').put('voz', { proveedor: 'google' }).expect(200);
      const r = await como('admin').probar('voz').expect(200);
      expect(r.body).toMatchObject({ ok: false, modo: 'real', mensaje: 'Falta la clave: define GOOGLE_TTS_API_KEY en el entorno del servidor' });
    } finally {
      process.env.PROVEEDORES_MODO = 'simulado';
    }
  });
});
