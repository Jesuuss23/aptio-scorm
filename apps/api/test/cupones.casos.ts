// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas de ventas (los planes, la versión y las
// pasarelas son globales).
// HU-1709 · Cupones y convenios (REQ-089, CP-151, PNT-37) contra PostgreSQL y Redis:
// - solo el superadmin administra los cupones (401 sin sesión, 403 a otro rol), con validación, código único y sin borrar;
// - CP-151: en la vista previa un cupón vencido (o agotado, oculto, de otro plan o de otro dominio) se rechaza con el
//   motivo y el total no cambia; uno vigente descuenta al céntimo con el IGV sobre la base descontada;
// - el checkout vuelve a validar el cupón y guarda la lista, el descuento y el porcentaje; el webhook aprobado suma un uso
//   una sola vez por evento y deja en la suscripción el precio de lista, el porcentaje y los ciclos que quedan;
// - la misma empresa no lo vuelve a usar; dos pagos en el último cupo se respetan y queda la auditoría.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, ID_PLANES_AJUSTES, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';
import { firmar, SuscripcionesService } from '../src/ventas/suscripciones.service.js';
import { ingresarCookie } from './ingreso-apoyo.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const SECRETO = 'secreto-de-las-pruebas-e2e-cupones';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@cupones.test`;
const plan = `productora-cup-${sufijo}`;
const RUTA = `/precios-cup-${sufijo}`;
const COD = (n: string) => `${n}-${sufijo}`.toUpperCase();

