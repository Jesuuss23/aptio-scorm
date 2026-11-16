// HU-1602 · Cola `crm` contra PostgreSQL y Redis reales, con los CRM simulados (REQ-075, RN-17-2). CP-129: con el CRM
// caído (500) se reintenta 3 veces con espera creciente y queda «error» con el motivo. CP-130: el webhook llega firmado
// y se verifica con la clave del panel. Las esperas se acortan (10, 20 y 40 ms) para la prueba.
import { COLA_CRM, type DatosEnvioCrm, ESPERAS_CRM_MS, esperaCrm, INTENTOS_CRM, opcionesRedis, opcionesTareaCrm } from '@aptio/colas';
import { prisma } from '@aptio/db';
import { CABECERA_ENTREGA, CABECERA_EVENTO, CABECERA_FIRMA, generarSecreto, verificarFirma } from '@aptio/schema/crm-envio';
import { Queue, QueueEvents } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearTrabajadorCrm, procesarEnvioCrm } from '../src/crm.js';

const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const PREFIJO = `aptio-pruebas-crm-${process.pid}`;
const CORREO = 'crm-prueba@worker.example';
const previas = new Map<string, { activa: boolean; mapeo: unknown; url: string | null; secreto: string | null }>();

type Pedido = { url: string; init: RequestInit; en: number };
const crmSimulado = (responder: (n: number) => Response) => {
  const pedidos: Pedido[] = [];
  const obtener = async (url: string, init: RequestInit) => {
    pedidos.push({ url, init, en: Date.now() });
    return responder(pedidos.length);
  };
  return { pedidos, obtener };
};

async function conexion(tipo: string, datos: { activa?: boolean; url?: string | null; secreto?: string | null } = {}) {
  return prisma.crmConexion.upsert({ where: { tipo }, create: { tipo, activa: true, ...datos }, update: { activa: true, mapeo: {}, ...datos } });
}
async function envio(tipo: string, datos: Parameters<typeof conexion>[1] = {}) {
  const c = await conexion(tipo, datos);
  const lead = await prisma.lead.upsert({
    where: { correo: CORREO }, update: {},
    create: { correo: CORREO, nombre: 'Lead del worker', empresa: 'Kallpa Formación', origen: 'formulario', via: 'formulario', paginaEntrada: '/precios', utmSource: 'google', consentimiento: true },
  });
  return prisma.leadEnvio.upsert({ where: { leadId_conexionId: { leadId: lead.id, conexionId: c.id } }, create: { leadId: lead.id, conexionId: c.id }, update: { estado: 'pendiente', intentos: 0, motivo: null } });
}

