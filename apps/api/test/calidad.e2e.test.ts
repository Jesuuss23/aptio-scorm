// HU-0505 · Control de calidad en la API: «Revisar con IA» encola IA-12 (202, cola ia) y responde 409 si ya hay una en
// curso; el revisor del cliente ve las observaciones pero no revisa ni descarta (403); descartar una de la IA da 200 y una
// de reglas 422 (CP-054: la imagen sin alternativo sigue bloqueando hasta corregirla). PostgreSQL real; la cola es un
// doble y el worker se corre aparte (apps/worker/test/calidad.test.ts).
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DatosTrabajo } from '@aptio/colas';
import { hashearClave, prisma, recalcularReglas, Rol } from '@aptio/db';
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

describe.skipIf(!hayBase && !process.env.CI)('control de calidad (HU-0505)', () => {
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
  let proyectoId: string;

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org calidad', slug: `calidad-${sufijo}` } })).id;
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
    const otraOrg = await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `calidad-otra-${sufijo}` } });
    await prisma.usuario.create({ data: { nombre: 'ajeno', email: correo('ajeno'), rol: Rol.PRODUCTOR, organizacionId: otraOrg.id, hashClave, emailVerificado: true } });
    proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 4 } })).id;
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
  it('«Revisar con IA» encola IA-12 con el curso; 409 si ya hay una revisión en curso', async () => {
    const r = await como('instruccional').post(`/cursos/${cursoId}/control-calidad`);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ estado: 'EN_COLA', eventos: '/api/v1/eventos' });
    expect(encolados).toEqual([{ cola: 'ia', datos: { trabajoId: r.body.id, organizacionId: orgId, tarea: 'IA-12', calidad: { cursoId } } }]);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ tarea: 'IA-12', tipo: 'CALIDAD', estado: 'EN_COLA', proyectoId });
    const otra = await como('productor').post(`/cursos/${cursoId}/control-calidad`);
    expect(otra.status).toBe(409);
    expect(otra.body.codigo).toBe('CALIDAD_EN_CURSO');
    // Al terminar, se puede pedir otra.
    await prisma.trabajoIA.update({ where: { id: r.body.id }, data: { estado: 'COMPLETADO' } });
    expect((await como('grafico').post(`/cursos/${cursoId}/control-calidad`)).status).toBe(202);
    await prisma.trabajoIA.updateMany({ where: { proyectoId, tarea: 'IA-12' }, data: { estado: 'COMPLETADO' } });
  });

  it('el revisor del cliente ve las observaciones, pero no revisa ni descarta (403); otra organización da 404', async () => {
    const ia = await prisma.observacion.create({ data: { cursoId, pantallaId: 'p09', tipo: 'CALIDAD', severidad: 'info', categoria: 'exactitud', mensaje: 'Ejemplo creado por la IA.', sugerencia: 'Confírmalo con el cliente.', origen: 'ia' } });
    expect((await como('revisor').post(`/cursos/${cursoId}/control-calidad`)).status).toBe(403);
    expect((await como('revisor').patch(`/observaciones/${ia.id}`, { resuelta: true })).status).toBe(403);
    const vistas = await como('revisor').get(`/cursos/${cursoId}/observaciones?resuelta=false`);
    expect(vistas.status).toBe(200);
    expect(vistas.body.find((o: { id: string }) => o.id === ia.id)).toMatchObject({ categoria: 'exactitud', sugerencia: 'Confírmalo con el cliente.', ruta: null, origen: 'ia' });
    expect((await como('ajeno').post(`/cursos/${cursoId}/control-calidad`)).status).toBe(404);
    expect((await como('ajeno').patch(`/observaciones/${ia.id}`, { resuelta: true })).status).toBe(404);
    expect(encolados).toEqual([]);
    await prisma.observacion.delete({ where: { id: ia.id } });
  });

  it('descartar una de la IA da 200 y la deja resuelta; una de reglas (CP-054) da 422 y sigue abierta', async () => {
    // CP-054: p20 con una imagen no decorativa sin alternativo; las reglas la marcan al guardar.
    const doc = loto();
    doc.modulos[0].capsulas[0].pantallas[19].bloques.push({ id: 'p20-foto', tipo: 'imagen', decorativa: false });
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc } });
    await recalcularReglas(prisma, cursoId, doc);
    const regla = await prisma.observacion.findFirstOrThrow({ where: { cursoId, origen: 'regla' } });
    expect(regla).toMatchObject({ pantallaId: 'p20', tipo: 'ACCESIBILIDAD', severidad: 'bloquea-entrega', categoria: 'accesibilidad' });
    const ia = await prisma.observacion.create({ data: { cursoId, pantallaId: 'p18', tipo: 'MATERIAL_FALTANTE', severidad: 'aviso', categoria: 'faltante', mensaje: 'Falta el video del cliente.', origen: 'ia' } });

    const r = await como('productor').patch(`/observaciones/${ia.id}`, { resuelta: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: ia.id, resuelta: true, categoria: 'faltante' });
    expect((await como('productor').get(`/cursos/${cursoId}/observaciones?resuelta=false`)).body.map((o: { id: string }) => o.id)).toEqual([regla.id]);

    const no = await como('productor').patch(`/observaciones/${regla.id}`, { resuelta: true });
    expect(no.status).toBe(422);
    expect(no.body.codigo).toBe('OBSERVACION_DE_REGLA');
    expect((await prisma.observacion.findUniqueOrThrow({ where: { id: regla.id } })).resuelta).toBe(false);
    // La regla sigue bloqueando la aprobación de p20 (RN-05-1).
    const aprobar = await como('instruccional').post(`/cursos/${cursoId}/pantallas/p20/aprobar`);
    expect(aprobar.status).toBe(409);
    expect((await como('productor').patch(`/observaciones/${ia.id}`, { resuelta: 'si' })).status).toBe(422);
  });
});
