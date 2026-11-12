// HU-1002 · Corregir la alineación con IA en la API (CP-084): pedir encola IA-17 sobre el curso entero; la propuesta se
// guarda como lo hace el worker (salida grabada de LOTO); aplicarla deja 0 alertas con una versión nueva y p28 en
// borrador; vence si el curso cambió; descartar; solo administración y diseño instruccional (403 al resto). PostgreSQL real.
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
const SALIDA = leer('salidas/X-IA-17-alineacion.json') as { resumen: string; cambios: object[]; patch: object[] };
type P = { id: string; estado: string; bloques: { interaccion?: { datos: { preguntas: { id: string; origen?: object }[] } } }[] };
const pantalla = (d: unknown, id: string) => (d as { modulos: { capsulas: { pantallas: P[] }[] }[] }).modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === id)!;

describe.skipIf(!hayBase && !process.env.CI)('corrección de la alineación con IA (HU-1002)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let cursoId: string;
  const cookies: Record<string, string> = {};
  const encolados: { cola: string; datos: DatosTrabajo }[] = [];
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const curso = () => prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
  /** Lo que guarda el worker al terminar IA-17 sobre el curso tal como está. */
  const propuesta = async () => {
    const c = await curso();
    return prisma.propuesta.create({
      data: { cursoId, pantallaId: null, tipo: 'alineacion', titulo: 'Corregir 2 alertas de alineación', descripcion: SALIDA.resumen, cambios: { patch: SALIDA.patch, correcciones: SALIDA.cambios, huella: null } as object, versionBase: c.version },
    });
  };

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org corrección', slug: `correccion-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('admin', Rol.ADMINISTRADOR);
    await crear('productor', Rol.PRODUCTOR);
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: cliente.id });
    const otraOrg = await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `correccion-otra-${sufijo}` } });
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

  it('pedir correcciones encola IA-17 sobre el curso entero, sin pantalla', async () => {
    const r = await como('instruccional').post(`/cursos/${cursoId}/propuestas`, { tipo: 'alineacion' });
    expect(r.status).toBe(202);
    expect(encolados).toEqual([{ cola: 'ia', datos: { trabajoId: r.body.id, organizacionId: orgId, tarea: 'IA-17', propuesta: { cursoId, tipo: 'alineacion' } } }]);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ estado: 'EN_COLA', tarea: 'IA-17' });
    expect((await como('admin').post(`/cursos/${cursoId}/propuestas`, { tipo: 'alineacion' })).status).toBe(202);
  });

  it('CP-084 · aplicar la propuesta deja 0 alertas con una versión nueva y p28 en borrador, por revisar; se deshace restaurando', async () => {
    const p = await propuesta();
    const lista = await como('instruccional').get(`/cursos/${cursoId}/propuestas?estado=PENDIENTE`);
    const vista = lista.body.find((x: { id: string }) => x.id === p.id);
    expect(vista).toMatchObject({ tipo: 'alineacion', pantallaId: null, versionBase: 5, correcciones: SALIDA.cambios });
    expect((await como('instruccional').get(`/cursos/${cursoId}/alineacion`)).body.totalAlertas).toBe(2);

    const r = await como('instruccional').post(`/propuestas/${p.id}/aplicar`, {});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ version: 6, regenerando: [], pantallasPorRevisar: [{ pantallaId: 'p28', numero: 28, titulo: 'Reto final', nueva: false }] });
    expect((await como('instruccional').get(`/cursos/${cursoId}/alineacion`)).body).toMatchObject({ version: 6, totalAlertas: 0 });
    const c = await curso();
    const p28 = pantalla(c.documento, 'p28');
    expect(p28.estado).toBe('borrador');
    expect(p28.bloques[1]!.interaccion!.datos.preguntas.filter((q) => q.origen).map((q) => q.id)).toEqual(['bq-09', 'bq-10']);
    expect((await prisma.cursoVersion.findFirstOrThrow({ where: { cursoId, version: 6 } })).motivo).toBe('alineación');
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('APLICADA');
    expect((await como('instruccional').post(`/propuestas/${p.id}/aplicar`, {})).body).toMatchObject({ codigo: 'PROPUESTA_RESUELTA' });

    // Deshacer con la restauración de versiones: vuelven las 2 alertas.
    expect((await como('instruccional').post(`/cursos/${cursoId}/versiones/5/restaurar`)).status).toBe(200);
    expect((await como('instruccional').get(`/cursos/${cursoId}/alineacion`)).body).toMatchObject({ version: 7, totalAlertas: 2 });
  });

  it('una propuesta vence si el curso cambió de versión; al listar también aparece vencida', async () => {
    const p = await propuesta();
    const otra = await propuesta();
    const { version } = await curso();
    // Otro cambio en el curso (el nivel de un objetivo) crea una versión nueva.
    expect((await como('instruccional').patch(`/cursos/${cursoId}/alineacion`, { version, objetivos: [{ id: 'obj-1', nivelBloom: 'recordar' }] })).status).toBe(200);
    const r = await como('instruccional').post(`/propuestas/${p.id}/aplicar`, {});
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: 'PROPUESTA_VENCIDA', mensaje: 'El curso cambió desde que se calculó esta propuesta. Recalcular propuesta.' });
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('VENCIDA');
    expect((await como('instruccional').get(`/cursos/${cursoId}/propuestas?estado=VENCIDA`)).body.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([p.id, otra.id]));
    expect((await curso()).version).toBe(version + 1);
  });

  it('descartar deja la propuesta descartada sin tocar el curso', async () => {
    const p = await propuesta();
    const antes = await curso();
    expect((await como('admin').post(`/propuestas/${p.id}/descartar`)).status).toBe(204);
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('DESCARTADA');
    expect((await curso()).version).toBe(antes.version);
    expect((await como('admin').post(`/propuestas/${p.id}/aplicar`, {})).body).toMatchObject({ codigo: 'PROPUESTA_RESUELTA' });
  });

  it('solo administración y diseño instruccional piden, aplican y descartan; otra organización no la encuentra', async () => {
    const p = await propuesta();
    for (const quien of ['productor', 'grafico', 'revisor']) {
      expect((await como(quien).post(`/cursos/${cursoId}/propuestas`, { tipo: 'alineacion' })).status).toBe(403);
      expect((await como(quien).post(`/propuestas/${p.id}/aplicar`, {})).status).toBe(403);
      expect((await como(quien).post(`/propuestas/${p.id}/descartar`)).status).toBe(403);
    }
    expect((await como('ajeno').post(`/cursos/${cursoId}/propuestas`, { tipo: 'alineacion' })).status).toBe(404);
    expect((await como('ajeno').post(`/propuestas/${p.id}/aplicar`, {})).status).toBe(404);
    expect(encolados).toHaveLength(0);
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('PENDIENTE');
  });

  it('sin alertas no hay nada que corregir (422 SIN_ALERTAS)', async () => {
    const { version } = await curso();
    await como('instruccional').patch(`/cursos/${cursoId}/alineacion`, { version, objetivos: [{ id: 'obj-2', nivelBloom: 'recordar' }, { id: 'obj-3', nivelBloom: 'recordar' }] });
    const r = await como('instruccional').post(`/cursos/${cursoId}/propuestas`, { tipo: 'alineacion' });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ codigo: 'SIN_ALERTAS' });
  });
});
