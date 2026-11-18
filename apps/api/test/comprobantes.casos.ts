// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas de ventas (los datos fiscales y las pasarelas
// son globales).
// HU-1707 · Comprobantes electrónicos SUNAT (REQ-087, CP-149, PNT-37) contra PostgreSQL, Redis y S3 (LocalStack). La
// emisión (CP-148, correlativo, idempotencia) se prueba en el worker; aquí:
// - Ventas › Facturación solo para el superadmin (el administrador de otra organización recibe 403; sin sesión, 401);
// - el filtro por estado SUNAT y la descarga del PDF y el XML desde S3, auditada;
// - CP-149: el observado se corrige y reenvía (con el mismo número) y el aviso firmado del OSE lo deja aceptado;
// - el webhook del OSE: firma inválida 401 sin cambios, aviso repetido sin cambios, proveedor ajeno al entorno 404;
// - los datos fiscales con su validación y auditoría;
// - el reembolso de un cobro encola su nota de crédito.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prepararAlmacen } from '@aptio/almacen';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { AlmacenService } from '../src/recursos/almacen.service.js';
import { ComprobantesService } from '../src/ventas/comprobantes.service.js';
import { firmar } from '../src/ventas/pasarelas/pruebas.js';
import { ingresarCookie } from './ingreso-apoyo.js';

process.env.AWS_ENDPOINT ??= 'http://localhost:9000';
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.S3_BUCKET_NAME ??= 'aptio-pruebas-api';

