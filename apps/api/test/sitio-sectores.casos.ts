// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (las versiones son globales).
// HU-1514 · Landings por sector (REQ-092, RN-16-9) contra PostgreSQL: crear la landing en borrador con la plantilla de
// bloques ocultos, 422 al publicar sin portada ni meta título, validación de los campos, CP-157 (testimonios del sector
// y, si no hay, todos), las preguntas del inicio, y CP-158 (en borrador no sale en «Sectores» ni en el pie y da 404).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol, ultimaVersion } from '@aptio/db';
import { landingsDe, renderizarPagina } from '@aptio/sitio';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@sitio-sectores.test`;
const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com', base: '' };

describe.skipIf(!hayBase && !process.env.CI)('landings por sector (HU-1514)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  const creados: string[] = [];
  const entornoOriginal = process.env.SITIO_ENTORNO;
  const MINERIA = `Minería ${sufijo}`;
  const BANCA = `Banca ${sufijo}`;
  const PUBLICO = `Público ${sufijo}`;
  const enviar = (m: 'get' | 'post' | 'patch', r: string, b?: object, quien: 'super' | 'admin' = 'super') => {
    const req = request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);
    return b ? req.send(b) : req;
  };
  const publica = (r: string) => { app.get(LimitePublicoService).reiniciar(); return request(servidor).get('/api/v1/publico/paginas').query({ ruta: r, idioma: 'es' }); };
  const landing = async (sector: string) => {
    const r = await enviar('post', '/sitio/paginas', { tipo: 'sector', sector });
    if (r.status !== 201) throw new Error(`landing: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body as { id: string; ruta: string; titulo: string; estado: string; tipo: string; sector: string };
  };
  const completarYPublicar = async (id: string, sector: string) => {
    const r = await enviar('patch', `/sitio/paginas/${id}`, { portada: { titulo: `Portada de ${sector}`, texto: 'Texto de la portada.' }, metaTitulo: `Capacitación en ${sector}`, accion: 'publicar' });
    if (r.status !== 200) throw new Error(`publicar: ${r.status} ${JSON.stringify(r.body)}`);
  };
  const mostrarBloques = async (id: string, tipos: string[]) => {
    const bloques = (await enviar('get', `/sitio/paginas/${id}/bloques`)).body as { id: string; tipo: string }[];
    for (const b of bloques.filter((x) => tipos.includes(x.tipo))) await enviar('patch', `/sitio/paginas/${id}/bloques/${b.id}`, { visible: true });
  };
  const elemento = async (coleccion: string, datos: Record<string, string | number>) => {
    const r = await enviar('post', '/sitio/elementos', { coleccion, datos });
    creados.push(r.body.id);
    await enviar('patch', `/sitio/elementos/${r.body.id}`, { visible: true });
  };
  const nombres = (bloques: { tipo: string; elementos?: { datos: Record<string, string> }[] }[], tipo: string, campo: string) =>
    (bloques.find((b) => b.tipo === tipo)?.elementos ?? []).map((e) => e.datos[campo]!).filter((n) => n.includes(sufijo));

  beforeAll(async () => {
    process.env.SITIO_ENTORNO = 'produccion';
    const org = await prisma.organizacion.create({ data: { nombre: 'Org sectores', slug: `sectores-${sufijo}` } });
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
    await prisma.sitioElemento.deleteMany({ where: { id: { in: creados } } });
    const paginas = (await prisma.sitioPagina.findMany({ where: { sector: { endsWith: sufijo } }, select: { id: true } })).map((p) => p.id);
    await prisma.auditoria.deleteMany({ where: { entidad: 'SitioPagina', entidadId: { in: paginas } } });
    await prisma.sitioPagina.deleteMany({ where: { id: { in: paginas } } });
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@sitio-sectores.test` } }, select: { id: true, organizacionId: true } });
    const ids = usuarios.map((u) => u.id);
    await prisma.sitioVersion.updateMany({ where: { publicadoPorId: { in: ids } }, data: { publicadoPorId: null } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `sectores-${sufijo}` } });
  });

  it('una landing nace en borrador en /sectores/{sector} con la plantilla oculta; solo el superadmin la crea', async () => {
    expect((await enviar('post', '/sitio/paginas', { tipo: 'sector', sector: 'Retail' }, 'admin')).status).toBe(403);
    const l = await landing(MINERIA);
    expect(l).toMatchObject({ ruta: `/sectores/mineria-${sufijo}`, titulo: MINERIA, estado: 'BORRADOR', tipo: 'sector', sector: MINERIA, portada: null, metaTitulo: null });
    const bloques = (await enviar('get', `/sitio/paginas/${l.id}/bloques`)).body as { tipo: string; visible: boolean }[];
    expect(bloques.map((b) => [b.tipo, b.visible])).toEqual(['hero', 'metricas', 'pasos', 'testimonios', 'faq', 'bloglista', 'cta'].map((t) => [t, false]));
    const aud = await prisma.auditoria.findFirst({ where: { entidad: 'SitioPagina', entidadId: l.id, accion: 'SITIO_PAGINA_CREADA' } });
    expect(aud?.datos).toMatchObject({ tipo: 'sector', sector: MINERIA, estado: 'BORRADOR' });
    // Nace en borrador: no se crea publicada ni programada.
    const directa = await enviar('post', '/sitio/paginas', { tipo: 'sector', sector: `Otro ${sufijo}`, accion: 'publicar' });
    expect([directa.status, directa.body.codigo]).toEqual([422, 'LANDING_EN_BORRADOR']);
  });

  it('RN-16-9: sin portada ni meta título no se publica ni se programa; los campos se validan', async () => {
    const l = await landing(BANCA);
    const sinNada = await enviar('patch', `/sitio/paginas/${l.id}`, { accion: 'publicar' });
    expect([sinNada.status, sinNada.body.codigo]).toEqual([422, 'LANDING_INCOMPLETA']);
    expect(sinNada.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(['portada.titulo', 'portada.texto', 'metaTitulo']);
    const programar = await enviar('patch', `/sitio/paginas/${l.id}`, { portada: { titulo: 'Cumplimiento', texto: 'Texto.' }, accion: 'programar', publicarEn: '2030-01-01T09:00:00-05:00' });
    expect([programar.status, programar.body.detalles?.map((d: { campo: string }) => d.campo)]).toEqual([422, ['metaTitulo']]);
    const mal = await enviar('patch', `/sitio/paginas/${l.id}`, { sector: 'General', metaTitulo: '<b>x</b>' });
    expect([mal.status, mal.body.detalles.map((d: { campo: string }) => d.campo)]).toEqual([422, ['sector', 'metaTitulo']]);
    const general = (await enviar('post', '/sitio/paginas', { ruta: `/prueba-${sufijo}-g`, titulo: 'G', sector: 'X' }));
    expect([general.status, general.body.codigo]).toEqual([422, 'NO_ES_LANDING']);
    const ok = await enviar('patch', `/sitio/paginas/${l.id}`, { blogCategoriaInicial: 'Estándares' });
    expect(ok.body).toMatchObject({ portada: null, blogCategoriaInicial: 'Estándares' });
    const aud = await prisma.auditoria.findFirst({ where: { entidad: 'SitioPagina', entidadId: l.id, accion: 'SITIO_PAGINA_EDITADA' } });
    expect(aud?.datos).toMatchObject({ blogCategoriaInicial: 'Estándares' });
  });

  it('CP-157 y CP-158: testimonios del sector (o todos), preguntas del inicio y la landing en borrador fuera del sitio', async () => {
    const [mineria] = await prisma.sitioPagina.findMany({ where: { sector: MINERIA } });
    const [banca] = await prisma.sitioPagina.findMany({ where: { sector: BANCA } });
    const borrador = await landing(PUBLICO);
    await elemento('testimonios', { nombre: `Ana ${sufijo}`, cargo: 'Jefa', empresa: 'Minera', sector: MINERIA.toUpperCase(), texto: 'Útil.', estrellas: 5 });
    await elemento('testimonios', { nombre: `Jorge ${sufijo}`, cargo: 'Jefe', empresa: 'Energía', sector: MINERIA, texto: 'Útil.', estrellas: 5 });
    await elemento('testimonios', { nombre: `Lucía ${sufijo}`, cargo: 'Directora', empresa: 'Universidad', sector: 'General', texto: 'Útil.', estrellas: 5 });
    await elemento('preguntas', { pregunta: `¿Del inicio? ${sufijo}`, respuesta: 'Sí.', pagina: '/' });
    await elemento('preguntas', { pregunta: `¿De minería? ${sufijo}`, respuesta: 'Sí.', pagina: mineria!.ruta });
    for (const p of [mineria!, banca!]) await mostrarBloques(p.id, ['hero', 'testimonios', 'faq']);
    await completarYPublicar(mineria!.id, MINERIA);
    await completarYPublicar(banca!.id, BANCA);

    const sitioMineria = (await publica(mineria!.ruta)).body;
    expect(sitioMineria.sector).toMatchObject({ nombre: MINERIA, metaTitulo: `Capacitación en ${MINERIA}` });
    expect(nombres(sitioMineria.bloques, 'testimonios', 'nombre')).toEqual([`Ana ${sufijo}`, `Jorge ${sufijo}`]);
    expect(nombres(sitioMineria.bloques, 'faq', 'pregunta')).toEqual([`¿Del inicio? ${sufijo}`, `¿De minería? ${sufijo}`]);
    // Banca no tiene testimonios propios: ve todos los visibles, y no las preguntas de Minería.
    const sitioBanca = (await publica(banca!.ruta)).body;
    expect(nombres(sitioBanca.bloques, 'testimonios', 'nombre')).toEqual([`Ana ${sufijo}`, `Jorge ${sufijo}`, `Lucía ${sufijo}`]);
    expect(nombres(sitioBanca.bloques, 'faq', 'pregunta')).toEqual([`¿Del inicio? ${sufijo}`]);

    // CP-158 · La landing en borrador da 404 y no sale en «Sectores» ni en el pie del HTML de la versión.
    expect((await publica(borrador.ruta)).status).toBe(404);
    const v = await ultimaVersion(prisma);
    const landings = landingsDe(v!.instantanea, 'es').map((l) => l.nombre);
    expect(landings).toEqual(expect.arrayContaining([MINERIA, BANCA]));
    expect(landings).not.toContain(PUBLICO);
    const html = renderizarPagina(v!.instantanea, mineria!.ruta, 'es', op)!;
    expect(html).toContain(`<title>Capacitación en ${MINERIA}</title>`);
    expect(html).toContain(`<a href="${mineria!.ruta}">${MINERIA}</a>`);
    expect(html).not.toContain(PUBLICO);
  });
});
