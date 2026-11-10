// HU-0204 · Pantallas modelo del kit (CP-025, CP-026) contra PostgreSQL real. Se salta sin DATABASE_URL, salvo en CI.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { DISPOSICIONES, KIT_INICIAL, modeloBase } from '@aptio/schema/marca';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { PantallasModeloService } from '../src/clientes/pantallas-modelo.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;

describe.skipIf(!hayBase && !process.env.CI)('pantallas modelo (HU-0204)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let otraOrgId: string;
  let clienteId: string;
  let sinKitId: string;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org modelos', slug: `modelos-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `modelos-otra-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina' } })).id;
    sinKitId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Colegio' } })).id;
    await prisma.kitMarca.create({ data: { clienteId, estilo: 'Industrial', paleta: KIT_INICIAL.paleta, tipografias: KIT_INICIAL.tipografias, voces: KIT_INICIAL.voces } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = orgId) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true } });
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('ajeno', Rol.ADMINISTRADOR, otraOrgId);
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['grafico', 'instruccional', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: [orgId, otraOrgId] } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    put: (ruta: string, datos: object) => request(servidor).put(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    delete: (ruta: string) => request(servidor).delete(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
  });
  const ruta = (id = clienteId) => `/clientes/${id}/kit/pantallas-modelo`;
  const generar = () => app.get(PantallasModeloService).paraGenerar(orgId, clienteId);

  it('CP-026 · un cliente sin pantallas modelo genera con las del estilo base', async () => {
    expect((await como('grafico').get(ruta())).body).toEqual([]);
    const modelos = await generar();
    expect(modelos).toHaveLength(DISPOSICIONES.length);
    expect(modelos.every((m) => m.origen === 'base')).toBe(true);
    // Sin kit también hay modelos para generar.
    expect((await app.get(PantallasModeloService).paraGenerar(orgId, sinKitId)).every((m) => m.origen === 'base')).toBe(true);
  });

  it('CP-025 · una pantalla modelo «Idea + ilustración» activa pasa al generador', async () => {
    const creada = await como('grafico').post(ruta(), { disposicion: 'idea', nombre: 'Idea + ilustración', definicion: modeloBase('idea') });
    expect(creada.status).toBe(201);
    expect(creada.body).toMatchObject({ disposicion: 'idea', nombre: 'Idea + ilustración', activa: true, orden: 0 });
    const idea = (await generar()).find((m) => m.disposicion === 'idea');
    expect(idea).toMatchObject({ origen: 'cliente', nombre: 'Idea + ilustración', modeloId: creada.body.id });

    // Desactivada (borrado lógico), el generador vuelve al estilo base y la lista la sigue mostrando.
    expect((await como('grafico').delete(`${ruta()}/${creada.body.id}`)).status).toBe(204);
    expect((await generar()).find((m) => m.disposicion === 'idea')?.origen).toBe('base');
    expect((await como('instruccional').get(ruta())).body[0]).toMatchObject({ id: creada.body.id, activa: false });
    expect((await como('instruccional').get(`${ruta()}?activas=true`)).body).toEqual([]);

    const reactivada = await como('grafico').put(`${ruta()}/${creada.body.id}`, { disposicion: 'idea', nombre: 'Idea + ilustración v2', definicion: modeloBase('idea'), activa: true });
    expect(reactivada.body).toMatchObject({ nombre: 'Idea + ilustración v2', activa: true });
    expect((await generar()).find((m) => m.disposicion === 'idea')?.nombre).toBe('Idea + ilustración v2');
  });

  it('valida la definición con zonas de la disposición en porcentajes', async () => {
    const r = await como('grafico').post(ruta(), { disposicion: 'quiz', nombre: 'Quiz', definicion: modeloBase('idea') });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('DEFINICION_NO_VALIDA');
    expect(r.body.detalles).toContainEqual({ error: 'celular: la zona «titulo» no es de la disposición quiz' });
    expect((await como('grafico').post(ruta(), { disposicion: 'otra', nombre: 'X', definicion: {} })).status).toBe(422);
  });

  it('el diseño instruccional solo ve; sin kit, 404 SIN_KIT; otra organización no accede', async () => {
    const datos = { disposicion: 'portada', nombre: 'Portada', definicion: modeloBase('portada') };
    expect((await como('instruccional').post(ruta(), datos)).status).toBe(403);
    const sinKit = await como('grafico').post(ruta(sinKitId), datos);
    expect(sinKit.status).toBe(404);
    expect(sinKit.body.codigo).toBe('SIN_KIT');
    expect((await como('ajeno').get(ruta())).status).toBe(404);
    expect((await como('ajeno').post(ruta(), datos)).status).toBe(404);
  });
});
