// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (versiones y puntero globales).
// HU-1512 · SEO técnico (REQ-071, PNT-26, PNT-29) contra PostgreSQL, Redis y el S3 local: el SEO de cada página con sus
// límites, las redirecciones 301 sin cadenas, bucles ni colisiones (422/409), la 301 automática al cambiar la ruta de
// una publicada, robots.txt con reglas extra, la revisión de problemas, permisos y auditoría; y en GET /s/* la 301 de una
// redirección publicada (CP-124) y una página sin indexar con noindex, fuera del sitemap y sin hreflang (CP-125).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { COLA_MANTENIMIENTO, idPrerender, opcionesRedis, prefijoColas } from '@aptio/colas';
import { hashearClave, ID_SEO, prisma, Rol, ultimaVersion } from '@aptio/db';
import { CLAVE_ACTUAL, claveVersion, opcionesRenderDesdeEnv, renderizarSitio } from '@aptio/sitio';
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
const correoDe = (n: string) => `${n}-${sufijo}@sitio-seo.test`;
const ruta = (n: string) => `/seo-${sufijo}-${n}`;
const almacen = new Almacen({ ...configDesdeEnv({ AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', ...process.env, AWS_ENDPOINT: endpoint }), bucket: 'aptio-pruebas-sitio-api' });

describe.skipIf((!hayBase || !hayS3) && !process.env.CI)('SEO técnico del sitio (HU-1512)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  const entornoOriginal = process.env.SITIO_ENTORNO;
  let respaldoSeo: Awaited<ReturnType<typeof prisma.sitioSeo.findUnique>> = null;
  const enviar = (m: 'get' | 'post' | 'patch' | 'delete', r: string, b?: object, quien: 'super' | 'admin' = 'super') => {
    const req = request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);
    return b ? req.send(b) : req;
  };
  const pagina = async (n: string, extra: object = {}) => {
    const r = await enviar('post', '/sitio/paginas', { ruta: ruta(n), titulo: `Página ${n}`, ...extra });
    if (r.status !== 201) throw new Error(`pagina: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body as { id: string; ruta: string; estado: string };
  };
  const redireccion = (desde: string, hacia: string, activa?: boolean) => enviar('post', '/sitio/seo/redirecciones', { desde, hacia, ...(activa === undefined ? {} : { activa }) });
  const auditorias = (accion: string) => prisma.auditoria.findMany({ where: { accion, usuario: { email: correoDe('super') } }, orderBy: { creadoEn: 'asc' } });

  beforeAll(async () => {
    process.env.SITIO_ENTORNO = 'produccion';
    respaldoSeo = await prisma.sitioSeo.findUnique({ where: { id: ID_SEO } });
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    const org = await prisma.organizacion.create({ data: { nombre: 'Org SEO', slug: `seo-${sufijo}` } });
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AlmacenService).useValue({ almacen }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const quien of ['super', 'admin'] as const) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correoDe(quien), clave: CLAVE });
      cookies[quien] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    if (entornoOriginal === undefined) delete process.env.SITIO_ENTORNO;
    else process.env.SITIO_ENTORNO = entornoOriginal;
    if (await almacen.info(CLAVE_ACTUAL)) await almacen.borrar([CLAVE_ACTUAL]);
    const redirecciones = await prisma.sitioRedireccion.findMany({ where: { OR: [{ desde: { contains: sufijo } }, { hacia: { contains: sufijo } }] } });
    await prisma.auditoria.deleteMany({ where: { entidadId: { in: redirecciones.map((r) => r.id) } } });
    await prisma.sitioRedireccion.deleteMany({ where: { id: { in: redirecciones.map((r) => r.id) } } });
    const paginas = await prisma.sitioPagina.findMany({ where: { ruta: { startsWith: `/seo-${sufijo}` } } });
    await prisma.auditoria.deleteMany({ where: { entidadId: { in: paginas.map((p) => p.id) } } });
    await prisma.sitioPagina.deleteMany({ where: { id: { in: paginas.map((p) => p.id) } } });
    await prisma.sitioSeo.deleteMany();
    if (respaldoSeo) await prisma.sitioSeo.create({ data: respaldoSeo });
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@sitio-seo.test` } }, select: { id: true } });
    const ids = usuarios.map((u) => u.id);
    const versiones = await prisma.sitioVersion.findMany({ where: { publicadoPorId: { in: ids } } });
    const cola = new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
    for (const v of versiones) await (await cola.getJob(idPrerender(v.numero)))?.remove();
    await cola.close();
    await prisma.sitioVersion.updateMany({ where: { publicadoPorId: { in: ids } }, data: { publicadoPorId: null } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `seo-${sufijo}` } });
  });

  it('solo el superadmin: 401 sin sesión y 403 a un rol de organización', async () => {
    expect((await request(servidor).get('/api/v1/sitio/seo')).status).toBe(401);
    expect((await request(servidor).post('/api/v1/sitio/seo/redirecciones').send({ desde: '/a', hacia: '/b' })).status).toBe(401);
    for (const [m, r] of [['get', '/sitio/seo'], ['patch', '/sitio/seo'], ['post', '/sitio/seo/redirecciones'], ['patch', `/sitio/seo/redirecciones/${crypto.randomUUID()}`], ['delete', `/sitio/seo/redirecciones/${crypto.randomUUID()}`]] as const) {
      expect([m, r, (await enviar(m, r, { robotsExtra: '', desde: '/a', hacia: '/b' }, 'admin')).status]).toEqual([m, r, 403]);
    }
  });

  it('PNT-26: el SEO de una página se guarda con sus límites, cambia «Cambios sin publicar» y queda en la auditoría', async () => {
    const p = await pagina('precios', { accion: 'publicar' });
    const largo = await enviar('patch', `/sitio/paginas/${p.id}`, { metaTitulo: 't'.repeat(61), metaDescripcion: 'd'.repeat(161), canonical: 'http://otro.pe' });
    expect([largo.status, largo.body.codigo, largo.body.detalles.map((d: { campo: string }) => d.campo)]).toEqual([422, 'NO_VALIDO', ['metaTitulo', 'metaDescripcion', 'canonical']]);
    expect((await enviar('patch', `/sitio/paginas/${p.id}`, { metaDescripcion: '<b>Hola</b>' })).status).toBe(422);
    expect((await enviar('patch', `/sitio/paginas/${p.id}`, { datosEstructurados: 'Article' })).status).toBe(422);
    expect((await enviar('patch', `/sitio/paginas/${p.id}`, { indexar: 'no' })).status).toBe(422);
    expect((await enviar('get', '/sitio/versiones')).body.pendientes).toBe(false);

    const ok = await enviar('patch', `/sitio/paginas/${p.id}`, { metaTitulo: 'Planes y precios', metaDescripcion: 'Planes en soles con factura electrónica.', canonical: '/precios', datosEstructurados: 'Product' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ metaTitulo: 'Planes y precios', metaDescripcion: 'Planes en soles con factura electrónica.', canonical: '/precios', indexar: true, datosEstructurados: 'Product' });
    expect((await enviar('get', '/sitio/versiones')).body.pendientes).toBe(true);
    const editada = (await auditorias('SITIO_PAGINA_EDITADA')).find((a) => a.entidadId === p.id);
    expect(editada?.datos).toMatchObject({ metaTitulo: 'Planes y precios', canonical: '/precios', datosEstructurados: 'Product' });
    // Un texto vacío vuelve al valor por defecto.
    expect((await enviar('patch', `/sitio/paginas/${p.id}`, { canonical: '' })).body.canonical).toBeNull();
  });

  it('redirecciones: alta, 409 si se repite el origen y 422 en sí misma, bucle, cadena o sobre una página publicada', async () => {
    const [a, b, c, d] = [ruta('r-a'), ruta('r-b'), ruta('r-c'), ruta('r-d')];
    const alta = await redireccion(`${a}/`, b);
    expect(alta.status).toBe(201);
    expect(alta.body).toMatchObject({ desde: a, hacia: b, activa: true });
    expect((await auditorias('SITIO_REDIRECCION_CREADA')).at(-1)).toMatchObject({ entidadId: alta.body.id, organizacionId: null, datos: { desde: a, hacia: b, activa: true } });
    const codigo = async (desde: string, hacia: string) => { const r = await redireccion(desde, hacia); return [r.status, r.body.codigo]; };
    expect(await codigo(a, c)).toEqual([409, 'REDIRECCION_REPETIDA']);
    expect(await codigo(c, c)).toEqual([422, 'REDIRECCION_A_SI_MISMA']);
    expect(await codigo(b, a)).toEqual([422, 'REDIRECCION_EN_BUCLE']);
    expect(await codigo(c, a)).toEqual([422, 'REDIRECCION_EN_CADENA']);
    expect(await codigo(b, d)).toEqual([422, 'REDIRECCION_EN_CADENA']);
    expect(await codigo(ruta('precios'), d)).toEqual([422, 'REDIRECCION_PISA_PAGINA']);
    expect(await codigo('precios', d)).toEqual([422, 'REDIRECCION_INVALIDA']);
    expect((await redireccion(c, 'https://otro.pe')).body.detalles).toEqual([{ campo: 'hacia', mensaje: 'El destino es una ruta interna en minúsculas, como /precios' }]);

    // Inactiva no cuenta para cadenas; activarla sí.
    const inactiva = await redireccion(c, a, false);
    expect(inactiva.status).toBe(201);
    const activar = await enviar('patch', `/sitio/seo/redirecciones/${inactiva.body.id}`, { activa: true });
    expect([activar.status, activar.body.codigo]).toEqual([422, 'REDIRECCION_EN_CADENA']);
    const destino = await enviar('patch', `/sitio/seo/redirecciones/${inactiva.body.id}`, { hacia: b, activa: true });
    expect(destino.body).toMatchObject({ desde: c, hacia: b, activa: true });
    expect((await auditorias('SITIO_REDIRECCION_EDITADA')).at(-1)?.datos).toMatchObject({ antes: { hacia: a, activa: false }, hacia: b, activa: true });
    expect((await enviar('delete', `/sitio/seo/redirecciones/${inactiva.body.id}`)).status).toBe(204);
    expect((await enviar('delete', `/sitio/seo/redirecciones/${inactiva.body.id}`)).status).toBe(404);
    expect((await auditorias('SITIO_REDIRECCION_BORRADA')).at(-1)).toMatchObject({ entidadId: inactiva.body.id, datos: { desde: c, hacia: b } });
  });

  it('cambiar la ruta de una publicada crea sola la 301; si formaría un bucle, cambia la ruta y avisa', async () => {
    const p = await pagina('mover', { accion: 'publicar' });
    const r = await enviar('patch', `/sitio/paginas/${p.id}`, { ruta: ruta('movida') });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ruta: ruta('movida'), redireccion: { desde: ruta('mover'), hacia: ruta('movida') } });
    expect(await prisma.sitioRedireccion.findUnique({ where: { desde: ruta('mover') } })).toMatchObject({ hacia: ruta('movida'), activa: true });
    expect((await auditorias('SITIO_REDIRECCION_CREADA')).at(-1)?.datos).toMatchObject({ desde: ruta('mover'), hacia: ruta('movida'), automatica: true, paginaId: p.id });
    const vuelta = await enviar('patch', `/sitio/paginas/${p.id}`, { ruta: ruta('mover') });
    expect(vuelta.status).toBe(200);
    expect(vuelta.body.ruta).toBe(ruta('mover'));
    expect(vuelta.body.redireccion).toBeUndefined();
    expect(vuelta.body.avisoRedireccion).toContain('No se creó la redirección 301');
  });

  it('robots.txt: reglas extra validadas línea por línea, con vista previa y auditoría', async () => {
    const mal = await enviar('patch', '/sitio/seo', { robotsExtra: 'Disallow: /\n<b>x</b>' });
    expect([mal.status, mal.body.detalles.map((d: { campo: string }) => d.campo)]).toEqual([422, ['robotsExtra.1', 'robotsExtra.2']]);
    const ok = await enviar('patch', '/sitio/seo', { robotsExtra: '# Panel\ndisallow: /panel' });
    expect(ok.status).toBe(200);
    expect(ok.body.robotsExtra).toBe('# Panel\nDisallow: /panel');
    expect(ok.body.robotsVistaPrevia).toMatch(/^User-agent: \*\nAllow: \/\n# Panel\nDisallow: \/panel\n\nSitemap: https:\/\/[^\n]+\/sitemap\.xml\n/);
    expect((await auditorias('SITIO_ROBOTS_EDITADO')).at(-1)?.datos).toMatchObject({ robotsExtra: '# Panel\nDisallow: /panel' });
  });

  it('PNT-29: la revisión lista páginas sin descripción, sin indexar y redirecciones sin destino, con su enlace', async () => {
    const sin = await pagina('sin-descripcion');
    const oculta = await pagina('oculta');
    await enviar('patch', `/sitio/paginas/${oculta.id}`, { indexar: false, metaDescripcion: 'Una página interna.' });
    const rota = await redireccion(ruta('vieja-rota'), ruta('no-existe'));
    const { problemas } = (await enviar('get', '/sitio/seo')).body as { problemas: { tipo: string; severidad: string; paginaId?: string; redireccionId?: string }[] };
    expect(problemas).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: 'sin-descripcion', severidad: 'alta', paginaId: sin.id }),
      expect.objectContaining({ tipo: 'sin-indexar', severidad: 'baja', paginaId: oculta.id }),
      expect.objectContaining({ tipo: 'redireccion-sin-destino', severidad: 'alta', redireccionId: rota.body.id }),
    ]));
    expect(problemas.some((p) => p.tipo === 'sin-descripcion' && p.paginaId === oculta.id)).toBe(false);
    const orden = problemas.map((p) => ({ alta: 0, media: 1, baja: 2 })[p.severidad as 'alta']);
    expect(orden).toEqual([...orden].sort());
  });

  it('CP-124 y CP-125: publicado, /s/* responde 301 en la redirección y la página sin indexar va con noindex, fuera del sitemap y sin hreflang', async () => {
    const destino = await pagina('destino', { accion: 'publicar' });
    await enviar('patch', `/sitio/paginas/${destino.id}`, { metaDescripcion: 'La página de destino.' });
    expect((await redireccion(ruta('origen'), ruta('destino'))).status).toBe(201);
    const es = await pagina('doble', { accion: 'publicar' });
    const en = (await enviar('post', '/sitio/paginas', { ruta: ruta('doble'), idioma: 'en', titulo: 'Double', accion: 'publicar' })).body;
    expect(es.estado).toBe('PUBLICADA');
    await enviar('patch', `/sitio/paginas/${en.id}`, { indexar: false });

    const v = await enviar('post', '/sitio/publicar');
    expect(v.status).toBe(201);
    // Lo que haría el worker con la versión: pre-renderizar y mover el puntero.
    const inst = (await ultimaVersion(prisma))!.instantanea;
    expect(inst.redirecciones).toEqual(expect.arrayContaining([{ desde: ruta('origen'), hacia: ruta('destino') }]));
    const op = opcionesRenderDesdeEnv();
    for (const a of renderizarSitio(inst, op)) await almacen.subir(claveVersion(v.body.numero, a.archivo), a.contenido, a.mime);
    await almacen.subir(CLAVE_ACTUAL, JSON.stringify({ version: v.body.numero, generadoEn: new Date().toISOString() }), 'application/json');
    app.get(SitioPublicoService).olvidar();

    const r301 = await request(servidor).get(`/s${ruta('origen')}/?utm_source=x`).redirects(0);
    expect([r301.status, r301.headers.location]).toEqual([301, `/s${ruta('destino')}`]);
    expect((await request(servidor).get(`/s${ruta('no-hay')}`)).status).toBe(404);
    // La página publicada manda sobre una redirección desde su ruta.
    expect((await request(servidor).get(`/s${ruta('destino')}`)).status).toBe(200);

    const enHtml = (await request(servidor).get(`/s/en${ruta('doble')}`)).text;
    const esHtml = (await request(servidor).get(`/s${ruta('doble')}`)).text;
    expect(enHtml).toContain('<meta name="robots" content="noindex"/>');
    expect(esHtml).toContain('<meta name="robots" content="index, follow"/>');
    for (const html of [enHtml, esHtml]) expect(html).not.toContain('hreflang');
    const sitemap = (await request(servidor).get('/s/sitemap.xml')).text;
    expect(sitemap).toContain(`${ruta('doble')}</loc>`);
    expect(sitemap).not.toContain(`/en${ruta('doble')}`);
    expect((await request(servidor).get('/s/robots.txt')).text).toContain('Allow: /\n# Panel\nDisallow: /panel\n');
    expect((await request(servidor).get(`/s${ruta('destino')}`)).text).toContain('<meta name="description" content="La página de destino."/>');
  });
});
