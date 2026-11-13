// HU-1501 · CP-109: las rutas /sitio/* son solo del superadmin de plataforma (ADR-011). El administrador de una
// organización y el resto de los roles reciben 403; sin sesión, 401.
// HU-1502 · CP-110 y CP-111: páginas con estados (borrador, programada, publicada), el sitio público con su 404 y el
// sitemap, la publicación programada con un reloj controlado, auditoría y el límite de 60 peticiones por minuto en
// /publico/*. PostgreSQL real.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, publicarProgramadas, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
      expect(ok.body).toEqual({ ruta: ruta('precios'), idioma: 'es', titulo: 'Precios', publicadaEn: pub.body.publicadaEn });
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
});
