// HU-0201 · Clientes (CP-019) contra PostgreSQL real. Se salta sin DATABASE_URL, salvo en CI.
import 'reflect-metadata';
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

describe.skipIf(!hayBase && !process.env.CI)('clientes (HU-0201)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let otraOrgId: string;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org clientes', slug: `clientes-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `clientes-otra-${sufijo}` } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = orgId, clienteId?: string) =>
      prisma.usuario.create({
        data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...(clienteId ? { clienteId } : {}) },
      });
    await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('ajeno', Rol.ADMINISTRADOR, otraOrgId);
    const propio = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: `Cliente del revisor ${sufijo}` } });
    await crear('revisor', Rol.REVISOR_CLIENTE, orgId, propio.id);

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['instruccional', 'productor', 'grafico', 'ajeno', 'revisor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });

  it('CP-019 · un cliente creado solo con el nombre aparece en la lista, sin kit', async () => {
    const alta = await como('instruccional').post('/clientes', { nombre: '  Minera Andina  ' });
    expect(alta.status).toBe(201);
    expect(alta.body).toMatchObject({ nombre: 'Minera Andina', idiomas: ['es'], lmsHabitual: null, retencionDocumentosDias: 180, tieneKit: false });

    const lista = await como('instruccional').get('/clientes');
    expect(lista.status).toBe(200);
    expect(lista.body.map((c: { nombre: string }) => c.nombre)).toContain('Minera Andina');
    expect((await como('instruccional').get(`/clientes/${alta.body.id}`)).body.id).toBe(alta.body.id);
  });

  it('guarda los datos opcionales y busca por nombre sin distinguir mayúsculas', async () => {
    const alta = await como('productor').post('/clientes', {
      nombre: 'Municipalidad de Lima', lmsHabitual: 'Moodle 4.5', idiomas: ['es', 'en'], retencionDocumentosDias: 90,
    });
    expect(alta.status).toBe(201);
    expect(alta.body).toMatchObject({ lmsHabitual: 'Moodle 4.5', idiomas: ['es', 'en'], retencionDocumentosDias: 90 });
    const res = await como('productor').get('/clientes?buscar=municipal');
    expect(res.body.map((c: { nombre: string }) => c.nombre)).toEqual(['Municipalidad de Lima']);
  });

  it('rechaza un nombre repetido (409) y datos no válidos (422)', async () => {
    const repetido = await como('instruccional').post('/clientes', { nombre: 'minera andina' });
    expect(repetido.status).toBe(409);
    expect(repetido.body.codigo).toBe('CLIENTE_EXISTE');
    expect((await como('instruccional').post('/clientes', { nombre: 'X' })).status).toBe(422);
    expect((await como('instruccional').post('/clientes', { nombre: 'Válido', idiomas: ['fr'] })).status).toBe(422);
  });

  it('edita el cliente', async () => {
    const alta = await como('instruccional').post('/clientes', { nombre: 'Colegio San Juan' });
    const res = await como('instruccional').patch(`/clientes/${alta.body.id}`, { lmsHabitual: 'Chamilo', idiomas: ['en'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nombre: 'Colegio San Juan', lmsHabitual: 'Chamilo', idiomas: ['en'] });
  });

  it('el diseñador gráfico ve los clientes pero no los crea', async () => {
    expect((await como('grafico').get('/clientes')).status).toBe(200);
    expect((await como('grafico').post('/clientes', { nombre: 'No permitido' })).status).toBe(403);
  });

  it('el revisor del cliente solo ve el suyo y no edita', async () => {
    const lista = await como('revisor').get('/clientes');
    expect(lista.body.map((c: { nombre: string }) => c.nombre)).toEqual([`Cliente del revisor ${sufijo}`]);
    const otro = (await como('instruccional').get('/clientes?buscar=Minera')).body[0];
    expect((await como('revisor').get(`/clientes/${otro.id}`)).status).toBe(404);
    expect((await como('revisor').patch(`/clientes/${lista.body[0].id}`, { notas: 'x' })).status).toBe(403);
  });

  it('otra organización no ve ni edita los clientes', async () => {
    const propio = (await como('instruccional').get('/clientes?buscar=Minera')).body[0];
    expect((await como('ajeno').get('/clientes')).body).toEqual([]);
    expect((await como('ajeno').get(`/clientes/${propio.id}`)).status).toBe(404);
    expect((await como('ajeno').patch(`/clientes/${propio.id}`, { nombre: 'Robado' })).status).toBe(404);
  });
});
