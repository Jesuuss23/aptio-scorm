// HU-1001 · Alineación pedagógica en la API (CP-083, RN-10-1 a RN-10-3): el informe de LOTO trae 2 alertas; subir el
// nivel de una pregunta del reto final resuelve la de obj-3 con una versión nueva del curso; 409 con una versión vieja;
// diseño gráfico y producción solo ven (403 al cambiar) y el revisor del cliente no ve la matriz (403). PostgreSQL real.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
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
const loto = () => JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));

describe.skipIf(!hayBase && !process.env.CI)('alineación pedagógica (HU-1001)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let cursoId: string;
  const cookies: Record<string, string> = {};
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });

  beforeAll(async () => {
    const orgId = (await prisma.organizacion.create({ data: { nombre: 'Org alineación', slug: `alineacion-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina' } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: cliente.id });
    const otraOrg = await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `alineacion-otra-${sufijo}` } });
    await prisma.usuario.create({ data: { nombre: 'ajeno', email: correo('ajeno'), rol: Rol.DISENADOR_INSTRUCCIONAL, organizacionId: otraOrg.id, hashClave, emailVerificado: true } });
    const proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 3 } })).id;
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

  it('CP-083 · el informe de LOTO trae la alerta de obj-3 y subir el nivel de una pregunta la resuelve', async () => {
    const r = await como('productor').get(`/cursos/${cursoId}/alineacion`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: 3, totalAlertas: 2, indicadores: { objetivosAlineados: 1, elementosSinObjetivo: 1, equilibrio: { presenta: 15, practica: 8, evalua: 8 } } });
    const obj3 = r.body.objetivos.find((o: { id: string }) => o.id === 'obj-3');
    expect(obj3).toMatchObject({ nivelBloom: 'aplicar', alertas: ['Se evalúa solo en «recordar», menor que «aplicar»'] });
    expect(obj3.evalua.map((x: { preguntaId: string; rol: string; nivelBloom: string; nivelEscrito: boolean }) => [x.preguntaId, x.rol, x.nivelBloom, x.nivelEscrito]))
      .toEqual([['bq-06', 'E', 'recordar', false], ['bq-07', 'E', 'recordar', false]]);
    expect(obj3.practica.map((x: { pantallaId: string; numero: number }) => [x.pantallaId, x.numero])).toEqual([['p15', 15], ['p20', 20], ['p22', 22]]);

    const cambio = await como('instruccional').patch(`/cursos/${cursoId}/alineacion`, { version: 3, elementos: [{ pantallaId: 'p28', preguntaId: 'bq-06', nivelBloom: 'aplicar' }] });
    expect(cambio.status).toBe(200);
    expect(cambio.body).toMatchObject({ version: 4, totalAlertas: 1 });
    expect(cambio.body.objetivos.find((o: { id: string }) => o.id === 'obj-3').alertas).toEqual([]);
    const v = await prisma.cursoVersion.findFirstOrThrow({ where: { cursoId, version: 4 } });
    expect(v.motivo).toBe('alineación');
    const doc = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).documento as { modulos: { capsulas: { pantallas: { id: string; bloques: { interaccion?: { datos: { preguntas: { id: string; nivelBloom?: string }[] } } }[] }[] }[] }[] };
    const p28 = doc.modulos[0]!.capsulas[0]!.pantallas.find((p) => p.id === 'p28')!;
    expect(p28.bloques.find((b) => b.interaccion)!.interaccion!.datos.preguntas.find((q) => q.id === 'bq-06')!.nivelBloom).toBe('aplicar');

    // El nivel de un objetivo también se cambia: obj-2 en «recordar» queda alineado.
    const objetivo = await como('instruccional').patch(`/cursos/${cursoId}/alineacion`, { version: 4, objetivos: [{ id: 'obj-2', nivelBloom: 'recordar' }] });
    expect(objetivo.body).toMatchObject({ version: 5, totalAlertas: 0, indicadores: { objetivosAlineados: 3 } });
  });

  it('409 con una versión vieja y 422 si el elemento no existe; nada se guarda', async () => {
    const antes = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    const vieja = await como('instruccional').patch(`/cursos/${cursoId}/alineacion`, { version: 1, objetivos: [{ id: 'obj-1', nivelBloom: 'aplicar' }] });
    expect(vieja.status).toBe(409);
    expect(vieja.body.codigo).toBe('VERSION_CAMBIO');
    const noExiste = await como('instruccional').patch(`/cursos/${cursoId}/alineacion`, { version: antes, elementos: [{ pantallaId: 'p28', preguntaId: 'bq-99', nivelBloom: 'aplicar' }] });
    expect(noExiste.status).toBe(422);
    expect(noExiste.body).toMatchObject({ codigo: 'NIVEL_NO_APLICA', mensaje: 'La pregunta bq-99 no existe en p28' });
    expect((await como('instruccional').patch(`/cursos/${cursoId}/alineacion`, { version: antes, objetivos: [{ id: 'obj-1', nivelBloom: 'experto' }] })).status).toBe(422);
    expect((await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version).toBe(antes);
  });

  it('diseño gráfico y producción solo ven; el revisor del cliente no ve la matriz; otra organización no la encuentra', async () => {
    const version = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    expect((await como('grafico').get(`/cursos/${cursoId}/alineacion`)).status).toBe(200);
    for (const quien of ['grafico', 'productor', 'revisor']) {
      expect((await como(quien).patch(`/cursos/${cursoId}/alineacion`, { version, objetivos: [{ id: 'obj-1', nivelBloom: 'aplicar' }] })).status).toBe(403);
    }
    expect((await como('revisor').get(`/cursos/${cursoId}/alineacion`)).status).toBe(403);
    expect((await como('ajeno').get(`/cursos/${cursoId}/alineacion`)).status).toBe(404);
  });
});
