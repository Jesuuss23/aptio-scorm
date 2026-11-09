// CP-016 · Un trabajo de la cola `ia` cambia de estado y la web recibe el evento por SSE en menos de 2 s.
// Se ejecuta contra PostgreSQL y Redis reales, con el procesador real del worker en modo simulado.
import 'reflect-metadata';
import { get, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { crearRedis, type EventoTrabajo, opcionesRedis, prefijoColas } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { Queue, Worker } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearProcesador } from '../../worker/src/procesar.js';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const sufijo = Math.random().toString(36).slice(2, 8);
process.env.COLAS_PREFIJO = `prueba-${sufijo}`;

const redisListo = await (async () => {
  const r = crearRedis();
  try {
    await r.connect();
    return (await r.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    r.disconnect();
  }
})();
const baseLista = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const CLAVE = 'clave-de-prueba-123';
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;

/** Abre /eventos y junta los eventos `trabajo` con el momento en que llegan. */
function escuchar(base: string, cookie: string) {
  const recibidos: { evento: EventoTrabajo; en: number }[] = [];
  let respuesta: IncomingMessage | undefined;
  const abierto = new Promise<IncomingMessage>((resolver, rechazar) => {
    const req = get(`${base}/api/v1/eventos`, { headers: { Cookie: cookie, Accept: 'text/event-stream' } }, (res) => {
      respuesta = res;
      let pendiente = '';
      res.setEncoding('utf8');
      res.on('data', (trozo: string) => {
        pendiente += trozo;
        const bloques = pendiente.split('\n\n');
        pendiente = bloques.pop() ?? '';
        for (const b of bloques) {
          const lineas = b.split('\n');
          if (!lineas.includes('event: trabajo')) continue;
          const data = lineas.find((l) => l.startsWith('data: '))?.slice(6);
          if (data) recibidos.push({ evento: JSON.parse(data) as EventoTrabajo, en: Date.now() });
        }
      });
      resolver(res);
    });
    req.on('error', rechazar);
  });
  return { recibidos, abierto, cerrar: () => respuesta?.destroy() };
}

// En CI los servicios son obligatorios: si faltan, la prueba falla en vez de saltarse.
describe.skipIf((!redisListo || !baseLista) && !process.env.CI)('CP-016 · eventos en vivo (HU-0105)', () => {
  let app: INestApplication;
  let base: string;
  let worker: { close(): Promise<void> };
  let orgId: string;
  let otraOrgId: string;
  const publicador = crearRedis();

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org eventos', slug: `eventos-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra org', slug: `eventos-otra-${sufijo}` } })).id;
    const hashClave = await hashearClave(CLAVE);
    const usuarios = [
      { nombre: 'productor', rol: Rol.PRODUCTOR, organizacionId: orgId },
      { nombre: 'revisor', rol: Rol.REVISOR_CLIENTE, organizacionId: orgId },
      { nombre: 'ajeno', rol: Rol.PRODUCTOR, organizacionId: otraOrgId },
    ];
    for (const u of usuarios) {
      await prisma.usuario.create({ data: { ...u, email: correo(u.nombre), hashClave, emailVerificado: true } });
    }
    if (usuarios.some((u) => u.rol === Rol.REVISOR_CLIENTE)) {
      const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Cliente' } });
      await prisma.usuario.update({ where: { email: correo('revisor') }, data: { clienteId: cliente.id } });
    }

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    worker = new Worker('ia', crearProcesador({ bd: prisma, redis: publicador, demoraMs: 0, modo: 'simulado' }), {
      connection: opcionesRedis(),
      prefix: prefijoColas(),
    });
  });

  afterAll(async () => {
    await worker?.close();
    await app?.close();
    const cola = new Queue('ia', { connection: opcionesRedis(), prefix: prefijoColas() });
    await cola.obliterate({ force: true });
    await cola.close();
    publicador.disconnect();
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  async function cookieDe(nombre: string) {
    const res = await request(base).post('/api/v1/auth/ingresar').send({ email: correo(nombre), clave: CLAVE });
    return ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
  }

  it('la web recibe cada cambio de estado en menos de 2 s y solo los de su organización', async () => {
    const cookie = await cookieDe('productor');
    const propio = escuchar(base, cookie);
    const ajeno = escuchar(base, await cookieDe('ajeno'));
    const res = await propio.abierto;
    await ajeno.abierto;
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const encolado = Date.now();
    const alta = await request(base).post('/api/v1/trabajos/simulados').set('Cookie', cookie).send({ tarea: 'IA-04' });
    expect(alta.status).toBe(202);
    expect(alta.body).toMatchObject({ tarea: 'IA-04', cola: 'ia', estado: 'EN_COLA' });

    await expect
      .poll(() => propio.recibidos.find((r) => r.evento.trabajoId === alta.body.id && r.evento.estado === 'COMPLETADO'), { timeout: 2_000 })
      .toBeTruthy();
    const delTrabajo = propio.recibidos.filter((r) => r.evento.trabajoId === alta.body.id);
    expect(delTrabajo[0]!.evento.estado).toBe('EN_CURSO');
    expect(delTrabajo[0]!.en - encolado).toBeLessThan(2_000);
    expect(delTrabajo.map((r) => r.evento.progreso)).toEqual([0, 25, 50, 75, 100]);
    expect(ajeno.recibidos).toHaveLength(0);

    const visto = await request(base).get(`/api/v1/trabajos/${alta.body.id}`).set('Cookie', cookie);
    expect(visto.body).toMatchObject({ estado: 'COMPLETADO', proveedor: 'simulado' });
    const deOtro = await request(base).get(`/api/v1/trabajos/${alta.body.id}`).set('Cookie', await cookieDe('ajeno'));
    expect(deOtro.status).toBe(404);

    propio.cerrar();
    ajeno.cerrar();
  });

  it('sin sesión /eventos responde 401 y el revisor del cliente no tiene acceso', async () => {
    expect((await request(base).get('/api/v1/eventos')).status).toBe(401);
    const revisor = await cookieDe('revisor');
    expect((await request(base).get('/api/v1/eventos').set('Cookie', revisor)).status).toBe(403);
  });

  it('una tarea sin salida simulada responde 422', async () => {
    const res = await request(base).post('/api/v1/trabajos/simulados').set('Cookie', await cookieDe('productor')).send({ tarea: 'IA-99' });
    expect(res.status).toBe(422);
    expect(res.body.codigo).toBe('TAREA_DESCONOCIDA');
  });
});
