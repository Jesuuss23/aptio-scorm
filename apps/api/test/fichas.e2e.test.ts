// HU-1204 · CP-094 · Fichas de compatibilidad LMS de un cliente contra PostgreSQL real: crear (201) con el informe del
// modo diagnóstico pegado, listar de la más nueva a la más vieja, 422 si falta el LMS o el informe no es un objeto JSON,
// 403 al revisor del cliente y 404 con un cliente que no existe o es de otra organización. Se salta sin DATABASE_URL, salvo en CI.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;

const INFORME = {
  aptio: 'diagnostico-scorm12', version: 1, generado: '2026-11-11T15:00:00.000Z', reproductor: '0.1.0',
  curso: { id: 'loto', titulo: 'Bloqueo y etiquetado', pantallas: 30, huella: 'abc123' }, navegador: 'Chrome 130 · Windows NT 10.0', enIframe: true,
  api: { encontrada: true, origen: 'padre', nivel: 1, conectado: true },
  busqueda: [{ nivel: 0, origen: 'propia', resultado: 'sin-api' }, { nivel: 1, origen: 'padre', resultado: 'api' }],
  inicial: { entrada: 'ab-initio', ubicacion: '', estado: 'not attempted', nota: '', suspendDataCaracteres: 0 },
  llamadas: { total: 1, guardadas: 1, lista: [{ ms: 5, metodo: 'LMSInitialize', respuesta: 'true', error: '0' }] },
};

describe.skipIf(!hayBase && !process.env.CI)('fichas de compatibilidad LMS (HU-1204)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let otraOrgId: string;
  let clienteId: string;
  let ajenoId: string;
  const cookies: Record<string, string> = {};
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object | string = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const ruta = (id = clienteId) => `/clientes/${id}/fichas-lms`;

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org fichas', slug: `fichas-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra org', slug: `fichas-otra-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } })).id;
    ajenoId = (await prisma.cliente.create({ data: { organizacionId: otraOrgId, nombre: 'Ajeno', idiomas: ['es'] } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['instruccional', 'productor', 'grafico', 'revisor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: [orgId, otraOrgId] } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  it('CP-094 · crea la ficha con el informe pegado (201) y la lista de la más nueva a la más vieja', async () => {
    const primera = await como('productor').post(ruta(), { lmsNombre: 'Moodle', lmsVersion: '4.5', limiteSubidaMb: 200, notas: 'Probado en el aula de pruebas', resultadoDiagnostico: INFORME });
    expect({ status: primera.status, body: primera.body }).toMatchObject({ status: 201, body: { lmsNombre: 'Moodle', lmsVersion: '4.5', limiteSubidaMb: 200, notas: 'Probado en el aula de pruebas', resultadoDiagnostico: INFORME } });
    expect(primera.body.id).toMatch(/^[0-9a-f-]{36}$/);
    const segunda = await como('instruccional').post(ruta(), { lmsNombre: 'Chamilo' });
    expect(segunda.status).toBe(201);
    expect(segunda.body).toMatchObject({ lmsNombre: 'Chamilo', lmsVersion: null, limiteSubidaMb: null, notas: null, resultadoDiagnostico: null });

    // El diseñador gráfico no registra fichas, pero las ve.
    const lista = await como('grafico').get(ruta());
    expect(lista.status).toBe(200);
    expect(lista.body.map((f: { lmsNombre: string }) => f.lmsNombre)).toEqual(['Chamilo', 'Moodle']);
    expect((await como('grafico').post(ruta(), { lmsNombre: 'Canvas' })).status).toBe(403);
    const auditoria = await prisma.auditoria.findFirst({ where: { organizacionId: orgId, accion: 'FICHA_LMS_CREADA', entidadId: primera.body.id } });
    expect(auditoria?.datos).toMatchObject({ clienteId, lmsNombre: 'Moodle' });
  });

  it('422 si falta el LMS, si el informe no es un objeto JSON o si sobra un campo', async () => {
    for (const cuerpo of [
      { lmsVersion: '4.5' },
      { lmsNombre: 'Moodle', resultadoDiagnostico: 'no es json' },
      { lmsNombre: 'Moodle', resultadoDiagnostico: [1, 2] },
      { lmsNombre: 'Moodle', limiteSubidaMb: 0 },
      { lmsNombre: 'Moodle', otro: true },
    ]) {
      const r = await como('productor').post(ruta(), cuerpo);
      expect({ cuerpo, status: r.status }).toEqual({ cuerpo, status: 422 });
    }
    const mal = await request(servidor).post(`/api/v1${ruta()}`).set('Cookie', cookies.productor!).set('Content-Type', 'application/json').send('{"lmsNombre":"Moodle",');
    expect(mal.status).toBeGreaterThanOrEqual(400);
    expect(mal.status).toBeLessThan(500);
    expect(await prisma.fichaCompatibilidad.count({ where: { clienteId } })).toBe(2);
  });

  it('403 al revisor del cliente, al crear y al listar', async () => {
    expect((await como('revisor').post(ruta(), { lmsNombre: 'Moodle' })).status).toBe(403);
    expect((await como('revisor').get(ruta())).status).toBe(403);
  });

  it('404 con un cliente que no existe o es de otra organización', async () => {
    for (const id of [randomUUID(), ajenoId]) {
      expect((await como('productor').post(ruta(id), { lmsNombre: 'Moodle' })).status).toBe(404);
      expect((await como('productor').get(ruta(id))).status).toBe(404);
    }
  });
});
