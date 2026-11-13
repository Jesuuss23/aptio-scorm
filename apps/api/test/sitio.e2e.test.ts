// HU-1501 · CP-109: las rutas /sitio/* son solo del superadmin de plataforma (ADR-011). El administrador de una
// organización y el resto de los roles reciben 403; sin sesión, 401.
// HU-1502 · CP-110 y CP-111: páginas con estados (borrador, programada, publicada), el sitio público con su 404 y el
// sitemap, la publicación programada con un reloj controlado, auditoría y el límite de 60 peticiones por minuto en
// /publico/*. PostgreSQL real.
// HU-1503 · CP-112 y CP-113: bloques por página (ocultar conserva los datos, reordenar), cascada RN-16-4, validaciones,
// permisos y auditoría.
// HU-1504 · CP-114 y CP-115: contenido por colección (nace oculto, un testimonio oculto no sale en ninguna página),
// cascada página → bloque → elemento, texto plano (RN-16-7), orden, permisos y auditoría.
// HU-1505 · CP-116 y CP-117: ficticios visibles bloquean publicar en producción (409 con la lista) y en pruebas se
// publica con aviso; «Ocultar todos los ficticios», la segunda defensa del sitio público, permisos y auditoría.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, publicarProgramadas, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n.toLowerCase()}-${sufijo}@sitio.test`;
const ROLES_ORGANIZACION = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR', 'REVISOR_CLIENTE'] as const;

