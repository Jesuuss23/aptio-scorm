// HU-0203 · Personaje con bocas (CP-023, CP-024) contra PostgreSQL y LocalStack reales. Se salta sin ellos, salvo en CI.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { KIT_INICIAL } from '@aptio/schema/marca';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

process.env.AWS_ENDPOINT ??= 'http://localhost:9000';
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.S3_BUCKET_NAME ??= 'aptio-pruebas-api';

const hayBase = Boolean(process.env.DATABASE_URL);
const hayS3 = await fetch(`${process.env.AWS_ENDPOINT}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
const ANA = readFileSync(new URL('../../../docs/diseno/personaje/plantilla-ana.svg', import.meta.url), 'utf8');
// La boca G no tiene grupos anidados: basta con quitar hasta su primer </g>.
const sinG = ANA.replace(/<g id="boca_G"[^>]*>.*?<\/g>/, '');

describe.skipIf((!hayBase || !hayS3) && !process.env.CI)('personaje del kit (HU-0203)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let clienteId: string;
  const almacen = new Almacen(configDesdeEnv());
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org personaje', slug: `personaje-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina' } })).id;
    const hashClave = await hashearClave(CLAVE);
    for (const [n, rol] of [['grafico', Rol.DISENADOR_GRAFICO], ['productor', Rol.PRODUCTOR]] as const) {
      await prisma.usuario.create({ data: { nombre: n, email: correo(n), rol, organizacionId: orgId, hashClave, emailVerificado: true } });
    }
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['grafico', 'productor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditoria.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { organizacionId: orgId } });
    await prisma.recurso.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
  });

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    put: (ruta: string, datos: object) => request(servidor).put(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });

  async function subirSvg(nombre: string, svg: string) {
    const cuerpo = new TextEncoder().encode(svg);
    const pedido = await como('grafico').post('/recursos/subidas', { nombre, mime: 'image/svg+xml', bytes: cuerpo.length, clienteId });
    expect(pedido.status).toBe(201);
    expect((await fetch(pedido.body.url, { method: 'PUT', headers: pedido.body.cabeceras, body: cuerpo })).status).toBe(200);
    return como('grafico').post(`/recursos/subidas/${pedido.body.subidaId}/confirmar`);
  }

  it('CP-024 · un SVG con <script> se guarda sin el script y sin atributos on*', async () => {
    const peligroso = ANA.replace('<g id="personaje"', '<script>fetch("https://malo.test")</script><g onload="alert(1)" id="personaje"');
    const r = await subirSvg('ana-peligrosa.svg', peligroso);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ tipo: 'SVG', eliminadosAlSanear: expect.arrayContaining(['script', 'atributos on*']) });
    const guardado = await (await fetch(r.body.url)).text();
    expect(guardado).not.toMatch(/<script|onload|malo\.test/);
    expect(guardado).toContain('id="boca_X"');
    const fila = await prisma.recurso.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(Number(fila.bytes)).toBe(Buffer.byteLength(guardado));
    expect((await almacen.info(fila.claveS3))?.cifrado).toBe('aws:kms');
  });

  it('un archivo que no es SVG se rechaza y se borra', async () => {
    const r = await subirSvg('falso.svg', '<html><body>hola</body></html>');
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('TIPO_NO_COINCIDE');
  });

  it('CP-023 · sin la boca G el kit marca «G falta» y la reemplaza por B', async () => {
    expect(sinG).not.toContain('boca_G');
    const svg = await subirSvg('ana.svg', sinG);
    const sinKit = await como('grafico').put(`/clientes/${clienteId}/kit/personaje`, { recursoId: svg.body.id, nombre: 'Ana', version: 1 });
    expect(sinKit.body.codigo).toBe('SIN_KIT');

    const kit = await como('grafico').put(`/clientes/${clienteId}/kit`, { ...KIT_INICIAL, version: 0 });
    const r = await como('grafico').put(`/clientes/${clienteId}/kit/personaje`, { recursoId: svg.body.id, nombre: 'Ana', version: kit.body.version });
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(kit.body.version + 1);
    expect(r.body.personaje).toMatchObject({
      nombre: 'Ana', bocasFaltantes: ['G'], reemplazos: { G: 'B' }, avisos: ['G falta: se usa la B hasta que se agregue'],
    });
    expect(r.body.personaje.bocasDisponibles).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'H', 'X']);
    expect(r.body.personaje.url).toContain('X-Amz-Expires=900');
    expect((await como('productor').get(`/clientes/${clienteId}/kit`)).body.personaje.bocasFaltantes).toEqual(['G']);
  });

  it('sin capas obligatorias no se puede usar; versión vieja da 409; el productor no lo cambia', async () => {
    const actual = (await como('grafico').get(`/clientes/${clienteId}/kit`)).body;
    const incompleto = await subirSvg('boceto.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><g id="boca_X"/></svg>');
    const r = await como('grafico').put(`/clientes/${clienteId}/kit/personaje`, { recursoId: incompleto.body.id, nombre: 'Boceto', version: actual.version });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('PERSONAJE_INCOMPLETO');
    expect(r.body.detalles).toContainEqual({ error: 'Falta la capa obligatoria «cabeza»' });

    const ana = await subirSvg('ana-completa.svg', ANA);
    const viejo = await como('grafico').put(`/clientes/${clienteId}/kit/personaje`, { recursoId: ana.body.id, nombre: 'Ana', version: actual.version - 1 });
    expect(viejo.status).toBe(409);
    expect((await como('productor').put(`/clientes/${clienteId}/kit/personaje`, { recursoId: ana.body.id, nombre: 'Ana', version: actual.version })).status).toBe(403);
    const bien = await como('grafico').put(`/clientes/${clienteId}/kit/personaje`, { recursoId: ana.body.id, nombre: 'Ana', version: actual.version });
    expect(bien.body.personaje).toMatchObject({ bocasFaltantes: [], avisos: [] });
  });
});
