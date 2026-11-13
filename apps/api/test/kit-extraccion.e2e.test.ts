// HU-0206 · Proponer el kit desde un curso anterior o un manual de marca en la API (CP-028, IA-18 v2): extraer pide un
// ZIP o un PDF del cliente (422 FORMATO_NO_VALIDO si no) y encola IA-18 en la cola ia con el cliente y el recurso
// (202, el kit no cambia). La propuesta se lee de TrabajoIA.resultado: procesando, lista (con evidencias y el aviso de
// tipografía) o error (p. ej. SIN_COLORES, con un mensaje legible). Descartar deja de ofrecerla. El productor y el
// revisor del cliente reciben 403. PostgreSQL real; colas simuladas.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { TAREA_KIT } from '@aptio/schema/extraccion-kit';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ColasService } from '../src/trabajos/colas.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
const propuestaGrabada = JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/salidas/X-IA-18-kit.json', import.meta.url), 'utf8'));
const EVIDENCIAS = { origen: 'zip', leidos: 3, colores: [{ valor: '#0F2A44', veces: 5 }], fuentes: [{ valor: 'Archivo', veces: 3 }], avisos: [] };

describe.skipIf(!hayBase && !process.env.CI)('kit desde un curso anterior (HU-0206)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let clienteId: string;
  let otroClienteId: string;
  const ids = { zip: randomUUID(), pdf: randomUUID(), png: randomUUID(), ajeno: randomUUID() };
  const cookies: Record<string, string> = {};
  const encolados: { cola: string; datos: { tarea: string; trabajoId: string; organizacionId: string; kit?: { clienteId: string; recursoId: string } } }[] = [];
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    delete: (ruta: string) => request(servidor).delete(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
  });
  const extraer = (quien: string, recursoId: string, cliente = clienteId) => como(quien).post(`/clientes/${cliente}/kit/extraer`, { recursoId });

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org kit', slug: `kit-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina' } })).id;
    otroClienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Otra' } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    await crear('di', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('dg', Rol.DISENADOR_GRAFICO);
    await crear('productor', Rol.PRODUCTOR);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId });
    const base = { organizacionId: orgId, clienteId, origen: 'CLIENTE' as const, bytes: 2048n, hash: 'x' };
    await prisma.recurso.createMany({ data: [
      { ...base, id: ids.zip, tipo: 'DOCUMENTO', claveS3: `k/${ids.zip}`, mime: 'application/zip', nombre: 'curso-anterior.zip' },
      { ...base, id: ids.pdf, tipo: 'DOCUMENTO', claveS3: `k/${ids.pdf}`, mime: 'application/pdf', nombre: 'manual-marca.pdf' },
      { ...base, id: ids.png, tipo: 'IMAGEN', claveS3: `k/${ids.png}`, mime: 'image/png', nombre: 'logo.png' },
      { ...base, id: ids.ajeno, clienteId: otroClienteId, tipo: 'DOCUMENTO', claveS3: `k/${ids.ajeno}`, mime: 'application/zip', nombre: 'ajeno.zip' },
    ] });
    const colas = { encolar: async (cola: string, datos: never) => void encolados.push({ cola, datos }), encolarConEspera: async () => 'x' };
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['di', 'dg', 'productor', 'revisor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });
  beforeEach(() => void (encolados.length = 0));

  afterAll(async () => {
    await app?.close();
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: orgId } });
    await prisma.recurso.deleteMany({ where: { organizacionId: orgId } });
    await prisma.auditoria.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
  });

  it('sin propuesta todavía, 404', async () => {
    expect((await como('di').get(`/clientes/${clienteId}/kit/propuesta`)).status).toBe(404);
  });

  it('CP-028 · extraer de un ZIP encola IA-18 en la cola ia con el cliente y el recurso (202), y la propuesta queda procesando', async () => {
    const r = await extraer('di', ids.zip);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ id: expect.any(String), estado: 'EN_COLA', eventos: '/api/v1/eventos' });
    expect(encolados).toEqual([{ cola: 'ia', datos: { trabajoId: r.body.id, organizacionId: orgId, tarea: TAREA_KIT, kit: { clienteId, recursoId: ids.zip } } }]);
    const t = await prisma.trabajoIA.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(t).toMatchObject({ tarea: 'IA-18', tipo: 'TEXTO', estado: 'EN_COLA', proyectoId: null, resultado: { tipo: 'kit', clienteId, recursoId: ids.zip, nombreArchivo: 'curso-anterior.zip' } });
    const p = await como('di').get(`/clientes/${clienteId}/kit/propuesta`);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ trabajoId: r.body.id, estado: 'procesando', recursoId: ids.zip, nombreArchivo: 'curso-anterior.zip', avisosTipografia: [] });
    expect(p.body.propuesta).toBeUndefined();

    // Lo que deja el worker: evidencias y propuesta en `resultado`.
    await prisma.trabajoIA.update({ where: { id: r.body.id }, data: { estado: 'COMPLETADO', resultado: { ...(t.resultado as object), evidencias: EVIDENCIAS, propuesta: propuestaGrabada } } });
    const lista = await como('dg').get(`/clientes/${clienteId}/kit/propuesta`);
    expect(lista.body).toMatchObject({ estado: 'lista', evidencias: EVIDENCIAS, propuesta: propuestaGrabada, avisosTipografia: ['La marca usa Archivo en títulos; se propone Montserrat (libre)'] });
    // El kit no cambió: aplicar es del equipo, con «Guardar».
    expect(await prisma.kitMarca.count({ where: { clienteId } })).toBe(0);
  });

  it('también de un PDF del manual de marca', async () => {
    const r = await extraer('dg', ids.pdf);
    expect(r.status).toBe(202);
    expect(encolados[0]!.datos.kit).toEqual({ clienteId, recursoId: ids.pdf });
  });

  it('422 FORMATO_NO_VALIDO si el material no es ZIP ni PDF; 404 si es de otro cliente; 422 sin recurso', async () => {
    const r = await extraer('di', ids.png);
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ codigo: 'FORMATO_NO_VALIDO', mensaje: 'El kit se extrae de un ZIP de un curso anterior o de un PDF del manual de marca' });
    expect((await extraer('di', ids.ajeno)).status).toBe(404);
    expect((await como('di').post(`/clientes/${clienteId}/kit/extraer`, {})).status).toBe(422);
    expect(encolados).toHaveLength(0);
  });

  it('un material sin colores deja la propuesta en error con el motivo legible', async () => {
    const r = await extraer('di', ids.zip);
    await prisma.trabajoIA.update({
      where: { id: r.body.id },
      data: { estado: 'ERROR', error: 'sin colores', resultado: { tipo: 'kit', clienteId, recursoId: ids.zip, nombreArchivo: 'curso-anterior.zip', error: { codigo: 'SIN_COLORES', mensaje: 'No se encontraron colores en los estilos del curso' } } },
    });
    const p = await como('di').get(`/clientes/${clienteId}/kit/propuesta`);
    expect(p.body).toMatchObject({ trabajoId: r.body.id, estado: 'error', error: { codigo: 'SIN_COLORES', mensaje: 'No se encontraron colores en los estilos del curso' } });
  });

  it('descartar deja de ofrecer la propuesta y queda en la auditoría', async () => {
    expect((await como('di').delete(`/clientes/${clienteId}/kit/propuesta`)).status).toBe(204);
    expect((await como('di').get(`/clientes/${clienteId}/kit/propuesta`)).status).toBe(404);
    expect(await prisma.auditoria.count({ where: { organizacionId: orgId, accion: 'KIT_PROPUESTA_DESCARTADA', entidadId: clienteId } })).toBe(1);
    // La de otro cliente no se mezcla.
    expect((await como('di').get(`/clientes/${otroClienteId}/kit/propuesta`)).status).toBe(404);
  });

  it('el productor y el revisor del cliente reciben 403', async () => {
    for (const quien of ['productor', 'revisor']) {
      expect((await extraer(quien, ids.zip)).status).toBe(403);
      expect((await como(quien).get(`/clientes/${clienteId}/kit/propuesta`)).status).toBe(403);
      expect((await como(quien).delete(`/clientes/${clienteId}/kit/propuesta`)).status).toBe(403);
    }
    expect(encolados).toHaveLength(0);
  });
});
