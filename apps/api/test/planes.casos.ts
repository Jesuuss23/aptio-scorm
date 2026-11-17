// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (los planes y la versión son globales).
// HU-1702 · Planes administrables (REQ-082, PNT-35, CP-141, CP-142) contra PostgreSQL: solo el superadmin (401/403);
// crear, editar, ordenar y destacar uno a la vez, con auditoría PLAN_*; el slug no cambia; el público lee la versión
// publicada (un cambio se ve al publicar); un plan oculto da 404; en producción un plan ficticio visible en una página
// publicada con planes bloquea publicar y nunca sale al público.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, ID_PLANES_AJUSTES, prisma, Rol, ultimaVersion } from '@aptio/db';
import { renderizarPagina } from '@aptio/sitio';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@planes.test`;
const RUTA = `/precios-${sufijo}`;
const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com', base: '' };
const rasgos = (...t: string[]) => t.map((texto) => ({ texto, visible: true }));

describe.skipIf(!hayBase && !process.env.CI)('planes administrables (HU-1702)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  const entornoOriginal = process.env.SITIO_ENTORNO;
  let planesPrevios: Awaited<ReturnType<typeof prisma.plan.findMany>> = [];
  let ajustesPrevios: Awaited<ReturnType<typeof prisma.planesAjustes.findUnique>> = null;
  let paginaId = '';
  const ids: Record<string, string> = {};
  const panel = (m: 'get' | 'post' | 'patch' | 'put', r: string, quien: 'super' | 'admin' = 'super') => request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);
  const publico = (slug: string) => { app.get(LimitePublicoService).reiniciar(); return request(servidor).get(`/api/v1/publico/planes/${slug}`); };
  const publicar = () => panel('post', '/sitio/publicar');
  const html = async () => renderizarPagina((await ultimaVersion(prisma))!.instantanea, RUTA, 'es', op)!;
  const auditoria = (accion: string) => prisma.auditoria.findMany({ where: { accion, usuario: { email: correoDe('super') } }, orderBy: { creadoEn: 'asc' } });

  beforeAll(async () => {
    process.env.SITIO_ENTORNO = 'produccion';
    planesPrevios = await prisma.plan.findMany();
    ajustesPrevios = await prisma.planesAjustes.findUnique({ where: { id: ID_PLANES_AJUSTES } });
    await prisma.plan.deleteMany();
    await prisma.planesAjustes.deleteMany();
    const org = await prisma.organizacion.create({ data: { nombre: 'Org planes', slug: `planes-${sufijo}` } });
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const quien of ['super', 'admin'] as const) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correoDe(quien), clave: CLAVE });
      cookies[quien] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  beforeEach(() => {
    process.env.SITIO_ENTORNO = 'produccion';
  });

  afterAll(async () => {
    await app?.close();
    if (entornoOriginal === undefined) delete process.env.SITIO_ENTORNO;
    else process.env.SITIO_ENTORNO = entornoOriginal;
    // Los planes y los ajustes son globales: vuelven a como estaban.
    await prisma.plan.deleteMany();
    for (const { caracteristicas, ...p } of planesPrevios) await prisma.plan.create({ data: { ...p, caracteristicas: caracteristicas ?? [] } });
    await prisma.planesAjustes.deleteMany();
    if (ajustesPrevios) await prisma.planesAjustes.create({ data: ajustesPrevios });
    if (paginaId) {
      await prisma.auditoria.deleteMany({ where: { entidadId: paginaId } });
      await prisma.sitioPagina.deleteMany({ where: { id: paginaId } });
    }
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@planes.test` } }, select: { id: true, organizacionId: true } });
    const uids = usuarios.map((u) => u.id);
    await prisma.sitioVersion.updateMany({ where: { publicadoPorId: { in: uids } }, data: { publicadoPorId: null } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: uids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: uids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `planes-${sufijo}` } });
  });

  it('solo el superadmin administra los planes: 401 sin sesión y 403 a un administrador de organización', async () => {
    expect((await request(servidor).get('/api/v1/ventas/planes')).status).toBe(401);
    for (const [m, r] of [['get', '/ventas/planes'], ['post', '/ventas/planes'], ['get', '/ventas/planes/ajustes'], ['put', '/ventas/planes/ajustes'], ['put', '/ventas/planes/orden']] as const) {
      expect((await panel(m, r, 'admin').send({})).status).toBe(403);
    }
    expect((await panel('get', '/ventas/planes')).body).toEqual({ planes: [], ajustes: { mostrarAnual: true, descuentoAnual: 20, conIgv: false } });
  });

  it('crea los planes con su precio anual, destaca uno a la vez, el slug no cambia y todo queda auditado', async () => {
    const inicial = await panel('post', '/ventas/planes').send({
      slug: 'inicial', nombre: 'Inicial', precioMes: 490, capsulasMes: 5, usuarios: 3, capsulaAdicional: 89, visible: true, caracteristicas: rasgos('5 cápsulas al mes', 'SCORM 1.2 y HTML'),
    });
    expect(inicial.status).toBe(201);
    expect(inicial.body).toMatchObject({ slug: 'inicial', precioMes: 490, precioAnual: null, precioAnualEfectivo: 4704, destacado: false, orden: 0, ficticio: false, textoBoton: 'Suscribirme' });
    ids.inicial = inicial.body.id;
    const productora = await panel('post', '/ventas/planes').send({ slug: 'productora', nombre: 'Productora', precioMes: 1290, capsulaAdicional: 69, destacado: true, visible: true, caracteristicas: rasgos('20 cápsulas al mes') });
    expect(productora.body).toMatchObject({ destacado: true, orden: 1 });
    ids.productora = productora.body.id;
    const empresa = await panel('post', '/ventas/planes').send({ slug: 'empresa', nombre: 'Empresa', textoBoton: 'Hablar con ventas', caracteristicas: rasgos('SSO') });
    expect(empresa.body).toMatchObject({ visible: false, precioMes: null, precioAnualEfectivo: null, orden: 2 });
    ids.empresa = empresa.body.id;

    expect((await panel('post', '/ventas/planes').send({ slug: 'inicial', nombre: 'Otra' })).body.codigo).toBe('SLUG_EN_USO');
    const malo = await panel('post', '/ventas/planes').send({ slug: 'Con Espacios', nombre: '', precioMes: -1 });
    expect(malo.status).toBe(422);
    expect(malo.body.codigo).toBe('NO_VALIDO');
    expect((await panel('patch', `/ventas/planes/${ids.inicial}`).send({ slug: 'otro' })).body.codigo).toBe('SLUG_FIJO');
    expect((await panel('patch', `/ventas/planes/${ids.empresa}`).send({ capsulaAdicional: 50 })).status).toBe(422); // a medida: sin cápsula adicional

    // Destacar la empresa apaga la productora.
    expect((await panel('patch', `/ventas/planes/${ids.empresa}`).send({ destacado: true, visible: true })).body.destacado).toBe(true);
    const lista = (await panel('get', '/ventas/planes')).body as { planes: { slug: string; destacado: boolean }[] };
    expect(lista.planes.filter((p) => p.destacado).map((p) => p.slug)).toEqual(['empresa']);
    await panel('patch', `/ventas/planes/${ids.productora}`).send({ destacado: true });

    expect((await panel('put', '/ventas/planes/orden').send({ ids: [ids.inicial, ids.productora] })).body.codigo).toBe('ORDEN_INCOMPLETO');
    const orden = await panel('put', '/ventas/planes/orden').send({ ids: [ids.productora, ids.inicial, ids.empresa] });
    expect(orden.body.planes.map((p: { slug: string }) => p.slug)).toEqual(['productora', 'inicial', 'empresa']);
    await panel('put', '/ventas/planes/orden').send({ ids: [ids.inicial, ids.productora, ids.empresa] });

    expect((await panel('put', '/ventas/planes/ajustes').send({ mostrarAnual: true, descuentoAnual: 95, conIgv: false })).status).toBe(422);
    expect((await panel('put', '/ventas/planes/ajustes').send({ mostrarAnual: true, descuentoAnual: 15, conIgv: false })).body).toEqual({ mostrarAnual: true, descuentoAnual: 15, conIgv: false });
    expect((await panel('get', `/ventas/planes`)).body.planes[0].precioAnualEfectivo).toBe(4998);
    await panel('put', '/ventas/planes/ajustes').send({ mostrarAnual: true, descuentoAnual: 20, conIgv: false });

    expect((await auditoria('PLAN_CREADO')).map((a) => (a.datos as { slug: string }).slug)).toEqual(['inicial', 'productora', 'empresa']);
    expect((await auditoria('PLAN_EDITADO')).map((a) => a.datos)).toEqual([
      { slug: 'empresa', campos: ['destacado', 'visible'], visible: true, destacado: true },
      { slug: 'productora', campos: ['destacado'], destacado: true },
    ]);
    expect(await auditoria('PLAN_ORDEN_CAMBIADO')).toHaveLength(2);
    const ajustes = await auditoria('PLAN_AJUSTES_ACTUALIZADOS');
    expect(ajustes.map((a) => a.datos)).toEqual([
      { antes: { mostrarAnual: true, descuentoAnual: 20, conIgv: false }, despues: { mostrarAnual: true, descuentoAnual: 15, conIgv: false } },
      { antes: { mostrarAnual: true, descuentoAnual: 15, conIgv: false }, despues: { mostrarAnual: true, descuentoAnual: 20, conIgv: false } },
    ]);
    expect(ajustes.every((a) => a.organizacionId === null && a.entidad === 'Plan')).toBe(true);
  });

  it('CP-141 · subir la Productora a S/ 1.390 se ve en /precios y en el plan público solo al publicar', async () => {
    const p = await panel('post', '/sitio/paginas').send({ ruta: RUTA, titulo: 'Precios' });
    expect(p.status).toBe(201);
    paginaId = p.body.id;
    const b = await panel('post', `/sitio/paginas/${paginaId}/bloques`).send({ tipo: 'precios' });
    await panel('patch', `/sitio/paginas/${paginaId}/bloques/${b.body.id}`).send({ visible: true });
    expect((await panel('patch', `/sitio/paginas/${paginaId}`).send({ accion: 'publicar' })).status).toBe(200);
    expect((await publicar()).status).toBe(201);
    expect((await publico('productora')).body).toMatchObject({ precioMes: 1290, destacado: true });

    const cambio = await panel('patch', `/ventas/planes/${ids.productora}`).send({ precioMes: 1390 });
    expect(cambio.body).toMatchObject({ precioMes: 1390, precioAnualEfectivo: 13344 });
    expect((await auditoria('PLAN_EDITADO')).at(-1)?.datos).toEqual({ slug: 'productora', campos: ['precioMes'], precioMesAntes: 1290, precioMes: 1390 });
    expect((await publico('productora')).body.precioMes).toBe(1290); // aún la versión anterior
    expect((await panel('get', '/sitio/versiones')).body.pendientes).toBe(true);

    expect((await publicar()).status).toBe(201);
    const r = await publico('productora');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      slug: 'productora', nombre: 'Productora', descripcion: '', aMedida: false, precioMes: 1390, precioAnual: 13344, ahorroAnual: 3336, precioMesConIgv: 1640.2,
      capsulasMes: null, usuarios: null, capsulaAdicional: 69, textoBoton: 'Suscribirme', destacado: true, caracteristicas: ['20 cápsulas al mes'],
      enlace: '/agendar-demo?plan=productora', ajustes: { mostrarAnual: true, descuentoAnual: 20, conIgv: false },
    });
    expect(r.body).not.toHaveProperty('ficticio');
    const pagina = await html();
    expect(pagina).toContain('S/ 1,390');
    expect(pagina).toContain('o S/ 13,344 al año (ahorras S/ 3,336)');
    expect(pagina).toContain('href="/agendar-demo?plan=productora"');
    expect(pagina).toContain('<span class="badge5">Más elegido</span>');
    expect((await publico('empresa')).body).toMatchObject({ aMedida: true, precioMes: null, precioAnual: null });
  });

  it('CP-142 · un plan oculto deja de salir en /precios y su plan público da 404', async () => {
    await panel('patch', `/ventas/planes/${ids.inicial}`).send({ visible: false });
    expect((await publico('inicial')).status).toBe(200);
    await publicar();
    const r = await publico('inicial');
    expect(r.status).toBe(404);
    expect(r.body.codigo).toBe('NO_ENCONTRADO');
    expect(await html()).not.toContain('plan=inicial');
    expect((await publico('no-existe')).status).toBe(404);
  });

  it('en producción un plan ficticio visible bloquea publicar; en pruebas publica y el público de producción no lo ve', async () => {
    await panel('patch', `/ventas/planes/${ids.empresa}`).send({ ficticio: true });
    const bloqueo = await publicar();
    expect(bloqueo.status).toBe(409);
    expect(bloqueo.body.codigo).toBe('FICTICIOS_VISIBLES');
    expect(bloqueo.body.detalles).toEqual(expect.arrayContaining([{ id: 'empresa', coleccion: 'planes', nombre: 'Empresa' }]));

    process.env.SITIO_ENTORNO = 'pruebas';
    expect((await publicar()).status).toBe(201);
    expect((await publico('empresa')).status).toBe(200);
    process.env.SITIO_ENTORNO = 'produccion';
    expect((await publico('empresa')).status).toBe(404);
    expect(await html()).not.toContain('plan=empresa');

    // Sin páginas publicadas que muestren planes, un plan ficticio no bloquea (no se publica).
    await panel('patch', `/sitio/paginas/${paginaId}`).send({ accion: 'borrador' });
    const sinPlanes = await publicar();
    expect([201, 409]).toContain(sinPlanes.status);
    expect((sinPlanes.body.detalles ?? []).some((d: { coleccion: string }) => d.coleccion === 'planes')).toBe(false);
  });
});
