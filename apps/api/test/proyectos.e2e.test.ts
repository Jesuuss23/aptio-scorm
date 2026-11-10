// HU-0301 a HU-0303 · Proyectos y Nuevo SCORM (CP-029 a CP-031) contra PostgreSQL real. Se salta sin DATABASE_URL, salvo en CI.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

process.env.AWS_ENDPOINT ??= 'http://localhost:9000';
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.S3_BUCKET_NAME ??= 'aptio-pruebas-api';

const hayBase = Boolean(process.env.DATABASE_URL);
const hayS3 = await fetch(`${process.env.AWS_ENDPOINT}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;

describe.skipIf(!hayBase && !process.env.CI)('proyectos (HU-0301 a HU-0303)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let otraOrgId: string;
  const clientes: string[] = [];
  let productorId: string;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org proyectos', slug: `proyectos-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `proyectos-otra-${sufijo}` } })).id;
    for (const [nombre, idiomas] of [['Minera Andina', ['es', 'en']], ['Banco Sur', ['es']], ['Colegio Norte', ['es']]] as const) {
      clientes.push((await prisma.cliente.create({ data: { organizacionId: orgId, nombre, idiomas: [...idiomas] } })).id);
    }
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = orgId, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...extra } });
    productorId = (await crear('productor', Rol.PRODUCTOR)).id;
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, orgId, { clienteId: clientes[1] });
    await crear('ajeno', Rol.ADMINISTRADOR, otraOrgId);
    // CP-029: 20 proyectos de 3 clientes (8, 7 y 5).
    await prisma.proyecto.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        organizacionId: orgId, clienteId: clientes[i < 8 ? 0 : i < 15 ? 1 : 2]!, nombre: `Cápsula ${i + 1}`, creadoPorId: productorId,
      })),
    });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['productor', 'grafico', 'revisor', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: [orgId, otraOrgId] } } });
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: orgId } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    delete: (ruta: string) => request(servidor).delete(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
  });

  it('CP-029 · con 20 proyectos de 3 clientes, filtrar por un cliente muestra solo los suyos', async () => {
    expect((await como('productor').get('/proyectos')).body).toHaveLength(20);
    const r = await como('productor').get(`/proyectos?clienteId=${clientes[1]}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(7);
    expect(r.body.every((p: { clienteId: string; clienteNombre: string }) => p.clienteId === clientes[1] && p.clienteNombre === 'Banco Sur')).toBe(true);
    expect((await como('productor').get('/proyectos?buscar=cápsula 1')).body.map((p: { nombre: string }) => p.nombre).sort()).toEqual(
      ['Cápsula 1', 'Cápsula 10', 'Cápsula 11', 'Cápsula 12', 'Cápsula 13', 'Cápsula 14', 'Cápsula 15', 'Cápsula 16', 'Cápsula 17', 'Cápsula 18', 'Cápsula 19'],
    );
  });

  it('CP-030 y CP-031 · solo con cliente y nombre se crea; sin LMS el perfil propuesto es Genérico', async () => {
    const r = await como('productor').post('/proyectos', { clienteId: clientes[0], nombre: 'Bloqueo y etiquetado' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      nombre: 'Bloqueo y etiquetado', clienteNombre: 'Minera Andina', estado: 'BORRADOR', idiomas: ['es', 'en'], modoIdioma: 'mismo-paquete',
      datosTecnicos: {}, perfilPropuesto: 'GENERICO', avance: { aprobadas: 0, total: 0 }, costoIaUsd: 0, publico: null, tono: null,
    });
    // Los datos técnicos se completan después y cambian el perfil propuesto.
    const editado = await como('productor').patch(`/proyectos/${r.body.id}`, { datosTecnicos: { lms: 'Moodle 4.5 o superior', horasCapacitacion: 48, porcentajeScorm: 50, fechaEntrega: '2026-12-15' } });
    expect(editado.status).toBe(200);
    expect(editado.body).toMatchObject({ perfilPropuesto: 'MOODLE', datosTecnicos: { lms: 'Moodle 4.5 o superior', horasCapacitacion: 48 } });
    const vuelve = await como('productor').patch(`/proyectos/${r.body.id}`, { datosTecnicos: { lms: '' } });
    expect(vuelve.body).toMatchObject({ perfilPropuesto: 'GENERICO', datosTecnicos: {} });
    // El costo de IA del proyecto suma sus trabajos.
    await prisma.trabajoIA.create({ data: { organizacionId: orgId, proyectoId: r.body.id, tarea: 'IA-01', tipo: 'TEXTO', proveedor: 'anthropic', modelo: 'x', costoUsd: 0.25 } });
    expect((await como('productor').get(`/proyectos/${r.body.id}`)).body.costoIaUsd).toBe(0.25);
  });

  it('valida los datos y archivar saca el proyecto de la lista sin borrarlo', async () => {
    expect((await como('productor').post('/proyectos', { clienteId: clientes[0] })).status).toBe(422);
    expect((await como('productor').post('/proyectos', { clienteId: clientes[0], nombre: 'X', pantallasObjetivo: 500 })).status).toBe(422);
    expect((await como('productor').post('/proyectos', { clienteId: clientes[0], nombre: 'Tono raro', tono: 'Sarcástico' })).status).toBe(422);
    const p = await como('productor').post('/proyectos', { clienteId: clientes[2], nombre: 'Para archivar', tono: 'Cercano', pantallasObjetivo: 20 });
    expect((await como('productor').delete(`/proyectos/${p.body.id}`)).status).toBe(204);
    expect((await como('productor').get(`/proyectos?clienteId=${clientes[2]}`)).body.some((x: { id: string }) => x.id === p.body.id)).toBe(false);
    expect((await como('productor').get('/proyectos?estado=ARCHIVADO')).body.map((x: { id: string }) => x.id)).toEqual([p.body.id]);
  });

  it('permisos: el gráfico ve y no crea; el revisor ve solo su cliente; otra organización no ve nada', async () => {
    expect((await como('grafico').get('/proyectos')).status).toBe(200);
    expect((await como('grafico').post('/proyectos', { clienteId: clientes[0], nombre: 'No' })).status).toBe(403);
    const delRevisor = await como('revisor').get('/proyectos');
    expect(delRevisor.body).toHaveLength(7);
    expect((await como('revisor').get(`/proyectos?clienteId=${clientes[0]}`)).body).toEqual([]);
    expect((await como('revisor').post('/proyectos', { clienteId: clientes[1], nombre: 'No' })).status).toBe(403);
    const ajeno = (await como('productor').get(`/proyectos?clienteId=${clientes[0]}`)).body[0].id as string;
    expect((await como('ajeno').get(`/proyectos/${ajeno}`)).status).toBe(404);
    expect((await como('ajeno').post('/proyectos', { clienteId: clientes[0], nombre: 'Intruso' })).status).toBe(404);
  });
  it('HU-1101: devuelve el curso del proyecto con su versión en ETag; sin curso, 404', async () => {
    const id = (await como('productor').get(`/proyectos?clienteId=${clientes[0]}`)).body[0].id as string;
    const sin = await como('grafico').get(`/proyectos/${id}/curso`);
    expect(sin.status).toBe(404);
    const documento = JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));
    await prisma.curso.create({ data: { organizacionId: orgId, proyectoId: id, versionEsquema: '0.2.0', documento, version: 3 } });
    const r = await como('grafico').get(`/proyectos/${id}/curso`);
    expect(r.status).toBe(200);
    expect(r.headers.etag).toBe('"3"');
    expect(r.body).toMatchObject({ proyectoId: id, version: 3, versionEsquema: '0.2.0' });
    expect(r.body.documento.modulos[0].capsulas[0].pantallas).toHaveLength(30);
    // El revisor de otro cliente y otra organización no lo ven.
    expect((await como('revisor').get(`/proyectos/${id}/curso`)).status).toBe(404);
    expect((await como('ajeno').get(`/proyectos/${id}/curso`)).status).toBe(404);
  });
  it.skipIf(!hayS3 && !process.env.CI)('HU-0702 y HU-0801: la vista previa recibe la URL firmada de cada audio, el SVG del personaje y los WebVTT en línea', async () => {
    const proyecto = (await como('productor').post('/proyectos', { clienteId: clientes[0], nombre: `Con voz ${sufijo}` })).body as { id: string };
    const almacen = new Almacen(configDesdeEnv());
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    const svg = readFileSync(new URL('../../../docs/diseno/personaje/plantilla-ana.svg', import.meta.url), 'utf8');
    const ids = { audio: randomUUID(), ana: randomUUID(), otraOrg: randomUUID(), vtt: randomUUID() };
    const vtt = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHola.\n\n';
    const clave = (x: string) => `org/${orgId}/${clientes[0]}/${x}`;
    await almacen.subir(clave(ids.ana), svg, 'image/svg+xml');
    await almacen.subir(clave(ids.vtt), vtt, 'text/vtt');
    const base = { organizacionId: orgId, clienteId: clientes[0]!, origen: 'GENERADO' as const, bytes: 10n, hash: 'x' };
    await prisma.recurso.createMany({ data: [
      { ...base, id: ids.audio, tipo: 'AUDIO', claveS3: clave(ids.audio), mime: 'audio/wav', nombre: 'p01-es.wav' },
      { ...base, id: ids.ana, tipo: 'SVG', origen: 'CLIENTE', claveS3: clave(ids.ana), mime: 'image/svg+xml', nombre: 'ana.svg' },
      { ...base, id: ids.vtt, tipo: 'SUBTITULO', claveS3: clave(ids.vtt), mime: 'text/vtt', nombre: 'p01-es.vtt' },
    ] });
    const documento = JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));
    documento.recursos.push({ id: ids.audio, tipo: 'audio', origen: 'generado', nombre: 'p01-es.wav', mime: 'audio/wav', idioma: 'es' }, { id: ids.otraOrg, tipo: 'audio', origen: 'generado', nombre: 'x.wav', mime: 'audio/wav' },
      { id: ids.vtt, tipo: 'subtitulos', origen: 'generado', nombre: 'p01-es.vtt', mime: 'text/vtt', idioma: 'es' });
    const p03 = documento.modulos[0].capsulas[0].pantallas[2];
    p03.bloques.find((b: { tipo: string }) => b.tipo === 'personaje').recursoId = ids.ana;
    await prisma.curso.create({ data: { organizacionId: orgId, proyectoId: proyecto.id, versionEsquema: '0.2.0', documento } });

    const r = await como('grafico').get(`/proyectos/${proyecto.id}/curso`);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.urlsRecursos)).toEqual([ids.audio]);
    expect(r.body.urlsRecursos[ids.audio]).toMatch(/X-Amz-Signature=/);
    expect(Object.keys(r.body.svgPersonajes)).toEqual([ids.ana]);
    expect(r.body.svgPersonajes[ids.ana]).toContain('id="boca_A"');
    expect(r.body.subtitulos).toEqual({ [ids.vtt]: vtt });
  });
});
