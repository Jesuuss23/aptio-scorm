// HU-1707 · Cola `comprobantes` contra PostgreSQL y Redis reales, con el OSE simulado, el almacenamiento en memoria y el
// SMTP simulado: CP-148 (factura F001 aceptada con PDF, XML y correo con adjuntos), boleta sin RUC, la tarea repetida
// que no duplica, el correlativo con 2 emisiones a la vez, CP-149 (observado, corregir y reenviar hasta aceptado), la
// nota de crédito del reembolso y los datos fiscales o el proveedor que faltan.
import { COLA_COMPROBANTES, type DatosComprobante, opcionesRedis, opcionesTareaComprobante } from '@aptio/colas';
import { prisma } from '@aptio/db';
import { Queue, QueueEvents } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearTrabajadorComprobantes, type DependenciasComprobantes, oseSimulado, procesarComprobante, RUC_OBSERVADO_PRUEBAS, siguienteNumero } from '../src/comprobantes.js';
import type { Correo } from '../src/correo.js';

const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const PID = process.pid;
const PREFIJO = `aptio-pruebas-comprobantes-${PID}`;
const SLUG = `plan-cpe-${PID}`;
const CORREO = `facturacion-${PID}@worker.example`;
// Series propias de la prueba (4 caracteres) para no tocar el correlativo de F001 y B001.
const sufijo = String(PID % 1000).padStart(3, '0').replace(/\d/g, (d) => 'ABCDEFGHIJ'[Number(d)]!);
const SERIES = { serieFactura: `F${sufijo}`, serieBoleta: `B${sufijo}`, serieNotaFactura: `FZ${sufijo.slice(1)}`, serieNotaBoleta: `BZ${sufijo.slice(1)}` };
const RUC_CLIENTE = '20131312955';
const RUC_EMISOR = '20000000001';

function entorno() {
  const archivos = new Map<string, { cuerpo: Uint8Array | string; mime: string }>();
  const enviados: Correo[] = [];
  const deps: DependenciasComprobantes = {
    proveedores: { pruebas: oseSimulado() },
    subir: async (clave, cuerpo, mime) => { archivos.set(clave, { cuerpo, mime }); },
    enviar: async (c) => { enviados.push(c); },
  };
  return { archivos, enviados, deps };
}

let fiscalesAntes: Awaited<ReturnType<typeof prisma.datosFiscales.findUnique>> = null;

async function limpiar() {
  const cobros = (await prisma.cobro.findMany({ where: { OR: [{ eventoPagoId: { startsWith: `cpe-${PID}-` } }, { solicitud: { correoAdmin: CORREO } }] }, select: { id: true } })).map((c) => c.id);
  await prisma.comprobante.deleteMany({ where: { cobroId: { in: cobros }, tipo: 'NOTA_CREDITO' } });
  await prisma.comprobante.deleteMany({ where: { cobroId: { in: cobros } } });
  await prisma.cobro.deleteMany({ where: { id: { in: cobros } } });
  const orgs = (await prisma.solicitudSuscripcion.findMany({ where: { correoAdmin: CORREO }, select: { organizacionId: true } })).map((s) => s.organizacionId).filter((x): x is string => !!x);
  await prisma.suscripcion.deleteMany({ where: { plan: { slug: SLUG } } });
  await prisma.solicitudSuscripcion.deleteMany({ where: { correoAdmin: CORREO } });
  await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  await prisma.plan.deleteMany({ where: { slug: SLUG } });
  await prisma.serieComprobante.deleteMany({ where: { serie: { in: Object.values(SERIES) } } });
}

