// HU-1103 · Patrones de navegación en la API (CP-087, RN-11-1): LOTO trae Historias con actividades obligatorias; el PUT
// guarda patrón y reglas con una versión nueva (motivo «navegación») y, si se pide, el preferido del cliente en su kit;
// 409 con una versión vieja, 422 fuera del esquema; diseño gráfico y producción solo ven y el revisor del cliente no ve
// la configuración (403). PostgreSQL real.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
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
const loto = () => JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));

describe.skipIf(!hayBase && !process.env.CI)('patrones de navegación (HU-1103)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let cursoId: string;
  let sinKitId: string;
  let clienteId: string;
  const cookies: Record<string, string> = {};
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    put: (ruta: string, datos: object) => request(servidor).put(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });

  beforeAll(async () => {
    const orgId = (await prisma.organizacion.create({ data: { nombre: 'Org navegación', slug: `navegacion-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina' } });
    clienteId = cliente.id;
    await prisma.kitMarca.create({ data: { clienteId, estilo: 'Industrial', paleta: KIT_INICIAL.paleta, tipografias: KIT_INICIAL.tipografias, voces: KIT_INICIAL.voces } });
    const otroCliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Sin kit' } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: cliente.id });
    const otraOrg = await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `navegacion-otra-${sufijo}` } });
    await prisma.usuario.create({ data: { nombre: 'ajeno', email: correo('ajeno'), rol: Rol.DISENADOR_INSTRUCCIONAL, organizacionId: otraOrg.id, hashClave, emailVerificado: true } });
    const proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 3 } })).id;
    const proyecto2 = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: otroCliente.id, nombre: 'Otro', creadoPorId: di.id } })).id;
    sinKitId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId: proyecto2, versionEsquema: '0.2.0', documento: loto() } })).id;
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['instruccional', 'productor', 'grafico', 'revisor', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    const orgs = (await prisma.organizacion.findMany({ where: { slug: { endsWith: sufijo } } })).map((o) => o.id);
    await prisma.proyecto.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  });

  it('CP-087 · LOTO trae Historias con actividades obligatorias y el PUT lo cambia con una versión nueva', async () => {
    const r = await como('productor').get(`/cursos/${cursoId}/navegacion`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: 3, patron: 'historias', modo: 'condiciones', patronPreferido: null, patronPreferidoDelCliente: false, hayKit: true });
    const cambio = await como('instruccional').put(`/cursos/${cursoId}/navegacion`, { version: 3, patron: 'historias', modo: 'secuencial', reanudar: 'automatica', mostrar: ['progreso', 'contador'] });
    expect(cambio.status).toBe(200);
    expect(cambio.body).toMatchObject({ version: 4, patron: 'historias', modo: 'secuencial', reanudar: 'automatica', mostrar: ['progreso', 'contador'], patronPreferidoDelCliente: false });
    expect((await prisma.cursoVersion.findFirstOrThrow({ where: { cursoId, version: 4 } })).motivo).toBe('navegación');
    const doc = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).documento as { navegacion: object };
    // Los campos que no vienen (siguienteSeHabilita, atajos…) se conservan.
    expect(doc.navegacion).toEqual({ patron: 'historias', modo: 'secuencial', siguienteSeHabilita: 'actividad', reanudar: 'automatica', mostrar: ['progreso', 'contador'], objetivosAlInicio: true, atajosTeclado: true });
  });

  it('«Usar como preferido del cliente» guarda el patrón en el kit de marca', async () => {
    const version = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    const r = await como('instruccional').put(`/cursos/${cursoId}/navegacion`, { version, patron: 'mapa', patronPreferidoDelCliente: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: version + 1, patron: 'mapa', modo: 'secuencial', patronPreferido: 'mapa', patronPreferidoDelCliente: true });
    expect((await prisma.kitMarca.findUniqueOrThrow({ where: { clienteId } })).patronPreferido).toBe('mapa');
    // Con otro patrón el preferido se conserva y la marca deja de coincidir.
    const otro = await como('instruccional').put(`/cursos/${cursoId}/navegacion`, { version: version + 1, patron: 'vertical' });
    expect(otro.body).toMatchObject({ patron: 'vertical', patronPreferido: 'mapa', patronPreferidoDelCliente: false });
    // Sin kit no hay dónde guardarlo: 422 y el curso no cambia.
    const sinKit = await como('instruccional').put(`/cursos/${sinKitId}/navegacion`, { version: 1, patron: 'mapa', patronPreferidoDelCliente: true });
    expect(sinKit.status).toBe(422);
    expect(sinKit.body.codigo).toBe('SIN_KIT');
    expect((await prisma.curso.findUniqueOrThrow({ where: { id: sinKitId } })).version).toBe(1);
  });

  it('409 con una versión vieja y 422 con valores fuera del esquema; nada se guarda', async () => {
    const antes = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    const vieja = await como('instruccional').put(`/cursos/${cursoId}/navegacion`, { version: 1, patron: 'clasico' });
    expect(vieja.status).toBe(409);
    expect(vieja.body.codigo).toBe('VERSION_CAMBIO');
    const malos = [{ patron: 'carrusel' }, { modo: 'rapido' }, { reanudar: 'siempre' }, { mostrar: ['temario', 'temario'] }, { mostrar: ['menu'] }];
    const estados = await Promise.all(malos.map(async (malo) => (await como('instruccional').put(`/cursos/${cursoId}/navegacion`, { version: antes, ...malo })).status));
    expect(estados).toEqual([422, 422, 422, 422, 422]);
    expect((await como('instruccional').put(`/cursos/${cursoId}/navegacion`, { patron: 'clasico' })).status).toBe(422);
    expect((await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version).toBe(antes);
  });

  it('diseño gráfico y producción solo ven; el revisor del cliente no ve la configuración; otra organización no la encuentra', async () => {
    const version = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    expect((await como('grafico').get(`/cursos/${cursoId}/navegacion`)).status).toBe(200);
    for (const quien of ['grafico', 'productor', 'revisor']) {
      expect((await como(quien).put(`/cursos/${cursoId}/navegacion`, { version, patron: 'clasico' })).status).toBe(403);
    }
    expect((await como('revisor').get(`/cursos/${cursoId}/navegacion`)).status).toBe(403);
    expect((await como('ajeno').get(`/cursos/${cursoId}/navegacion`)).status).toBe(404);
  });
});
