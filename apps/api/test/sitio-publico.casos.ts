// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (versiones y ajustes globales).
// HU-1508 · CP-120 · El sitio público pre-renderizado en GET /s/* (DA-08, REQ-109), contra PostgreSQL, Redis y el S3
// local reales: sin versión responde la 404 en HTML; con el puntero sirve el HTML de la versión con ETag y 304, las
// fuentes con caché de un año, robots.txt, la 404 de la versión para lo no publicado y rechaza rutas raras.
// Publicar encola el pre-render y GET /sitio/versiones muestra su estado.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { COLA_MANTENIMIENTO, idPrerender, opcionesRedis, prefijoColas, TAREA_PRERENDER } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { CLAVE_ACTUAL, claveVersion, fuentes, instantaneaDeEjemplo, renderizarSitio } from '@aptio/sitio';
import { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { AlmacenService } from '../src/recursos/almacen.service.js';
import { SitioPublicoService } from '../src/sitio/sitio-publico.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const endpoint = process.env.AWS_ENDPOINT ?? 'http://localhost:9000';
const hayS3 = await fetch(`${endpoint}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = `super-${sufijo}@sitio-publico.test`;
const almacen = new Almacen({ ...configDesdeEnv({ AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', ...process.env, AWS_ENDPOINT: endpoint }), bucket: 'aptio-pruebas-sitio-api' });
const VERSION = 900_000 + Math.floor(Math.random() * 90_000);

describe.skipIf((!hayBase || !hayS3) && !process.env.CI)('sitio público pre-renderizado (HU-1508)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let publico: SitioPublicoService;
  let cookie = '';
  const env = { ...process.env };

  beforeAll(async () => {
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    if (await almacen.info(CLAVE_ACTUAL)) await almacen.borrar([CLAVE_ACTUAL]);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correo, rol: Rol.SUPERADMIN, hashClave: await hashearClave(CLAVE), emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AlmacenService).useValue({ almacen }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    publico = app.get(SitioPublicoService);
    const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo, clave: CLAVE });
    cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
  });

  afterAll(async () => {
    await app?.close();
    process.env.SITIO_ENTORNO = env.SITIO_ENTORNO;
    const usuario = await prisma.usuario.findUnique({ where: { email: correo } });
    const versiones = usuario ? await prisma.sitioVersion.findMany({ where: { publicadoPorId: usuario.id } }) : [];
    const cola = new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
    for (const v of versiones) await (await cola.getJob(idPrerender(v.numero)))?.remove();
    await cola.close();
    await prisma.auditoria.deleteMany({ where: { entidadId: { in: versiones.map((v) => v.id) } } });
    await prisma.sitioVersion.deleteMany({ where: { id: { in: versiones.map((v) => v.id) } } });
    await prisma.auditoria.deleteMany({ where: { usuario: { email: correo } } });
    await prisma.usuario.deleteMany({ where: { email: correo } });
  });

  it('sin ninguna versión pre-renderizada responde la página 404 en HTML, fuera del prefijo de la API', async () => {
    publico.olvidar();
    const r = await request(servidor).get('/s/');
    expect(r.status).toBe(404);
    expect(r.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(r.text).toMatch(/^<!doctype html>/);
    expect(r.text).toContain('Página no encontrada');
    expect(r.text).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(r.text).not.toContain('<script');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect((await request(servidor).get('/api/v1/s/')).status).toBe(404);
  });

  it('CP-120: con el puntero sirve el HTML de la versión con ETag; el mismo ETag da 304', async () => {
    for (const a of renderizarSitio(instantaneaDeEjemplo('produccion'), { entorno: 'produccion', sitioUrl: 'https://aptioscorm.com', base: '/s' })) {
      await almacen.subir(claveVersion(VERSION, a.archivo), a.contenido, a.mime);
    }
    await almacen.subir(CLAVE_ACTUAL, JSON.stringify({ version: VERSION, generadoEn: new Date().toISOString() }), 'application/json');
    publico.olvidar();

    for (const ruta of ['/s', '/s/', '/s/?utm_source=x']) {
      const r = await request(servidor).get(ruta);
      expect([ruta, r.status]).toEqual([ruta, 200]);
      expect(r.text).toContain('Mariana Paredes');
    }
    const r = await request(servidor).get('/s/');
    expect(r.text).not.toContain('Persona de ejemplo');
    expect(r.headers).toMatchObject({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=60, must-revalidate', 'x-content-type-options': 'nosniff' });
    const etag = r.headers.etag as string;
    expect(etag).toMatch(/^"[\w-]+"$/);
    const otra = await request(servidor).get('/s/').set('If-None-Match', etag);
    expect(otra.status).toBe(304);
    expect(otra.text ?? '').toBe('');
    expect((await request(servidor).get('/s/').set('If-None-Match', '"otra"')).status).toBe(200);

    expect((await request(servidor).get('/s/en')).text).toContain('<html lang="en">');
    expect((await request(servidor).get('/s/funcionalidades/personaje/')).text).toContain('Un personaje que habla');
    const sitemap = await request(servidor).get('/s/sitemap.xml');
    expect(sitemap.headers['content-type']).toBe('application/xml; charset=utf-8');
    expect(sitemap.text).toContain('<loc>https://aptioscorm.com/funcionalidades/personaje</loc>');
  });

  it('las fuentes se guardan un año; robots.txt de la versión', async () => {
    const f = fuentes()[0]!;
    const r = await request(servidor).get(`/s/_fuentes/${f.archivo}`).buffer(true);
    expect(r.status).toBe(200);
    expect(r.headers).toMatchObject({ 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000, immutable' });
    expect((await request(servidor).get('/s/_fuentes/no-existe-0123abcd.woff2')).status).toBe(404);
    const robots = await request(servidor).get('/s/robots.txt');
    expect(robots.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(robots.text).toBe('User-agent: *\nAllow: /\n\nSitemap: https://aptioscorm.com/sitemap.xml\n');
  });

  it('lo no publicado y las rutas no válidas dan la 404 de la versión', async () => {
    for (const ruta of ['/s/precios', '/s/en/no-existe', '/s/..%2F..%2Fsitio%2Factual.json', '/s/Mayusculas', '/s/a/b/c/d/e/f/g/h/i', '/s/_fuentes/../actual.json']) {
      const r = await request(servidor).get(ruta);
      expect([ruta, r.status]).toEqual([ruta, 404]);
      expect(r.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(r.headers['cache-control']).toBe('public, max-age=0, s-maxage=30');
      expect(r.text).toContain('Página no encontrada');
    }
  });

  it('publicar encola el pre-render y GET /sitio/versiones muestra su estado', async () => {
    const v = await request(servidor).post('/api/v1/sitio/publicar').set('Cookie', cookie);
    expect(v.status).toBe(201);
    expect(v.body.prerender).toEqual({ estado: 'en_curso', en: null, error: null });
    const cola = new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
    try {
      const job = await cola.getJob(idPrerender(v.body.numero));
      expect(job?.name).toBe(TAREA_PRERENDER);
      expect(job?.data).toEqual({ numero: v.body.numero });
    } finally {
      await cola.close();
    }
    await prisma.sitioVersion.update({ where: { numero: v.body.numero }, data: { prerenderEstado: 'error', prerenderEn: new Date(), prerenderError: 'Bucket no disponible' } });
    const lista = (await request(servidor).get('/api/v1/sitio/versiones').set('Cookie', cookie)).body;
    expect(lista.versiones[0]).toMatchObject({ numero: v.body.numero, prerender: { estado: 'error', error: 'Bucket no disponible' } });
    expect(lista.versiones[0].prerender.en).toMatch(/^\d{4}-/);
  });
});