let n = 0;
/** Un cobro aprobado de una solicitud (con o sin RUC), con su organización y suscripción. */
async function cobro(ruc: string | null, total = 1522.2, moneda = 'PEN') {
  n += 1;
  const plan = await prisma.plan.upsert({ where: { slug: SLUG }, create: { slug: SLUG, nombre: 'Productora', precioMes: 1290 }, update: {} });
  const s = await prisma.solicitudSuscripcion.create({
    data: {
      planId: plan.id, ciclo: 'MENSUAL', razonSocial: ruc ? 'Minera Andina SAC' : 'Ana Quispe', ruc, tipoComprobante: ruc ? 'FACTURA' : 'BOLETA', nombreAdmin: 'Ana Quispe', correoAdmin: CORREO,
      subtotal: 1290, igv: 232.2, total, moneda, pasarela: 'pruebas', estado: 'APROBADA',
    },
  });
  const org = await prisma.organizacion.create({ data: { nombre: 'Minera Andina SAC', slug: `minera-cpe-${s.id.slice(0, 8)}`, ruc } });
  const sus = await prisma.suscripcion.create({
    data: { organizacionId: org.id, planId: plan.id, ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, inicioPeriodo: new Date('2026-11-17T15:00:00Z'), finPeriodo: new Date('2026-12-17T15:00:00Z'), pasarela: 'pruebas', solicitudId: s.id },
  });
  await prisma.solicitudSuscripcion.update({ where: { id: s.id }, data: { organizacionId: org.id } });
  return prisma.cobro.create({ data: { solicitudSuscripcionId: s.id, suscripcionId: sus.id, eventoPagoId: `cpe-${PID}-${n}`, monto: total, moneda, pasarela: 'pruebas', ultimos4Digitos: '1111' } });
}

