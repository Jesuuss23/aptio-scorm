// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (versiones y ajustes globales).
// HU-1509 · Ajustes del sitio (REQ-073, PNT-38) contra PostgreSQL y el S3 local reales: leer y guardar (validación 422,
// texto plano, normalización), RBAC, auditoría, logo SVG saneado y PNG, correo de prueba y «Comprobar» el dominio.
// CP-121: con el modo mantenimiento activo, cualquier ruta de /s/* responde 503 con la página de aviso a un visitante y
// el superadmin sigue viendo el sitio; al desactivarlo vuelve el 200. Nombre, dominio y WhatsApp salen al publicar.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { CLAVE_ACTUAL, claveVersion, fuentes, instantaneaDeEjemplo, renderizarSitio } from '@aptio/sitio';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { AlmacenService } from '../src/recursos/almacen.service.js';
import { AjustesService } from '../src/sitio/ajustes.service.js';
import { SitioPublicoService } from '../src/sitio/sitio-publico.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const endpoint = process.env.AWS_ENDPOINT ?? 'http://localhost:9000';
const hayS3 = await fetch(`${endpoint}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@sitio-ajustes.test`;
const almacen = new Almacen({ ...configDesdeEnv({ AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', ...process.env, AWS_ENDPOINT: endpoint }), bucket: 'aptio-pruebas-sitio-api' });
const VERSION = 800_000 + Math.floor(Math.random() * 90_000);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><rect width="10" height="10" fill="#FF6B35"/></svg>';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000105fe02fea70000000049454e44ae426082', 'hex');

describe.skipIf((!hayBase || !hayS3) && !process.env.CI)('ajustes del sitio (HU-1509)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let ajustesServicio: AjustesService;
  let publico: SitioPublicoService;
  const cookies: Record<string, string> = {};
  let respaldo: Awaited<ReturnType<typeof prisma.sitioAjustes.findMany>> = [];
  const como = (quien: 'super' | 'admin') => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    patch: (ruta: string, cuerpo: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(cuerpo),
    post: (ruta: string) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    put: (ruta: string, mime: string, cuerpo: Buffer | string) => request(servidor).put(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).set('Content-Type', mime).send(cuerpo),
    del: (ruta: string) => request(servidor).delete(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
  });
  const s = () => como('super');
  /** Lo que ve en /s/ quien no inició sesión (el estado de mantenimiento se vuelve a leer). */
  const visitante = (ruta: string) => { ajustesServicio.olvidar(); return request(servidor).get(ruta); };

  beforeAll(async () => {
    respaldo = await prisma.sitioAjustes.findMany();
    await prisma.sitioAjustes.deleteMany();
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    const org = await prisma.organizacion.create({ data: { nombre: 'Org ajustes', slug: `ajustes-${sufijo}` } });
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AlmacenService).useValue({ almacen }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    ajustesServicio = app.get(AjustesService);
    publico = app.get(SitioPublicoService);
    for (const quien of ['super', 'admin'] as const) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correoDe(quien), clave: CLAVE });
      cookies[quien] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
    // Una versión pre-renderizada para que /s/ tenga qué servir.
    for (const a of renderizarSitio(instantaneaDeEjemplo('produccion'), { entorno: 'produccion', sitioUrl: 'https://aptioscorm.com', base: '/s' })) {
      await almacen.subir(claveVersion(VERSION, a.archivo), a.contenido, a.mime);
    }
    await almacen.subir(CLAVE_ACTUAL, JSON.stringify({ version: VERSION, generadoEn: new Date().toISOString() }), 'application/json');
    publico.olvidar();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.sitioAjustes.deleteMany();
    for (const f of respaldo) await prisma.sitioAjustes.create({ data: { ...f, datos: f.datos as object } });
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@sitio-ajustes.test` } }, select: { id: true, organizacionId: true } });
    const versiones = await prisma.sitioVersion.findMany({ where: { publicadoPorId: { in: usuarios.map((u) => u.id) } }, select: { id: true } });
    await prisma.auditoria.deleteMany({ where: { OR: [{ usuarioId: { in: usuarios.map((u) => u.id) } }, { entidadId: { in: versiones.map((v) => v.id) } }] } });
    await prisma.sitioVersion.deleteMany({ where: { id: { in: versiones.map((v) => v.id) } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
    await prisma.organizacion.deleteMany({ where: { slug: `ajustes-${sufijo}` } });
  });

  it('sin guardar nada devuelve los valores por defecto; solo el superadmin entra (403 y 401)', async () => {
    const r = await s().get('/sitio/ajustes');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      dominio: null, nombre: 'Aptio SCORM', logo: null, favicon: null, analitica: { ga4: null, gtm: null, metaPixel: null },
      whatsapp: { visible: false, numero: null, mensaje: null }, correoLeads: null, mantenimiento: { activo: false, mensaje: null, desde: null }, actualizadoEn: null,
    });
    expect((await como('admin').get('/sitio/ajustes')).status).toBe(403);
    expect((await como('admin').patch('/sitio/ajustes', { nombre: 'X' })).status).toBe(403);
    expect((await request(servidor).get('/api/v1/sitio/ajustes')).status).toBe(401);
  });

  it('guarda normalizado, rechaza con 422 y la lista de campos, y deja la auditoría', async () => {
    const r = await s().patch('/sitio/ajustes', {
      dominio: 'AptioScorm.com', nombre: 'Aptio SCORM Perú', analitica: { ga4: 'g-ab12cd34ef' },
      whatsapp: { visible: true, numero: '+51 987 654 321', mensaje: 'Hola, quiero una demo' }, correoLeads: 'Ventas@Aulas.pe',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dominio: 'aptioscorm.com', nombre: 'Aptio SCORM Perú', analitica: { ga4: 'G-AB12CD34EF' }, whatsapp: { numero: '+51987654321' }, correoLeads: 'ventas@aulas.pe' });
    expect(r.body.actualizadoEn).toMatch(/^\d{4}-/);

    const mal = await s().patch('/sitio/ajustes', { dominio: 'https://x.com/a', nombre: '<b>X</b>', whatsapp: { numero: '987' } });
    expect(mal.status).toBe(422);
    expect(mal.body.codigo).toBe('NO_VALIDO');
    expect(mal.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(['dominio', 'nombre', 'whatsapp.numero']);
    expect((await s().patch('/sitio/ajustes', {})).body.codigo).toBe('SIN_CAMBIOS');
    expect((await s().patch('/sitio/ajustes', { otro: 1 })).status).toBe(422);
    expect((await s().get('/sitio/ajustes')).body.nombre).toBe('Aptio SCORM Perú');

    const aud = await prisma.auditoria.findFirst({ where: { accion: 'SITIO_AJUSTES_ACTUALIZADOS', usuario: { email: correoDe('super') } }, orderBy: { creadoEn: 'asc' } });
    expect(aud?.datos).toEqual({ campos: ['dominio', 'nombre', 'analitica', 'whatsapp', 'correoLeads'], publicar: true });
  });

  it('nombre, dominio y WhatsApp salen al sitio al publicar: el panel marca cambios pendientes', async () => {
    const v = await s().post('/sitio/publicar');
    expect(v.status).toBe(201);
    expect((await s().get('/sitio/versiones')).body.pendientes).toBe(false);
    const fila = await prisma.sitioVersion.findUniqueOrThrow({ where: { numero: v.body.numero } });
    expect((fila.instantanea as { sitio: unknown }).sitio).toEqual({
      nombre: 'Aptio SCORM Perú', dominio: 'aptioscorm.com', logo: null, favicon: null, whatsapp: { numero: '+51987654321', mensaje: 'Hola, quiero una demo' },
    });
    await s().patch('/sitio/ajustes', { correoLeads: 'leads@aulas.pe', analitica: { gtm: 'GTM-AB12CD3' } });
    expect((await s().get('/sitio/versiones')).body.pendientes).toBe(false);
    await s().patch('/sitio/ajustes', { whatsapp: { visible: false } });
    expect((await s().get('/sitio/versiones')).body.pendientes).toBe(true);
  });

  it('logo SVG saneado y favicon PNG con su hash en el nombre; se sirven en /s/_marca/ con caché de un año', async () => {
    const logo = await s().put('/sitio/ajustes/marca/logo', 'image/svg+xml', SVG);
    expect(logo.status).toBe(200);
    expect(logo.body.logo).toMatchObject({ mime: 'image/svg+xml' });
    expect(logo.body.logo.archivo).toMatch(/^logo-[0-9a-f]{8}\.svg$/);
    const servido = await request(servidor).get(`/s/_marca/${logo.body.logo.archivo}`).buffer(true).parse((res, fin) => { let t = ''; res.on('data', (c: Buffer) => { t += c.toString(); }); res.on('end', () => fin(null, t)); });
    expect(servido.status).toBe(200);
    expect(servido.headers).toMatchObject({ 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=31536000, immutable' });
    expect(servido.body).toContain('<rect');
    expect(servido.body).not.toMatch(/script|onload/);

    const fav = await s().put('/sitio/ajustes/marca/favicon', 'image/png', PNG);
    expect(fav.body.favicon.archivo).toMatch(/^favicon-[0-9a-f]{8}\.png$/);
    expect((await request(servidor).get(`/s/_marca/${fav.body.favicon.archivo}`)).headers['content-type']).toBe('image/png');

    expect((await s().put('/sitio/ajustes/marca/favicon', 'image/png', Buffer.from('no soy png'))).body.codigo).toBe('ARCHIVO_NO_VALIDO');
    expect((await s().put('/sitio/ajustes/marca/logo', 'image/svg+xml', '<html></html>')).body.codigo).toBe('ARCHIVO_NO_VALIDO');
    expect((await s().put('/sitio/ajustes/marca/logo', 'image/png', Buffer.alloc(201 * 1024))).status).toBe(413);
    expect((await s().put('/sitio/ajustes/marca/otro', 'image/png', PNG)).status).toBe(404);
    expect((await como('admin').put('/sitio/ajustes/marca/logo', 'image/png', PNG)).status).toBe(403);
    expect((await s().del('/sitio/ajustes/marca/favicon')).body.favicon).toBeNull();
    expect((await request(servidor).get('/s/_marca/logo-00000000.svg')).status).toBe(404);
  });

  it('correo de prueba al correo de leads y «Comprobar» el dominio', async () => {
    expect((await s().post('/sitio/ajustes/correo-prueba')).body).toEqual({ para: 'leads@aulas.pe' });
    await s().patch('/sitio/ajustes', { dominio: 'no-existe-aptio.invalid' });
    const r = await s().post('/sitio/ajustes/dominio/comprobar');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dominio: 'no-existe-aptio.invalid', ok: false, venceEn: null });
    expect(r.body.error).toBeTruthy();
    await s().patch('/sitio/ajustes', { dominio: null, correoLeads: null });
    expect((await s().post('/sitio/ajustes/dominio/comprobar')).body.codigo).toBe('SIN_DOMINIO');
    expect((await s().post('/sitio/ajustes/correo-prueba')).body.codigo).toBe('SIN_CORREO_LEADS');
  });

  it('CP-121: en mantenimiento cualquier ruta da 503 con el aviso al visitante y el superadmin sigue viendo el sitio', async () => {
    expect((await visitante('/s/')).status).toBe(200);
    const on = await s().patch('/sitio/ajustes', { mantenimiento: { activo: true, mensaje: 'Volvemos a las 3 p. m.' } });
    expect(on.body.mantenimiento).toMatchObject({ activo: true, mensaje: 'Volvemos a las 3 p. m.' });
    expect(on.body.mantenimiento.desde).toMatch(/^\d{4}-/);

    for (const ruta of ['/s', '/s/', '/s/funcionalidades/personaje', '/s/no-existe', '/s/sitemap.xml', '/s/robots.txt', '/s/..%2Fx']) {
      const r = await visitante(ruta);
      expect([ruta, r.status]).toEqual([ruta, 503]);
      expect(r.headers).toMatchObject({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'retry-after': '600' });
      expect(r.text).toContain('<h1>Volvemos pronto</h1>');
      expect(r.text).toContain('Volvemos a las 3 p. m.');
      expect(r.text).toContain('noindex, nofollow');
    }
    // Las fuentes se siguen sirviendo para dibujar el aviso.
    expect((await visitante(`/s/_fuentes/${fuentes()[0]!.archivo}`)).status).toBe(200);

    const sup = await request(servidor).get('/s/').set('Cookie', cookies.super!);
    expect(sup.status).toBe(200);
    expect(sup.headers['cache-control']).toBe('private, no-store');
    expect(sup.text).toContain('Modo mantenimiento activo');
    expect(sup.text).toContain('Mariana Paredes');
    expect((await request(servidor).get('/s/').set('Cookie', cookies.admin!)).status).toBe(503);

    const auditorias = await prisma.auditoria.findMany({ where: { usuario: { email: correoDe('super') }, accion: { startsWith: 'SITIO_MANTENIMIENTO' } } });
    expect(auditorias.map((a) => a.accion)).toEqual(['SITIO_MANTENIMIENTO_ACTIVADO']);

    await s().patch('/sitio/ajustes', { mantenimiento: { activo: false } });
    const r = await visitante('/s/');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=0, s-maxage=60, must-revalidate');
    expect(await prisma.auditoria.count({ where: { usuario: { email: correoDe('super') }, accion: 'SITIO_MANTENIMIENTO_DESACTIVADO' } })).toBe(1);
  });
});
