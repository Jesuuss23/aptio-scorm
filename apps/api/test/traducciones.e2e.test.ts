// HU-0802 · Traducir con glosario: listar con sincronización de huellas, «Traducir pendientes» (202, cola ia), editar
// o marcar Revisado con versión del curso (CP-077), alcance por organización y revisor solo lectura. PostgreSQL real;
// la cola es un doble y el worker se corre aparte (apps/worker/test/traducir.test.ts).
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DatosTrabajo } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { huellaTexto, textosDe } from '@aptio/schema/traduccion';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ColasService } from '../src/trabajos/colas.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
const loto = () => JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));
const TITULO = '/modulos/0/capsulas/0/pantallas/0/titulo';
const SUBTITULO = '/modulos/0/capsulas/0/pantallas/0/bloques/1/contenido';
type T = { id: string; ruta: string; pantallaId: string | null; es: string; en: string | null; estado: string };

describe.skipIf(!hayBase && !process.env.CI)('traducciones (HU-0802)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let cursoId: string;
  let otroCursoId: string;
  const cookies: Record<string, string> = {};
  const encolados: { cola: string; datos: DatosTrabajo }[] = [];
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const curso = () => prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
  const lista = async (filtro = ''): Promise<T[]> => (await como('productor').get(`/cursos/${cursoId}/traducciones${filtro}`)).body;

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org traducciones', slug: `traducciones-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', glosario: { create: [{ termino: 'LOTO', noTraducir: true }] } } });
    const otroCliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Banco' } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: cliente.id });
    await crear('revisor-otro', Rol.REVISOR_CLIENTE, { clienteId: otroCliente.id });
    const otraOrg = await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `traducciones-otra-${sufijo}` } });
    await prisma.usuario.create({ data: { nombre: 'ajeno', email: correo('ajeno'), rol: Rol.PRODUCTOR, organizacionId: otraOrg.id, hashClave, emailVerificado: true } });
    const proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 4 } })).id;
    const otroProyecto = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: otroCliente.id, nombre: 'Atención', creadoPorId: di.id } })).id;
    otroCursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId: otroProyecto, versionEsquema: '0.2.0', documento: loto(), version: 1 } })).id;
    const colas = { encolar: async (cola: string, datos: DatosTrabajo) => void encolados.push({ cola, datos }), encolarConEspera: async () => 'x' };
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['instruccional', 'productor', 'grafico', 'revisor', 'revisor-otro', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });
  beforeEach(() => void encolados.splice(0));

  afterAll(async () => {
    await app?.close();
    const orgs = (await prisma.organizacion.findMany({ where: { slug: { endsWith: sufijo } } })).map((o) => o.id);
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  });

  it('lista los 291 textos de LOTO en orden, todos Pendientes, y crea sus filas una sola vez', async () => {
    const r = await como('productor').get(`/cursos/${cursoId}/traducciones`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(291);
    expect(r.body[1]).toEqual({ id: expect.any(String), ruta: expect.stringMatching(/^\//), pantallaId: null, es: expect.any(String), en: null, estado: 'PENDIENTE' });
    expect(r.body.find((t: T) => t.ruta === TITULO)).toMatchObject({ pantallaId: 'p01', es: 'Bloqueo y etiquetado', en: null, estado: 'PENDIENTE' });
    expect(await prisma.traduccion.count({ where: { cursoId } })).toBe(291);
    // Listar de nuevo no duplica ni cambia los ids.
    expect((await lista()).map((t) => t.id)).toEqual(r.body.map((t: T) => t.id));
    expect(await prisma.traduccion.count({ where: { cursoId } })).toBe(291);
    expect(await lista('?estado=REVISADA')).toEqual([]);
    expect((await como('productor').get(`/cursos/${cursoId}/traducciones?estado=OTRO`)).status).toBe(422);
  });

  it('«Traducir pendientes» responde 202 y encola IA-10 en la cola ia con el curso', async () => {
    const r = await como('grafico').post(`/cursos/${cursoId}/traducciones/traducir`);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ id: expect.any(String), estado: 'EN_COLA', eventos: '/api/v1/eventos' });
    expect(encolados).toEqual([{ cola: 'ia', datos: { trabajoId: r.body.id, organizacionId: orgId, tarea: 'IA-10', traduccion: { cursoId } } }]);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ tarea: 'IA-10', estado: 'EN_COLA', tipo: 'TEXTO' });
  });

  it('CP-077 · editar el inglés crea una versión del curso y lo deja Revisado; marcar Revisado sin inglés da 422', async () => {
    const sub = (await lista()).find((t) => t.ruta === SUBTITULO)!;
    const sinIngles = await como('productor').patch(`/traducciones/${sub.id}`, { estado: 'REVISADA' });
    expect(sinIngles.status).toBe(422);
    expect(sinIngles.body.codigo).toBe('SIN_TRADUCCION');
    expect((await como('productor').patch(`/traducciones/${sub.id}`, {})).body.codigo).toBe('SIN_CAMBIOS');

    const antes = (await curso()).version;
    const r = await como('productor').patch(`/traducciones/${sub.id}`, { en: '  Safety capsule, reviewed by hand  ' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: sub.id, ruta: SUBTITULO, pantallaId: 'p01', es: sub.es, en: 'Safety capsule, reviewed by hand', estado: 'REVISADA' });
    const c = await curso();
    expect(c.version).toBe(antes + 1);
    expect(textosDe(c.documento).find((t) => t.ruta === SUBTITULO)?.en).toBe('Safety capsule, reviewed by hand');
    const version = await prisma.cursoVersion.findFirstOrThrow({ where: { cursoId, version: c.version } });
    expect(version.motivo).toBe('traducción');
    expect((await lista('?estado=REVISADA')).map((t) => t.ruta)).toEqual([SUBTITULO]);

    // Pedir la traducción de nuevo no lo toca: sigue Revisado con su inglés (el worker solo toma los Pendientes).
    await como('productor').post(`/cursos/${cursoId}/traducciones/traducir`);
    expect((await lista()).find((t) => t.ruta === SUBTITULO)).toMatchObject({ en: 'Safety capsule, reviewed by hand', estado: 'REVISADA' });

    // Con el inglés ya escrito, marcar Revisado no crea versión.
    const tit = (await lista()).find((t) => t.ruta === TITULO)!;
    await prisma.traduccion.update({ where: { id: tit.id }, data: { estado: 'TRADUCIDA_IA' } });
    await como('productor').patch(`/traducciones/${tit.id}`, { en: 'Lockout and tagout' });
    const v = (await curso()).version;
    expect((await como('instruccional').patch(`/traducciones/${tit.id}`, { estado: 'REVISADA' })).body.estado).toBe('REVISADA');
    expect((await curso()).version).toBe(v);
  });

  it('si el español cambia, lo revisado vuelve a Pendiente y conserva el inglés anterior como referencia', async () => {
    const c = await curso();
    const doc = structuredClone(c.documento) as ReturnType<typeof loto>;
    doc.modulos[0].capsulas[0].pantallas[0].bloques[1].contenido.es = 'Cápsula de seguridad · 12 min';
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc } });
    const sub = (await lista()).find((t) => t.ruta === SUBTITULO)!;
    expect(sub).toMatchObject({ es: 'Cápsula de seguridad · 12 min', en: 'Safety capsule, reviewed by hand', estado: 'PENDIENTE' });
    expect((await prisma.traduccion.findUniqueOrThrow({ where: { id: sub.id } })).textoOrigenHash).toBe(huellaTexto('Cápsula de seguridad · 12 min'));
  });

  it('el revisor del cliente consulta pero no traduce ni edita (403); otra organización y otro cliente no ven nada (404)', async () => {
    const sub = (await lista()).find((t) => t.ruta === SUBTITULO)!;
    expect((await como('revisor').get(`/cursos/${cursoId}/traducciones`)).body).toHaveLength(291);
    expect((await como('revisor').post(`/cursos/${cursoId}/traducciones/traducir`)).status).toBe(403);
    expect((await como('revisor').patch(`/traducciones/${sub.id}`, { estado: 'REVISADA' })).status).toBe(403);
    expect((await como('revisor-otro').get(`/cursos/${cursoId}/traducciones`)).status).toBe(404);
    expect((await como('ajeno').get(`/cursos/${cursoId}/traducciones`)).status).toBe(404);
    expect((await como('ajeno').post(`/cursos/${cursoId}/traducciones/traducir`)).status).toBe(404);
    expect((await como('ajeno').patch(`/traducciones/${sub.id}`, { en: 'x' })).status).toBe(404);
    expect(encolados).toEqual([]);
    // El curso de otro cliente de la misma organización sí lo ve el equipo.
    expect((await como('productor').get(`/cursos/${otroCursoId}/traducciones`)).status).toBe(200);
  });
});
