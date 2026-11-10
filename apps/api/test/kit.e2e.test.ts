// HU-0202 · Kit de marca (CP-021, CP-022) contra PostgreSQL real. Se salta sin DATABASE_URL, salvo en CI.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { KIT_INICIAL } from '@aptio/schema/marca';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;

describe.skipIf(!hayBase && !process.env.CI)('kit de marca (HU-0202)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let otraOrgId: string;
  let clienteId: string;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org kit', slug: `kit-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `kit-otra-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina' } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = orgId, cliente?: string) =>
      prisma.usuario.create({
        data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...(cliente ? { clienteId: cliente } : {}) },
      });
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('revisor', Rol.REVISOR_CLIENTE, orgId, clienteId);
    await crear('ajeno', Rol.ADMINISTRADOR, otraOrgId);

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['grafico', 'instruccional', 'productor', 'revisor', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: [orgId, otraOrgId] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    put: (ruta: string, datos: object) => request(servidor).put(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const ruta = () => `/clientes/${clienteId}/kit`;
  const kit = (cambios: object = {}) => ({ ...KIT_INICIAL, estilo: 'Industrial', ...cambios });

  it('un cliente sin kit responde SIN_KIT y el diseñador gráfico lo crea con versión 0', async () => {
    const sin = await como('grafico').get(ruta());
    expect(sin.status).toBe(404);
    expect(sin.body.codigo).toBe('SIN_KIT');

    const creado = await como('grafico').put(ruta(), kit({ version: 0 }));
    expect(creado.status).toBe(200);
    expect(creado.body).toMatchObject({ clienteId, estilo: 'Industrial', version: 1, logoRecursoId: null, contraste: { cumpleAA: true }, advertencias: [] });
    expect((await como('productor').get(ruta())).body.paleta).toEqual(KIT_INICIAL.paleta);
    expect((await como('instruccional').get(`/clientes/${clienteId}`)).body.tieneKit).toBe(true);
  });

  it('CP-021 · texto #9AA0A6 sobre blanco guarda con advertencia de contraste', async () => {
    const actual = (await como('grafico').get(ruta())).body;
    const r = await como('grafico').put(ruta(), kit({ version: actual.version, paleta: { ...KIT_INICIAL.paleta, texto: '#9AA0A6', fondo: '#FFFFFF' } }));
    expect(r.status).toBe(200);
    expect(r.body.contraste).toEqual({ textoFondo: 2.64, cumpleAA: false });
    expect(r.body.advertencias[0]).toMatchObject({ codigo: 'CONTRASTE_BAJO', colores: ['texto', 'fondo'] });
    expect(r.body.version).toBe(actual.version + 1);
  });

  it('CP-022 · quien guarda con una versión vieja recibe 409 y no pisa el cambio', async () => {
    const leida = (await como('grafico').get(ruta())).body.version;
    const primero = await como('instruccional').put(ruta(), kit({ version: leida, paleta: { ...KIT_INICIAL.paleta, primario: '#8A1538' } }));
    expect(primero.status).toBe(200);
    const segundo = await como('grafico').put(ruta(), kit({ version: leida, paleta: { ...KIT_INICIAL.paleta, primario: '#0B3D91' } }));
    expect(segundo.status).toBe(409);
    expect(segundo.body).toMatchObject({ codigo: 'KIT_DESACTUALIZADO', detalles: [{ versionActual: leida + 1 }] });
    expect((await como('grafico').get(ruta())).body.paleta.primario).toBe('#8A1538');
    // Crear de nuevo con versión 0 cuando ya existe también es un conflicto.
    expect((await como('grafico').put(ruta(), kit({ version: 0 }))).status).toBe(409);
  });

  it('valida colores, estilo, tipografías de la lista cerrada y el logo', async () => {
    const v = (await como('grafico').get(ruta())).body.version;
    const malo = await como('grafico').put(ruta(), kit({ version: v, paleta: { ...KIT_INICIAL.paleta, acento: 'amarillo' } }));
    expect(malo.status).toBe(422);
    expect((await como('grafico').put(ruta(), kit({ version: v, estilo: 'Neón' }))).status).toBe(422);
    expect((await como('grafico').put(ruta(), kit({ version: v, tipografias: { titulos: 'Comic Sans MS', textos: 'Lato' } }))).status).toBe(422);
    const logo = await como('grafico').put(ruta(), kit({ version: v, logoRecursoId: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f' }));
    expect(logo.status).toBe(422);
    expect(logo.body.codigo).toBe('LOGO_NO_VALIDO');
  });

  it('el productor solo ve; el revisor y otra organización no acceden', async () => {
    const v = (await como('productor').get(ruta())).body.version;
    expect((await como('productor').put(ruta(), kit({ version: v }))).status).toBe(403);
    expect((await como('revisor').get(ruta())).status).toBe(403);
    expect((await como('ajeno').get(ruta())).status).toBe(404);
    expect((await como('ajeno').put(ruta(), kit({ version: v }))).status).toBe(404);
    const auditoria = await prisma.auditoria.count({ where: { organizacionId: orgId, accion: 'KIT_GUARDADO' } });
    expect(auditoria).toBe(3);
  });
});
