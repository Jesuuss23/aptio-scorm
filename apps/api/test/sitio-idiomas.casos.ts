// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (las versiones son globales).
// HU-1510 · Sitio en español e inglés (REQ-069) contra PostgreSQL: cada idioma tiene su contenido, su menú y su pie, con
// el orden aparte; los ficticios en inglés también se listan, se ocultan y bloquean publicar en producción (RN-16-3); el
// ajuste «Mostrar selector ES/EN» se guarda, queda en la auditoría y sale al sitio al publicar.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@sitio-idiomas.test`;

describe.skipIf(!hayBase && !process.env.CI)('sitio en español e inglés (HU-1510)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  const elementos: string[] = [];
  const enlaces: string[] = [];
  const entornoOriginal = process.env.SITIO_ENTORNO;
  let respaldo: Awaited<ReturnType<typeof prisma.sitioAjustes.findMany>> = [];
  const enviar = (m: 'get' | 'post' | 'patch' | 'delete', r: string, b?: object, quien: 'super' | 'admin' = 'super') => {
    const req = request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);
    return b ? req.send(b) : req;
  };
  const publico = (r: string) => { app.get(LimitePublicoService).reiniciar(); return request(servidor).get(`/api/v1${r}`); };
  const paso = async (titulo: string, idioma?: 'es' | 'en', extra: object = {}) => {
    const r = await enviar('post', '/sitio/elementos', { coleccion: 'pasos', datos: { titulo: `${titulo} ${sufijo}`, texto: 'Texto.' }, ...(idioma ? { idioma } : {}), ...extra });
    if (r.status !== 201) throw new Error(`paso: ${r.status} ${JSON.stringify(r.body)}`);
    elementos.push(r.body.id);
    return r.body as { id: string; idioma: string; orden: number; visible: boolean };
  };
  const enlace = async (cuerpo: object) => {
    const r = await enviar('post', '/sitio/navegacion', cuerpo);
    if (r.status === 201) enlaces.push(r.body.id);
    return r;
  };
  const propios = <T extends { id: string }>(lista: T[], ids: string[]) => lista.filter((x) => ids.includes(x.id));

  beforeAll(async () => {
    respaldo = await prisma.sitioAjustes.findMany();
    const org = await prisma.organizacion.create({ data: { nombre: 'Org idiomas', slug: `idiomas-${sufijo}` } });
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

  afterAll(async () => {
    await app?.close();
    if (entornoOriginal === undefined) delete process.env.SITIO_ENTORNO;
    else process.env.SITIO_ENTORNO = entornoOriginal;
    await prisma.sitioElemento.deleteMany({ where: { id: { in: elementos } } });
    await prisma.sitioEnlace.deleteMany({ where: { id: { in: enlaces } } });
    await prisma.sitioAjustes.deleteMany();
    for (const f of respaldo) await prisma.sitioAjustes.create({ data: { ...f, datos: f.datos as object } });
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@sitio-idiomas.test` } }, select: { id: true } });
    const ids = usuarios.map((u) => u.id);
    await prisma.sitioVersion.updateMany({ where: { publicadoPorId: { in: ids } }, data: { publicadoPorId: null } });
    await prisma.sitioAjustes.updateMany({ where: { actualizadoPorId: { in: ids } }, data: { actualizadoPorId: null } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `idiomas-${sufijo}` } });
  });

  it('elementos: cada idioma tiene su lista y su orden; sin idioma, español; otro idioma da 422', async () => {
    const es = await paso('Paso ES');
    const [en1, en2] = [await paso('Step one', 'en'), await paso('Step two', 'en')];
    expect(es.idioma).toBe('es');
    expect([en1.idioma, en1.orden, en1.visible, en2.orden]).toEqual(['en', 0, false, 1]);
    const listaEn = (await enviar('get', '/sitio/elementos?coleccion=pasos&idioma=en')).body as { id: string; idioma: string }[];
    expect(listaEn.map((e) => e.id)).toEqual([en1.id, en2.id]);
    const listaEs = (await enviar('get', '/sitio/elementos?coleccion=pasos')).body as { id: string; idioma: string }[];
    expect(listaEs.some((e) => e.id === en1.id)).toBe(false);
    expect(listaEs.every((e) => e.idioma === 'es')).toBe(true);
    expect((await enviar('get', '/sitio/elementos?coleccion=pasos&idioma=fr')).status).toBe(422);
    expect((await enviar('post', '/sitio/elementos', { coleccion: 'pasos', idioma: 'fr', datos: { titulo: 'X', texto: 'Y' } })).status).toBe(422);

    // El orden en inglés no toca el de español: la lista debe tener todos los del idioma, y solo ellos.
    const mezcla = await enviar('patch', '/sitio/elementos', { coleccion: 'pasos', idioma: 'en', orden: [en2.id, en1.id, es.id] });
    expect([mezcla.status, mezcla.body.codigo]).toEqual([422, 'ORDEN_INVALIDO']);
    const r = await enviar('patch', '/sitio/elementos', { coleccion: 'pasos', idioma: 'en', orden: [en2.id, en1.id] });
    expect(r.status).toBe(200);
    expect((r.body as { id: string; orden: number }[]).map((e) => [e.id, e.orden])).toEqual([[en2.id, 0], [en1.id, 1]]);
    expect((await prisma.sitioElemento.findUniqueOrThrow({ where: { id: es.id } })).orden).toBe(es.orden);

    // Borrar compacta solo su idioma.
    expect((await enviar('delete', `/sitio/elementos/${en2.id}`)).status).toBe(204);
    expect((await prisma.sitioElemento.findUniqueOrThrow({ where: { id: en1.id } })).orden).toBe(0);
    expect((await prisma.sitioElemento.findUniqueOrThrow({ where: { id: es.id } })).orden).toBe(es.orden);

    const aud = await prisma.auditoria.findMany({ where: { entidad: 'SitioElemento', entidadId: { in: [en1.id, en2.id] } }, orderBy: { creadoEn: 'asc' } });
    expect(aud.find((a) => a.accion === 'SITIO_ELEMENTO_AGREGADO')?.datos).toMatchObject({ coleccion: 'pasos', idioma: 'en' });
    const reorden = await prisma.auditoria.findFirst({ where: { accion: 'SITIO_ELEMENTOS_REORDENADOS', usuarioId: { not: null } }, orderBy: { creadoEn: 'desc' } });
    expect(reorden?.datos).toMatchObject({ coleccion: 'pasos', idioma: 'en' });
  });

  it('navegación: menú y pie por idioma, el enlace del pie toma el idioma de su columna y el orden va aparte', async () => {
    const [m1, m2] = [await enlace({ zona: 'menu', idioma: 'en', texto: `Pricing ${sufijo}`, ruta: '/en/precios' }), await enlace({ zona: 'menu', idioma: 'en', texto: `Blog ${sufijo}`, ruta: '/en/blog' })];
    expect([m1.status, m1.body.idioma, m1.body.visible]).toEqual([201, 'en', false]);
    const col = await enlace({ zona: 'pie', idioma: 'en', texto: `Company ${sufijo}` });
    const hijo = await enlace({ zona: 'pie', padreId: col.body.id, texto: `Privacy ${sufijo}`, ruta: '/en/privacidad' });
    expect([hijo.status, hijo.body.idioma, hijo.body.orden]).toEqual([201, 'en', 0]);
    const otro = await enlace({ zona: 'pie', padreId: col.body.id, idioma: 'es', texto: 'Privacidad', ruta: '/privacidad' });
    expect([otro.status, otro.body.codigo, otro.body.detalles?.[0]?.tipo]).toEqual([422, 'UBICACION_INVALIDA', 'PADRE_DE_OTRO_IDIOMA']);
    expect((await enviar('post', '/sitio/navegacion', { zona: 'menu', idioma: 'fr', texto: 'X', ruta: '/x' })).status).toBe(422);

    const en = (await enviar('get', '/sitio/navegacion?idioma=en')).body as { menu: { id: string }[]; pie: { id: string; enlaces: { id: string }[] }[] };
    expect(propios(en.menu, [m1.body.id, m2.body.id]).map((e) => e.id)).toEqual([m1.body.id, m2.body.id]);
    expect(en.pie.find((c) => c.id === col.body.id)?.enlaces.map((e) => e.id)).toEqual([hijo.body.id]);
    const es = (await enviar('get', '/sitio/navegacion')).body as { menu: { id: string; idioma: string }[]; pie: { id: string }[] };
    expect(es.menu.some((e) => e.id === m1.body.id) || es.pie.some((c) => c.id === col.body.id)).toBe(false);
    expect(es.menu.every((e) => e.idioma === 'es')).toBe(true);

    // El grupo del menú en inglés se ordena con todos sus enlaces, sin los del español.
    const todosEn = en.menu.map((e) => e.id);
    const r = await enviar('patch', '/sitio/navegacion', { zona: 'menu', idioma: 'en', orden: [...todosEn].reverse() });
    expect(r.status).toBe(200);
    expect((r.body as { id: string }[]).map((e) => e.id)).toEqual([...todosEn].reverse());
    const deEs = await enlace({ zona: 'menu', texto: `Precios ${sufijo}`, ruta: '/precios' });
    expect(deEs.body.idioma).toBe('es');
    const mal = await enviar('patch', '/sitio/navegacion', { zona: 'menu', idioma: 'en', orden: [...todosEn, deEs.body.id] });
    expect([mal.status, mal.body.codigo]).toEqual([422, 'ORDEN_INVALIDO']);
    const aud = await prisma.auditoria.findFirst({ where: { entidad: 'SitioEnlace', entidadId: hijo.body.id, accion: 'SITIO_ENLACE_AGREGADO' } });
    expect(aud?.datos).toMatchObject({ zona: 'pie', idioma: 'en', padreId: col.body.id });

    // Publicado, el público lee la navegación de cada idioma.
    for (const id of [m1.body.id, col.body.id, hijo.body.id]) await enviar('patch', `/sitio/navegacion/${id}`, { visible: true });
    process.env.SITIO_ENTORNO = 'pruebas';
    expect((await enviar('post', '/sitio/publicar')).status).toBe(201);
    const pubEn = (await publico('/publico/navegacion?idioma=en')).body as { menu: { texto: string }[]; pie: { titulo: string; enlaces: { texto: string }[] }[]; mostrarSelectorIdioma: boolean };
    expect(pubEn.menu.map((e) => e.texto)).toContain(`Pricing ${sufijo}`);
    expect(pubEn.menu.map((e) => e.texto)).not.toContain(`Blog ${sufijo}`);
    expect(pubEn.pie.find((c) => c.titulo === `Company ${sufijo}`)?.enlaces.map((e) => e.texto)).toEqual([`Privacy ${sufijo}`]);
    expect(pubEn.mostrarSelectorIdioma).toBe(true);
    const pubEs = (await publico('/publico/navegacion')).body as { menu: { texto: string }[] };
    expect(pubEs.menu.map((e) => e.texto)).not.toContain(`Pricing ${sufijo}`);
    expect((await publico('/publico/navegacion?idioma=fr')).status).toBe(422);
  });

  it('RN-16-3: un ficticio visible en inglés sale en la lista, bloquea publicar en producción y se oculta con los demás', async () => {
    const f = await paso('Fake step', 'en', { ficticio: true });
    await enviar('patch', `/sitio/elementos/${f.id}`, { visible: true });
    process.env.SITIO_ENTORNO = 'produccion';
    const lista = await enviar('get', '/sitio/ficticios');
    expect(lista.body.ficticios.map((x: { id: string; idioma: string }) => [x.id, x.idioma])).toContainEqual([f.id, 'en']);
    const r = await enviar('post', '/sitio/publicar');
    expect([r.status, r.body.codigo]).toEqual([409, 'FICTICIOS_VISIBLES']);
    expect(r.body.detalles.map((d: { id: string }) => d.id)).toContain(f.id);
    const o = await enviar('post', '/sitio/ficticios/ocultar');
    expect(o.status).toBe(200);
    expect(o.body.ficticios.some((x: { id: string }) => x.id === f.id)).toBe(false);
    expect((await prisma.sitioElemento.findUniqueOrThrow({ where: { id: f.id } })).visible).toBe(false);
  });

  it('«Mostrar selector ES/EN»: activo por defecto, se guarda con auditoría, deja cambios sin publicar y sale al publicar', async () => {
    process.env.SITIO_ENTORNO = 'pruebas';
    expect((await enviar('get', '/sitio/ajustes')).body.mostrarSelectorIdioma).toBe(true);
    expect((await enviar('patch', '/sitio/ajustes', { mostrarSelectorIdioma: false }, 'admin')).status).toBe(403);
    expect((await enviar('patch', '/sitio/ajustes', { mostrarSelectorIdioma: 'no' })).status).toBe(422);
    await enviar('post', '/sitio/publicar');
    expect((await enviar('get', '/sitio/versiones')).body.pendientes).toBe(false);

    const r = await enviar('patch', '/sitio/ajustes', { mostrarSelectorIdioma: false });
    expect([r.status, r.body.mostrarSelectorIdioma]).toEqual([200, false]);
    expect((await enviar('get', '/sitio/versiones')).body.pendientes).toBe(true);
    const aud = await prisma.auditoria.findFirst({ where: { accion: 'SITIO_AJUSTES_ACTUALIZADOS', usuarioId: { not: null } }, orderBy: { creadoEn: 'desc' } });
    expect(aud?.datos).toEqual({ campos: ['mostrarSelectorIdioma'], publicar: true });
    expect((await publico('/publico/navegacion?idioma=en')).body.mostrarSelectorIdioma).toBe(true);

    await enviar('post', '/sitio/publicar');
    expect((await publico('/publico/navegacion?idioma=en')).body.mostrarSelectorIdioma).toBe(false);
    expect((await publico('/publico/navegacion')).body.mostrarSelectorIdioma).toBe(false);

    await enviar('patch', '/sitio/ajustes', { mostrarSelectorIdioma: true });
    await enviar('post', '/sitio/publicar');
    expect((await publico('/publico/navegacion')).body.mostrarSelectorIdioma).toBe(true);
  });
});