const hayBase = Boolean(process.env.DATABASE_URL);
const hayS3 = await fetch(`${process.env.AWS_ENDPOINT}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const SECRETO = 'secreto-de-las-pruebas-e2e-del-ose';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@comprobantes.test`;
// Series propias (4 caracteres) para no chocar con F001 ni con otras pruebas.
const letras = Array.from({ length: 3 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const SERIE_F = `F${letras}`;
const SERIE_B = `B${letras}`;
const VARIABLES = ['SITIO_ENTORNO', 'OSE_PRUEBAS_SECRETO_WEBHOOK'] as const;

describe.skipIf(!hayBase && !process.env.CI)('comprobantes electrónicos (HU-1707)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let cookie = '';
  let cookieAdmin = '';
  let orgId = '';
  let planId = '';
  let solicitudId = '';
  const cobros: string[] = [];
  const originales = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
  let fiscalesAntes: Awaited<ReturnType<typeof prisma.datosFiscales.findUnique>> = null;
  let numero = 0;

  const panel = (m: 'get' | 'post' | 'put', ruta: string, c = cookie) => request(servidor)[m](`/api/v1${ruta}`).set('Cookie', c);
  const servicio = () => app.get(ComprobantesService);
  const aviso = (o: Record<string, unknown>, firma: string | null = null, proveedor = 'pruebas') => {
    const cuerpo = JSON.stringify(o);
    const r = request(servidor).post(`/api/v1/webhooks/ose/${proveedor}`).set('Content-Type', 'application/json');
    return r.set('X-Aptio-Firma', firma ?? firmar(SECRETO, cuerpo)).send(cuerpo);
  };
  const ingresar = async (email: string) => {
    return ingresarCookie(servidor, email, CLAVE);
  };
  /** Un cobro aprobado sin alta (de la pasarela de pruebas) con su comprobante ya emitido en el estado pedido. */
  const comprobante = async (estado: 'ACEPTADO' | 'OBSERVADO' | 'PENDIENTE' | 'RECHAZADO', extra: Record<string, unknown> = {}) => {
    numero += 1;
    const cobro = await prisma.cobro.create({ data: { solicitudSuscripcionId: solicitudId, eventoPagoId: `cpe-api-${sufijo}-${numero}`, monto: 1522.2, moneda: 'PEN', pasarela: 'pruebas', tokenPago: `pago_${sufijo}_${numero}`, ultimos4Digitos: '1111' } });
    cobros.push(cobro.id);
    return prisma.comprobante.create({
      data: {
        organizacionId: orgId, cobroId: cobro.id, tipo: 'FACTURA', serie: SERIE_F, numero, ruc: '20999999990', razonSocial: 'Minera Andina SAC', correoFacturacion: correoDe('pagos'),
        moneda: 'PEN', baseSinIgv: 1290, igv: 232.2, total: 1522.2, estado, motivo: estado === 'OBSERVADO' ? 'El RUC del receptor no figura como activo en el padrón (OSE simulado)' : null,
        proveedor: 'pruebas', ambiente: 'pruebas', intentos: 1, ...extra,
      },
    });
  };
  const trabajo = (id: string) => servicio().colaComprobantes.getJob(id);
  const fiscalesValidos = {
    rucEmisor: '20000000001', razonSocialEmisor: 'Grupo de Soluciones Creativas SAC', direccionEmisor: 'Av. Ejemplo 123, Lima',
    serieFactura: 'F001', serieBoleta: 'B001', serieNotaFactura: 'FC01', serieNotaBoleta: 'BC01', proveedor: 'pruebas', ambiente: 'pruebas',
    detraccionActiva: false, detraccionTasa: 12, detraccionUmbralPen: 700,
  };

  beforeAll(async () => {
    Object.assign(process.env, { SITIO_ENTORNO: 'pruebas', OSE_PRUEBAS_SECRETO_WEBHOOK: SECRETO });
    fiscalesAntes = await prisma.datosFiscales.findUnique({ where: { id: 'principal' } });
    planId = (await prisma.plan.create({ data: { slug: `productora-cpe-${sufijo}`, nombre: 'Productora', precioMes: 1290 } })).id;
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Minera Andina SAC', slug: `minera-cpe-${sufijo}`, ruc: '20999999990' } })).id;
    solicitudId = (await prisma.solicitudSuscripcion.create({
      data: { planId, ciclo: 'MENSUAL', razonSocial: 'Minera Andina SAC', ruc: '20999999990', tipoComprobante: 'FACTURA', nombreAdmin: 'Ana', correoAdmin: correoDe('pagos'), subtotal: 1290, igv: 232.2, total: 1522.2, moneda: 'PEN', pasarela: 'pruebas', estado: 'RECHAZADA' },
    })).id;
    const hash = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave: hash, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Ana', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: orgId, hashClave: hash, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    if (hayS3) await prepararAlmacen(app.get(AlmacenService).almacen, ['http://localhost:5173']);
    cookie = await ingresar(correoDe('super'));
    cookieAdmin = await ingresar(correoDe('admin'));
  });

  beforeEach(() => {
    process.env.SITIO_ENTORNO = 'pruebas';
  });

  afterAll(async () => {
    const cola = servicio()?.colaComprobantes;
    if (cola) for (const j of await cola.getJobs(['waiting', 'delayed', 'completed', 'failed', 'prioritized'])) if (cobros.includes(j?.data.cobroId ?? '')) await j.remove().catch(() => undefined);
    await app?.close();
    for (const v of VARIABLES) {
      if (originales[v] === undefined) delete process.env[v];
      else process.env[v] = originales[v];
    }
    const comps = (await prisma.comprobante.findMany({ where: { cobroId: { in: cobros } }, select: { id: true } })).map((c) => c.id);
    await prisma.auditoria.deleteMany({ where: { entidadId: { in: [...comps, ...cobros, 'principal'] } } });
    await prisma.comprobante.deleteMany({ where: { id: { in: comps }, tipo: 'NOTA_CREDITO' } });
    await prisma.comprobante.deleteMany({ where: { id: { in: comps } } });
    await prisma.cobro.deleteMany({ where: { id: { in: cobros } } });
    await prisma.solicitudSuscripcion.deleteMany({ where: { id: solicitudId } });
    const uids = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@comprobantes.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: uids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: uids } } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.serieComprobante.deleteMany({ where: { serie: { in: [SERIE_F, SERIE_B] } } });
    if (fiscalesAntes) { const { id: _i, actualizadoEn: _a, ...resto } = fiscalesAntes; await prisma.datosFiscales.update({ where: { id: 'principal' }, data: resto }); }
  });

  it('Ventas › Facturación es solo del superadmin: el administrador de una organización recibe 403 y sin sesión, 401', async () => {
    const c = await comprobante('OBSERVADO');
    for (const [m, ruta] of [['get', '/ventas/comprobantes'], ['get', `/ventas/comprobantes/${c.id}`], ['get', `/ventas/comprobantes/${c.id}/pdf`], ['post', `/ventas/comprobantes/${c.id}/reenviar`], ['get', '/ventas/datos-fiscales'], ['put', '/ventas/datos-fiscales']] as const) {
      expect([ruta, (await panel(m, ruta, cookieAdmin).send({})).status]).toEqual([ruta, 403]);
      expect([ruta, (await request(servidor)[m](`/api/v1${ruta}`)).status]).toEqual([ruta, 401]);
    }
    expect((await prisma.comprobante.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('OBSERVADO');
  });

  it('lista con el filtro por estado SUNAT y descarga el PDF y el XML desde S3 con auditoría', async () => {
    const obs = await comprobante('OBSERVADO');
    const ok = await comprobante('ACEPTADO');
    const l = await panel('get', '/ventas/comprobantes?estado=OBSERVADO');
    expect(l.status).toBe(200);
    const ids = l.body.comprobantes.map((x: { id: string }) => x.id);
    expect(ids).toContain(obs.id);
    expect(ids).not.toContain(ok.id);
    expect(l.body.comprobantes.find((x: { id: string }) => x.id === obs.id)).toMatchObject({
      tipo: 'FACTURA', numeroCompleto: `${SERIE_F}-${String(obs.numero).padStart(8, '0')}`, ruc: '20999999990', moneda: 'PEN', baseSinIgv: 1290, igv: 232.2, total: 1522.2,
      estado: 'OBSERVADO', reenviable: true, conArchivos: false, referencia: null, detraccion: null,
    });
    expect((await panel('get', '/ventas/comprobantes?estado=OTRO')).status).toBe(422);
    expect((await panel('get', `/ventas/comprobantes/${obs.id}/pdf`)).body.codigo).toBe('ARCHIVO_PENDIENTE');
    expect((await panel('get', '/ventas/comprobantes/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    if (!hayS3) return;
    const almacen = app.get(AlmacenService).almacen;
    const base = `comprobantes/${ok.id}/20000000001-01-${SERIE_F}-${String(ok.numero).padStart(8, '0')}`;
    await almacen.subir(`${base}.pdf`, new TextEncoder().encode('%PDF-1.7 prueba'), 'application/pdf');
    await almacen.subir(`${base}.xml`, '<Invoice/>', 'application/xml');
    await prisma.comprobante.update({ where: { id: ok.id }, data: { s3KeyPdf: `${base}.pdf`, s3KeyXml: `${base}.xml` } });
    const pdf = await panel('get', `/ventas/comprobantes/${ok.id}/pdf`).buffer(true).parse((res, cb) => { const p: Buffer[] = []; res.on('data', (d: Buffer) => p.push(d)); res.on('end', () => cb(null, Buffer.concat(p))); });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe(`attachment; filename="20000000001-01-${SERIE_F}-${String(ok.numero).padStart(8, '0')}.pdf"`);
    expect((pdf.body as Buffer).toString()).toBe('%PDF-1.7 prueba');
    const xml = await panel('get', `/ventas/comprobantes/${ok.id}/xml`);
    expect(xml.headers['content-type']).toMatch(/^application\/xml/);
    expect(xml.text).toBe('<Invoice/>');
    expect(await prisma.auditoria.count({ where: { accion: 'COMPROBANTE_DESCARGADO', entidadId: ok.id } })).toBe(2);
  });

  it('CP-149 · el observado se corrige y reenvía con el mismo número; el aviso firmado del OSE lo deja aceptado', async () => {
    const c = await comprobante('OBSERVADO');
    const malo = await panel('post', `/ventas/comprobantes/${c.id}/reenviar`).send({ ruc: '', razonSocial: '', correoFacturacion: 'no' });
    expect(malo.status).toBe(422);
    expect(malo.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(['ruc', 'razonSocial', 'correoFacturacion']);
    const r = await panel('post', `/ventas/comprobantes/${c.id}/reenviar`).send({ ruc: '20131312955', razonSocial: ' Minera Andina S.A.C. ', direccion: 'Av. Minera 456, Arequipa', correoFacturacion: correoDe('facturas') });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: c.id, serie: SERIE_F, numero: c.numero, ruc: '20131312955', razonSocial: 'Minera Andina S.A.C.', direccion: 'Av. Minera 456, Arequipa', correoFacturacion: correoDe('facturas'), estado: 'PENDIENTE' });
    const audit = await prisma.auditoria.findFirstOrThrow({ where: { accion: 'COMPROBANTE_REENVIADO', entidadId: c.id } });
    expect(audit.datos).toMatchObject({ estadoAnterior: 'OBSERVADO', antes: { ruc: '20999999990' }, despues: { ruc: '20131312955' } });
    const jobs = (await servicio().colaComprobantes.getJobs(['waiting', 'delayed', 'prioritized'])).filter((j) => j?.data.comprobanteId === c.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.id).toMatch(new RegExp(`^reenvio-${c.id}-1-\\d+$`));
    expect(jobs[0]!.data).toEqual({ cobroId: c.cobroId, comprobanteId: c.id });

    const ev = { id: `ev-${sufijo}-1`, serie: SERIE_F, numero: c.numero, estado: 'ACEPTADO', motivo: 'Aceptado' };
    const a = await aviso(ev);
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ recibido: true, duplicado: false });
    expect(await prisma.comprobante.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ estado: 'ACEPTADO', motivo: 'Aceptado' });
    expect(await trabajo(`reenvio-${c.id}-ose-${ev.id}`)).toBeTruthy();
    expect((await aviso(ev)).body).toEqual({ recibido: true, duplicado: true });
    // Un estado final no vuelve atrás, ni con otro aviso.
    await aviso({ ...ev, id: `ev-${sufijo}-2`, estado: 'OBSERVADO' });
    expect((await prisma.comprobante.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('ACEPTADO');
    expect(await prisma.auditoria.count({ where: { accion: 'COMPROBANTE_ESTADO_OSE', entidadId: c.id } })).toBe(1);
    expect((await panel('post', `/ventas/comprobantes/${c.id}/reenviar`).send({ ruc: '20131312955', razonSocial: 'X', correoFacturacion: correoDe('x') })).body.codigo).toBe('COMPROBANTE_NO_REENVIABLE');
    const rech = await comprobante('RECHAZADO');
    expect((await panel('post', `/ventas/comprobantes/${rech.id}/reenviar`).send({ ruc: '20131312955', razonSocial: 'X', correoFacturacion: correoDe('x') })).status).toBe(409);
  });

  it('el webhook del OSE con firma inválida responde 401 y no cambia el comprobante; un proveedor ajeno al entorno, 404', async () => {
    const c = await comprobante('PENDIENTE');
    const ev = { id: `ev-${sufijo}-firma`, serie: SERIE_F, numero: c.numero, estado: 'RECHAZADO', motivo: 'Error' };
    const r = await aviso(ev, firmar('otro-secreto', JSON.stringify(ev)));
    expect(r.status).toBe(401);
    expect(r.body.codigo).toBe('FIRMA_NO_VALIDA');
    expect((await request(servidor).post('/api/v1/webhooks/ose/pruebas').set('Content-Type', 'application/json').send(JSON.stringify(ev))).status).toBe(401);
    expect((await prisma.comprobante.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('PENDIENTE');
    expect(await prisma.eventoOse.count({ where: { comprobanteId: c.id } })).toBe(0);
    expect((await aviso({ ...ev, numero: 0 })).body.codigo).toBe('EVENTO_NO_VALIDO');
    expect((await aviso({ ...ev, numero: 99_999_999 })).status).toBe(404);
    expect((await aviso(ev, null, 'nubefact')).status).toBe(404);
    process.env.SITIO_ENTORNO = 'produccion';
    expect((await aviso(ev)).status).toBe(404);
    process.env.SITIO_ENTORNO = 'pruebas';
    const ok = await aviso(ev);
    expect(ok.status).toBe(200);
    expect(await prisma.comprobante.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ estado: 'RECHAZADO', motivo: 'Error' });
  });

  it('los datos fiscales se guardan validados y auditados, sin secretos, y con los proveedores del entorno', async () => {
    const g = await panel('get', '/ventas/datos-fiscales');
    expect(g.status).toBe(200);
    expect(g.body.proveedores).toEqual([{ codigo: 'pruebas', nombre: 'OSE de pruebas (simulado)', disponible: true }]);
    const p = await panel('put', '/ventas/datos-fiscales').send({ ...fiscalesValidos, detraccionActiva: true, rucEmisor: '20000000001' });
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ ...fiscalesValidos, detraccionActiva: true });
    expect(JSON.stringify(p.body)).not.toContain(SECRETO);
    expect(await prisma.auditoria.count({ where: { accion: 'DATOS_FISCALES_ACTUALIZADOS', entidadId: 'principal' } })).toBeGreaterThanOrEqual(1);
    const e = await panel('put', '/ventas/datos-fiscales').send({ ...fiscalesValidos, rucEmisor: '20000000002', serieBoleta: 'F002', detraccionTasa: 0, proveedor: 'nubefact', otro: 1 });
    expect(e.status).toBe(422);
    expect(e.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(expect.arrayContaining(['rucEmisor', 'serieBoleta', 'detraccionTasa', 'proveedor', 'otro']));
    expect((await panel('put', '/ventas/datos-fiscales').send({ ...fiscalesValidos, ambiente: 'produccion' })).body.detalles).toEqual([{ campo: 'ambiente', mensaje: 'El OSE de pruebas solo emite en el ambiente de pruebas' }]);
    expect((await panel('put', '/ventas/datos-fiscales').send({ ...fiscalesValidos, rucEmisor: '' })).body.rucEmisor).toBeNull();
    process.env.SITIO_ENTORNO = 'produccion';
    expect((await panel('get', '/ventas/datos-fiscales')).body.proveedores[0].disponible).toBe(false);
  });

  it('el reembolso de un cobro encola su nota de crédito', async () => {
    const c = await comprobante('ACEPTADO');
    const r = await panel('post', `/ventas/cobros/${c.cobroId}/reembolsar`);
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('REEMBOLSADO');
    const j = await trabajo(`nota-${c.cobroId}`);
    expect(j?.data).toEqual({ cobroId: c.cobroId, tipo: 'NOTA_CREDITO' });
  });
});