describe.skipIf(!hayBase && !process.env.CI)('sitio web solo para el superadmin (HU-1501)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let org = '';
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    org = (await prisma.organizacion.create({ data: { nombre: 'Org sitio', slug: `sitio-${sufijo}` } })).id;
    const cliente = (await prisma.cliente.create({ data: { organizacionId: org, nombre: 'Minera' } })).id;
    const hashClave = await hashearClave(CLAVE);
    for (const rol of ROLES_ORGANIZACION) {
      await prisma.usuario.create({
        data: { nombre: rol, email: correo(rol), rol: Rol[rol], organizacionId: org, hashClave, emailVerificado: true, ...(rol === 'REVISOR_CLIENTE' ? { clienteId: cliente } : {}) },
      });
    }
    await prisma.usuario.create({ data: { nombre: 'Super', email: correo('SUPERADMIN'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of [...ROLES_ORGANIZACION, 'SUPERADMIN']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      if (res.status !== 200) throw new Error(`No pudo ingresar ${n}: ${res.status}`);
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    const paginas = (await prisma.sitioPagina.findMany({ where: { ruta: { startsWith: `/prueba-${sufijo}` } }, select: { id: true } })).map((p) => p.id);
    await prisma.auditoria.deleteMany({ where: { entidad: 'SitioPagina', entidadId: { in: paginas } } });
    await prisma.sitioPagina.deleteMany({ where: { id: { in: paginas } } });
    await prisma.auditoria.deleteMany({ where: { OR: [{ organizacionId: org }, { usuario: { email: { endsWith: `-${sufijo}@sitio.test` } } }] } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@sitio.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: org } });
    await prisma.organizacion.deleteMany({ where: { id: org } });
  });

  it('CP-109: el administrador de una organización recibe 403 en GET /sitio/paginas', async () => {
    const res = await request(servidor).get('/api/v1/sitio/paginas').set('Cookie', cookies.ADMINISTRADOR!);
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toBe('Tu rol no permite esta acción');
  });

  it('ningún otro rol de la organización entra', async () => {
    const estados = [];
    for (const rol of ROLES_ORGANIZACION) estados.push([rol, (await request(servidor).get('/api/v1/sitio/paginas').set('Cookie', cookies[rol]!)).status]);
    expect(estados).toEqual(ROLES_ORGANIZACION.map((rol) => [rol, 403]));
  });

  it('sin sesión responde 401', async () => {
    expect((await request(servidor).get('/api/v1/sitio/paginas')).status).toBe(401);
  });

  it('el superadmin ve la lista de páginas', async () => {
    const res = await request(servidor).get('/api/v1/sitio/paginas').set('Cookie', cookies.SUPERADMIN!);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const yo = await request(servidor).get('/api/v1/yo').set('Cookie', cookies.SUPERADMIN!);
    expect(yo.body).toMatchObject({ rol: 'SUPERADMIN', clienteId: null });
  });

  describe('páginas con estados y programación (HU-1502)', () => {
    const ruta = (n: string) => `/prueba-${sufijo}-${n}`;
    const sa = () => ({
      get: (r: string) => request(servidor).get(`/api/v1${r}`).set('Cookie', cookies.SUPERADMIN!),
      post: (r: string, b: object) => request(servidor).post(`/api/v1${r}`).set('Cookie', cookies.SUPERADMIN!).send(b),
      patch: (r: string, b: object) => request(servidor).patch(`/api/v1${r}`).set('Cookie', cookies.SUPERADMIN!).send(b),
      delete: (r: string) => request(servidor).delete(`/api/v1${r}`).set('Cookie', cookies.SUPERADMIN!),
    });
    const publica = (r: string, idioma = 'es') => request(servidor).get('/api/v1/publico/paginas').query({ ruta: r, idioma });
    const sitemap = async () => (await request(servidor).get('/api/v1/publico/sitemap.xml')).text;
    const reiniciarLimite = () => app.get(LimitePublicoService).reiniciar();
    const auditorias = (id: string) => prisma.auditoria.findMany({ where: { entidad: 'SitioPagina', entidadId: id }, orderBy: { creadoEn: 'asc' } });

    it('CP-110: un borrador da 404 en el sitio y no entra al sitemap; al publicarlo, 200 y entra', async () => {
      reiniciarLimite();
      const creada = await sa().post('/sitio/paginas', { ruta: ruta('precios'), idioma: 'es', titulo: 'Precios' });
      expect(creada.status).toBe(201);
      expect(creada.body).toMatchObject({ ruta: ruta('precios'), idioma: 'es', estado: 'BORRADOR', publicarEn: null, publicadaEn: null });
      const id = creada.body.id as string;

      const r404 = await publica(ruta('precios'));
      expect(r404.status).toBe(404);
      expect(r404.body.codigo).toBe('NO_ENCONTRADO');
      expect(await sitemap()).not.toContain(ruta('precios'));

      const pub = await sa().patch(`/sitio/paginas/${id}`, { accion: 'publicar' });
      expect(pub.status).toBe(200);
      expect(pub.body).toMatchObject({ estado: 'PUBLICADA', publicarEn: null });
      expect(pub.body.publicadaEn).toEqual(expect.any(String));
      const ok = await publica(ruta('precios'));
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ ruta: ruta('precios'), idioma: 'es', titulo: 'Precios', publicadaEn: pub.body.publicadaEn, bloques: [] });
      const sm = await request(servidor).get('/api/v1/publico/sitemap.xml');
      expect(sm.headers['content-type']).toMatch(/^application\/xml/);
      expect(sm.text).toContain(`<loc>https://aptioscorm.com${ruta('precios')}</loc>`);
      // En inglés no existe: 404.
      expect((await publica(ruta('precios'), 'en')).status).toBe(404);

      // De vuelta a borrador: otra vez 404 y fuera del sitemap.
      const borr = await sa().patch(`/sitio/paginas/${id}`, { accion: 'borrador' });
      expect(borr.body.estado).toBe('BORRADOR');
      expect((await publica(ruta('precios'))).status).toBe(404);
      expect(await sitemap()).not.toContain(ruta('precios'));

      expect((await auditorias(id)).map((a) => [a.accion, a.usuarioId, a.organizacionId])).toEqual([
        ['SITIO_PAGINA_CREADA', expect.any(String), null], ['SITIO_PAGINA_PUBLICADA', expect.any(String), null], ['SITIO_PAGINA_A_BORRADOR', expect.any(String), null],
      ]);
    });

    it('CP-111: una página programada sigue en 404 hasta su hora y luego queda publicada y en el sitemap', async () => {
      reiniciarLimite();
      const hora = new Date(Date.now() + 60 * 60_000);
      hora.setUTCSeconds(0, 0);
      // 09:00 de Lima del día de la prueba, expresada con su zona.
      const enLima = new Date(hora.getTime() - 5 * 3600_000).toISOString().replace(/\.\d{3}Z$/, '-05:00');
      const res = await sa().post('/sitio/paginas', { ruta: ruta('demo'), titulo: 'Agendar demo', accion: 'programar', publicarEn: enLima });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ estado: 'PROGRAMADA', publicarEn: hora.toISOString(), publicadaEn: null });
      expect((await publica(ruta('demo'))).status).toBe(404);
      expect(await sitemap()).not.toContain(ruta('demo'));

      // Reloj controlado: un segundo antes no se publica; a la hora, sí (el worker la corre cada 30 s).
      expect(await publicarProgramadas(prisma, new Date(hora.getTime() - 1000))).not.toContain(res.body.id);
      expect((await publica(ruta('demo'))).status).toBe(404);
      expect(await publicarProgramadas(prisma, new Date(hora.getTime() + 30_000))).toContain(res.body.id);
      const ok = await publica(ruta('demo'));
      expect(ok.status).toBe(200);
      expect(new Date(ok.body.publicadaEn).getTime() - hora.getTime()).toBeLessThan(60_000);
      expect(await sitemap()).toContain(ruta('demo'));
      expect((await auditorias(res.body.id)).map((a) => a.accion)).toEqual(['SITIO_PAGINA_CREADA', 'SITIO_PAGINA_PUBLICADA']);
    });

    it('programar exige una fecha futura con zona; volver a borrador la limpia', async () => {
      const p = (await sa().post('/sitio/paginas', { ruta: ruta('programar'), titulo: 'Programar' })).body;
      const pasado = await sa().patch(`/sitio/paginas/${p.id}`, { accion: 'programar', publicarEn: '2020-01-01T09:00:00-05:00' });
      expect([pasado.status, pasado.body.codigo]).toEqual([422, 'PUBLICAR_EN_PASADO']);
      const sinFecha = await sa().patch(`/sitio/paginas/${p.id}`, { accion: 'programar' });
      expect([sinFecha.status, sinFecha.body.codigo]).toEqual([422, 'PUBLICAR_EN_REQUERIDO']);
      expect((await sa().patch(`/sitio/paginas/${p.id}`, { accion: 'programar', publicarEn: '2099-01-01T09:00' })).status).toBe(422);
      expect((await sa().patch(`/sitio/paginas/${p.id}`, { accion: 'programar', publicarEn: '2099-02-31T09:00:00-05:00' })).status).toBe(422);
      expect((await sa().patch(`/sitio/paginas/${p.id}`, { publicarEn: '2099-01-01T09:00:00-05:00' })).body.codigo).toBe('PUBLICAR_EN_SIN_PROGRAMAR');
      const prog = await sa().patch(`/sitio/paginas/${p.id}`, { accion: 'programar', publicarEn: '2099-01-01T09:00:00-05:00' });
      expect(prog.body).toMatchObject({ estado: 'PROGRAMADA', publicarEn: '2099-01-01T14:00:00.000Z' });
      const borr = await sa().patch(`/sitio/paginas/${p.id}`, { accion: 'borrador' });
      expect(borr.body).toMatchObject({ estado: 'BORRADOR', publicarEn: null });
    });

    it('valida la ruta, el título y el idioma, y no duplica ruta e idioma (409)', async () => {
      const malas = ['precios', '/Precios', '/precios/', '/pre cios', '//x', '/a_b', '/-a'];
      const estados = [];
      for (const mala of malas) estados.push([mala, (await sa().post('/sitio/paginas', { ruta: mala, titulo: 'X' })).status]);
      expect(estados).toEqual(malas.map((m) => [m, 422]));
      expect((await sa().post('/sitio/paginas', { ruta: ruta('t'), titulo: '' })).status).toBe(422);
      expect((await sa().post('/sitio/paginas', { ruta: ruta('t'), titulo: 'X', idioma: 'fr' })).status).toBe(422);
      expect((await sa().post('/sitio/paginas', { ruta: ruta('t'), titulo: 'X', extra: 1 })).status).toBe(422);
      expect((await sa().post('/sitio/paginas', { ruta: `${ruta('sectores')}/mineria-y-energia`, titulo: 'Minería' })).status).toBe(201);
      const dup = await sa().post('/sitio/paginas', { ruta: `${ruta('sectores')}/mineria-y-energia`, titulo: 'Otra' });
      expect([dup.status, dup.body.codigo]).toEqual([409, 'RUTA_EN_USO']);
      // Misma ruta en inglés: sí.
      expect((await sa().post('/sitio/paginas', { ruta: `${ruta('sectores')}/mineria-y-energia`, titulo: 'Mining', idioma: 'en' })).status).toBe(201);
    });

    it('la ruta no cambia en una publicada (422); el título sí; en borrador cambia la ruta', async () => {
      const p = (await sa().post('/sitio/paginas', { ruta: ruta('producto'), titulo: 'Producto', accion: 'publicar' })).body;
      expect(p.estado).toBe('PUBLICADA');
      const r = await sa().patch(`/sitio/paginas/${p.id}`, { ruta: ruta('producto-2') });
      expect([r.status, r.body.codigo]).toEqual([422, 'RUTA_PUBLICADA']);
      const t = await sa().patch(`/sitio/paginas/${p.id}`, { titulo: 'Producto nuevo' });
      expect(t.body).toMatchObject({ titulo: 'Producto nuevo', estado: 'PUBLICADA', ruta: ruta('producto') });
      await sa().patch(`/sitio/paginas/${p.id}`, { accion: 'borrador' });
      const c = await sa().patch(`/sitio/paginas/${p.id}`, { ruta: ruta('producto-2') });
      expect(c.body.ruta).toBe(ruta('producto-2'));
      const editadas = (await auditorias(p.id)).filter((a) => a.accion === 'SITIO_PAGINA_EDITADA');
      expect(editadas.map((a) => a.datos)).toEqual([
        expect.objectContaining({ titulo: 'Producto nuevo' }), expect.objectContaining({ ruta: ruta('producto-2'), antes: expect.objectContaining({ ruta: ruta('producto') }) }),
      ]);
    });

    it('solo se borra un borrador (422 en programada o publicada), con auditoría', async () => {
      const prog = (await sa().post('/sitio/paginas', { ruta: ruta('b1'), titulo: 'B1', accion: 'programar', publicarEn: '2099-01-01T09:00:00-05:00' })).body;
      const pub = (await sa().post('/sitio/paginas', { ruta: ruta('b2'), titulo: 'B2', accion: 'publicar' })).body;
      const borr = (await sa().post('/sitio/paginas', { ruta: ruta('b3'), titulo: 'B3' })).body;
      for (const p of [prog, pub]) {
        const r = await sa().delete(`/sitio/paginas/${p.id}`);
        expect([r.status, r.body.codigo]).toEqual([422, 'PAGINA_NO_BORRADOR']);
      }
      expect((await sa().delete(`/sitio/paginas/${borr.id}`)).status).toBe(204);
      expect(await prisma.sitioPagina.findUnique({ where: { id: borr.id } })).toBeNull();
      expect((await auditorias(borr.id)).map((a) => a.accion)).toEqual(['SITIO_PAGINA_CREADA', 'SITIO_PAGINA_BORRADA']);
      expect((await sa().delete(`/sitio/paginas/${borr.id}`)).status).toBe(404);
      expect((await sa().patch('/sitio/paginas/no-es-uuid', { titulo: 'x' })).status).toBe(400);
    });

    it('CP-109: ningún rol de la organización crea, cambia ni borra páginas; sin sesión, 401', async () => {
      const p = (await sa().post('/sitio/paginas', { ruta: ruta('rbac'), titulo: 'RBAC' })).body;
      const estados = [];
      for (const rol of ROLES_ORGANIZACION) {
        const c = cookies[rol]!;
        estados.push([rol,
          (await request(servidor).post('/api/v1/sitio/paginas').set('Cookie', c).send({ ruta: ruta('x'), titulo: 'X' })).status,
          (await request(servidor).patch(`/api/v1/sitio/paginas/${p.id}`).set('Cookie', c).send({ accion: 'publicar' })).status,
          (await request(servidor).delete(`/api/v1/sitio/paginas/${p.id}`).set('Cookie', c)).status]);
      }
      expect(estados).toEqual(ROLES_ORGANIZACION.map((rol) => [rol, 403, 403, 403]));
      expect((await request(servidor).post('/api/v1/sitio/paginas').send({ ruta: ruta('x'), titulo: 'X' })).status).toBe(401);
      expect((await request(servidor).patch(`/api/v1/sitio/paginas/${p.id}`).send({ accion: 'publicar' })).status).toBe(401);
      expect((await prisma.sitioPagina.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('BORRADOR');
    });

    it('limita /publico/* a 60 peticiones por minuto por IP (429) sin tocar las rutas con sesión', async () => {
      reiniciarLimite();
      const estados: number[] = [];
      for (let i = 0; i < 61; i++) estados.push((await request(servidor).get('/api/v1/publico/sitemap.xml')).status);
      expect(estados.slice(0, 60).every((e) => e === 200)).toBe(true);
      expect(estados[60]).toBe(429);
      const r = await publica(ruta('precios'));
      expect(r.status).toBe(429);
      expect(r.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
      expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
      expect((await sa().get('/sitio/paginas')).status).toBe(200);
      reiniciarLimite();
      expect((await request(servidor).get('/api/v1/publico/sitemap.xml')).status).toBe(200);
    });
  });
  describe('editor de página por bloques (HU-1503)', () => {
    const ruta = (n: string) => `/prueba-${sufijo}-b-${n}`;
    const enviar = (m: 'get' | 'post' | 'patch' | 'delete', r: string, b?: object, c = cookies.SUPERADMIN) => {
      const req = request(servidor)[m](`/api/v1${r}`);
      if (c) req.set('Cookie', c);
      return b ? req.send(b) : req;
    };
    const publica = (r: string) => request(servidor).get('/api/v1/publico/paginas').query({ ruta: r, idioma: 'es' });
    const reiniciarLimite = () => app.get(LimitePublicoService).reiniciar();
    const nuevaPagina = async (n: string) => (await enviar('post', '/sitio/paginas', { ruta: ruta(n), titulo: `Inicio ${n}` })).body.id as string;
    const agregar = async (pagina: string, tipo: string, ajustes?: object) => {
      const r = await enviar('post', `/sitio/paginas/${pagina}/bloques`, { tipo, ...(ajustes ? { ajustes } : {}) });
      if (r.status !== 201) throw new Error(`agregar ${tipo}: ${r.status} ${JSON.stringify(r.body)}`);
      return r.body as { id: string; tipo: string; orden: number; visible: boolean };
    };
    const mostrar = (pagina: string, bloque: string, visible: boolean) => enviar('patch', `/sitio/paginas/${pagina}/bloques/${bloque}`, { visible });

    it('un bloque nuevo va al final y oculto (RN-16-2); la lista sale por orden', async () => {
      const p = await nuevaPagina('nuevo');
      expect((await enviar('get', `/sitio/paginas/${p}/bloques`)).body).toEqual([]);
      const a = await agregar(p, 'hero');
      const b = await agregar(p, 'cta');
      expect([a.orden, a.visible, b.orden, b.visible]).toEqual([0, false, 1, false]);
      const lista = await enviar('get', `/sitio/paginas/${p}/bloques`);
      expect(lista.status).toBe(200);
      expect(lista.body.map((x: { tipo: string }) => x.tipo)).toEqual(['hero', 'cta']);
    });

    it('CP-112: ocultar Testimonios lo saca del sitio y conserva sus datos', async () => {
      reiniciarLimite();
      const p = await nuevaPagina('cp112');
      const hero = await agregar(p, 'hero');
      const datos = { titulo: 'Lo que dicen', items: [{ autor: 'Ana', texto: 'Muy útil' }] };
      const testi = await agregar(p, 'testimonios', datos);
      await mostrar(p, hero.id, true);
      expect((await mostrar(p, testi.id, true)).body.visible).toBe(true);
      await enviar('patch', `/sitio/paginas/${p}`, { accion: 'publicar' });
      const sinElementos = (r: { body: { bloques: { tipo: string; ajustes: unknown }[] } }) => r.body.bloques.map(({ tipo, ajustes }) => ({ tipo, ajustes }));
      expect(sinElementos(await publica(ruta('cp112')))).toEqual([{ tipo: 'hero', ajustes: null }, { tipo: 'testimonios', ajustes: datos }]);

      const oculto = await mostrar(p, testi.id, false);
      expect(oculto.status).toBe(200);
      expect(oculto.body).toMatchObject({ visible: false, ajustes: datos });
      expect((await publica(ruta('cp112'))).body.bloques).toEqual([{ tipo: 'hero', ajustes: null }]);
      const admin = (await enviar('get', `/sitio/paginas/${p}/bloques`)).body as { id: string; ajustes: unknown }[];
      expect(admin.find((x) => x.id === testi.id)?.ajustes).toEqual(datos);
    });

    it('CP-113: mover Logos sobre Cifras cambia el orden en el sitio', async () => {
      reiniciarLimite();
      const p = await nuevaPagina('cp113');
      const bloques = [await agregar(p, 'hero'), await agregar(p, 'metricas'), await agregar(p, 'logos'), await agregar(p, 'cta')];
      for (const b of bloques) await mostrar(p, b.id, true);
      await enviar('patch', `/sitio/paginas/${p}`, { accion: 'publicar' });
      const tipos = async () => ((await publica(ruta('cp113'))).body.bloques as { tipo: string }[]).map((b) => b.tipo);
      expect(await tipos()).toEqual(['hero', 'metricas', 'logos', 'cta']);
      const [hero, cifras, logos, cta] = bloques.map((b) => b.id) as [string, string, string, string];
      const r = await enviar('patch', `/sitio/paginas/${p}/bloques`, { orden: [hero, logos, cifras, cta] });
      expect(r.status).toBe(200);
      expect(r.body.map((b: { tipo: string; orden: number }) => [b.tipo, b.orden])).toEqual([['hero', 0], ['logos', 1], ['metricas', 2], ['cta', 3]]);
      expect(await tipos()).toEqual(['hero', 'logos', 'metricas', 'cta']);
    });

    it('RN-16-4: si la página vuelve a borrador no se expone ni ella ni sus bloques', async () => {
      reiniciarLimite();
      const p = await nuevaPagina('cascada');
      await mostrar(p, (await agregar(p, 'hero')).id, true);
      await enviar('patch', `/sitio/paginas/${p}`, { accion: 'publicar' });
      expect((await publica(ruta('cascada'))).body.bloques).toHaveLength(1);
      await enviar('patch', `/sitio/paginas/${p}`, { accion: 'borrador' });
      const r = await publica(ruta('cascada'));
      expect(r.status).toBe(404);
      expect(r.body.bloques).toBeUndefined();
    });

    it('rechaza tipos fuera del catálogo y órdenes con bloques faltantes, repetidos o ajenos (422)', async () => {
      const p = await nuevaPagina('validar');
      const otra = await nuevaPagina('validar-otra');
      const [a, b] = [await agregar(p, 'hero'), await agregar(p, 'faq')];
      const ajeno = await agregar(otra, 'cta');
      const tipo = await enviar('post', `/sitio/paginas/${p}/bloques`, { tipo: 'video' });
      const extra = await enviar('post', `/sitio/paginas/${p}/bloques`, { tipo: 'hero', orden: 3 });
      const grandes = await enviar('post', `/sitio/paginas/${p}/bloques`, { tipo: 'hero', ajustes: { t: 'x'.repeat(20_001) } });
      const ordenes = [[a.id], [a.id, a.id, b.id], [a.id, b.id, ajeno.id], [b.id, ajeno.id]];
      const res = [];
      for (const orden of ordenes) {
        const r = await enviar('patch', `/sitio/paginas/${p}/bloques`, { orden });
        res.push([r.status, r.body.codigo, r.body.detalles?.[0]?.tipo]);
      }
      expect([tipo.status, extra.status, grandes.status, grandes.body.codigo]).toEqual([422, 422, 422, 'AJUSTES_GRANDES']);
      expect(res).toEqual([[422, 'ORDEN_INVALIDO', 'FALTANTE'], [422, 'ORDEN_INVALIDO', 'DUPLICADO'], [422, 'ORDEN_INVALIDO', 'AJENO'], [422, 'ORDEN_INVALIDO', 'AJENO']]);
      expect((await enviar('patch', `/sitio/paginas/${p}/bloques/${b.id}`, {})).status).toBe(422);
      // Un bloque de otra página no se toca desde esta: 404.
      expect((await mostrar(p, ajeno.id, true)).status).toBe(404);
      expect((await enviar('get', '/sitio/paginas/00000000-0000-4000-8000-000000000000/bloques')).status).toBe(404);
      expect((await enviar('get', '/sitio/paginas/no-es-uuid/bloques')).status).toBe(400);
      expect((await enviar('get', `/sitio/paginas/${p}/bloques`)).body.map((x: { id: string }) => x.id)).toEqual([a.id, b.id]);
    });

    it('borrar un bloque compacta el orden; borrar la página borra sus bloques', async () => {
      const p = await nuevaPagina('borrar');
      const [a, b, c] = [await agregar(p, 'hero'), await agregar(p, 'faq'), await agregar(p, 'cta')];
      expect((await enviar('delete', `/sitio/paginas/${p}/bloques/${b.id}`)).status).toBe(204);
      const lista = (await enviar('get', `/sitio/paginas/${p}/bloques`)).body as { id: string; orden: number }[];
      expect(lista.map((x) => [x.id, x.orden])).toEqual([[a.id, 0], [c.id, 1]]);
      expect((await agregar(p, 'logos')).orden).toBe(2);
      expect((await enviar('delete', `/sitio/paginas/${p}`)).status).toBe(204);
      expect(await prisma.sitioBloque.count({ where: { paginaId: p } })).toBe(0);
    });

    it('solo el superadmin: 403 a los roles de organización y 401 sin sesión', async () => {
      const p = await nuevaPagina('permisos');
      const b = await agregar(p, 'hero');
      const estados = [];
      for (const rol of ROLES_ORGANIZACION) {
        const c = cookies[rol]!;
        estados.push([rol,
          (await enviar('get', `/sitio/paginas/${p}/bloques`, undefined, c)).status,
          (await enviar('post', `/sitio/paginas/${p}/bloques`, { tipo: 'cta' }, c)).status,
          (await enviar('patch', `/sitio/paginas/${p}/bloques`, { orden: [b.id] }, c)).status,
          (await enviar('patch', `/sitio/paginas/${p}/bloques/${b.id}`, { visible: true }, c)).status,
          (await enviar('delete', `/sitio/paginas/${p}/bloques/${b.id}`, undefined, c)).status]);
      }
      expect(estados).toEqual(ROLES_ORGANIZACION.map((rol) => [rol, 403, 403, 403, 403, 403]));
      expect([
        (await enviar('get', `/sitio/paginas/${p}/bloques`, undefined, '')).status,
        (await enviar('patch', `/sitio/paginas/${p}/bloques/${b.id}`, { visible: true }, '')).status,
      ]).toEqual([401, 401]);
      expect((await prisma.sitioBloque.findUniqueOrThrow({ where: { id: b.id } })).visible).toBe(false);
    });

    it('cada cambio de bloques queda en la auditoría', async () => {
      const p = await nuevaPagina('auditoria');
      const [a, b] = [await agregar(p, 'hero'), await agregar(p, 'testimonios', { titulo: 'T' })];
      await mostrar(p, b.id, true);
      await mostrar(p, b.id, true); // sin cambio: no audita
      await mostrar(p, b.id, false);
      await enviar('patch', `/sitio/paginas/${p}/bloques`, { orden: [b.id, a.id] });
      await enviar('patch', `/sitio/paginas/${p}/bloques`, { orden: [b.id, a.id] }); // mismo orden: no audita
      await enviar('delete', `/sitio/paginas/${p}/bloques/${a.id}`);
      const filas = await prisma.auditoria.findMany({
        where: { entidadId: { in: [p, a.id, b.id] }, accion: { startsWith: 'SITIO_BLOQUE' } }, orderBy: { creadoEn: 'asc' },
      });
      expect(filas.map((f) => [f.accion, f.entidad, f.organizacionId])).toEqual([
        ['SITIO_BLOQUE_AGREGADO', 'SitioBloque', null], ['SITIO_BLOQUE_AGREGADO', 'SitioBloque', null],
        ['SITIO_BLOQUE_MOSTRADO', 'SitioBloque', null], ['SITIO_BLOQUE_OCULTADO', 'SitioBloque', null],
        ['SITIO_BLOQUES_REORDENADOS', 'SitioPagina', null], ['SITIO_BLOQUE_BORRADO', 'SitioBloque', null],
      ]);
      expect(filas[4]!.datos).toMatchObject({ antes: [a.id, b.id], despues: [b.id, a.id] });
      expect(filas[5]!.datos).toMatchObject({ tipo: 'hero', nombre: 'Portada' });
    });
  });
  describe('contenido administrable (HU-1504)', () => {
    const ruta = (n: string) => `/prueba-${sufijo}-c-${n}`;
    const marca = `zz-${sufijo}`;
    const creados: string[] = [];
    const enviar = (m: 'get' | 'post' | 'patch' | 'delete', r: string, b?: object, c = cookies.SUPERADMIN) => {
      const req = request(servidor)[m](`/api/v1${r}`);
      if (c) req.set('Cookie', c);
      return b ? req.send(b) : req;
    };
    const publica = (r: string) => request(servidor).get('/api/v1/publico/paginas').query({ ruta: r, idioma: 'es' });
    const reiniciarLimite = () => app.get(LimitePublicoService).reiniciar();
    const elemento = async (coleccion: string, datos: object) => {
      const r = await enviar('post', '/sitio/elementos', { coleccion, datos });
      if (r.status !== 201) throw new Error(`elemento ${coleccion}: ${r.status} ${JSON.stringify(r.body)}`);
      creados.push(r.body.id);
      return r.body as { id: string; orden: number; visible: boolean; datos: Record<string, unknown> };
    };
    const testimonio = (nombre: string) => elemento('testimonios', { nombre: `${nombre} ${marca}`, cargo: 'Jefa', empresa: 'Minera', texto: 'Muy útil.', estrellas: 5 });
    const mostrar = (id: string, visible = true) => enviar('patch', `/sitio/elementos/${id}`, { visible });
    /** Página publicada con los bloques visibles indicados. */
    const paginaCon = async (n: string, tipos: string[], { publicar = true, ocultar = [] as string[] } = {}) => {
      const p = (await enviar('post', '/sitio/paginas', { ruta: ruta(n), titulo: n })).body.id as string;
      for (const tipo of tipos) {
        const b = (await enviar('post', `/sitio/paginas/${p}/bloques`, { tipo })).body.id as string;
        if (!ocultar.includes(tipo)) await enviar('patch', `/sitio/paginas/${p}/bloques/${b}`, { visible: true });
      }
      if (publicar) await enviar('patch', `/sitio/paginas/${p}`, { accion: 'publicar' });
      return p;
    };
    const nombresEn = async (r: string, tipo: string) => {
      const res = await publica(r);
      const bloque = (res.body.bloques as { tipo: string; elementos?: { datos: { nombre?: string; pregunta?: string } }[] }[] | undefined)?.find((b) => b.tipo === tipo);
      return bloque?.elementos?.map((e) => e.datos.nombre ?? e.datos.pregunta).filter((x) => x?.endsWith(marca)) ?? null;
    };

    afterAll(async () => {
      await prisma.sitioElemento.deleteMany({ where: { id: { in: creados } } });
    });

    it('CP-115: una cifra nueva queda oculta y al final de su colección', async () => {
      const antes = (await enviar('get', '/sitio/elementos?coleccion=cifras')).body as unknown[];
      const c = await elemento('cifras', { valor: '4 días', etiqueta: `para entregar ${marca}` });
      expect([c.visible, c.orden]).toEqual([false, antes.length]);
      const lista = (await enviar('get', '/sitio/elementos?coleccion=cifras')).body as { id: string; visible: boolean }[];
      expect(lista.at(-1)).toMatchObject({ id: c.id, visible: false });
    });

    it('CP-114: un testimonio oculto no aparece en ninguna de dos páginas publicadas con Testimonios', async () => {
      reiniciarLimite();
      const a = await testimonio('Ana');
      const b = await testimonio('Beto');
      await mostrar(a.id);
      await mostrar(b.id);
      await paginaCon('cp114-a', ['hero', 'testimonios']);
      await paginaCon('cp114-b', ['testimonios', 'cta']);
      expect(await nombresEn(ruta('cp114-a'), 'testimonios')).toEqual([`Ana ${marca}`, `Beto ${marca}`]);
      const oculto = await mostrar(b.id, false);
      expect(oculto.body).toMatchObject({ visible: false, datos: { nombre: `Beto ${marca}` } });
      expect([await nombresEn(ruta('cp114-a'), 'testimonios'), await nombresEn(ruta('cp114-b'), 'testimonios')]).toEqual([[`Ana ${marca}`], [`Ana ${marca}`]]);
      // El bloque sin colección no trae elementos.
      expect((await publica(ruta('cp114-a'))).body.bloques[0]).toEqual({ tipo: 'hero', ajustes: null });
    });

    it('RN-16-4: un elemento visible no sale si su bloque está oculto o la página no está publicada', async () => {
      reiniciarLimite();
      const l = await elemento('logos', { nombre: `Logo ${marca}` });
      await mostrar(l.id);
      await paginaCon('cascada-a', ['hero', 'logos'], { ocultar: ['logos'] });
      const res = await publica(ruta('cascada-a'));
      expect(res.body.bloques.map((x: { tipo: string }) => x.tipo)).toEqual(['hero']);
      await paginaCon('cascada-b', ['logos'], { publicar: false });
      expect((await publica(ruta('cascada-b'))).status).toBe(404);
    });

    it('preguntas: las generales en todas las páginas y las de una ruta solo en esa', async () => {
      reiniciarLimite();
      const g = await elemento('preguntas', { pregunta: `¿General? ${marca}`, respuesta: 'Sí.' });
      const p = await elemento('preguntas', { pregunta: `¿De precios? ${marca}`, respuesta: 'Sí.', pagina: ruta('faq-precios') });
      await mostrar(g.id);
      await mostrar(p.id);
      await paginaCon('faq-precios', ['faq']);
      await paginaCon('faq-otra', ['faq']);
      expect(await nombresEn(ruta('faq-precios'), 'faq')).toEqual([`¿General? ${marca}`, `¿De precios? ${marca}`]);
      expect(await nombresEn(ruta('faq-otra'), 'faq')).toEqual([`¿General? ${marca}`]);
    });

    it('edita los datos validando la colección; vaciar un opcional lo quita', async () => {
      const x = await elemento('lms', { nombre: `Canvas ${marca}`, nota: 'Perfil' });
      const r = await enviar('patch', `/sitio/elementos/${x.id}`, { datos: { nota: '' } });
      expect(r.status).toBe(200);
      expect(r.body.datos).toEqual({ nombre: `Canvas ${marca}` });
      const r2 = await enviar('patch', `/sitio/elementos/${x.id}`, { datos: { nota: 'Nueva' }, visible: true });
      expect(r2.body).toMatchObject({ visible: true, datos: { nombre: `Canvas ${marca}`, nota: 'Nueva' } });
    });

    it('rechaza colecciones, campos y HTML no válidos (422 RN-16-7) y órdenes incompletos', async () => {
      const x = await elemento('pasos', { titulo: `Paso ${marca}`, texto: 'Texto' });
      const casos = [
        await enviar('get', '/sitio/elementos?coleccion=planes'),
        await enviar('get', '/sitio/elementos'),
        await enviar('post', '/sitio/elementos', { coleccion: 'planes', datos: {} }),
        await enviar('post', '/sitio/elementos', { coleccion: 'pasos', datos: { titulo: 'Solo título' } }),
        await enviar('post', '/sitio/elementos', { coleccion: 'pasos', datos: { titulo: '<b>Hola</b>', texto: 'x' } }),
        await enviar('post', '/sitio/elementos', { coleccion: 'pasos', datos: { titulo: 'T', texto: 'x', url: 'http://x' } }),
        await enviar('patch', `/sitio/elementos/${x.id}`, { datos: { texto: '<script>alert(1)</script>' } }),
        await enviar('patch', `/sitio/elementos/${x.id}`, {}),
      ];
      expect(casos.map((r) => r.status)).toEqual([422, 422, 422, 422, 422, 422, 422, 422]);
      expect(casos.slice(3, 7).map((r) => r.body.codigo)).toEqual(['DATOS_NO_VALIDOS', 'DATOS_NO_VALIDOS', 'DATOS_NO_VALIDOS', 'DATOS_NO_VALIDOS']);
      expect(casos[4]!.body.detalles).toEqual([{ campo: 'titulo', mensaje: 'Título solo admite texto, sin etiquetas HTML' }]);
      expect(casos[7]!.body.codigo).toBe('SIN_CAMBIOS');
      expect((await prisma.sitioElemento.findUniqueOrThrow({ where: { id: x.id } })).datos).toEqual({ titulo: `Paso ${marca}`, texto: 'Texto' });

      const todos = ((await enviar('get', '/sitio/elementos?coleccion=pasos')).body as { id: string }[]).map((e) => e.id);
      const otra = await elemento('lms', { nombre: `Otro ${marca}` });
      const ordenes = [todos.slice(1), [...todos, todos[0]!], [...todos, otra.id]];
      const res = [];
      for (const orden of ordenes) {
        const r = await enviar('patch', '/sitio/elementos', { coleccion: 'pasos', orden });
        res.push([r.status, r.body.codigo, r.body.detalles?.[0]?.tipo]);
      }
      expect(res).toEqual([[422, 'ORDEN_INVALIDO', 'FALTANTE'], [422, 'ORDEN_INVALIDO', 'DUPLICADO'], [422, 'ORDEN_INVALIDO', 'AJENO']]);
      expect((await enviar('patch', '/sitio/elementos/00000000-0000-4000-8000-000000000000', { visible: true })).status).toBe(404);
    });

    it('reordena la colección y borrar compacta el orden', async () => {
      const [a, b] = [await elemento('funcionalidades', { etiqueta: 'A', titulo: `A ${marca}`, texto: 'x' }), await elemento('funcionalidades', { etiqueta: 'B', titulo: `B ${marca}`, texto: 'x' })];
      const ids = ((await enviar('get', '/sitio/elementos?coleccion=funcionalidades')).body as { id: string }[]).map((e) => e.id);
      const nuevo = [...ids.filter((id) => id !== a.id && id !== b.id), b.id, a.id];
      const r = await enviar('patch', '/sitio/elementos', { coleccion: 'funcionalidades', orden: nuevo });
      expect(r.status).toBe(200);
      expect(r.body.map((e: { id: string }) => e.id)).toEqual(nuevo);
      expect((await enviar('delete', `/sitio/elementos/${b.id}`)).status).toBe(204);
      const despues = (await enviar('get', '/sitio/elementos?coleccion=funcionalidades')).body as { id: string; orden: number }[];
      expect(despues.map((e) => e.orden)).toEqual(despues.map((_, i) => i));
      expect(despues.at(-1)!.id).toBe(a.id);
    });

    it('solo el superadmin: 403 a los roles de organización y 401 sin sesión', async () => {
      const x = await elemento('logos', { nombre: `Permisos ${marca}` });
      const estados = [];
      for (const rol of ROLES_ORGANIZACION) {
        const c = cookies[rol]!;
        estados.push([rol,
          (await enviar('get', '/sitio/elementos?coleccion=logos', undefined, c)).status,
          (await enviar('post', '/sitio/elementos', { coleccion: 'logos', datos: { nombre: 'X' } }, c)).status,
          (await enviar('patch', '/sitio/elementos', { coleccion: 'logos', orden: [x.id] }, c)).status,
          (await enviar('patch', `/sitio/elementos/${x.id}`, { visible: true }, c)).status,
          (await enviar('delete', `/sitio/elementos/${x.id}`, undefined, c)).status]);
      }
      expect(estados).toEqual(ROLES_ORGANIZACION.map((rol) => [rol, 403, 403, 403, 403, 403]));
      expect([
        (await enviar('get', '/sitio/elementos?coleccion=logos', undefined, '')).status,
        (await enviar('patch', `/sitio/elementos/${x.id}`, { visible: true }, '')).status,
      ]).toEqual([401, 401]);
      expect((await prisma.sitioElemento.findUniqueOrThrow({ where: { id: x.id } })).visible).toBe(false);
    });

    it('cada cambio de contenido queda en la auditoría', async () => {
      const x = await elemento('cifras', { valor: '1', etiqueta: `Auditada ${marca}` });
      await mostrar(x.id);
      await mostrar(x.id); // sin cambio: no audita
      await enviar('patch', `/sitio/elementos/${x.id}`, { datos: { valor: '2' } });
      await mostrar(x.id, false);
      await enviar('delete', `/sitio/elementos/${x.id}`);
      const filas = await prisma.auditoria.findMany({ where: { entidad: 'SitioElemento', entidadId: x.id }, orderBy: { creadoEn: 'asc' } });
      expect(filas.map((f) => [f.accion, f.organizacionId])).toEqual([
        ['SITIO_ELEMENTO_AGREGADO', null], ['SITIO_ELEMENTO_MOSTRADO', null], ['SITIO_ELEMENTO_EDITADO', null],
        ['SITIO_ELEMENTO_OCULTADO', null], ['SITIO_ELEMENTO_BORRADO', null],
      ]);
      expect(filas[2]!.datos).toMatchObject({ coleccion: 'cifras', antes: { valor: '1' }, despues: { valor: '2' } });
    });
  });
  describe('datos ficticios y bloqueo de publicación (HU-1505)', () => {
    const ruta = (n: string) => `/prueba-${sufijo}-f-${n}`;
    const marca = `zf-${sufijo}`;
    const creados: string[] = [];
    const entornoOriginal = process.env.SITIO_ENTORNO;
    const enviar = (m: 'get' | 'post' | 'patch' | 'delete', r: string, b?: object, c = cookies.SUPERADMIN) => {
      const req = request(servidor)[m](`/api/v1${r}`);
      if (c) req.set('Cookie', c);
      return b ? req.send(b) : req;
    };
    const publica = (r: string) => request(servidor).get('/api/v1/publico/paginas').query({ ruta: r, idioma: 'es' });
    const reiniciarLimite = () => app.get(LimitePublicoService).reiniciar();
    const testimonio = async (nombre: string, { ficticio = true, visible = true } = {}) => {
      const r = await enviar('post', '/sitio/elementos', { coleccion: 'testimonios', ficticio, datos: { nombre: `${nombre} ${marca}`, cargo: 'Jefa', empresa: 'Inventada', texto: 'Muy útil.', estrellas: 5 } });
      if (r.status !== 201) throw new Error(`testimonio: ${r.status} ${JSON.stringify(r.body)}`);
      creados.push(r.body.id);
      if (visible) await enviar('patch', `/sitio/elementos/${r.body.id}`, { visible: true });
      return r.body as { id: string; ficticio: boolean; visible: boolean };
    };
    const pagina = async (n: string, tipos: string[] = ['testimonios']) => {
      const p = (await enviar('post', '/sitio/paginas', { ruta: ruta(n), titulo: n })).body.id as string;
      for (const tipo of tipos) {
        const b = (await enviar('post', `/sitio/paginas/${p}/bloques`, { tipo })).body.id as string;
        await enviar('patch', `/sitio/paginas/${p}/bloques/${b}`, { visible: true });
      }
      return p;
    };
    const nombres = (r: { body: { bloques?: { elementos?: { datos: { nombre?: string }; ficticio?: boolean }[] }[] } }) =>
      (r.body.bloques ?? []).flatMap((b) => b.elementos ?? []).filter((e) => e.datos.nombre?.endsWith(marca)).map((e) => [e.datos.nombre, e.ficticio ?? false]);

    afterEach(async () => {
      process.env.SITIO_ENTORNO = entornoOriginal;
      await prisma.sitioElemento.updateMany({ where: { id: { in: creados } }, data: { visible: false } });
    });
    afterAll(async () => {
      if (entornoOriginal === undefined) delete process.env.SITIO_ENTORNO;
      await prisma.sitioElemento.deleteMany({ where: { id: { in: creados } } });
    });

    it('un elemento se crea y se marca o desmarca como ficticio, con auditoría', async () => {
      const r = await enviar('post', '/sitio/elementos', { coleccion: 'logos', datos: { nombre: `Logo ${marca}` } });
      creados.push(r.body.id);
      expect(r.body).toMatchObject({ ficticio: false, visible: false });
      const m = await enviar('patch', `/sitio/elementos/${r.body.id}`, { ficticio: true });
      expect(m.body.ficticio).toBe(true);
      await enviar('patch', `/sitio/elementos/${r.body.id}`, { ficticio: true }); // sin cambio: no audita
      await enviar('patch', `/sitio/elementos/${r.body.id}`, { ficticio: false });
      const filas = await prisma.auditoria.findMany({ where: { entidad: 'SitioElemento', entidadId: r.body.id }, orderBy: { creadoEn: 'asc' } });
      expect(filas.map((f) => f.accion)).toEqual(['SITIO_ELEMENTO_AGREGADO', 'SITIO_ELEMENTO_MARCADO_FICTICIO', 'SITIO_ELEMENTO_DESMARCADO_FICTICIO']);
    });

    it('CP-116: en producción, con 2 testimonios ficticios visibles, publicar da 409 con la lista y la página no cambia', async () => {
      delete process.env.SITIO_ENTORNO; // sin definir = producción
      const [a, b] = [await testimonio('Ana'), await testimonio('Beto')];
      await testimonio('Oculto', { visible: false });
      await testimonio('Real', { ficticio: false });
      const p = await pagina('cp116');
      const r = await enviar('patch', `/sitio/paginas/${p}`, { accion: 'publicar' });
      expect(r.status).toBe(409);
      expect(r.body.codigo).toBe('FICTICIOS_VISIBLES');
      const propios = (r.body.detalles as { id: string; coleccion: string; nombre: string }[]).filter((d) => d.nombre.endsWith(marca));
      expect(propios).toEqual([{ id: a.id, coleccion: 'testimonios', nombre: `Ana ${marca}` }, { id: b.id, coleccion: 'testimonios', nombre: `Beto ${marca}` }]);
      expect((await prisma.sitioPagina.findUniqueOrThrow({ where: { id: p } })).estado).toBe('BORRADOR');
      // Crear y publicar de una vez también se bloquea.
      expect((await enviar('post', '/sitio/paginas', { ruta: ruta('cp116-directa'), titulo: 'Directa', accion: 'publicar' })).status).toBe(409);
      expect(await prisma.sitioPagina.count({ where: { ruta: ruta('cp116-directa') } })).toBe(0);

      // «Ocultar todos los ficticios» y entonces se publica.
      const lista = await enviar('get', '/sitio/ficticios');
      expect(lista.body.entorno).toBe('produccion');
      expect(lista.body.ficticios.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([a.id, b.id]));
      const o = await enviar('post', '/sitio/ficticios/ocultar');
      expect(o.status).toBe(200);
      expect(o.body).toMatchObject({ entorno: 'produccion', ficticios: [] });
      expect(o.body.ocultados).toBeGreaterThanOrEqual(2);
      const pub = await enviar('patch', `/sitio/paginas/${p}`, { accion: 'publicar' });
      expect(pub.status).toBe(200);
      expect(pub.body.avisoFicticios).toBeUndefined();
      const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { accion: 'SITIO_FICTICIOS_OCULTADOS' }, orderBy: { creadoEn: 'desc' } });
      expect((auditoria.datos as { elementos: { id: string }[] }).elementos.map((e) => e.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    });

    it('CP-117: en pruebas, con los mismos datos, se publica con aviso y el público los muestra marcados', async () => {
      process.env.SITIO_ENTORNO = 'pruebas';
      reiniciarLimite();
      await testimonio('Ana');
      await testimonio('Beto');
      await testimonio('Real', { ficticio: false });
      const p = await pagina('cp117');
      const r = await enviar('patch', `/sitio/paginas/${p}`, { accion: 'publicar' });
      expect(r.status).toBe(200);
      expect(r.body.estado).toBe('PUBLICADA');
      expect(r.body.avisoFicticios).toBeGreaterThanOrEqual(2);
      expect((await enviar('get', '/sitio/ficticios')).body.entorno).toBe('pruebas');
      expect(nombres(await publica(ruta('cp117')))).toEqual([[`Ana ${marca}`, true], [`Beto ${marca}`, true], [`Real ${marca}`, false]]);

      // Segunda defensa: la misma página publicada, vista en producción, no muestra los ficticios.
      process.env.SITIO_ENTORNO = 'produccion';
      expect(nombres(await publica(ruta('cp117')))).toEqual([[`Real ${marca}`, false]]);
    });

    it('en producción la programada no se publica con ficticios visibles; al ocultarlos se publica sola', async () => {
      delete process.env.SITIO_ENTORNO;
      await testimonio('Programado');
      const hora = new Date(Date.now() + 120_000);
      const p = (await enviar('post', '/sitio/paginas', { ruta: ruta('programada'), titulo: 'Programada', accion: 'programar', publicarEn: hora.toISOString() })).body.id as string;
      expect(await publicarProgramadas(prisma, new Date(hora.getTime() + 1000), 'produccion')).not.toContain(p);
      expect(await publicarProgramadas(prisma, new Date(hora.getTime() + 31_000), 'produccion')).not.toContain(p);
      expect((await prisma.sitioPagina.findUniqueOrThrow({ where: { id: p } })).estado).toBe('PROGRAMADA');
      await enviar('post', '/sitio/ficticios/ocultar');
      expect(await publicarProgramadas(prisma, new Date(hora.getTime() + 61_000), 'produccion')).toContain(p);
      const acciones = (await prisma.auditoria.findMany({ where: { entidad: 'SitioPagina', entidadId: p }, orderBy: { creadoEn: 'asc' } })).map((a) => a.accion);
      expect(acciones).toEqual(['SITIO_PAGINA_CREADA', 'SITIO_PAGINA_BLOQUEADA', 'SITIO_PAGINA_PUBLICADA']);
    });

    it('ficticios: solo el superadmin (403 y 401)', async () => {
      const estados = [];
      for (const rol of ROLES_ORGANIZACION) {
        const c = cookies[rol]!;
        estados.push([rol, (await enviar('get', '/sitio/ficticios', undefined, c)).status, (await enviar('post', '/sitio/ficticios/ocultar', undefined, c)).status]);
      }
      expect(estados).toEqual(ROLES_ORGANIZACION.map((rol) => [rol, 403, 403]));
      expect([(await enviar('get', '/sitio/ficticios', undefined, '')).status, (await enviar('post', '/sitio/ficticios/ocultar', undefined, '')).status]).toEqual([401, 401]);
    });
  });
});
