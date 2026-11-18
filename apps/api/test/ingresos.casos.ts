// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas de ventas.
// HU-1710 · Panel de ingresos (REQ-090, CP-152, PNT-35) contra PostgreSQL:
// - CP-152: suscripciones vigentes por S/ 13,834 al mes (mensuales, anuales entre 12, con pago pendiente y una que pidió
//   cancelar) más una CANCELADA y una SUSPENDIDA que no cuentan; los dólares van aparte. Para no depender de las
//   suscripciones de otras pruebas, los datos viven en marzo de 2001 (creadas y canceladas entonces);
// - el mes por defecto es el de Lima y uno mal escrito da 422;
// - solo el superadmin (401 sin sesión, 403 a otro rol).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { mesLima } from '@aptio/schema/ingresos';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ingresarCookie } from './ingreso-apoyo.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@ingresos.test`;
const F = (d: string) => new Date(`${d}T15:00:00Z`);

describe.skipIf(!hayBase && !process.env.CI)('panel de ingresos (HU-1710)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  const orgs: string[] = [];
  let planId = '';
  const como = (quien: string) => ({ get: (r: string) => request(servidor).get(`/api/v1${r}`).set('Cookie', cookies[quien]!) });

  beforeAll(async () => {
    planId = (await prisma.plan.create({ data: { slug: `ingresos-${sufijo}`, nombre: 'Ingresos', precioMes: 1290, visible: false, orden: 97 } })).id;
    const sus = async (n: number, d: { estado?: 'ACTIVA' | 'PAGO_PENDIENTE' | 'SUSPENDIDA' | 'CANCELADA'; ciclo?: 'MENSUAL' | 'ANUAL'; precio: number; moneda?: string; cancelarAlFin?: boolean; canceladaEn?: Date; porcentajeDescuento?: number; ciclosDescuentoRestantes?: number | null }) => {
      const org = await prisma.organizacion.create({ data: { nombre: `Ingresos ${n}`, slug: `ingresos-${n}-${sufijo}` } });
      orgs.push(org.id);
      await prisma.suscripcion.create({
        data: {
          organizacionId: org.id, planId, ciclo: d.ciclo ?? 'MENSUAL', precioPactadoSinIgv: d.precio, moneda: d.moneda ?? 'PEN', estado: d.estado ?? 'ACTIVA', inicioPeriodo: F('2001-02-01'),
          finPeriodo: F('2001-04-01'), pasarela: 'pruebas', cancelarAlFin: d.cancelarAlFin ?? false, canceladaEn: d.canceladaEn ?? null, creadoEn: F('2001-01-10'),
          porcentajeDescuento: d.porcentajeDescuento ?? null, ciclosDescuentoRestantes: d.ciclosDescuentoRestantes ?? null,
        },
      });
    };
    await sus(1, { precio: 490 });
    await sus(2, { precio: 1290 });
    await sus(3, { precio: 1290, estado: 'PAGO_PENDIENTE' });
    await sus(4, { precio: 2990 });
    await sus(5, { precio: 2990, cancelarAlFin: true });
    await sus(6, { precio: 28704, ciclo: 'ANUAL' });
    await sus(7, { precio: 28704, ciclo: 'ANUAL' });
    await sus(8, { precio: 2990, estado: 'CANCELADA', canceladaEn: F('2001-03-12') });
    await sus(9, { precio: 1290, estado: 'SUSPENDIDA' });
    await sus(10, { precio: 349, moneda: 'USD', porcentajeDescuento: 20, ciclosDescuentoRestantes: 2 });
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: orgs[0]!, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['super', 'admin']) {
      cookies[n] = await ingresarCookie(servidor, correoDe(n), CLAVE);
    }
  });

  afterAll(async () => {
    await app?.close();
    const usuarios = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@ingresos.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { OR: [{ usuarioId: { in: usuarios } }, { organizacionId: { in: orgs } }] } });
    await prisma.tokenAcceso.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.suscripcion.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
    await prisma.plan.deleteMany({ where: { id: planId } });
  });

  it('CP-152 · S/ 13,834 al mes sin la cancelada ni la suspendida; dólares aparte, cancelación y su variación', async () => {
    const r = await como('super').get('/ventas/ingresos?mes=2001-03');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.actual).toMatchObject({
      mes: '2001-03', inicio: '2001-03-01T05:00:00.000Z', corte: '2001-04-01T04:59:59.999Z', activas: 8, vigentesAlInicio: 9, canceladas: 1, tasaCancelacion: 11.1,
      monedas: [{ moneda: 'PEN', mrr: 13834, enRiesgo: 2990, activas: 7, arpu: 1976.29 }, { moneda: 'USD', mrr: 279.2, enRiesgo: 0, activas: 1, arpu: 279.2 }],
    });
    // Febrero: la cancelada en marzo todavía estaba vigente y nadie canceló.
    expect(r.body.anterior).toMatchObject({ mes: '2001-02', activas: 9, canceladas: 0, tasaCancelacion: 0 });
    expect(r.body.anterior.monedas[0]).toMatchObject({ moneda: 'PEN', mrr: 16824, activas: 8 });
    expect(r.body.variacionCancelacion).toBe(11.1);
  });

  it('el mes por defecto es el de Lima; uno mal escrito da 422', async () => {
    const r = await como('super').get('/ventas/ingresos');
    expect(r.status).toBe(200);
    expect(r.body.actual.mes).toBe(mesLima(new Date()));
    for (const malo of ['2026-13', '2026-1', 'noviembre']) {
      const x = await como('super').get(`/ventas/ingresos?mes=${malo}`);
      expect(x.status).toBe(422);
      expect(x.body).toMatchObject({ codigo: 'NO_VALIDO', detalles: [{ campo: 'mes' }] });
    }
  });

  it('solo el superadmin: 401 sin sesión y 403 a un administrador de organización', async () => {
    expect((await request(servidor).get('/api/v1/ventas/ingresos')).status).toBe(401);
    expect((await como('admin').get('/ventas/ingresos')).status).toBe(403);
  });
});
