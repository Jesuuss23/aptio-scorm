// HU-1104 · Patrón de navegación con IA en la API (CP-088, REQ-048): pedir encola IA-14 en modo recomendar o crear; la
// propuesta se guarda como lo hace el worker (salidas grabadas de LOTO); aplicarla cambia solo `patron` y
// `patronPersonalizado` con una versión nueva de motivo «navegación»; vence si el curso cambió; descartar; solo
// administración y diseño instruccional (403 al resto). PostgreSQL real.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DatosTrabajo } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ColasService } from '../src/trabajos/colas.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
const leer = (ruta: string) => JSON.parse(readFileSync(new URL(`../../../packages/ai/casos/loto/${ruta}`, import.meta.url), 'utf8'));
const loto = () => leer('curso-esperado-es.json');
type Salida = { recomendado: { patron: string; motivo: string }; alternativa: { patron: string; motivo: string }; navegacion: Record<string, unknown> };
const CREADO = leer('salidas/X-IA-14-patron-tablero.json') as Salida;
const RECOMENDADO = leer('salidas/04-IA-14-navegacion.json') as Salida;
const DESCRIPCION = 'tablero de misiones de seguridad';

describe.skipIf(!hayBase && !process.env.CI)('patrón de navegación con IA (HU-1104)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let cursoId: string;
  const cookies: Record<string, string> = {};
  const encolados: { cola: string; datos: DatosTrabajo }[] = [];
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    put: (ruta: string, datos: object) => request(servidor).put(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const curso = () => prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
  /** Lo que guarda el worker al terminar IA-14 sobre el curso tal como está. */
  const propuesta = async (modo: 'recomendar' | 'crear' = 'crear') => {
    const c = await curso();
    const s = modo === 'crear' ? CREADO : RECOMENDADO;
    const titulo = modo === 'crear' ? 'Patrón nuevo: Tablero de misiones de seguridad' : 'Recomendado: Historias';
    return prisma.propuesta.create({
      data: {
        cursoId, pantallaId: null, tipo: 'patron', titulo, descripcion: s.recomendado.motivo, versionBase: c.version,
        cambios: { modo, navegacion: s.navegacion, recomendado: s.recomendado, alternativa: s.alternativa, descripcion: modo === 'crear' ? DESCRIPCION : null, huella: null } as object,
      },
    });
  };

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org patrón', slug: `patron-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('admin', Rol.ADMINISTRADOR);
    await crear('productor', Rol.PRODUCTOR);
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: cliente.id });
    const otraOrg = await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `patron-otra-${sufijo}` } });
    await prisma.usuario.create({ data: { nombre: 'ajeno', email: correo('ajeno'), rol: Rol.DISENADOR_INSTRUCCIONAL, organizacionId: otraOrg.id, hashClave, emailVerificado: true } });
    const proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 5 } })).id;
    await prisma.cursoVersion.create({ data: { cursoId, version: 5, documento: loto(), motivo: 'generación' } });
    const colas = { encolar: async (cola: string, datos: DatosTrabajo) => void encolados.push({ cola, datos }), encolarConEspera: async () => 'x' };
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['instruccional', 'admin', 'productor', 'grafico', 'revisor', 'ajeno']) {
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

  it('«✦ Recomendar» y «✦ Crear con IA» encolan IA-14 sobre el curso entero; crear exige la descripción', async () => {
    const rec = await como('instruccional').post(`/cursos/${cursoId}/propuestas`, { tipo: 'patron', modo: 'recomendar' });
    expect(rec.status).toBe(202);
    const crea = await como('admin').post(`/cursos/${cursoId}/propuestas`, { tipo: 'patron', modo: 'crear', descripcion: `  ${DESCRIPCION}  ` });
    expect(crea.status).toBe(202);
    expect(encolados).toEqual([
      { cola: 'ia', datos: { trabajoId: rec.body.id, organizacionId: orgId, tarea: 'IA-14', propuesta: { cursoId, tipo: 'patron', modo: 'recomendar' } } },
      { cola: 'ia', datos: { trabajoId: crea.body.id, organizacionId: orgId, tarea: 'IA-14', propuesta: { cursoId, tipo: 'patron', modo: 'crear', texto: DESCRIPCION } } },
    ]);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: crea.body.id } })).toMatchObject({ estado: 'EN_COLA', tarea: 'IA-14' });

    const sinTexto = await como('instruccional').post(`/cursos/${cursoId}/propuestas`, { tipo: 'patron', modo: 'crear', descripcion: '   ' });
    expect(sinTexto.status).toBe(422);
    expect(sinTexto.body).toMatchObject({ codigo: 'DESCRIPCION_VACIA' });
    expect((await como('instruccional').post(`/cursos/${cursoId}/propuestas`, { tipo: 'patron' })).body).toMatchObject({ codigo: 'MODO_REQUERIDO' });
    expect((await como('instruccional').post(`/cursos/${cursoId}/propuestas`, { tipo: 'patron', modo: 'inventar' })).status).toBe(422);
    expect(encolados).toHaveLength(2);
  });

  it('CP-088 · aplicar el patrón creado deja una versión nueva con motivo «navegación» y conserva reglas y elementos visibles', async () => {
    const p = await propuesta('crear');
    const vista = (await como('instruccional').get(`/cursos/${cursoId}/propuestas?estado=PENDIENTE`)).body.find((x: { id: string }) => x.id === p.id);
    expect(vista).toMatchObject({
      tipo: 'patron', pantallaId: null, versionBase: 5, titulo: 'Patrón nuevo: Tablero de misiones de seguridad',
      patron: { modo: 'crear', descripcion: DESCRIPCION, recomendado: CREADO.recomendado, alternativa: CREADO.alternativa, navegacion: CREADO.navegacion },
    });

    const r = await como('instruccional').post(`/propuestas/${p.id}/aplicar`, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: 6, regenerando: [] });
    const nav = ((await curso()).documento as { navegacion: Record<string, unknown> }).navegacion;
    expect(nav).toEqual({
      ...loto().navegacion,
      patron: 'personalizado',
      patronPersonalizado: { nombre: 'Tablero de misiones de seguridad', base: 'mapa', progreso: 'puntos', avance: 'botones', menu: 'mapa', marcador: true, barra: 'abajo', origen: 'ia' },
    });
    expect((await prisma.cursoVersion.findFirstOrThrow({ where: { cursoId, version: 6 } })).motivo).toBe('navegación');
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('APLICADA');
    expect((await como('productor').get(`/cursos/${cursoId}/navegacion`)).body).toMatchObject({ patron: 'personalizado', patronPersonalizado: { nombre: 'Tablero de misiones de seguridad' } });
    expect((await como('instruccional').post(`/propuestas/${p.id}/aplicar`, {})).body).toMatchObject({ codigo: 'PROPUESTA_RESUELTA' });
  });

  it('aplicar la recomendación de un patrón del catálogo quita el personalizado', async () => {
    const p = await propuesta('recomendar');
    const r = await como('admin').post(`/propuestas/${p.id}/aplicar`, {});
    expect(r.status).toBe(200);
    const nav = ((await curso()).documento as { navegacion: Record<string, unknown> }).navegacion;
    expect(nav.patron).toBe('historias');
    expect(nav).not.toHaveProperty('patronPersonalizado');
    expect(nav.mostrar).toEqual(loto().navegacion.mostrar);
    expect((await prisma.cursoVersion.findFirstOrThrow({ where: { cursoId, version: r.body.version } })).motivo).toBe('navegación');
  });

  it('una propuesta vence (409) si el curso cambió de versión', async () => {
    const p = await propuesta('crear');
    const { version } = await curso();
    expect((await como('instruccional').put(`/cursos/${cursoId}/navegacion`, { version, patron: 'vertical' })).status).toBe(200);
    const r = await como('instruccional').post(`/propuestas/${p.id}/aplicar`, {});
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: 'PROPUESTA_VENCIDA', mensaje: 'El curso cambió desde que se calculó esta propuesta. Recalcular propuesta.' });
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('VENCIDA');
    expect((await curso()).version).toBe(version + 1);
    expect(((await curso()).documento as { navegacion: { patron: string } }).navegacion.patron).toBe('vertical');
  });

  it('descartar deja la propuesta descartada sin tocar el curso', async () => {
    const p = await propuesta('recomendar');
    const antes = await curso();
    expect((await como('instruccional').post(`/propuestas/${p.id}/descartar`)).status).toBe(204);
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('DESCARTADA');
    expect((await curso()).version).toBe(antes.version);
  });

  it('solo administración y diseño instruccional piden, aplican y descartan (403); otra organización no la encuentra', async () => {
    const p = await propuesta('crear');
    for (const quien of ['productor', 'grafico', 'revisor']) {
      expect((await como(quien).post(`/cursos/${cursoId}/propuestas`, { tipo: 'patron', modo: 'recomendar' })).status).toBe(403);
      expect((await como(quien).post(`/cursos/${cursoId}/propuestas`, { tipo: 'patron', modo: 'crear', descripcion: DESCRIPCION })).status).toBe(403);
      expect((await como(quien).post(`/propuestas/${p.id}/aplicar`, {})).status).toBe(403);
      expect((await como(quien).post(`/propuestas/${p.id}/descartar`)).status).toBe(403);
    }
    expect((await como('ajeno').post(`/cursos/${cursoId}/propuestas`, { tipo: 'patron', modo: 'recomendar' })).status).toBe(404);
    expect((await como('ajeno').post(`/propuestas/${p.id}/aplicar`, {})).status).toBe(404);
    expect(encolados).toHaveLength(0);
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('PENDIENTE');
  });
});