describe.skipIf(!hayBase)('cola comprobantes (HU-1707)', () => {
  beforeAll(async () => {
    fiscalesAntes = await prisma.datosFiscales.findUnique({ where: { id: 'principal' } });
  });
  beforeEach(async () => {
    await limpiar();
    await prisma.datosFiscales.upsert({
      where: { id: 'principal' },
      create: { rucEmisor: RUC_EMISOR, razonSocialEmisor: 'Grupo de Soluciones Creativas SAC', direccionEmisor: 'Av. Ejemplo 123, Lima', ...SERIES },
      update: { rucEmisor: RUC_EMISOR, razonSocialEmisor: 'Grupo de Soluciones Creativas SAC', direccionEmisor: 'Av. Ejemplo 123, Lima', ...SERIES, proveedor: 'pruebas', ambiente: 'pruebas', detraccionActiva: false },
    });
  });
  afterAll(async () => {
    await limpiar();
    if (fiscalesAntes) { const { id: _i, actualizadoEn: _a, ...resto } = fiscalesAntes; await prisma.datosFiscales.update({ where: { id: 'principal' }, data: resto }); }
    await prisma.$disconnect();
  });

  it('CP-148 · un cobro con RUC emite la factura de su serie, aceptada, con PDF y XML en S3 y el correo con los dos adjuntos', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { archivos, enviados, deps } = entorno();
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    expect(r).toMatchObject({ resultado: 'emitido', estado: 'ACEPTADO' });
    const comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: r.comprobanteId! } });
    expect(comp).toMatchObject({ tipo: 'FACTURA', serie: SERIES.serieFactura, numero: 1, ruc: RUC_CLIENTE, razonSocial: 'Minera Andina SAC', correoFacturacion: CORREO, moneda: 'PEN', estado: 'ACEPTADO', proveedor: 'pruebas', ambiente: 'pruebas', intentos: 1 });
    expect([Number(comp.baseSinIgv), Number(comp.igv), Number(comp.total)]).toEqual([1290, 232.2, 1522.2]);
    expect(comp.organizacionId).not.toBeNull();
    const archivo = `${RUC_EMISOR}-01-${SERIES.serieFactura}-00000001`;
    expect(comp.s3KeyXml).toBe(`comprobantes/${comp.id}/${archivo}.xml`);
    expect(comp.s3KeyPdf).toBe(`comprobantes/${comp.id}/${archivo}.pdf`);
    const xml = String(archivos.get(comp.s3KeyXml!)!.cuerpo);
    expect(xml).toContain(`<cbc:ID>${SERIES.serieFactura}-00000001</cbc:ID>`);
    expect(xml).toContain(`<cbc:ID schemeID="6">${RUC_CLIENTE}</cbc:ID>`);
    const pdf = archivos.get(comp.s3KeyPdf!)!;
    expect(pdf.mime).toBe('application/pdf');
    expect(Buffer.from(pdf.cuerpo as Uint8Array).subarray(0, 5).toString()).toBe('%PDF-');
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ para: CORREO, asunto: `Tu factura ${SERIES.serieFactura}-00000001 de Aptio SCORM` });
    expect(enviados[0]!.adjuntos!.map((a) => [a.archivo, a.mime])).toEqual([[`${archivo}.pdf`, 'application/pdf'], [`${archivo}.xml`, 'application/xml']]);
    expect(comp.correoEnviadoEn).not.toBeNull();
  });

  it('sin RUC emite una boleta sin documento del receptor, en la moneda del cobro', async () => {
    const c = await cobro(null, 129.8, 'USD');
    const { archivos, deps } = entorno();
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    const comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: r.comprobanteId! } });
    expect(comp).toMatchObject({ tipo: 'BOLETA', serie: SERIES.serieBoleta, ruc: null, moneda: 'USD', estado: 'ACEPTADO' });
    expect([Number(comp.baseSinIgv), Number(comp.igv)]).toEqual([110, 19.8]);
    expect(String(archivos.get(comp.s3KeyXml!)!.cuerpo)).toContain('<cbc:ID schemeID="0">-</cbc:ID>');
  });

  it('HU-1711 · un comprobante nuevo usa los datos que el administrador editó en el portal; el ya emitido no cambia', async () => {
    const primero = await cobro(null);
    const { deps } = entorno();
    const r1 = await procesarComprobante(prisma, { cobroId: primero.id }, deps);
    const boleta = await prisma.comprobante.findUniqueOrThrow({ where: { id: r1.comprobanteId! } });
    expect(boleta).toMatchObject({ tipo: 'BOLETA', ruc: null, razonSocial: 'Ana Quispe', direccion: null, correoFacturacion: CORREO });
    const sus = await prisma.suscripcion.findUniqueOrThrow({ where: { id: primero.suscripcionId! } });
    await prisma.datosFacturacionOrg.create({
      data: { organizacionId: sus.organizacionId, razonSocial: 'Minera Andina SAC', ruc: RUC_CLIENTE, direccion: 'Av. Arequipa 123, Lima', correoFacturacion: `pagos-${PID}@worker.example`, tipoComprobantePreferido: 'FACTURA' },
    });
    n += 1;
    const segundo = await prisma.cobro.create({ data: { solicitudSuscripcionId: primero.solicitudSuscripcionId, suscripcionId: sus.id, eventoPagoId: `cpe-${PID}-${n}`, monto: 1522.2, moneda: 'PEN', pasarela: 'pruebas', ultimos4Digitos: '1111' } });
    const r2 = await procesarComprobante(prisma, { cobroId: segundo.id }, deps);
    const factura = await prisma.comprobante.findUniqueOrThrow({ where: { id: r2.comprobanteId! } });
    expect(factura).toMatchObject({ tipo: 'FACTURA', serie: SERIES.serieFactura, ruc: RUC_CLIENTE, razonSocial: 'Minera Andina SAC', direccion: 'Av. Arequipa 123, Lima', correoFacturacion: `pagos-${PID}@worker.example`, organizacionId: sus.organizacionId });
    // El primero se repite y sigue siendo la boleta con sus datos de entonces.
    await procesarComprobante(prisma, { cobroId: primero.id }, deps);
    expect(await prisma.comprobante.findUniqueOrThrow({ where: { id: boleta.id } })).toMatchObject({ tipo: 'BOLETA', ruc: null, razonSocial: 'Ana Quispe', correoFacturacion: CORREO });
    // Con boleta preferida, aunque la organización tenga RUC, el siguiente es boleta.
    await prisma.datosFacturacionOrg.update({ where: { organizacionId: sus.organizacionId }, data: { tipoComprobantePreferido: 'BOLETA' } });
    n += 1;
    const tercero = await prisma.cobro.create({ data: { solicitudSuscripcionId: primero.solicitudSuscripcionId, suscripcionId: sus.id, eventoPagoId: `cpe-${PID}-${n}`, monto: 1522.2, moneda: 'PEN', pasarela: 'pruebas', ultimos4Digitos: '1111' } });
    const r3 = await procesarComprobante(prisma, { cobroId: tercero.id }, deps);
    expect(await prisma.comprobante.findUniqueOrThrow({ where: { id: r3.comprobanteId! } })).toMatchObject({ tipo: 'BOLETA', ruc: null, razonSocial: 'Minera Andina SAC' });
  });

  it('la tarea repetida (incluso a la vez) deja un solo comprobante, un solo número y un solo correo', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { enviados, deps } = entorno();
    const [a, b] = await Promise.all([procesarComprobante(prisma, { cobroId: c.id }, deps), procesarComprobante(prisma, { cobroId: c.id }, deps)]);
    expect(a.comprobanteId).toBe(b.comprobanteId);
    const otra = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    expect(otra).toMatchObject({ resultado: 'omitido', motivo: 'ya se emitió y se envió' });
    expect(await prisma.comprobante.count({ where: { cobroId: c.id } })).toBe(1);
    expect((await prisma.serieComprobante.findUniqueOrThrow({ where: { serie: SERIES.serieFactura } })).ultimoNumero).toBe(1);
    expect(enviados).toHaveLength(1);
  });

  it('dos emisiones a la vez de cobros distintos reciben números correlativos distintos', async () => {
    const c1 = await cobro(RUC_CLIENTE); const c2 = await cobro(RUC_CLIENTE); const c3 = await cobro(RUC_CLIENTE);
    const { deps } = entorno();
    await Promise.all([c1, c2, c3].map((c) => procesarComprobante(prisma, { cobroId: c!.id }, deps)));
    const numeros = (await prisma.comprobante.findMany({ where: { cobroId: { in: [c1!.id, c2!.id, c3!.id] } } })).map((x) => x.numero).sort();
    expect(numeros).toEqual([1, 2, 3]);
    // La asignación directa también es atómica bajo bloqueo.
    const dos = await Promise.all([0, 1].map(() => prisma.$transaction((tx) => siguienteNumero(tx, SERIES.serieFactura, 'FACTURA'))));
    expect(dos.sort()).toEqual([4, 5]);
  });

  it('CP-149 · el OSE observa la factura con el motivo; corregido el receptor y reenviada, queda aceptada', async () => {
    const c = await cobro(RUC_OBSERVADO_PRUEBAS);
    const { enviados, deps } = entorno();
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    expect(r).toMatchObject({ resultado: 'emitido', estado: 'OBSERVADO' });
    let comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: r.comprobanteId! } });
    expect(comp.motivo).toContain('no figura como activo');
    expect(enviados).toHaveLength(0);
    // Lo que hace POST /ventas/comprobantes/{id}/reenviar: corrige el receptor y encola el reenvío con el comprobanteId.
    await prisma.comprobante.update({ where: { id: comp.id }, data: { ruc: RUC_CLIENTE, razonSocial: 'Minera Andina SAC', direccion: 'Jr. Cajamarca 456, Lima' } });
    const r2 = await procesarComprobante(prisma, { cobroId: c.id, comprobanteId: comp.id }, deps);
    expect(r2).toMatchObject({ resultado: 'emitido', estado: 'ACEPTADO' });
    comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } });
    expect(comp).toMatchObject({ numero: 1, intentos: 2, ruc: RUC_CLIENTE, estado: 'ACEPTADO' });
    expect(enviados).toHaveLength(1);
  });

  it('el reembolso emite la nota de crédito de su serie, que referencia la factura por el total', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { archivos, enviados, deps } = entorno();
    await expect(procesarComprobante(prisma, { cobroId: c.id, tipo: 'NOTA_CREDITO' }, deps)).rejects.toThrow('aún no tiene comprobante');
    const f = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    const r = await procesarComprobante(prisma, { cobroId: c.id, tipo: 'NOTA_CREDITO' }, deps);
    const nota = await prisma.comprobante.findUniqueOrThrow({ where: { id: r.comprobanteId! } });
    expect(nota).toMatchObject({ tipo: 'NOTA_CREDITO', serie: SERIES.serieNotaFactura, numero: 1, comprobanteReferenciaId: f.comprobanteId, estado: 'ACEPTADO' });
    expect(Number(nota.total)).toBe(1522.2);
    const xml = String(archivos.get(nota.s3KeyXml!)!.cuerpo);
    expect(xml).toContain(`<cbc:ReferenceID>${SERIES.serieFactura}-00000001</cbc:ReferenceID>`);
    expect(enviados.map((e) => e.asunto)).toContain(`Tu nota de crédito ${SERIES.serieNotaFactura}-00000001 de Aptio SCORM`);
  });

  it('si el SMTP falla, el correo se libera y el reintento lo envía una vez', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { deps, enviados } = entorno();
    let fallar = true;
    const conFallo = { ...deps, enviar: async (x: Correo) => { if (fallar) { fallar = false; throw new Error('SMTP caído'); } await deps.enviar(x); } };
    await expect(procesarComprobante(prisma, { cobroId: c.id }, conFallo)).rejects.toThrow('SMTP caído');
    const comp = await prisma.comprobante.findFirstOrThrow({ where: { cobroId: c.id } });
    expect(comp).toMatchObject({ estado: 'ACEPTADO', correoEnviadoEn: null, intentos: 1 });
    expect(await procesarComprobante(prisma, { cobroId: c.id }, conFallo)).toMatchObject({ estado: 'ACEPTADO' });
    expect(enviados).toHaveLength(1);
    expect((await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } })).intentos).toBe(1);
  });

  it('sin RUC del emisor o sin el proveedor en este entorno, el comprobante queda pendiente con el motivo', async () => {
    await prisma.datosFiscales.update({ where: { id: 'principal' }, data: { rucEmisor: null } });
    const c = await cobro(RUC_CLIENTE);
    const { deps, enviados } = entorno();
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    expect(r).toMatchObject({ resultado: 'pendiente', estado: 'PENDIENTE' });
    expect(r.motivo).toContain('Faltan los datos fiscales del emisor');
    await prisma.datosFiscales.update({ where: { id: 'principal' }, data: { rucEmisor: RUC_EMISOR } });
    const sinOse = await procesarComprobante(prisma, { cobroId: c.id, comprobanteId: r.comprobanteId! }, { ...deps, proveedores: {} });
    expect(sinOse.motivo).toContain('no está disponible en este entorno');
    expect((await procesarComprobante(prisma, { cobroId: c.id, comprobanteId: r.comprobanteId! }, deps)).estado).toBe('ACEPTADO');
    expect(enviados).toHaveLength(1);
  });

  it('con la detracción activa, la factura en soles desde el umbral guarda su monto', async () => {
    await prisma.datosFiscales.update({ where: { id: 'principal' }, data: { detraccionActiva: true, detraccionTasa: 12, detraccionUmbralPen: 700 } });
    const c = await cobro(RUC_CLIENTE);
    const { archivos, deps } = entorno();
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    const comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: r.comprobanteId! } });
    expect(Number(comp.detraccion)).toBe(182.66);
    expect(String(archivos.get(comp.s3KeyXml!)!.cuerpo)).toContain('languageLocaleID="2006"');
  });

  it('la cola emite la factura del cobro encolado', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { deps, enviados } = entorno();
    const trabajador = crearTrabajadorComprobantes(prisma, deps, { connection: opcionesRedis(), prefix: PREFIJO });
    const cola = new Queue<DatosComprobante>(COLA_COMPROBANTES, { connection: opcionesRedis(), prefix: PREFIJO });
    const eventos = new QueueEvents(COLA_COMPROBANTES, { connection: opcionesRedis(), prefix: PREFIJO });
    await eventos.waitUntilReady();
    try {
      const job = await cola.add('emitir-comprobante', { cobroId: c.id }, opcionesTareaComprobante(c.id));
      await job.waitUntilFinished(eventos, 20_000);
      expect(await prisma.comprobante.count({ where: { cobroId: c.id, estado: 'ACEPTADO' } })).toBe(1);
      expect(enviados).toHaveLength(1);
    } finally {
      await trabajador.close();
      await cola.obliterate({ force: true });
      await cola.close();
      await eventos.close();
    }
  });
});
