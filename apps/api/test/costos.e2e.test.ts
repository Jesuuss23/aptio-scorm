// HU-1302 · Resumen de costos de IA (CP-097): suma lo que registra TrabajoIA por proyecto, por cliente (con los trabajos
// del cliente sin proyecto, como la propuesta del kit IA-18) y por proveedor y tarea; promedio por SCORM sobre los
// proyectos exportados o, si aún no hay, sobre los que tienen gasto. Filtros por días de Lima, cliente y proyecto, y
// nada de otra organización. Lo ven el administrador y el diseño instruccional; los demás reciben 403. PostgreSQL real.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@costos.test`;

describe.skipIf(!hayBase && !process.env.CI)('resumen de costos (HU-1302)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const orgs: string[] = [];
  const ids: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  const costos = (quien: string, q: Record<string, string> = {}) => request(servidor).get('/api/v1/costos').query(q).set('Cookie', cookies[quien]!);

  beforeAll(async () => {
    const org = (await prisma.organizacion.create({ data: { nombre: 'Org costos', slug: `costos-${sufijo}` } })).id;
    const otra = (await prisma.organizacion.create({ data: { nombre: 'Otra org', slug: `costos-otra-${sufijo}` } })).id;
    orgs.push(org, otra);
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = org, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...extra } });
    const admin = await crear('admin', Rol.ADMINISTRADOR);
    await crear('di', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('dg', Rol.DISENADOR_GRAFICO);
    await crear('productor', Rol.PRODUCTOR);
    const ajeno = await crear('ajeno', Rol.ADMINISTRADOR, otra);

    ids.minera = (await prisma.cliente.create({ data: { organizacionId: org, nombre: 'Minera Andina' } })).id;
    ids.banco = (await prisma.cliente.create({ data: { organizacionId: org, nombre: 'Banco Sur' } })).id;
    ids.clienteAjeno = (await prisma.cliente.create({ data: { organizacionId: otra, nombre: 'Ajeno' } })).id;
    await crear('revisor', Rol.REVISOR_CLIENTE, org, { clienteId: ids.minera });

    const proyecto = async (clave: string, organizacionId: string, clienteId: string, creadoPorId: string, exportado: boolean) => {
      const p = await prisma.proyecto.create({ data: { organizacionId, clienteId, nombre: clave, creadoPorId } });
      const c = await prisma.curso.create({ data: { organizacionId, proyectoId: p.id, versionEsquema: '0.2.0', documento: {} } });
      if (exportado) await prisma.exportacion.create({ data: { organizacionId, cursoId: c.id, versionCurso: 1, formato: 'SCORM12', modoIdioma: 'unico', estado: 'COMPLETADO', creadoPorId } });
      // Una exportación con error no cuenta como SCORM entregado.
      else await prisma.exportacion.create({ data: { organizacionId, cursoId: c.id, versionCurso: 1, formato: 'SCORM12', modoIdioma: 'unico', estado: 'ERROR', creadoPorId } });
      const g = await prisma.generacion.create({ data: { organizacionId, proyectoId: p.id, parametros: {}, iniciadoPorId: creadoPorId, estado: 'COMPLETADO' } });
      ids[clave] = p.id;
      return { proyectoId: p.id, generacionId: g.id };
    };
    const loto = await proyecto('LOTO', org, ids.minera, admin.id, true);
    const altura = await proyecto('Trabajo en altura', org, ids.minera, admin.id, true);
    const fraude = await proyecto('Prevención de fraude', org, ids.banco, admin.id, false);
    const externo = await proyecto('Externo', otra, ids.clienteAjeno, ajeno.id, true);

    // Octubre y noviembre en hora de Lima: el 31/10 a las 23:30 de Lima ya es 1/11 en UTC.
    const oct = new Date('2026-10-15T15:00:00Z');
    const finOct = new Date('2026-11-01T04:30:00Z');
    const nov = new Date('2026-11-10T15:00:00Z');
    const t = (organizacionId: string, en: object, tarea: string, proveedor: string, costoUsd: number, creadoEn: Date, extra: object = {}) =>
      ({ organizacionId, ...en, tarea, tipo: 'TEXTO' as const, proveedor, modelo: 'm', costoUsd, estado: 'COMPLETADO' as const, creadoEn, ...extra });
    await prisma.trabajoIA.createMany({ data: [
      t(org, loto, 'IA-02', 'anthropic', 1.2, oct),
      t(org, loto, 'IA-03', 'anthropic', 0.8, nov),
      t(org, loto, 'IA-09', 'google-tts', 0.5, nov, { tipo: 'VOZ' }),
      t(org, altura, 'IA-02', 'anthropic', 1.5, finOct),
      t(org, altura, 'IA-07', 'openai-imagen', 2.5, nov, { tipo: 'IMAGEN' }),
      t(org, fraude, 'IA-02', 'anthropic', 0.6, nov),
      // Propuesta de kit del cliente, sin proyecto (HU-0206).
      t(org, {}, 'IA-18', 'anthropic', 0.25, nov, { resultado: { tipo: 'kit', clienteId: ids.banco, recursoId: ids.banco, nombreArchivo: 'manual.pdf' } }),
      // Encolado que aún no llamó al proveedor: no cuenta.
      t(org, loto, 'IA-12', '-', 0, nov, { estado: 'EN_COLA' }),
      t(otra, externo, 'IA-02', 'anthropic', 9, nov),
    ] });

    const app0 = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(app0.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['admin', 'di', 'dg', 'productor', 'revisor', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    for (const organizacionId of orgs) {
      await prisma.trabajoIA.deleteMany({ where: { organizacionId } });
      await prisma.exportacion.deleteMany({ where: { organizacionId } });
      await prisma.generacion.deleteMany({ where: { organizacionId } });
      await prisma.curso.deleteMany({ where: { organizacionId } });
      await prisma.proyecto.deleteMany({ where: { organizacionId } });
    }
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@costos.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  });

  it('CP-097 · 3 proyectos con generaciones: total de cada uno y promedio por SCORM exportado', async () => {
    const r = await costos('admin');
    expect(r.status).toBe(200);
    expect(r.body.totalUsd).toBe(7.35);
    expect(r.body.porProyecto).toEqual([
      { proyectoId: ids['Trabajo en altura'], nombre: 'Trabajo en altura', clienteId: ids.minera, cliente: 'Minera Andina', llamadas: 2, usd: 4, exportado: true },
      { proyectoId: ids.LOTO, nombre: 'LOTO', clienteId: ids.minera, cliente: 'Minera Andina', llamadas: 3, usd: 2.5, exportado: true },
      { proyectoId: ids['Prevención de fraude'], nombre: 'Prevención de fraude', clienteId: ids.banco, cliente: 'Banco Sur', llamadas: 1, usd: 0.6, exportado: false },
    ]);
    // Solo LOTO y Trabajo en altura tienen un paquete exportado: (2,5 + 4) / 2.
    expect(r.body).toMatchObject({ criterioPromedio: 'exportados', scormContados: 2, promedioPorScormUsd: 3.25 });
    expect(r.body.porCliente).toEqual([
      { clienteId: ids.minera, nombre: 'Minera Andina', proyectosUsd: 6.5, sinProyectoUsd: 0, usd: 6.5 },
      { clienteId: ids.banco, nombre: 'Banco Sur', proyectosUsd: 0.6, sinProyectoUsd: 0.25, usd: 0.85 },
    ]);
    expect(r.body.porProveedorTarea).toEqual([
      { proveedor: 'anthropic', tarea: 'IA-02', llamadas: 3, usd: 3.3 },
      { proveedor: 'openai-imagen', tarea: 'IA-07', llamadas: 1, usd: 2.5 },
      { proveedor: 'anthropic', tarea: 'IA-03', llamadas: 1, usd: 0.8 },
      { proveedor: 'google-tts', tarea: 'IA-09', llamadas: 1, usd: 0.5 },
      { proveedor: 'anthropic', tarea: 'IA-18', llamadas: 1, usd: 0.25 },
    ]);
    // El diseño instruccional ve lo mismo.
    expect((await costos('di')).body).toEqual(r.body);
  });

  it('filtra por días de Lima, cliente y proyecto', async () => {
    // Octubre de Lima incluye el trabajo del 31/10 a las 23:30 (1/11 en UTC).
    const oct = await costos('admin', { desde: '2026-10-01', hasta: '2026-10-31' });
    expect(oct.body.totalUsd).toBe(2.7);
    expect(oct.body.porProyecto.map((p: { nombre: string; usd: number }) => [p.nombre, p.usd])).toEqual([['Trabajo en altura', 1.5], ['LOTO', 1.2]]);
    const nov = await costos('admin', { desde: '2026-11-01' });
    expect(nov.body.totalUsd).toBe(4.65);

    const banco = await costos('admin', { clienteId: ids.banco! });
    expect(banco.body.totalUsd).toBe(0.85);
    expect(banco.body.porCliente).toEqual([{ clienteId: ids.banco, nombre: 'Banco Sur', proyectosUsd: 0.6, sinProyectoUsd: 0.25, usd: 0.85 }]);
    // Sin exportaciones en el alcance, el promedio usa los proyectos con gasto.
    expect(banco.body).toMatchObject({ criterioPromedio: 'con-gasto', scormContados: 1, promedioPorScormUsd: 0.6 });

    const loto = await costos('admin', { proyectoId: ids.LOTO! });
    expect(loto.body).toMatchObject({ totalUsd: 2.5, scormContados: 1, promedioPorScormUsd: 2.5 });
    expect(loto.body.porCliente).toEqual([{ clienteId: ids.minera, nombre: 'Minera Andina', proyectosUsd: 2.5, sinProyectoUsd: 0, usd: 2.5 }]);

    const vacio = await costos('admin', { desde: '2027-01-01' });
    expect(vacio.body).toEqual({ totalUsd: 0, scormContados: 0, promedioPorScormUsd: 0, criterioPromedio: 'con-gasto', porProyecto: [], porCliente: [], porProveedorTarea: [] });

    expect((await costos('admin', { desde: '1/11/2026' })).status).toBe(422);
    expect((await costos('admin', { clienteId: 'x' })).status).toBe(422);
  });

  it('nada de otra organización se mezcla, ni con sus identificadores', async () => {
    const ajeno = await costos('ajeno');
    expect(ajeno.body).toMatchObject({ totalUsd: 9, scormContados: 1, promedioPorScormUsd: 9 });
    expect((await costos('admin', { clienteId: ids.clienteAjeno! })).body.totalUsd).toBe(0);
    expect((await costos('admin', { proyectoId: ids.Externo! })).body.totalUsd).toBe(0);
    expect((await costos('ajeno', { clienteId: ids.minera! })).body.porCliente).toEqual([]);
  });

  it('diseño gráfico, producción y el revisor del cliente reciben 403', async () => {
    for (const quien of ['dg', 'productor', 'revisor']) expect((await costos(quien)).status).toBe(403);
    expect((await request(servidor).get('/api/v1/costos')).status).toBe(401);
  });
});
