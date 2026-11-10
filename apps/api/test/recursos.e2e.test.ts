// HU-1404 · Subidas cifradas y URL firmada (CP-103, CP-034) contra PostgreSQL y LocalStack reales.
// Se salta sin esos servicios, salvo en CI.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { RetencionService } from '../src/recursos/retencion.service.js';

process.env.AWS_ENDPOINT ??= 'http://localhost:9000';
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.S3_BUCKET_NAME ??= 'aptio-pruebas-api';

const hayBase = Boolean(process.env.DATABASE_URL);
const hayS3 = await fetch(`${process.env.AWS_ENDPOINT}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;

const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const EXE = (() => {
  const b = Buffer.alloc(512);
  b.set([0x4d, 0x5a], 0);
  b.set([0x80, 0, 0, 0], 0x3c);
  b.set([0x50, 0x45, 0, 0], 0x80);
  return b;
})();

describe.skipIf((!hayBase || !hayS3) && !process.env.CI)('recursos y almacenamiento cifrado (HU-1404)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let otraOrgId: string;
  let clienteId: string;
  let otroClienteId: string;
  let usuarioId: string;
  const almacen = new Almacen(configDesdeEnv());
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org recursos', slug: `recursos-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `recursos-otra-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: `Minera ${sufijo}`, retencionDocumentosDias: 180 } })).id;
    otroClienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: `Banco ${sufijo}` } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = orgId, cliente?: string) =>
      prisma.usuario.create({
        data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...(cliente ? { clienteId: cliente } : {}) },
      });
    usuarioId = (await crear('productor', Rol.PRODUCTOR)).id;
    await crear('ajeno', Rol.ADMINISTRADOR, otraOrgId);
    await crear('revisor', Rol.REVISOR_CLIENTE, orgId, otroClienteId);

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['productor', 'ajeno', 'revisor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: [orgId, otraOrgId] } } });
    await prisma.recurso.deleteMany({ where: { organizacionId: orgId } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });

  /** Pide la URL, sube con el PUT firmado (como el navegador) y confirma. */
  async function subir(nombre: string, mime: string, cuerpo: Buffer, extra: object = { clienteId, origen: 'CLIENTE' }) {
    const pedido = await como('productor').post('/recursos/subidas', { nombre, mime, bytes: cuerpo.length, ...extra });
    expect(pedido.status).toBe(201);
    const put = await fetch(pedido.body.url, { method: 'PUT', headers: pedido.body.cabeceras, body: new Uint8Array(cuerpo) });
    expect(put.status).toBe(200);
    return { pedido, confirmado: await como('productor').post(`/recursos/subidas/${pedido.body.subidaId}/confirmar`) };
  }

  it('CP-103 · un PDF subido queda cifrado con KMS y solo se descarga con URL firmada de 15 minutos', async () => {
    const { pedido, confirmado } = await subir('Política de seguridad.pdf', 'application/pdf', PDF);
    expect(new URL(pedido.body.url).searchParams.get('X-Amz-Expires')).toBe('900');
    expect(confirmado.status).toBe(201);
    expect(confirmado.body).toMatchObject({ tipo: 'DOCUMENTO', origen: 'CLIENTE', nombre: 'Política de seguridad.pdf', bytes: PDF.length, clienteId });
    expect(confirmado.body.hash).toMatch(/^[0-9a-f]{64}$/);

    const fila = await prisma.recurso.findUniqueOrThrow({ where: { id: confirmado.body.id } });
    expect(fila.claveS3).not.toContain('Política');
    expect((await almacen.info(fila.claveS3))?.cifrado).toBe('aws:kms');

    const visto = await como('productor').get(`/recursos/${confirmado.body.id}`);
    const url = new URL(visto.body.url);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(Buffer.from(await (await fetch(url)).arrayBuffer()).equals(PDF)).toBe(true);
    // El bloqueo de acceso público lo comprueba packages/almacen: LocalStack no lo aplica a las lecturas sin firma.

    // Confirmar dos veces no duplica el recurso.
    const otra = await como('productor').post(`/recursos/subidas/${pedido.body.subidaId}/confirmar`);
    expect(otra.body.id).toBe(confirmado.body.id);
  });

  it('CP-034 · un .exe renombrado a .pdf se rechaza y se borra del almacenamiento', async () => {
    const { pedido, confirmado } = await subir('informe.pdf', 'application/pdf', EXE);
    expect(confirmado.status).toBe(422);
    expect(confirmado.body).toMatchObject({ codigo: 'TIPO_NO_COINCIDE', detalles: [{ declarado: 'application/pdf', real: 'application/x-msdownload' }] });
    expect(await prisma.subida.findUnique({ where: { id: pedido.body.subidaId } })).toBeNull();
    expect(await prisma.recurso.count({ where: { organizacionId: orgId, nombre: 'informe.pdf' } })).toBe(0);
    const auditoria = await prisma.auditoria.findFirst({ where: { organizacionId: orgId, accion: 'ARCHIVO_RECHAZADO' } });
    expect(auditoria?.entidadId).toBe(pedido.body.subidaId);
  });

  it('rechaza tipos fuera de la lista, archivos demasiado grandes y confirmar sin haber subido', async () => {
    const svg = await como('productor').post('/recursos/subidas', { nombre: 'a.svg', mime: 'image/svg+xml', bytes: 10 });
    expect(svg.status).toBe(422);
    expect(svg.body.codigo).toBe('TIPO_NO_PERMITIDO');
    const grande = await como('productor').post('/recursos/subidas', { nombre: 'a.png', mime: 'image/png', bytes: 50 * 1024 * 1024 });
    expect(grande.body.codigo).toBe('ARCHIVO_GRANDE');
    const sinCliente = await como('productor').post('/recursos/subidas', { nombre: 'a.pdf', mime: 'application/pdf', bytes: 10, origen: 'CLIENTE' });
    expect(sinCliente.body.codigo).toBe('SIN_CLIENTE');

    const pedido = await como('productor').post('/recursos/subidas', { nombre: 'a.pdf', mime: 'application/pdf', bytes: 10 });
    const sinArchivo = await como('productor').post(`/recursos/subidas/${pedido.body.subidaId}/confirmar`);
    expect(sinArchivo.status).toBe(422);
    expect(sinArchivo.body.codigo).toBe('SUBIDA_INCOMPLETA');
  });

  it('aísla por organización y el revisor solo ve los recursos de su cliente', async () => {
    const { confirmado } = await subir('Manual.pdf', 'application/pdf', PDF);
    expect((await como('ajeno').get(`/recursos/${confirmado.body.id}`)).status).toBe(404);
    expect((await como('ajeno').get('/recursos')).body).toEqual([]);
    expect((await como('ajeno').post('/recursos/subidas', { nombre: 'a.pdf', mime: 'application/pdf', bytes: 10, clienteId })).status).toBe(404);
    expect((await como('revisor').get(`/recursos/${confirmado.body.id}`)).status).toBe(404);
    expect((await como('revisor').get(`/recursos?clienteId=${clienteId}`)).body).toEqual([]);
    expect((await como('revisor').post('/recursos/subidas', { nombre: 'a.pdf', mime: 'application/pdf', bytes: 10 })).status).toBe(403);

    const lista = await como('productor').get(`/recursos?clienteId=${clienteId}&tipo=DOCUMENTO`);
    expect(lista.body.map((r: { nombre: string }) => r.nombre)).toContain('Manual.pdf');
    expect(lista.body[0].url).toBeUndefined();
  });

  it('al entregar un proyecto programa el borrado de sus documentos según la retención del cliente', async () => {
    const proyecto = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'LOTO', creadoPorId: usuarioId, estado: 'ENTREGADO' } });
    const { confirmado } = await subir('Procedimiento LOTO.pdf', 'application/pdf', PDF, { proyectoId: proyecto.id, origen: 'CLIENTE' });
    expect(confirmado.body.clienteId).toBe(clienteId);
    const entregado = new Date('2026-11-10T12:00:00Z');
    const r = await app.get(RetencionService).programarBorrado(orgId, proyecto.id, entregado);
    expect(r.documentos).toBe(1);
    expect(r.eliminarEn.toISOString()).toBe('2027-05-09T12:00:00.000Z');
    expect((await como('productor').get(`/recursos/${confirmado.body.id}`)).body.eliminarEn).toBe('2027-05-09T12:00:00.000Z');
  });
});
