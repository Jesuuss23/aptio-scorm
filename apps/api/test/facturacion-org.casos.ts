// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas de ventas.
// HU-1711 · Portal de facturación de la organización (REQ-091, CP-153, PNT-40) contra PostgreSQL y S3 (LocalStack):
// - CP-153: el administrador ve sus 3 comprobantes (factura, boleta y nota de crédito) y descarga el PDF y el XML de
//   cada uno; el de otra organización da 404 y el que aún no tiene archivo, también;
// - los datos de facturación caen en los del alta hasta que se editan; el PUT valida (la factura exige RUC) y audita;
// - el cambio de tarjeta con la pasarela de pruebas guarda solo los 4 últimos dígitos (sin CVV) y con Stripe da 409;
// - solo el administrador: 401 sin sesión y 403 al productor y al superadmin.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prepararAlmacen } from '@aptio/almacen';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { AlmacenService } from '../src/recursos/almacen.service.js';
import { ingresarCookie } from './ingreso-apoyo.js';

process.env.AWS_ENDPOINT ??= 'http://localhost:9000';
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.S3_BUCKET_NAME ??= 'aptio-pruebas-api';

const hayBase = Boolean(process.env.DATABASE_URL);
const hayS3 = await fetch(`${process.env.AWS_ENDPOINT}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@facturacion-org.test`;
const letras = Array.from({ length: 3 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');

describe.skipIf(!hayBase && !process.env.CI)('portal de facturación de la organización (HU-1711)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  const orgs: string[] = [];
  const cobros: string[] = [];
  const comprobantes: string[] = [];
  const claves: string[] = [];
  let planId = '';
  let solicitudId = '';
  let suscripcionId = '';
  let suscripcionOtraId = '';
  let ajeno = '';
  let sinArchivo = '';
  const como = (quien: string) => ({
    get: (r: string) => request(servidor).get(`/api/v1${r}`).set('Cookie', cookies[quien]!),
    put: (r: string, b: object) => request(servidor).put(`/api/v1${r}`).set('Cookie', cookies[quien]!).send(b),
    post: (r: string, b: object) => request(servidor).post(`/api/v1${r}`).set('Cookie', cookies[quien]!).send(b),
  });
  let numero = 0;
  const comprobante = async (organizacionId: string, susId: string, tipo: 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO', referenciaId: string | null = null) => {
    numero += 1;
    const cobro = await prisma.cobro.create({ data: { solicitudSuscripcionId: solicitudId, suscripcionId: susId, eventoPagoId: `portal-${sufijo}-${numero}`, monto: 1522.2, moneda: 'PEN', pasarela: 'pruebas', tokenPago: `pago_${sufijo}_${numero}`, ultimos4Digitos: '1111' } });
    cobros.push(cobro.id);
    const serie = tipo === 'FACTURA' ? `F${letras}` : tipo === 'BOLETA' ? `B${letras}` : `C${letras}`;
    const c = await prisma.comprobante.create({
      data: {
        organizacionId, cobroId: cobro.id, tipo, serie, numero, ruc: tipo === 'BOLETA' ? null : '20999999990', razonSocial: 'Minera Andina SAC', correoFacturacion: correoDe('pagos'),
        moneda: 'PEN', baseSinIgv: 1290, igv: 232.2, total: 1522.2, estado: 'ACEPTADO', proveedor: 'pruebas', ambiente: 'pruebas', intentos: 1, comprobanteReferenciaId: referenciaId,
      },
    });
    comprobantes.push(c.id);
    return c;
  };
  const conArchivos = async (id: string) => {
    const base = `comprobantes/${id}/portal-${sufijo}-${id.slice(0, 8)}`;
    if (hayS3) {
      const almacen = app.get(AlmacenService).almacen;
      await almacen.subir(`${base}.pdf`, new TextEncoder().encode(`%PDF-1.7 ${id}`), 'application/pdf');
      await almacen.subir(`${base}.xml`, `<Invoice id="${id}"/>`, 'application/xml');
    }
    claves.push(`${base}.pdf`, `${base}.xml`);
    await prisma.comprobante.update({ where: { id }, data: { s3KeyPdf: `${base}.pdf`, s3KeyXml: `${base}.xml` } });
  };

  beforeAll(async () => {
    planId = (await prisma.plan.create({ data: { slug: `portal-${sufijo}`, nombre: 'Productora', precioMes: 1290, capsulasMes: 6, visible: false, orden: 96 } })).id;
    const org = await prisma.organizacion.create({ data: { nombre: 'Minera Andina SAC', slug: `portal-${sufijo}`, ruc: '20999999990' } });
    const otra = await prisma.organizacion.create({ data: { nombre: 'Otra SAC', slug: `portal-otra-${sufijo}` } });
    orgs.push(org.id, otra.id);
    solicitudId = (await prisma.solicitudSuscripcion.create({
      data: { planId, ciclo: 'MENSUAL', razonSocial: 'Minera Andina SAC', ruc: '20999999990', tipoComprobante: 'FACTURA', nombreAdmin: 'Ana', correoAdmin: correoDe('pagos'), subtotal: 1290, igv: 232.2, total: 1522.2, moneda: 'PEN', pasarela: 'pruebas', estado: 'APROBADA' },
    })).id;
    const periodo = { inicioPeriodo: new Date(Date.now() - 5 * 86_400_000), finPeriodo: new Date(Date.now() + 25 * 86_400_000) };
    suscripcionId = (await prisma.suscripcion.create({ data: { organizacionId: org.id, planId, ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, pasarela: 'pruebas', ultimos4Digitos: '1111', solicitudId, ...periodo } })).id;
    suscripcionOtraId = (await prisma.suscripcion.create({ data: { organizacionId: otra.id, planId, ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, pasarela: 'stripe', ...periodo } })).id;
    const hashClave = await hashearClave(CLAVE);
    for (const [n, rol, organizacionId] of [['admin', Rol.ADMINISTRADOR, org.id], ['productor', Rol.PRODUCTOR, org.id], ['otra', Rol.ADMINISTRADOR, otra.id], ['super', Rol.SUPERADMIN, null]] as const) {
      await prisma.usuario.create({ data: { nombre: n, email: correoDe(n), rol, organizacionId, hashClave, emailVerificado: true } });
    }
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    if (hayS3) await prepararAlmacen(app.get(AlmacenService).almacen, ['http://localhost:5173']);
    for (const n of ['admin', 'productor', 'otra', 'super']) {
      cookies[n] = await ingresarCookie(servidor, correoDe(n), CLAVE);
    }
    const f = await comprobante(org.id, suscripcionId, 'FACTURA');
    const b = await comprobante(org.id, suscripcionId, 'BOLETA');
    const nc = await comprobante(org.id, suscripcionId, 'NOTA_CREDITO', f.id);
    for (const c of [f, b, nc]) await conArchivos(c.id);
    const x = await comprobante(otra.id, suscripcionOtraId, 'FACTURA');
    await conArchivos(x.id);
    ajeno = x.id;
    sinArchivo = (await comprobante(otra.id, suscripcionOtraId, 'BOLETA')).id;
  });

  afterAll(async () => {
    if (hayS3 && app) await app.get(AlmacenService).almacen.borrar(claves).catch(() => undefined);
    await app?.close();
    const usuarios = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@facturacion-org.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { OR: [{ usuarioId: { in: usuarios } }, { organizacionId: { in: orgs } }] } });
    await prisma.tokenAcceso.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.comprobante.deleteMany({ where: { id: { in: comprobantes }, tipo: 'NOTA_CREDITO' } });
    await prisma.comprobante.deleteMany({ where: { id: { in: comprobantes } } });
    await prisma.cobro.deleteMany({ where: { id: { in: cobros } } });
    await prisma.datosFacturacionOrg.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.consumoCapsula.deleteMany({ where: { suscripcionId: { in: [suscripcionId, suscripcionOtraId] } } });
    await prisma.suscripcion.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.solicitudSuscripcion.deleteMany({ where: { id: solicitudId } });
    await prisma.serieComprobante.deleteMany({ where: { serie: { in: [`F${letras}`, `B${letras}`, `C${letras}`] } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
    await prisma.plan.deleteMany({ where: { id: planId } });
  });

  it('CP-153 · el resumen trae el plan, el consumo, el medio, los datos del alta y los 3 comprobantes, que se descargan en PDF y XML', async () => {
    const r = await como('admin').get('/organizacion/facturacion');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.plan).toMatchObject({ nombre: 'Productora', ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, moneda: 'PEN', estado: 'ACTIVA' });
    expect(r.body.consumo).toBeTruthy();
    expect(r.body.medioPago).toEqual({ pasarela: 'pruebas', ultimos4Digitos: '1111', editable: true, aviso: null });
    expect(r.body.datos).toEqual({ razonSocial: 'Minera Andina SAC', ruc: '20999999990', direccion: null, correoFacturacion: correoDe('pagos'), tipoComprobantePreferido: 'FACTURA', origen: 'ALTA' });
    const tipos = r.body.comprobantes.map((c: { tipo: string }) => c.tipo).sort();
    expect(tipos).toEqual(['BOLETA', 'FACTURA', 'NOTA_CREDITO']);
    expect(r.body.comprobantes.map((c: { id: string }) => c.id)).not.toContain(ajeno);
    const nota = r.body.comprobantes.find((c: { tipo: string }) => c.tipo === 'NOTA_CREDITO');
    expect(nota).toMatchObject({ referencia: expect.stringMatching(new RegExp(`^F${letras}-`)), estado: 'ACEPTADO', total: 1522.2, conPdf: true, conXml: true });
    if (!hayS3) return;
    for (const c of r.body.comprobantes as { id: string }[]) {
      const pdf = await como('admin').get(`/organizacion/comprobantes/${c.id}/pdf`).buffer(true);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers['content-disposition']).toMatch(/^attachment; filename=".+\.pdf"$/);
      expect(pdf.headers['cache-control']).toBe('no-store');
      expect(Buffer.from(pdf.body).toString()).toBe(`%PDF-1.7 ${c.id}`);
      const xml = await como('admin').get(`/organizacion/comprobantes/${c.id}/xml`).buffer(true).parse((res, cb) => { let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => cb(null, t)); });
      expect(xml.status).toBe(200);
      expect(xml.body).toBe(`<Invoice id="${c.id}"/>`);
    }
    const auditadas = await prisma.auditoria.count({ where: { organizacionId: orgs[0]!, accion: 'COMPROBANTE_DESCARGADO', datos: { path: ['desde'], equals: 'portal' } } });
    expect(auditadas).toBe(6);
  });

  it('CP-153 · el comprobante de otra organización da 404, igual que uno sin archivo o un id que no existe', async () => {
    for (const f of ['pdf', 'xml']) {
      const r = await como('admin').get(`/organizacion/comprobantes/${ajeno}/${f}`);
      expect(r.status).toBe(404);
      expect(r.body).toMatchObject({ codigo: 'NO_ENCONTRADO' });
      expect((await como('admin').get(`/organizacion/comprobantes/00000000-0000-4000-8000-000000000000/${f}`)).status).toBe(404);
      const p = await como('otra').get(`/organizacion/comprobantes/${sinArchivo}/${f}`);
      expect(p.status).toBe(404);
      expect(p.body).toMatchObject({ codigo: 'ARCHIVO_PENDIENTE' });
    }
    expect((await como('admin').get('/organizacion/comprobantes/no-es-uuid/pdf')).status).toBe(400);
  });

  it('PUT datos: la factura exige un RUC válido, la boleta lo admite vacío, y queda auditado con el antes y el después', async () => {
    const malo = await como('admin').put('/organizacion/facturacion/datos', { razonSocial: '<b>Minera</b>', ruc: '20999999991', correoFacturacion: 'no-es-correo', tipoComprobantePreferido: 'FACTURA' });
    expect(malo.status).toBe(422);
    expect(malo.body.codigo).toBe('NO_VALIDO');
    expect(malo.body.detalles.map((d: { campo: string }) => d.campo).sort()).toEqual(['correoFacturacion', 'razonSocial', 'ruc']);
    const sinRuc = await como('admin').put('/organizacion/facturacion/datos', { razonSocial: 'Minera Andina SAC', ruc: '', correoFacturacion: 'pagos@minera.pe', tipoComprobantePreferido: 'FACTURA' });
    expect(sinRuc.status).toBe(422);
    expect(sinRuc.body.detalles).toEqual([{ campo: 'ruc', mensaje: 'Para recibir factura escribe el RUC' }]);
    expect(await prisma.datosFacturacionOrg.count({ where: { organizacionId: orgs[0]! } })).toBe(0);

    const ok = await como('admin').put('/organizacion/facturacion/datos', { razonSocial: '  Minera Andina SAC  ', ruc: '20100070970', direccion: 'Av. Javier Prado 123, Lima', correoFacturacion: 'Pagos@Minera.pe', tipoComprobantePreferido: 'FACTURA' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ razonSocial: 'Minera Andina SAC', ruc: '20100070970', direccion: 'Av. Javier Prado 123, Lima', correoFacturacion: 'pagos@minera.pe', tipoComprobantePreferido: 'FACTURA', origen: 'PORTAL' });
    const boleta = await como('admin').put('/organizacion/facturacion/datos', { razonSocial: 'Ana Pérez', ruc: '', correoFacturacion: 'ana@minera.pe', tipoComprobantePreferido: 'BOLETA' });
    expect(boleta.status).toBe(200);
    expect(boleta.body).toMatchObject({ ruc: null, direccion: null, tipoComprobantePreferido: 'BOLETA' });
    expect((await como('admin').get('/organizacion/facturacion')).body.datos).toMatchObject({ razonSocial: 'Ana Pérez', origen: 'PORTAL' });

    const a = await prisma.auditoria.findMany({ where: { organizacionId: orgs[0]!, accion: 'DATOS_FACTURACION_ACTUALIZADOS' }, orderBy: { creadoEn: 'asc' } });
    expect(a).toHaveLength(2);
    expect(a[0]!.datos).toMatchObject({ antes: { origen: 'ALTA', ruc: '20999999990' }, despues: { ruc: '20100070970', correoFacturacion: 'pagos@minera.pe' } });
    expect(a[1]!.datos).toMatchObject({ antes: { origen: 'PORTAL', ruc: '20100070970' }, despues: { ruc: null, tipoComprobantePreferido: 'BOLETA' } });
    // La otra organización no ve los datos de esta.
    expect((await como('otra').get('/organizacion/facturacion')).body.datos).toMatchObject({ razonSocial: 'Otra SAC', origen: 'ALTA' });
  });

  it('cambio de tarjeta: con la pasarela de pruebas guarda solo los 4 últimos dígitos y audita; sin CVV; con Stripe da 409', async () => {
    const cvv = await como('admin').post('/organizacion/facturacion/medio-pago', { tarjeta: '4000 0000 0000 0002', cvv: '123' });
    expect(cvv.status).toBe(422);
    expect(cvv.body.detalles).toEqual([{ campo: 'cvv', mensaje: expect.stringContaining('código de seguridad') }]);
    expect((await como('admin').post('/organizacion/facturacion/medio-pago', { tarjeta: '5555 5555 5555 4444' })).status).toBe(422);
    const ok = await como('admin').post('/organizacion/facturacion/medio-pago', { tarjeta: '4000 0000 0000 0002' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ pasarela: 'pruebas', ultimos4Digitos: '0002', editable: true, aviso: null });
    expect((await prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } })).ultimos4Digitos).toBe('0002');
    const a = await prisma.auditoria.findFirstOrThrow({ where: { organizacionId: orgs[0]!, accion: 'MEDIO_PAGO_ACTUALIZADO' } });
    expect(a.datos).toEqual({ pasarela: 'pruebas', antes: '1111', despues: '0002' });
    expect(JSON.stringify(a.datos)).not.toContain('4000000000000002');

    const stripe = await como('otra').post('/organizacion/facturacion/medio-pago', { tarjeta: '4111 1111 1111 1111' });
    expect(stripe.status).toBe(409);
    expect(stripe.body).toMatchObject({ codigo: 'MEDIO_NO_EDITABLE', mensaje: expect.stringContaining('enlace para pagar') });
    expect((await como('otra').get('/organizacion/facturacion')).body.medioPago).toMatchObject({ pasarela: 'stripe', ultimos4Digitos: null, editable: false, aviso: expect.stringContaining('por correo') });
  });

  it('solo el administrador: 401 sin sesión y 403 al productor y al superadmin', async () => {
    const rutas = [['get', '/organizacion/facturacion'], ['put', '/organizacion/facturacion/datos'], ['post', '/organizacion/facturacion/medio-pago'], ['get', `/organizacion/comprobantes/${comprobantes[0]}/pdf`], ['get', `/organizacion/comprobantes/${comprobantes[0]}/xml`]] as const;
    for (const [m, ruta] of rutas) {
      expect([ruta, (await request(servidor)[m](`/api/v1${ruta}`).send({})).status]).toEqual([ruta, 401]);
      for (const quien of ['productor', 'super']) expect([ruta, quien, (await request(servidor)[m](`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send({})).status]).toEqual([ruta, quien, 403]);
    }
  });
});
