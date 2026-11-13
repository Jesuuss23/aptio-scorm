// HU-1303 · Rentabilidad y mediciones (CP-098, RN-13-1): parámetros por organización (ejemplo del prototipo hasta que se
// guarden; solo administración edita), mediciones por proyecto, escenario y etapa (las 8 fijas) con borrado, y el
// cálculo con «supuestos» o «mediciones» (promedio entre proyectos; un escenario sin mediciones usa los supuestos).
// Diseño gráfico, producción y el revisor del cliente reciben 403. PostgreSQL real.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { PARAMETROS_EJEMPLO } from '@aptio/schema/rentabilidad';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@negocio.test`;
const cerca = (n: number, d = 2) => Number(n.toFixed(d));

describe.skipIf(!hayBase && !process.env.CI)('rentabilidad y mediciones (HU-1303)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const orgs: string[] = [];
  const ids: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1/negocio${ruta}`).set('Cookie', cookies[quien]!),
    put: (ruta: string, datos: object) => request(servidor).put(`/api/v1/negocio${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    post: (ruta: string, datos: object) => request(servidor).post(`/api/v1/negocio${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    delete: (ruta: string) => request(servidor).delete(`/api/v1/negocio${ruta}`).set('Cookie', cookies[quien]!),
  });

  beforeAll(async () => {
    const org = (await prisma.organizacion.create({ data: { nombre: 'Org negocio', slug: `negocio-${sufijo}` } })).id;
    const otra = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `negocio-otra-${sufijo}` } })).id;
    orgs.push(org, otra);
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = org, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...extra } });
    const admin = await crear('admin', Rol.ADMINISTRADOR);
    await crear('di', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('dg', Rol.DISENADOR_GRAFICO);
    await crear('productor', Rol.PRODUCTOR);
    const ajeno = await crear('ajeno', Rol.ADMINISTRADOR, otra);
    const cliente = (await prisma.cliente.create({ data: { organizacionId: org, nombre: 'Minera Andina' } })).id;
    const clienteOtra = (await prisma.cliente.create({ data: { organizacionId: otra, nombre: 'Ajeno' } })).id;
    await crear('revisor', Rol.REVISOR_CLIENTE, org, { clienteId: cliente });
    ids.loto = (await prisma.proyecto.create({ data: { organizacionId: org, clienteId: cliente, nombre: 'Bloqueo y etiquetado', creadoPorId: admin.id } })).id;
    ids.ajeno = (await prisma.proyecto.create({ data: { organizacionId: otra, clienteId: clienteOtra, nombre: 'Ajeno', creadoPorId: ajeno.id } })).id;

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['admin', 'di', 'dg', 'productor', 'revisor', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.medicionProceso.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.parametrosNegocio.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@negocio.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  });

  it('sin parámetros guardados devuelve el ejemplo del prototipo y su cálculo', async () => {
    const p = await como('di').get('/parametros');
    expect(p.status).toBe(200);
    expect(p.body).toEqual({ ...PARAMETROS_EJEMPLO, ejemplo: true, actualizadoEn: null });
    const r = await como('di').get('/rentabilidad');
    expect(r.body).toMatchObject({ fuente: 'supuestos', horasHoy: 150, horasGenerador: 25.5, respaldo: { hoy: 'supuestos', generador: 'supuestos' } });
    expect(cerca(r.body.costoHoy)).toBe(3640.91);
    expect(cerca(r.body.costoGenerador)).toBe(629.11);
  });

  it('administración guarda los parámetros de su organización; diseño instruccional solo los ve', async () => {
    const datos = { ...PARAMETROS_EJEMPLO, tarifaHora: 30, tipoCambio: 3.8, etapas: [{ etapa: 'boca', horasHoy: 10, horasGenerador: 0 }] };
    expect((await como('di').put('/parametros', datos)).status).toBe(403);
    const g = await como('admin').put('/parametros', datos);
    expect(g.status).toBe(200);
    expect(g.body).toMatchObject({ tarifaHora: 30, tipoCambio: 3.8, ejemplo: false, actualizadoEn: expect.any(String) });
    // Las etapas que faltan toman el ejemplo, en el orden fijo.
    expect(g.body.etapas).toHaveLength(8);
    expect(g.body.etapas[4]).toEqual({ etapa: 'boca', horasHoy: 10, horasGenerador: 0 });
    expect((await como('di').get('/parametros')).body).toMatchObject({ tarifaHora: 30, ejemplo: false });
    // Horas hoy: 150 − 16 + 10 = 144.
    expect((await como('di').get('/rentabilidad')).body.horasHoy).toBe(144);
    // La otra organización sigue con el ejemplo.
    expect((await como('ajeno').get('/parametros')).body).toMatchObject({ tarifaHora: 22, ejemplo: true });
    expect(await prisma.auditoria.count({ where: { organizacionId: orgs[0]!, accion: 'PARAMETROS_NEGOCIO_GUARDADOS' } })).toBe(1);

    for (const malo of [{ ...datos, personas: 0 }, { ...datos, tipoCambio: 0 }, { ...datos, etapas: [{ etapa: 'otra', horasHoy: 1, horasGenerador: 1 }] }, { ...datos, precioHoy: -1 }, { tarifaHora: 30 }]) {
      expect((await como('admin').put('/parametros', malo)).status).toBe(422);
    }
  });

  it('CP-098 · con las horas reales de 2 proyectos, «mediciones» usa sus promedios', async () => {
    const registrar = (datos: object, quien = 'di') => como(quien).post('/mediciones', datos);
    const r1 = await registrar({ proyectoId: ids.loto, escenario: 'hoy', etapa: 'lectura-guion', horas: 18 });
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ proyectoRef: 'Bloqueo y etiquetado', proyectoId: ids.loto, escenario: 'hoy', etapa: 'lectura-guion', horas: 18, registradoPor: 'di' });
    await registrar({ proyectoId: ids.loto, escenario: 'hoy', etapa: 'diseno-grafico', horas: 60 });
    await registrar({ proyectoRef: 'Curso de inducción 2025', escenario: 'hoy', etapa: 'lectura-guion', horas: 22, notas: 'Antes de la herramienta' }, 'admin');
    await registrar({ proyectoRef: 'Curso de inducción 2025', escenario: 'hoy', etapa: 'animacion', horas: 40 }, 'admin');

    const lista = await como('admin').get('/mediciones');
    expect(lista.body).toHaveLength(4);
    expect(lista.body[0]).toMatchObject({ proyectoRef: 'Curso de inducción 2025', etapa: 'animacion', proyectoId: null, registradoPor: 'admin' });

    // Hoy: (18 + 60 + 22 + 40) ÷ 2 proyectos = 70 h; el generador no tiene mediciones y usa los supuestos.
    const m = await como('di').get('/rentabilidad?fuente=mediciones');
    expect(m.body).toMatchObject({ fuente: 'mediciones', horasHoy: 70, horasGenerador: 25.5, proyectosMedidos: { hoy: 2, generador: 0 }, respaldo: { hoy: 'mediciones', generador: 'supuestos' } });
    expect(m.body.etapas.slice(0, 3).map((e: { horasHoy: number }) => e.horasHoy)).toEqual([20, 30, 20]);
    // Costo con tarifa 30: 70 × 30 + 900 ÷ (396 ÷ 70); margen a S/ 1.500.
    const costo = 70 * 30 + 900 / (396 / 70);
    expect(cerca(m.body.costoHoy)).toBe(cerca(costo));
    expect(cerca(m.body.margenCompetenciaHoy, 4)).toBe(cerca((1500 - costo) / 1500, 4));
    // Con «supuestos» no cambian.
    expect((await como('di').get('/rentabilidad?fuente=supuestos')).body.horasHoy).toBe(144);
    expect((await como('di').get('/rentabilidad?fuente=otra')).status).toBe(422);

    // La otra organización no ve estas mediciones.
    expect((await como('ajeno').get('/mediciones')).body).toEqual([]);
    expect((await como('ajeno').get('/rentabilidad?fuente=mediciones')).body.proyectosMedidos).toEqual({ hoy: 0, generador: 0 });
  });

  it('422 ante datos no válidos o un proyecto ajeno; borrar quita la medición de su organización', async () => {
    const base = { proyectoRef: 'Proyecto X', escenario: 'generador', etapa: 'audio', horas: 1.5 };
    for (const malo of [{ ...base, escenario: 'manana' }, { ...base, etapa: 'otra' }, { ...base, horas: -1 }, { ...base, horas: 1.555 }, { ...base, proyectoRef: undefined }, { ...base, proyectoRef: 'x' }]) {
      expect((await como('di').post('/mediciones', malo)).status).toBe(422);
    }
    const ajeno = await como('di').post('/mediciones', { ...base, proyectoRef: undefined, proyectoId: ids.ajeno });
    expect(ajeno.status).toBe(422);
    expect(ajeno.body.codigo).toBe('PROYECTO_NO_VALIDO');

    const nueva = await como('di').post('/mediciones', base);
    expect(nueva.status).toBe(201);
    expect((await como('di').get('/rentabilidad?fuente=mediciones')).body.respaldo.generador).toBe('mediciones');
    expect((await como('ajeno').delete(`/mediciones/${nueva.body.id}`)).status).toBe(404);
    expect((await como('di').delete(`/mediciones/${nueva.body.id}`)).status).toBe(204);
    expect((await como('di').delete(`/mediciones/${nueva.body.id}`)).status).toBe(404);
    expect((await como('di').get('/rentabilidad?fuente=mediciones')).body.respaldo.generador).toBe('supuestos');
    expect(await prisma.auditoria.count({ where: { organizacionId: orgs[0]!, accion: 'MEDICION_BORRADA', entidadId: nueva.body.id } })).toBe(1);
  });

  it('diseño gráfico, producción y el revisor del cliente reciben 403', async () => {
    for (const quien of ['dg', 'productor', 'revisor']) {
      expect((await como(quien).get('/parametros')).status).toBe(403);
      expect((await como(quien).put('/parametros', PARAMETROS_EJEMPLO)).status).toBe(403);
      expect((await como(quien).get('/rentabilidad')).status).toBe(403);
      expect((await como(quien).get('/mediciones')).status).toBe(403);
      expect((await como(quien).post('/mediciones', { proyectoRef: 'Proyecto X', escenario: 'hoy', etapa: 'audio', horas: 1 })).status).toBe(403);
    }
  });
});
