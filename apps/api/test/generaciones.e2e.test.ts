// HU-0401 y HU-0408 · Lanzar, ver, cancelar y continuar la generación (CP-036, CP-037, CP-045) contra PostgreSQL real;
// la cola se sustituye por un doble. Las etapas corren en el worker y se prueban en apps/worker/test/generar.test.ts.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DatosTrabajo, NombreCola } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { ETAPAS } from '@aptio/schema/generacion';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ColasService } from '../src/trabajos/colas.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;

describe.skipIf(!hayBase && !process.env.CI)('generación del SCORM (HU-0401, HU-0408)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let otraOrgId: string;
  let clienteId: string;
  let productorId: string;
  const cookies: Record<string, string> = {};
  const encolados: { cola: NombreCola; datos: DatosTrabajo; jobId: string | undefined }[] = [];
  let colaCaida = false;

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org generación', slug: `generacion-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `generacion-otra-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } })).id;
    const otroClienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Banco Sur', idiomas: ['es'] } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = orgId, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...extra } });
    productorId = (await crear('productor', Rol.PRODUCTOR)).id;
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, orgId, { clienteId });
    await crear('revisor-otro', Rol.REVISOR_CLIENTE, orgId, { clienteId: otroClienteId });
    await crear('ajeno', Rol.ADMINISTRADOR, otraOrgId);

    const colas = {
      encolar: (cola: NombreCola, datos: DatosTrabajo, jobId?: string) => {
        if (colaCaida) return Promise.reject(new Error('Redis no responde'));
        encolados.push({ cola, datos, jobId });
        return Promise.resolve();
      },
    };
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['productor', 'grafico', 'revisor', 'revisor-otro', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: [orgId, otraOrgId] } } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  beforeEach(() => {
    encolados.length = 0;
    colaCaida = false;
  });

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  async function proyecto(material: 'listo' | 'pendiente' | 'error' | null = 'listo') {
    const p = await prisma.proyecto.create({
      data: { organizacionId: orgId, clienteId, nombre: 'Bloqueo y etiquetado', creadoPorId: productorId, pantallasObjetivo: 30, publico: 'Técnicos de planta', tono: 'cercano' },
    });
    if (material) await prisma.materialFuente.create({ data: { proyectoId: p.id, tipo: 'TEMA', tema: 'LOTO', estado: material } });
    return p.id;
  }
  const estadoProyecto = async (id: string) => (await prisma.proyecto.findUniqueOrThrow({ where: { id } })).estado;

  it('CP-036 · lanza la generación con las 11 etapas en cola y la encola en la cola ia', async () => {
    const id = await proyecto();
    const res = await como('productor').post(`/proyectos/${id}/generaciones`, { idiomas: ['es', 'en'] });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      proyectoId: id, estado: 'EN_COLA', avance: 0, costoUsd: 0, terminadoEn: null,
      parametros: { pantallas: 30, idiomas: ['es', 'en'], publico: 'Técnicos de planta', tono: 'cercano', porcentajeActividades: 40 },
    });
    expect(res.body.etapas.map((e: { etapa: string }) => e.etapa)).toEqual([...ETAPAS]);
    expect(res.body.etapas.every((e: { estado: string; orden: number }, i: number) => e.estado === 'EN_COLA' && e.orden === i + 1)).toBe(true);
    expect(encolados).toEqual([{ cola: 'ia', datos: { trabajoId: res.body.id, organizacionId: orgId, tarea: 'GENERAR' }, jobId: `${res.body.id}:1` }]);
    expect(await estadoProyecto(id)).toBe('GENERANDO');
    expect(await prisma.auditoria.count({ where: { accion: 'GENERACION_LANZADA', entidadId: res.body.id } })).toBe(1);

    // El equipo y el revisor de ese cliente la ven; la lista va de la más nueva a la más antigua.
    expect((await como('grafico').get(`/generaciones/${res.body.id}`)).body.id).toBe(res.body.id);
    expect((await como('revisor').get(`/proyectos/${id}/generaciones`)).body.map((g: { id: string }) => g.id)).toEqual([res.body.id]);
  });

  it('CP-037 · un segundo lanzamiento, aunque sea simultáneo, recibe 409 y no crea otra generación', async () => {
    const id = await proyecto();
    const [a, b] = await Promise.all([como('productor').post(`/proyectos/${id}/generaciones`), como('productor').post(`/proyectos/${id}/generaciones`)]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    const rechazo = a.status === 409 ? a : b;
    expect(rechazo.body.codigo).toBe('GENERACION_ACTIVA');
    expect(await prisma.generacion.count({ where: { proyectoId: id } })).toBe(1);
    expect(encolados).toHaveLength(1);
  });

  it('exige material leído: sin material, en lectura o con error devuelve 422', async () => {
    for (const [material, codigo] of [[null, 'SIN_MATERIAL'], ['pendiente', 'MATERIAL_EN_PROCESO'], ['error', 'SIN_MATERIAL']] as const) {
      const res = await como('productor').post(`/proyectos/${await proyecto(material)}/generaciones`);
      expect(res.status).toBe(422);
      expect(res.body.codigo).toBe(codigo);
    }
    expect((await como('productor').post(`/proyectos/${await proyecto()}/generaciones`, { pantallas: 2 })).status).toBe(422);
    expect(encolados).toHaveLength(0);
  });

  it('CP-045 · cancelar conserva las etapas terminadas y deja las pendientes canceladas', async () => {
    const id = await proyecto();
    const g = (await como('productor').post(`/proyectos/${id}/generaciones`)).body;
    // El worker ya terminó las etapas 1 y 2 y está en la 3.
    await prisma.generacionEtapa.updateMany({ where: { generacionId: g.id, orden: { lte: 2 } }, data: { estado: 'COMPLETADO', detalle: { texto: 'hecho' } } });
    await prisma.generacionEtapa.updateMany({ where: { generacionId: g.id, orden: 3 }, data: { estado: 'EN_CURSO' } });
    await prisma.generacion.update({ where: { id: g.id }, data: { estado: 'EN_CURSO' } });

    const res = await como('productor').post(`/generaciones/${g.id}/cancelar`);
    expect(res.status).toBe(202);
    expect(res.body.estado).toBe('CANCELADO');
    expect(res.body.avance).toBe(18);
    expect(res.body.etapas.slice(0, 4).map((e: { estado: string }) => e.estado)).toEqual(['COMPLETADO', 'COMPLETADO', 'CANCELADO', 'CANCELADO']);
    expect(res.body.etapas[0].detalle).toBe('hecho');
    expect(await estadoProyecto(id)).toBe('BORRADOR');
    expect((await como('productor').post(`/generaciones/${g.id}/cancelar`)).body.codigo).toBe('GENERACION_TERMINADA');

    // Cancelada, ya se puede lanzar otra en el mismo proyecto.
    expect((await como('productor').post(`/proyectos/${id}/generaciones`)).status).toBe(202);
  });

  it('HU-0408 · continuar retoma desde la etapa con error sin tocar las terminadas', async () => {
    const id = await proyecto();
    const g = (await como('productor').post(`/proyectos/${id}/generaciones`)).body;
    expect((await como('productor').post(`/generaciones/${g.id}/continuar`)).body.codigo).toBe('GENERACION_NO_RETOMABLE');

    await prisma.generacionEtapa.updateMany({ where: { generacionId: g.id, orden: 1 }, data: { estado: 'COMPLETADO', detalle: { texto: 'resumen' } } });
    await prisma.generacionEtapa.updateMany({ where: { generacionId: g.id, orden: 2 }, data: { estado: 'ERROR', detalle: { texto: '529' } } });
    await prisma.generacion.update({ where: { id: g.id }, data: { estado: 'ERROR', terminadoEn: new Date() } });
    encolados.length = 0;

    const res = await como('productor').post(`/generaciones/${g.id}/continuar`);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ estado: 'EN_COLA', terminadoEn: null });
    expect(res.body.etapas[0]).toMatchObject({ estado: 'COMPLETADO', detalle: 'resumen' });
    expect(res.body.etapas[1]).toMatchObject({ estado: 'EN_COLA', detalle: null });
    // Otro jobId: BullMQ descarta un trabajo repetido con el mismo id.
    expect(encolados).toEqual([{ cola: 'ia', datos: { trabajoId: g.id, organizacionId: orgId, tarea: 'GENERAR' }, jobId: `${g.id}:2` }]);
    expect(await estadoProyecto(id)).toBe('GENERANDO');
  });

  it('CP-038 · el resultado de una etapa terminada trae sus datos; una sin terminar, null', async () => {
    const id = await proyecto();
    const g = (await como('productor').post(`/proyectos/${id}/generaciones`)).body;
    const datos = { ideas: [{ id: 't04-f01', texto: 'Bloqueo: colocar un candado personal.', paginas: [7] }], acta: { titulo: 'Acta', temas: [], textoActa: 'Sin omitidos' } };
    await prisma.generacionEtapa.updateMany({ where: { generacionId: g.id, orden: 1 }, data: { estado: 'COMPLETADO', detalle: { texto: '30 páginas → 1 idea clave', datos } } });
    const res = await como('revisor').get(`/generaciones/${g.id}/etapas/RESUMEN_MATERIAL`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ etapa: 'RESUMEN_MATERIAL', estado: 'COMPLETADO', detalle: '30 páginas → 1 idea clave', datos });
    expect((await como('grafico').get(`/generaciones/${g.id}/etapas/OBJETIVOS_ESTRUCTURA`)).body).toMatchObject({ estado: 'EN_COLA', datos: null });
    expect((await como('grafico').get(`/generaciones/${g.id}/etapas/NO_EXISTE`)).status).toBe(404);
    expect((await como('ajeno').get(`/generaciones/${g.id}/etapas/RESUMEN_MATERIAL`)).status).toBe(404);
  });

  it('si la cola no responde, la generación queda en error y el proyecto en borrador', async () => {
    const id = await proyecto();
    colaCaida = true;
    expect((await como('productor').post(`/proyectos/${id}/generaciones`)).status).toBe(500);
    const g = await prisma.generacion.findFirstOrThrow({ where: { proyectoId: id } });
    expect(g.estado).toBe('ERROR');
    expect(await estadoProyecto(id)).toBe('BORRADOR');
  });

  it('permisos: el gráfico y el revisor no lanzan; otro cliente u otra organización no la ven', async () => {
    const id = await proyecto();
    expect((await como('grafico').post(`/proyectos/${id}/generaciones`)).status).toBe(403);
    expect((await como('revisor').post(`/proyectos/${id}/generaciones`)).status).toBe(403);
    const g = (await como('productor').post(`/proyectos/${id}/generaciones`)).body;
    expect((await como('revisor').post(`/generaciones/${g.id}/cancelar`)).status).toBe(403);
    expect((await como('revisor-otro').get(`/generaciones/${g.id}`)).status).toBe(404);
    expect((await como('ajeno').get(`/generaciones/${g.id}`)).status).toBe(404);
    expect((await como('ajeno').get(`/proyectos/${id}/generaciones`)).status).toBe(404);
    expect((await como('ajeno').get(`/generaciones/${g.id}/eventos`)).status).toBe(404);
  });
});