describe.skipIf(!hayBase && !process.env.CI)('cupones y convenios (HU-1709)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  let paginaId = '';
  let orgAjena = '';
  const originales = { entorno: process.env.SITIO_ENTORNO, secreto: process.env.PAGO_PRUEBA_SECRETO };
  let ajustesPrevios: Awaited<ReturnType<typeof prisma.planesAjustes.findUnique>> = null;
  const como = (quien: string) => ({
    get: (r: string) => request(servidor).get(`/api/v1${r}`).set('Cookie', cookies[quien]!),
    post: (r: string, d: object = {}) => request(servidor).post(`/api/v1${r}`).set('Cookie', cookies[quien]!).send(d),
    patch: (r: string, d: object = {}) => request(servidor).patch(`/api/v1${r}`).set('Cookie', cookies[quien]!).send(d),
  });
  const sinLimite = () => { app.get(LimitePublicoService).reiniciar(); app.get(SuscripcionesService).reiniciarLimite(); };
  const vista = (d: Record<string, unknown>) => { sinLimite(); return request(servidor).post('/api/v1/publico/checkout/cupon').send({ plan, ...d }); };
  const empresa = (correo: string, extra: Record<string, unknown> = {}) => ({ plan, ciclo: 'MENSUAL', razonSocial: 'Minera Andina SAC', ruc: '', dni: '40506089', nombreAdmin: 'Ana Quispe', correoAdmin: correo, consentimiento: true, ...extra });
  const checkout = (d: Record<string, unknown>) => { sinLimite(); return request(servidor).post('/api/v1/publico/checkout').send(d); };
  const webhook = (d: object) => {
    const cuerpo = Buffer.from(JSON.stringify(d));
    return request(servidor).post('/api/v1/webhooks/pago/pruebas').set('Content-Type', 'application/json').set('X-Aptio-Firma', firmar(SECRETO, cuerpo)).send(cuerpo.toString('utf8'));
  };
  const crearCupon = (d: Record<string, unknown>) => como('super').post('/ventas/cupones', { nombre: 'Cupón', porcentaje: 20, ...d });

  beforeAll(async () => {
    process.env.SITIO_ENTORNO = 'pruebas';
    process.env.PAGO_PRUEBA_SECRETO = SECRETO;
    ajustesPrevios = await prisma.planesAjustes.findUnique({ where: { id: ID_PLANES_AJUSTES } });
    await prisma.planesAjustes.upsert({ where: { id: ID_PLANES_AJUSTES }, create: { id: ID_PLANES_AJUSTES, mostrarAnual: true, descuentoAnual: 20, conIgv: false }, update: { mostrarAnual: true, descuentoAnual: 20, conIgv: false } });
    await prisma.plan.createMany({ data: [{ slug: plan, nombre: 'Productora', precioMes: 1290, visible: true, orden: 95 }, { slug: `inicial-cup-${sufijo}`, nombre: 'Inicial', precioMes: 490, visible: true, orden: 96 }] });
    orgAjena = (await prisma.organizacion.create({ data: { nombre: 'Ajena', slug: `ajena-cup-${sufijo}` } })).id;
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: orgAjena, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['super', 'admin']) {
      cookies[n] = await ingresarCookie(servidor, correoDe(n), CLAVE);
    }
    const p = await como('super').post('/sitio/paginas', { ruta: RUTA, titulo: 'Precios' });
    paginaId = p.body.id;
    const b = await como('super').post(`/sitio/paginas/${paginaId}/bloques`, { tipo: 'precios' });
    await como('super').patch(`/sitio/paginas/${paginaId}/bloques/${b.body.id}`, { visible: true });
    await como('super').patch(`/sitio/paginas/${paginaId}`, { accion: 'publicar' });
    const publicada = await como('super').post('/sitio/publicar');
    if (publicada.status !== 201) throw new Error(`No se pudo publicar el sitio de prueba: ${publicada.status} ${JSON.stringify(publicada.body)}`);
  });

  afterAll(async () => {
    const solicitudes = await prisma.solicitudSuscripcion.findMany({ where: { correoAdmin: { endsWith: `-${sufijo}@cupones.test` } } });
    const ids = solicitudes.map((s) => s.id);
    const orgs = [...solicitudes.map((s) => s.organizacionId).filter((x): x is string => !!x), orgAjena];
    const cobros = (await prisma.cobro.findMany({ where: { solicitudSuscripcionId: { in: ids } }, select: { id: true } })).map((c) => c.id);
    const cola = app?.get(SuscripcionesService).colaComprobantes;
    if (cola) for (const id of cobros) await cola.remove(id).catch(() => undefined);
    const bienvenida = app?.get(SuscripcionesService).colaSuscripciones;
    if (bienvenida) for (const j of await bienvenida.getJobs(['waiting', 'delayed', 'prioritized'])) if (ids.includes((j?.data as { solicitudId?: string } | undefined)?.solicitudId ?? '')) await j.remove().catch(() => undefined);
    await app?.close();
    if (originales.entorno === undefined) delete process.env.SITIO_ENTORNO;
    else process.env.SITIO_ENTORNO = originales.entorno;
    if (originales.secreto === undefined) delete process.env.PAGO_PRUEBA_SECRETO;
    else process.env.PAGO_PRUEBA_SECRETO = originales.secreto;
    const cupones = (await prisma.cupon.findMany({ where: { codigo: { endsWith: `-${sufijo}`.toUpperCase() } }, select: { id: true } })).map((c) => c.id);
    await prisma.auditoria.deleteMany({ where: { OR: [{ entidadId: { in: [...ids, ...cupones] } }, { organizacionId: { in: orgs } }] } });
    await prisma.cobro.deleteMany({ where: { id: { in: cobros } } });
    await prisma.suscripcion.deleteMany({ where: { solicitudId: { in: ids } } });
    await prisma.solicitudSuscripcion.deleteMany({ where: { id: { in: ids } } });
    await prisma.cupon.deleteMany({ where: { id: { in: cupones } } });
    await prisma.lead.deleteMany({ where: { correo: { endsWith: `-${sufijo}@cupones.test` } } });
    const usuarios = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@cupones.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.sitioVersion.updateMany({ where: { publicadoPorId: { in: usuarios } }, data: { publicadoPorId: null } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.tokenAcceso.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
    if (paginaId) {
      await prisma.auditoria.deleteMany({ where: { entidadId: paginaId } });
      await prisma.sitioPagina.deleteMany({ where: { id: paginaId } });
    }
    await prisma.plan.deleteMany({ where: { slug: { endsWith: `-cup-${sufijo}` } } });
    await prisma.planesAjustes.deleteMany();
    if (ajustesPrevios) await prisma.planesAjustes.create({ data: ajustesPrevios });
  });

  it('solo el superadmin administra los cupones: valida, normaliza el código, no repite y oculta sin borrar', async () => {
    expect((await request(servidor).get('/api/v1/ventas/cupones')).status).toBe(401);
    expect((await como('admin').get('/ventas/cupones')).status).toBe(403);
    expect((await como('admin').post('/ventas/cupones', { codigo: COD('NO'), nombre: 'x', porcentaje: 10 })).status).toBe(403);

    const malo = await crearCupon({ codigo: 'no vale', porcentaje: 0, tipo: 'CONVENIO' });
    expect(malo.status).toBe(422);
    expect(malo.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(['codigo', 'porcentaje', 'dominiosCorreo']);

    const c = await crearCupon({ codigo: ` ${COD('lanza').toLowerCase()} `, nombre: 'Lanzamiento', ciclosDescuento: 3, vigenciaDesde: '2026-01-01', vigenciaHasta: '2099-12-31', limiteUsos: 50 });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ codigo: COD('LANZA'), tipo: 'CAMPANA', porcentaje: 20, ciclosDescuento: 3, vigenciaDesde: '2026-01-01', vigenciaHasta: '2099-12-31', usos: 0, visible: true, estado: 'ACTIVO', beneficio: '−20 % en los primeros 3 pagos' });
    expect((await crearCupon({ codigo: COD('LANZA') })).body.codigo).toBe('CODIGO_EN_USO');

    const oculto = await crearCupon({ codigo: COD('OCULTO') });
    const editado = await como('super').patch(`/ventas/cupones/${oculto.body.id}`, { visible: false, usos: 99 });
    expect(editado.body).toMatchObject({ visible: false, usos: 0, estado: 'OCULTO' });
    expect((await como('super').patch(`/ventas/cupones/${oculto.body.id}`, { vigenciaDesde: '2026-12-31', vigenciaHasta: '2026-01-01' })).status).toBe(422);
    const lista = await como('super').get('/ventas/cupones');
    expect(lista.body.cupones.filter((x: { codigo: string }) => x.codigo.endsWith(`-${sufijo}`.toUpperCase())).map((x: { codigo: string }) => x.codigo)).toEqual([COD('LANZA'), COD('OCULTO')]);
    const auditoria = await prisma.auditoria.findMany({ where: { entidadId: oculto.body.id }, orderBy: { creadoEn: 'asc' } });
    expect(auditoria.map((a) => a.accion)).toEqual(['CUPON_CREADO', 'CUPON_ACTUALIZADO']);
    expect(auditoria[1]!.datos).toMatchObject({ cambios: { visible: false }, antes: { visible: true } });
  });

  it('CP-151 · un cupón vencido se rechaza con el motivo y el total no cambia; uno vigente descuenta al céntimo', async () => {
    await crearCupon({ codigo: COD('VENCIDO'), vigenciaDesde: '2026-01-01', vigenciaHasta: '2026-01-31' });
    const v = await vista({ cupon: COD('vencido') });
    expect(v.status).toBe(422);
    expect(v.body).toMatchObject({ codigo: 'CUPON_NO_VALIDO', mensaje: 'Este cupón venció el 31 de enero de 2026' });
    expect(v.body.detalles).toEqual([{
      campo: 'cupon', mensaje: 'Este cupón venció el 31 de enero de 2026', motivo: 'CUPON_VENCIDO', fecha: '2026-01-31',
      resumen: { plan, nombrePlan: 'Productora', ciclo: 'MENSUAL', subtotal: 1290, descuento: 0, base: 1290, igv: 232.2, total: 1522.2, moneda: 'PEN', cupon: null },
    }]);

    const ok = await vista({ cupon: COD('lanza') });
    expect(ok.status).toBe(200);
    expect(ok.body.resumen).toMatchObject({ subtotal: 1290, descuento: 258, base: 1032, igv: 185.76, total: 1217.76, moneda: 'PEN', cupon: { codigo: COD('LANZA'), porcentaje: 20, ciclosDescuento: 3 } });
    const anual = await vista({ cupon: COD('lanza'), ciclo: 'ANUAL' });
    expect(anual.body.resumen).toMatchObject({ subtotal: 12384, descuento: 2476.8, base: 9907.2, igv: 1783.3, total: 11690.5 });

    const motivo = async (d: Record<string, unknown>) => (await vista(d)).body.detalles?.[0]?.motivo;
    expect(await motivo({ cupon: 'NO-EXISTE-NUNCA' })).toBe('CUPON_NO_EXISTE');
    expect(await motivo({ cupon: COD('OCULTO') })).toBe('CUPON_INACTIVO');
    await crearCupon({ codigo: COD('INICIAL'), planesPermitidos: [`inicial-cup-${sufijo}`] });
    expect(await motivo({ cupon: COD('INICIAL') })).toBe('CUPON_NO_APLICA_PLAN');
    expect((await vista({ cupon: COD('INICIAL'), plan: `inicial-cup-${sufijo}` })).body.resumen).toMatchObject({ subtotal: 490, descuento: 98, total: 462.56 });
    await crearCupon({ codigo: COD('EDU'), tipo: 'CONVENIO', porcentaje: 15, dominiosCorreo: ['pucp.edu.pe'] });
    expect(await motivo({ cupon: COD('EDU') })).toBe('CUPON_CORREO_CONVENIO');
    expect(await motivo({ cupon: COD('EDU'), correoAdmin: 'ana@empresa.pe' })).toBe('CUPON_CORREO_CONVENIO');
    expect((await vista({ cupon: COD('EDU'), correoAdmin: 'ana@alumnos.pucp.edu.pe' })).body.resumen).toMatchObject({ descuento: 193.5, total: 1293.87 });
    expect((await vista({ cupon: '' })).body.detalles[0].campo).toBe('cupon');
  });

  it('el checkout vuelve a validar; el webhook aprobado suma el uso una vez y la suscripción guarda el descuento', async () => {
    const malo = await checkout(empresa(correoDe('vencida'), { cupon: COD('VENCIDO') }));
    expect(malo.status).toBe(422);
    expect(malo.body.detalles).toEqual([{ campo: 'cupon', mensaje: 'Este cupón venció el 31 de enero de 2026', motivo: 'CUPON_VENCIDO' }]);
    expect(await prisma.solicitudSuscripcion.count({ where: { correoAdmin: correoDe('vencida') } })).toBe(0);

    const c = await checkout(empresa(correoDe('ana'), { cupon: COD('LANZA'), ruc: '20131312955' }));
    expect(c.status).toBe(201);
    expect(c.body.resumen).toMatchObject({ subtotal: 1290, descuento: 258, base: 1032, total: 1217.76, cupon: { codigo: COD('LANZA') } });
    const s = await prisma.solicitudSuscripcion.findUniqueOrThrow({ where: { id: c.body.id } });
    expect([Number(s.subtotal), Number(s.subtotalListaSinIgv), Number(s.descuentoSinIgv), s.porcentajeDescuento, Number(s.total)]).toEqual([1032, 1290, 258, 20, 1217.76]);

    const ev = { id: `evt_${sufijo}_cupon`, tipo: 'pago.aprobado', solicitudId: c.body.id, ultimos4: '4242', monto: 1217.76, moneda: 'PEN' };
    expect((await webhook(ev)).body).toEqual({ recibido: true, duplicado: false });
    expect((await webhook(ev)).body).toEqual({ recibido: true, duplicado: true });
    const cupon = await prisma.cupon.findUniqueOrThrow({ where: { codigo: COD('LANZA') } });
    expect(cupon.usos).toBe(1);
    const sus = await prisma.suscripcion.findUniqueOrThrow({ where: { solicitudId: c.body.id } });
    expect(sus).toMatchObject({ precioPactadoSinIgv: 1290, cuponId: cupon.id, porcentajeDescuento: 20, ciclosDescuentoRestantes: 2 });
    expect(Number((await prisma.cobro.findFirstOrThrow({ where: { solicitudSuscripcionId: c.body.id } })).monto)).toBe(1217.76);
    expect(await prisma.auditoria.count({ where: { entidadId: cupon.id, accion: 'CUPON_USADO' } })).toBe(1);

    // La misma empresa (por su RUC) no lo vuelve a usar.
    expect((await vista({ cupon: COD('LANZA'), correoAdmin: correoDe('otra'), ruc: '20131312955' })).body.detalles[0].motivo).toBe('CUPON_YA_USADO');
    expect((await checkout(empresa(correoDe('otra'), { cupon: COD('LANZA'), ruc: '20131312955' }))).body.detalles[0].motivo).toBe('CUPON_YA_USADO');
    // Sin cupón, el resumen de siempre.
    expect((await checkout(empresa(correoDe('sin')))).body.resumen).toMatchObject({ subtotal: 1290, descuento: 0, total: 1522.2, cupon: null });
  });

  it('dos pagos en el último cupo se respetan y queda la auditoría; después el cupón está agotado', async () => {
    await crearCupon({ codigo: COD('UNO'), limiteUsos: 1, ciclosDescuento: null, porcentaje: 10 });
    const a = await checkout(empresa(correoDe('uno-a'), { cupon: COD('UNO') }));
    const b = await checkout(empresa(correoDe('uno-b'), { cupon: COD('UNO') }));
    expect([a.status, b.status]).toEqual([201, 201]);
    const [ra, rb] = await Promise.all([
      webhook({ id: `evt_${sufijo}_uno_a`, tipo: 'pago.aprobado', solicitudId: a.body.id }),
      webhook({ id: `evt_${sufijo}_uno_b`, tipo: 'pago.aprobado', solicitudId: b.body.id }),
    ]);
    expect([ra.body.duplicado, rb.body.duplicado]).toEqual([false, false]);
    const cupon = await prisma.cupon.findUniqueOrThrow({ where: { codigo: COD('UNO') } });
    expect(cupon.usos).toBe(2);
    const acciones = (await prisma.auditoria.findMany({ where: { entidadId: cupon.id }, select: { accion: true } })).map((x) => x.accion).sort();
    expect(acciones).toEqual(['CUPON_CREADO', 'CUPON_USADO', 'CUPON_USO_SOBRE_LIMITE']);
    const suscripciones = await prisma.suscripcion.findMany({ where: { solicitudId: { in: [a.body.id, b.body.id] } } });
    expect(suscripciones.map((x) => [x.porcentajeDescuento, x.ciclosDescuentoRestantes])).toEqual([[10, null], [10, null]]);
    expect((await vista({ cupon: COD('UNO') })).body.detalles[0].motivo).toBe('CUPON_AGOTADO');
    expect((await como('super').get('/ventas/cupones')).body.cupones.find((x: { codigo: string }) => x.codigo === COD('UNO'))).toMatchObject({ usos: 2, limiteUsos: 1, estado: 'AGOTADO' });
  });
});
