// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (versiones globales).
// HU-1511 · Sitio web › Blog (REQ-070, PNT-28) contra PostgreSQL, Redis y el S3 local reales: la URL de WordPress
// segura (solo https:// con dominio público), «Sincronizar ahora» en la cola, el orden y la visibilidad de categorías y
// artículos con su auditoría y el re-render de la versión vigente, GET /publico/blog sin lo oculto (CP-123, CP-155),
// otra URL borra la copia, la imagen copiada en /s/_blog/ y los permisos.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { COLA_MANTENIMIENTO, ID_BLOG_MANUAL, opcionesRedis, prefijoColas, TAREA_BLOG, TAREA_PRERENDER } from '@aptio/colas';
import { crearVersion, hashearClave, ID_BLOG, prisma, Rol } from '@aptio/db';
import { claveBlog, instantaneaDeEjemplo } from '@aptio/sitio';
import { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { AlmacenService } from '../src/recursos/almacen.service.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const endpoint = process.env.AWS_ENDPOINT ?? 'http://localhost:9000';
const hayS3 = await fetch(`${endpoint}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@sitio-blog.test`;
const almacen = new Almacen({ ...configDesdeEnv({ AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', ...process.env, AWS_ENDPOINT: endpoint }), bucket: 'aptio-pruebas-sitio-api' });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const IMAGEN = `${sufijo.padEnd(16, '0').replace(/[^0-9a-f]/g, 'a')}.png`;
const F = (d: number) => new Date(Date.UTC(2026, 10, d, 15));

describe.skipIf((!hayBase || !hayS3) && !process.env.CI)('Sitio web › Blog (HU-1511)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  let cola: Queue;
  let version = '';
  let respaldo: { blog: unknown[]; categorias: unknown[]; articulos: unknown[] } = { blog: [], categorias: [], articulos: [] };
  const enviar = (m: 'get' | 'post' | 'patch', r: string, b?: object, quien: 'super' | 'admin' = 'super') => {
    const req = request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);
    return b ? req.send(b) : req;
  };
  const publico = (r: string) => { app.get(LimitePublicoService).reiniciar(); return request(servidor).get(`/api/v1${r}`); };
  const ultimaAuditoria = () => prisma.auditoria.findFirst({ where: { entidad: 'SitioBlog', usuario: { email: correoDe('super') } }, orderBy: { creadoEn: 'desc' } });
  const rerenders = async () => (await cola.getJobs(['waiting', 'delayed'])).filter((j) => j.name === TAREA_PRERENDER && /-r\d+$/.test(j.id ?? '')).length;
  /** Lo que el worker dejaría tras sincronizar: tres categorías y cuatro artículos. */
  const copia = async () => {
    await prisma.wpArticulo.deleteMany();
    await prisma.wpCategoria.deleteMany();
    await prisma.wpCategoria.createMany({ data: [
      { id: 3, nombre: 'Guías', slug: 'guias', orden: 0, sincronizadoEn: new Date() },
      { id: 4, nombre: 'Casos', slug: 'casos', orden: 1, sincronizadoEn: new Date() },
      { id: 5, nombre: 'Noticias internas', slug: 'noticias-internas', orden: 2, sincronizadoEn: new Date() },
    ] });
    const art = (id: number, titulo: string, categorias: number[], d: number, extra: object = {}) => ({
      id, slug: `a-${id}`, titulo, extracto: `Resumen ${id}`, categorias, autor: 'Equipo Aptio', fecha: F(d), enlace: `https://blog.ejemplo.pe/a-${id}/`, sincronizadoEn: new Date(), ...extra,
    });
    await prisma.wpArticulo.createMany({ data: [
      art(10, 'Preparar un manual', [3], 4, { imagen: IMAGEN, imagenOrigen: 'https://blog.ejemplo.pe/x.png', imagenAncho: 768, imagenAlto: 432 }),
      art(11, 'Un caso de banca', [4], 3),
      art(12, 'Guía y caso a la vez', [3, 4], 2),
      art(13, 'Aniversario', [5], 1),
    ] });
  };

  beforeAll(async () => {
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    respaldo = { blog: await prisma.sitioBlog.findMany(), categorias: await prisma.wpCategoria.findMany(), articulos: await prisma.wpArticulo.findMany() };
    await prisma.wpArticulo.deleteMany();
    await prisma.wpCategoria.deleteMany();
    await prisma.sitioBlog.deleteMany();
    const org = await prisma.organizacion.create({ data: { nombre: 'Org blog', slug: `blog-${sufijo}` } });
    const hashClave = await hashearClave(CLAVE);
    const sup = await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
    // Una versión vigente, para ver que cada cambio pide volver a renderizarla.
    version = (await crearVersion(prisma, { origen: 'publicacion', entorno: 'pruebas', instantanea: instantaneaDeEjemplo('pruebas'), usuario: { id: sup.id, nombre: 'Super' } })).id;
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AlmacenService).useValue({ almacen }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    cola = new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
    for (const quien of ['super', 'admin'] as const) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correoDe(quien), clave: CLAVE });
      cookies[quien] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    for (const j of await cola.getJobs(['waiting', 'delayed'])) {
      if (j.id === ID_BLOG_MANUAL || (j.name === TAREA_PRERENDER && /-r\d+$/.test(j.id ?? ''))) await j.remove();
    }
    await cola.close();
    await prisma.wpArticulo.deleteMany();
    await prisma.wpCategoria.deleteMany();
    await prisma.sitioBlog.deleteMany();
    await prisma.sitioBlog.createMany({ data: respaldo.blog as never });
    await prisma.wpCategoria.createMany({ data: respaldo.categorias as never });
    await prisma.wpArticulo.createMany({ data: respaldo.articulos as never });
    await prisma.auditoria.deleteMany({ where: { OR: [{ entidadId: version }, { usuario: { email: { in: [correoDe('super'), correoDe('admin')] } } }] } });
    await prisma.sitioVersion.deleteMany({ where: { id: version } });
    await prisma.usuario.deleteMany({ where: { email: { in: [correoDe('super'), correoDe('admin')] } } });
    await prisma.organizacion.deleteMany({ where: { slug: `blog-${sufijo}` } });
  });

  it('solo el superadmin: el administrador recibe 403 y sin sesión 401', async () => {
    expect((await enviar('get', '/sitio/blog', undefined, 'admin')).status).toBe(403);
    expect((await enviar('post', '/sitio/blog/sincronizar', undefined, 'admin')).status).toBe(403);
    expect((await enviar('patch', '/sitio/blog/categorias/3', { visible: false }, 'admin')).status).toBe(403);
    expect((await request(servidor).get('/api/v1/sitio/blog')).status).toBe(401);
  });

  it('sin conectar: valores por defecto, «Sincronizar ahora» pide la URL y el público no ve nada', async () => {
    const r = await enviar('get', '/sitio/blog');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ url: null, frecuenciaMin: 15, porPagina: 6, mostrarImagen: true, mostrarAutor: true, sincronizadoEn: null, intentoEn: null, error: null, categorias: [], articulos: [] });
    const s = await enviar('post', '/sitio/blog/sincronizar');
    expect(s.status).toBe(422);
    expect(s.body.codigo).toBe('SIN_URL');
    expect((await publico('/publico/blog')).body).toEqual({ url: null, porPagina: 6, categorias: [], articulos: [] });
  });

  it('la URL es https:// con dominio público, sin usuario, clave ni parámetros; la frecuencia y el número por filtro tienen sus valores', async () => {
    const casos: [object, string, string][] = [
      [{ url: 'http://blog.ejemplo.pe' }, 'url', 'La URL del blog empieza con https://'],
      [{ url: 'https://10.0.0.5' }, 'url', 'La URL del blog usa un dominio, no una dirección IP'],
      [{ url: 'https://usuario:clave@blog.ejemplo.pe' }, 'url', 'La URL del blog va sin usuario, clave, puerto ni parámetros'],
      [{ url: 'https://localhost' }, 'url', 'La URL del blog necesita un dominio público'],
      [{ frecuenciaMin: 20 }, 'frecuenciaMin', 'La frecuencia es de 15, 30 o 60 minutos'],
      [{ porPagina: 20 }, 'porPagina', 'La sección muestra de 3 a 12 artículos'],
    ];
    for (const [cuerpo, campo, mensaje] of casos) {
      const r = await enviar('patch', '/sitio/blog', cuerpo);
      expect(r.status).toBe(422);
      expect(r.body).toMatchObject({ codigo: 'NO_VALIDO', detalles: [{ campo, mensaje }] });
    }
    expect((await enviar('patch', '/sitio/blog', {})).body.codigo).toBe('SIN_CAMBIOS');
  });

  it('al conectar guarda la URL sin / final, lo audita y pide sincronizar; «Sincronizar ahora» encola la lectura forzada', async () => {
    const r = await enviar('patch', '/sitio/blog', { url: 'https://blog.ejemplo.pe/', frecuenciaMin: 30 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ url: 'https://blog.ejemplo.pe', frecuenciaMin: 30 });
    expect((await ultimaAuditoria())).toMatchObject({ accion: 'SITIO_BLOG_ACTUALIZADO', datos: { campos: ['url', 'frecuenciaMin'], url: 'https://blog.ejemplo.pe', antes: null } });
    const job = await cola.getJob(ID_BLOG_MANUAL);
    expect(job?.name).toBe(TAREA_BLOG);
    expect(job?.data).toMatchObject({ forzar: true });

    await job?.remove();
    const s = await enviar('post', '/sitio/blog/sincronizar');
    expect(s.status).toBe(202);
    expect(s.body).toEqual({ encolado: true });
    expect((await cola.getJob(ID_BLOG_MANUAL))?.data).toMatchObject({ forzar: true });
    expect(await ultimaAuditoria()).toMatchObject({ accion: 'SITIO_BLOG_SINCRONIZACION_PEDIDA' });
    // Pedirlo otra vez mientras espera no duplica el trabajo.
    expect((await enviar('post', '/sitio/blog/sincronizar')).status).toBe(202);
    expect((await cola.getJobs(['waiting'])).filter((j) => j.name === TAREA_BLOG)).toHaveLength(1);
  });

  it('el panel lista la copia: categorías con su número de artículos y artículos con «Editar en WordPress» y su imagen', async () => {
    await copia();
    const r = await enviar('get', '/sitio/blog');
    expect(r.body.categorias.map((c: { nombre: string; articulos: number; visible: boolean }) => [c.nombre, c.articulos, c.visible])).toEqual([['Guías', 2, true], ['Casos', 2, true], ['Noticias internas', 1, true]]);
    expect(r.body.articulos.map((a: { id: number }) => a.id)).toEqual([10, 11, 12, 13]);
    expect(r.body.articulos[0]).toMatchObject({ editar: 'https://blog.ejemplo.pe/wp-admin/post.php?post=10&action=edit', imagen: `/s/_blog/${IMAGEN}`, autor: 'Equipo Aptio', visible: true });
  });

  it('CP-155: ocultar una categoría y un artículo vale al instante en /publico/blog, se audita y pide re-render', async () => {
    const antes = await publico('/publico/blog');
    expect(antes.body.categorias).toEqual([{ slug: 'guias', nombre: 'Guías', cantidad: 2 }, { slug: 'casos', nombre: 'Casos', cantidad: 2 }, { slug: 'noticias-internas', nombre: 'Noticias internas', cantidad: 1 }]);
    expect(antes.body.articulos[0]).toMatchObject({ id: 10, categorias: ['guias'], autor: 'Equipo Aptio', imagen: { archivo: IMAGEN, ancho: 768, alto: 432 } });

    const pedidos = await rerenders();
    const r = await enviar('patch', '/sitio/blog/categorias/5', { visible: false });
    expect(r.status).toBe(200);
    expect(r.body.categorias.find((c: { id: number }) => c.id === 5).visible).toBe(false);
    expect(await ultimaAuditoria()).toMatchObject({ accion: 'SITIO_BLOG_CATEGORIA_OCULTADA', entidadId: '5', datos: { nombre: 'Noticias internas' } });
    expect(await rerenders()).toBe(pedidos + 1);
    await enviar('patch', '/sitio/blog/articulos/11', { visible: false });
    expect(await ultimaAuditoria()).toMatchObject({ accion: 'SITIO_BLOG_ARTICULO_OCULTADO', entidadId: '11' });
    // Volver a mandar lo mismo no audita ni pide otro render.
    await enviar('patch', '/sitio/blog/articulos/11', { visible: false });
    expect(await rerenders()).toBe(pedidos + 2);

    const despues = await publico('/publico/blog');
    expect(despues.body.categorias).toEqual([{ slug: 'guias', nombre: 'Guías', cantidad: 2 }, { slug: 'casos', nombre: 'Casos', cantidad: 1 }]);
    expect(despues.body.articulos.map((a: { titulo: string }) => a.titulo)).toEqual(['Preparar un manual', 'Guía y caso a la vez']);
    const casos = await publico('/publico/blog?categoria=casos');
    expect(casos.body.articulos.map((a: { id: number; categorias: string[] }) => [a.id, a.categorias])).toEqual([[12, ['guias', 'casos']]]);
    expect((await publico('/publico/blog?categoria=noticias-internas')).status).toBe(404);
    expect((await publico('/publico/blog?categoria=No%20Vale')).status).toBe(422);
  });

  it('los filtros se ordenan con todos los ids; «Mostrar autor» apagado no lo manda al público', async () => {
    const r = await enviar('patch', '/sitio/blog/categorias', { orden: [4, 3, 5] });
    expect(r.status).toBe(200);
    expect(r.body.categorias.map((c: { id: number; orden: number }) => [c.id, c.orden])).toEqual([[4, 0], [3, 1], [5, 2]]);
    expect(await ultimaAuditoria()).toMatchObject({ accion: 'SITIO_BLOG_CATEGORIAS_ORDENADAS', datos: { orden: [4, 3, 5] } });
    for (const orden of [[4, 3], [4, 3, 5, 9], [4, 4, 5]]) expect((await enviar('patch', '/sitio/blog/categorias', { orden })).body.codigo).toBe('ORDEN_INVALIDO');
    expect((await publico('/publico/blog')).body.categorias.map((c: { slug: string }) => c.slug)).toEqual(['casos', 'guias']);

    await enviar('patch', '/sitio/blog', { mostrarAutor: false, porPagina: 3 });
    const p = await publico('/publico/blog');
    expect(p.body.porPagina).toBe(3);
    expect(p.body.articulos[0].autor).toBeUndefined();
    expect((await enviar('patch', '/sitio/blog/categorias/999', { visible: false })).status).toBe(404);
    expect((await enviar('patch', '/sitio/blog/articulos/999', { visible: false })).status).toBe(404);
    expect((await enviar('patch', '/sitio/blog/articulos/10', { visible: 'no' })).status).toBe(422);
  });

  it('la imagen copiada se sirve en /s/_blog/ con caché de un año; un nombre raro es 404', async () => {
    await almacen.subir(claveBlog(IMAGEN), PNG, 'image/png');
    const r = await request(servidor).get(`/s/_blog/${IMAGEN}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await request(servidor).get('/s/_blog/0000000000000000.png')).status).toBe(404);
    expect((await request(servidor).get('/s/_blog/foto.svg')).status).toBe(404);
  });

  it('otra URL es otro blog: la copia anterior se borra; vacía desconecta', async () => {
    const r = await enviar('patch', '/sitio/blog', { url: 'https://otro-blog.ejemplo.pe' });
    expect(r.body).toMatchObject({ url: 'https://otro-blog.ejemplo.pe', categorias: [], articulos: [], sincronizadoEn: null });
    const fuera = await enviar('patch', '/sitio/blog', { url: '' });
    expect(fuera.body.url).toBeNull();
    expect((await publico('/publico/blog')).body.articulos).toEqual([]);
    expect(await prisma.sitioBlog.findUnique({ where: { id: ID_BLOG } })).toMatchObject({ url: null });
  });
});
