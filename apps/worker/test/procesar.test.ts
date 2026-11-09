// HU-0105 · El worker procesa un trabajo de la cola y publica sus eventos (contra Redis y PostgreSQL reales).
import { CANAL_EVENTOS, crearRedis, type EventoTrabajo, leerEvento, opcionesRedis } from '@aptio/colas';
import { prisma } from '@aptio/db';
import { Queue, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearProcesador } from '../src/procesar.js';

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

describe.skipIf(!redisListo || !baseLista)('worker con proveedores simulados', () => {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const publicador = crearRedis();
  const oyente = crearRedis();
  const eventos: EventoTrabajo[] = [];
  let orgId: string;

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org worker', slug: `worker-${sufijo}` } })).id;
    await oyente.subscribe(CANAL_EVENTOS);
    oyente.on('message', (_c, m) => {
      const e = leerEvento(m);
      if (e?.organizacionId === orgId) eventos.push(e);
    });
  });

  afterAll(async () => {
    await prisma.organizacion.delete({ where: { id: orgId } });
    oyente.disconnect();
    publicador.disconnect();
  });

  const nuevoTrabajo = (tarea: string) =>
    prisma.trabajoIA.create({ data: { organizacionId: orgId, tarea, tipo: 'TEXTO', proveedor: 'simulado', modelo: '-' } });

  it('procesa desde la cola ia, guarda el resultado y publica en curso, avance y completado', async () => {
    const t = await nuevoTrabajo('IA-04');
    // Prefijo propio de la prueba para no competir con un worker de desarrollo que esté escuchando `ia`.
    const prefix = `prueba-${sufijo}`;
    const colaPrueba = new Queue('ia', { connection: opcionesRedis(), prefix });
    const worker = new Worker('ia', crearProcesador({ bd: prisma, redis: publicador, demoraMs: 0, modo: 'simulado' }), {
      connection: opcionesRedis(),
      prefix,
    });
    await colaPrueba.add('IA-04', { trabajoId: t.id, organizacionId: orgId, tarea: 'IA-04' });

    await expect.poll(() => eventos.filter((e) => e.trabajoId === t.id).at(-1)?.estado, { timeout: 5_000 }).toBe('COMPLETADO');
    const propios = eventos.filter((e) => e.trabajoId === t.id);
    expect(propios.map((e) => e.progreso)).toEqual([0, 25, 50, 75, 100]);
    expect(propios[0]).toMatchObject({ tipo: 'estado', estado: 'EN_CURSO', tarea: 'IA-04' });

    const guardado = await prisma.trabajoIA.findUniqueOrThrow({ where: { id: t.id } });
    expect(guardado).toMatchObject({ estado: 'COMPLETADO', proveedor: 'simulado', modelo: 'caso-loto/02-IA-04-estructura.json', intentos: 1 });

    await worker.close();
    await colaPrueba.obliterate({ force: true });
    await colaPrueba.close();
  });

  it('marca el error y lo publica si la tarea no tiene salida', async () => {
    const t = await nuevoTrabajo('IA-99');
    const procesar = crearProcesador({ bd: prisma, redis: publicador, demoraMs: 0, modo: 'simulado' });
    const trabajo = { data: { trabajoId: t.id, organizacionId: orgId, tarea: 'IA-99' }, queueName: 'ia', updateProgress: async () => {} };
    await expect(procesar(trabajo)).rejects.toThrow(/no tiene salida/);
    expect((await prisma.trabajoIA.findUniqueOrThrow({ where: { id: t.id } })).estado).toBe('ERROR');
    await expect.poll(() => eventos.find((e) => e.trabajoId === t.id && e.estado === 'ERROR')?.mensaje).toMatch(/no tiene salida/);
  });

  it('no procesa un trabajo de otra organización', async () => {
    const t = await nuevoTrabajo('IA-01');
    const procesar = crearProcesador({ bd: prisma, redis: publicador, demoraMs: 0, modo: 'simulado' });
    const ajeno = { data: { trabajoId: t.id, organizacionId: crypto.randomUUID(), tarea: 'IA-01' }, queueName: 'ia', updateProgress: async () => {} };
    await expect(procesar(ajeno)).rejects.toThrow(/no existe/);
    expect((await prisma.trabajoIA.findUniqueOrThrow({ where: { id: t.id } })).estado).toBe('EN_COLA');
  });
});