describe.skipIf(!hayBase)('cola crm (HU-1602)', () => {
  beforeAll(async () => {
    for (const c of await prisma.crmConexion.findMany()) previas.set(c.tipo, { activa: c.activa, mapeo: c.mapeo, url: c.url, secreto: c.secreto });
  });
  beforeEach(async () => {
    await prisma.lead.deleteMany({ where: { correo: CORREO } });
  });
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { correo: CORREO } });
    for (const c of await prisma.crmConexion.findMany()) {
      const p = previas.get(c.tipo);
      if (p) await prisma.crmConexion.update({ where: { id: c.id }, data: { activa: p.activa, mapeo: p.mapeo as object, url: p.url, secreto: p.secreto } });
      else await prisma.crmConexion.delete({ where: { id: c.id } });
    }
    await prisma.$disconnect();
  });

  it('las esperas de producción son 30 s, 2 min y 8 min, con 4 intentos en total y la entrega fija en el id', () => {
    expect([ESPERAS_CRM_MS, INTENTOS_CRM]).toEqual([[30_000, 120_000, 480_000], 4]);
    expect([1, 2, 3].map((n) => esperaCrm(n))).toEqual([30_000, 120_000, 480_000]);
    expect(opcionesTareaCrm('e-1')).toMatchObject({ jobId: 'crm-e-1', attempts: 4, backoff: { type: 'crm' } });
  });

  it('CP-129 · con el CRM caído (500) se reintenta 3 veces con espera creciente y queda «error» con el motivo', async () => {
    const e = await envio('hubspot');
    const crm = crmSimulado(() => new Response(JSON.stringify({ message: 'Service unavailable' }), { status: 500 }));
    const esperas = [40, 80, 160];
    const cola = new Queue<DatosEnvioCrm>(COLA_CRM, { connection: opcionesRedis(), prefix: PREFIJO });
    const eventos = new QueueEvents(COLA_CRM, { connection: opcionesRedis(), prefix: PREFIJO });
    const trabajador = crearTrabajadorCrm(prisma, { connection: opcionesRedis(), prefix: PREFIJO, esperas, deps: { obtener: crm.obtener, entorno: { HUBSPOT_TOKEN: 'pat-secreto' } } });
    try {
      await eventos.waitUntilReady();
      const job = await cola.add('crm-enviar', { envioId: e.id, evento: 'lead.creado', entrega: 'cp129' }, opcionesTareaCrm('cp129'));
      await expect(job.waitUntilFinished(eventos, 10_000)).rejects.toThrow('HubSpot respondió 500: Service unavailable');
      // 1 intento y 3 reintentos, cada espera más larga que la anterior.
      expect(crm.pedidos).toHaveLength(4);
      const gaps = crm.pedidos.slice(1).map((p, i) => p.en - crm.pedidos[i]!.en);
      gaps.forEach((g, i) => expect(g).toBeGreaterThanOrEqual(esperas[i]! - 5));
      expect(gaps[2]!).toBeGreaterThan(gaps[0]!);
      const final = await prisma.leadEnvio.findUniqueOrThrow({ where: { id: e.id } });
      expect(final).toMatchObject({ estado: 'error', intentos: 4, motivo: 'HubSpot respondió 500: Service unavailable', enviadoEn: null });
    } finally {
      await trabajador.close();
      await eventos.close();
      await cola.obliterate({ force: true });
      await cola.close();
    }
  });

  it('mientras quedan reintentos el envío sigue «pendiente»; si el CRM vuelve, queda «enviado» con su id', async () => {
    const e = await envio('hubspot');
    const crm = crmSimulado((n) => (n === 1 ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ results: [{ id: '4401' }] }), { status: 200 })));
    const deps = { obtener: crm.obtener, entorno: { HUBSPOT_TOKEN: 't' } };
    const datos = { envioId: e.id, evento: 'lead.creado' as const, entrega: 'x' };
    await expect(procesarEnvioCrm(prisma, datos, { numero: 1, maximo: 4 }, deps)).rejects.toMatchObject({ reintentable: true });
    expect(await prisma.leadEnvio.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ estado: 'pendiente', intentos: 1, motivo: 'HubSpot respondió 503' });
    expect(await procesarEnvioCrm(prisma, datos, { numero: 2, maximo: 4 }, deps)).toEqual({ estado: 'enviado', idExterno: '4401' });
    expect(await prisma.leadEnvio.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ estado: 'enviado', intentos: 2, motivo: null, idExterno: '4401', enviadoEn: expect.any(Date) });
  });

  it('sin la clave en el entorno no reintenta: queda «error» en el primer intento y dice qué variable falta', async () => {
    const e = await envio('pipedrive');
    const crm = crmSimulado(() => new Response('{}'));
    await expect(procesarEnvioCrm(prisma, { envioId: e.id, evento: 'lead.creado', entrega: 'x' }, { numero: 1, maximo: 4 }, { obtener: crm.obtener, entorno: {} })).rejects.toMatchObject({ reintentable: false });
    expect(crm.pedidos).toHaveLength(0);
    expect(await prisma.leadEnvio.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ estado: 'error', intentos: 1, motivo: 'Falta la clave: define PIPEDRIVE_TOKEN en el entorno del servidor' });
  });

  it('CP-130 · el webhook llega con la firma HMAC verificable con la clave del panel, el evento y la entrega', async () => {
    const secreto = generarSecreto();
    const e = await envio('webhook', { url: 'https://hooks.ventas.pe/aptio', secreto });
    const crm = crmSimulado(() => new Response(null, { status: 204 }));
    const ahora = new Date();
    const r = await procesarEnvioCrm(prisma, { envioId: e.id, evento: 'lead.actualizado', entrega: 'ent-130' }, { numero: 1, maximo: 4 }, { obtener: crm.obtener, resolver: async () => ['93.184.216.34'], ahora: () => ahora });
    expect(r).toEqual({ estado: 'enviado', idExterno: null });
    const [p] = crm.pedidos;
    const h = p!.init.headers as Record<string, string>;
    expect([p!.url, h[CABECERA_EVENTO], h[CABECERA_ENTREGA]]).toEqual(['https://hooks.ventas.pe/aptio', 'lead.actualizado', 'ent-130']);
    expect(verificarFirma(h[CABECERA_FIRMA], String(p!.init.body), secreto)).toEqual({ ok: true });
    expect(verificarFirma(h[CABECERA_FIRMA], String(p!.init.body), generarSecreto())).toEqual({ ok: false, motivo: 'no_coincide' });
    expect(JSON.parse(String(p!.init.body))).toMatchObject({ evento: 'lead.actualizado', entrega: 'ent-130', lead: { correo: CORREO, empresa: 'Kallpa Formación', utm: { source: 'google' } } });
  });

  it('una conexión desactivada antes del envío no se llama y queda «error» con el motivo', async () => {
    const e = await envio('zoho', { activa: false });
    const crm = crmSimulado(() => new Response('{}'));
    await expect(procesarEnvioCrm(prisma, { envioId: e.id, evento: 'lead.creado', entrega: 'x' }, { numero: 1, maximo: 4 }, { obtener: crm.obtener })).rejects.toMatchObject({ reintentable: false });
    expect(crm.pedidos).toHaveLength(0);
    expect(await prisma.leadEnvio.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ estado: 'error', motivo: 'La conexión con Zoho CRM se desactivó antes del envío' });
  });
});
