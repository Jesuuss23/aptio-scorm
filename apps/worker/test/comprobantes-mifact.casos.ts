// HU-1712 · Emisión con Mifact contra PostgreSQL real y el servicio de Mifact simulado con un fetch falso (sin red):
// CP-162 (factura aceptada: se guardan el XML firmado, el CDR y el PDF oficial, y el correo los adjunta), la boleta con
// DNI, CP-163 (en proceso en SUNAT → la consulta de cada 10 minutos la confirma y descarga los archivos), el error de
// Mifact que se reenvía con el mismo número, la caída de red que reintenta y el aceptado con observaciones. Corre desde
// comprobantes.test.ts, después de la suite de HU-1707: las dos cambian la misma fila de datos fiscales y no pueden ir en paralelo.
import { prisma } from '@aptio/db';
import JSZip from 'jszip';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { consultarPendientes, type DependenciasComprobantes, procesarComprobante } from '../src/comprobantes.js';
import type { Correo } from '../src/correo.js';
import { proveedorMifact } from '../src/ose/mifact.js';

const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const PID = process.pid;
const SLUG = `plan-mifact-${PID}`;
const CORREO = `mifact-${PID}@worker.example`;
const sufijo = String(PID % 1000).padStart(3, '0').replace(/\d/g, (d) => 'KLMNOPQRST'[Number(d)]!);
const SERIES = { serieFactura: `F${sufijo}`, serieBoleta: `B${sufijo}`, serieNotaFactura: `FY${sufijo.slice(1)}`, serieNotaBoleta: `BY${sufijo.slice(1)}` };
const RUC_CLIENTE = '20131312955';
const RUC_EMISOR = '20100100100';

type Llamada = { metodo: string; cuerpo: Record<string, unknown> };
type Respuesta = Record<string, unknown> | 'red' | number;

async function zipBase64(nombre: string, contenido: string) {
  const z = new JSZip();
  z.file(nombre, contenido);
  return (await z.generateAsync({ type: 'nodebuffer' })).toString('base64');
}
async function aceptado(serie: string, numero: number, codigo = '102') {
  const nombre = `${RUC_EMISOR}-01-${serie}-${String(numero).padStart(8, '0')}`;
  return {
    estado_documento: codigo, errors: '', sunat_responsecode: '0', sunat_description: `El comprobante ${serie}-${numero} ha sido aceptado`, sunat_note: codigo === '103' ? '4332 - Observación de prueba' : '',
    xml_enviado: await zipBase64(`${nombre}.xml`, `<Invoice firmado="si">${serie}-${numero}</Invoice>`),
    cdr_sunat: await zipBase64(`R-${nombre}.xml`, `<ApplicationResponse>${serie}-${numero}</ApplicationResponse>`),
    pdf_bytes: Buffer.from(`%PDF-1.4 Mifact ${serie}-${numero}`).toString('base64'),
    codigo_hash: `hash-${numero}`, cadena_para_codigo_qr: `${RUC_EMISOR}|01|${serie}|${numero}|`,
  };
}

/** Mifact simulado: cada método responde lo que diga `respuestas` (o 404 si no hay nada preparado). */
function entorno() {
  const archivos = new Map<string, { cuerpo: Uint8Array | string; mime: string }>();
  const enviados: Correo[] = [];
  const llamadas: Llamada[] = [];
  const respuestas: Record<string, Respuesta | ((c: Record<string, unknown>) => Promise<Respuesta>)> = {};
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const metodo = String(url).split('/').pop()!;
    const cuerpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
    llamadas.push({ metodo, cuerpo });
    const preparada = respuestas[metodo];
    const r = typeof preparada === 'function' ? await preparada(cuerpo) : preparada;
    if (r === undefined) return new Response('Not Found', { status: 404 });
    if (r === 'red') throw new TypeError('fetch failed');
    if (typeof r === 'number') return new Response('', { status: r });
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const deps: DependenciasComprobantes = {
    proveedores: { mifact: proveedorMifact({ url: 'https://mifact.simulado/api/invoiceService.svc', token: 'token-simulado', fetch: f }) },
    subir: async (clave, cuerpo, mime) => { archivos.set(clave, { cuerpo, mime }); },
    enviar: async (c) => { enviados.push(c); },
  };
  return { archivos, enviados, llamadas, respuestas, deps };
}

let fiscalesAntes: Awaited<ReturnType<typeof prisma.datosFiscales.findUnique>> = null;

async function limpiar() {
  const cobros = (await prisma.cobro.findMany({ where: { OR: [{ eventoPagoId: { startsWith: `mifact-${PID}-` } }, { solicitud: { correoAdmin: CORREO } }] }, select: { id: true } })).map((c) => c.id);
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
async function cobro(ruc: string | null, dni: string | null = null, total = 1522.2) {
  n += 1;
  const plan = await prisma.plan.upsert({ where: { slug: SLUG }, create: { slug: SLUG, nombre: 'Productora', precioMes: 1290 }, update: {} });
  const s = await prisma.solicitudSuscripcion.create({
    data: {
      planId: plan.id, ciclo: 'MENSUAL', razonSocial: ruc ? 'Minera Andina SAC' : 'Ana Quispe', ruc, dniReceptor: dni, tipoComprobante: ruc ? 'FACTURA' : 'BOLETA', nombreAdmin: 'Ana Quispe', correoAdmin: CORREO,
      subtotal: 1290, igv: 232.2, total, moneda: 'PEN', pasarela: 'pruebas', estado: 'APROBADA',
    },
  });
  const org = await prisma.organizacion.create({ data: { nombre: 'Minera Andina SAC', slug: `minera-mifact-${s.id.slice(0, 8)}`, ruc } });
  const sus = await prisma.suscripcion.create({
    data: { organizacionId: org.id, planId: plan.id, ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, inicioPeriodo: new Date('2026-11-17T15:00:00Z'), finPeriodo: new Date('2026-12-17T15:00:00Z'), pasarela: 'pruebas', solicitudId: s.id },
  });
  await prisma.solicitudSuscripcion.update({ where: { id: s.id }, data: { organizacionId: org.id } });
  return prisma.cobro.create({ data: { solicitudSuscripcionId: s.id, suscripcionId: sus.id, eventoPagoId: `mifact-${PID}-${n}`, monto: total, moneda: 'PEN', pasarela: 'pruebas', ultimos4Digitos: '1111' } });
}

const fiscales = { rucEmisor: RUC_EMISOR, razonSocialEmisor: 'Grupo de Soluciones Creativas SAC', direccionEmisor: 'Av. Ejemplo 123, Lima', ubigeoEmisor: '150101', codigoAnexo: '0000', ...SERIES, proveedor: 'mifact', ambiente: 'pruebas', detraccionActiva: false };

export const casosMifact = () => describe.skipIf(!hayBase)('comprobantes con Mifact (HU-1712)', () => {
  beforeAll(async () => {
    fiscalesAntes = await prisma.datosFiscales.findUnique({ where: { id: 'principal' } });
  });
  beforeEach(async () => {
    await limpiar();
    await prisma.datosFiscales.upsert({ where: { id: 'principal' }, create: fiscales, update: fiscales });
  });
  afterAll(async () => {
    await limpiar();
    if (fiscalesAntes) { const { id: _i, actualizadoEn: _a, ...resto } = fiscalesAntes; await prisma.datosFiscales.update({ where: { id: 'principal' }, data: resto }); }
    await prisma.$disconnect();
  });

  it('CP-162 · factura aceptada por SUNAT: guarda el XML firmado, el CDR y el PDF de Mifact, el hash y el QR, y los envía por correo', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { archivos, enviados, llamadas, respuestas, deps } = entorno();
    respuestas.SendInvoice = await aceptado(SERIES.serieFactura, 1);
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    expect(r).toMatchObject({ resultado: 'emitido', estado: 'ACEPTADO' });
    expect(llamadas.map((l) => l.metodo)).toEqual(['SendInvoice']);
    expect(llamadas[0]!.cuerpo).toMatchObject({
      TOKEN: 'token-simulado', NUM_NIF_EMIS: RUC_EMISOR, COD_UBI_EMIS: '150101', COD_TIP_CPE: '01', NUM_SERIE_CPE: SERIES.serieFactura, NUM_CORRE_CPE: '00000001',
      COD_TIP_NIF_RECP: '6', NUM_NIF_RECP: RUC_CLIENTE, MNT_TOT: '1522.20', COD_TIP_OPE_SUNAT: '0101',
    });
    const comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: r.comprobanteId! } });
    const archivo = `${RUC_EMISOR}-01-${SERIES.serieFactura}-00000001`;
    expect(comp).toMatchObject({
      proveedor: 'mifact', estado: 'ACEPTADO', intentos: 1, hashCpe: 'hash-1', cadenaQr: `${RUC_EMISOR}|01|${SERIES.serieFactura}|1|`,
      s3KeyXml: `comprobantes/${comp.id}/${archivo}.xml`, s3KeyPdf: `comprobantes/${comp.id}/${archivo}.pdf`, s3KeyCdr: `comprobantes/${comp.id}/R-${archivo}.xml`,
    });
    expect(archivos.get(comp.s3KeyXml!)!.cuerpo).toBe(`<Invoice firmado="si">${SERIES.serieFactura}-1</Invoice>`);
    expect(archivos.get(comp.s3KeyCdr!)!.cuerpo).toBe(`<ApplicationResponse>${SERIES.serieFactura}-1</ApplicationResponse>`);
    expect(Buffer.from(archivos.get(comp.s3KeyPdf!)!.cuerpo as Uint8Array).toString()).toBe(`%PDF-1.4 Mifact ${SERIES.serieFactura}-1`);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.adjuntos!.map((a) => a.archivo)).toEqual([`${archivo}.pdf`, `${archivo}.xml`, `R-${archivo}.xml`]);
    expect(enviados[0]!.texto).toContain('constancia de recepción de SUNAT (CDR)');
    // Repetir la tarea no vuelve a llamar a Mifact ni a enviar el correo.
    await procesarComprobante(prisma, { cobroId: c.id }, deps);
    expect(llamadas).toHaveLength(1);
    expect(enviados).toHaveLength(1);
  });

  it('una boleta de más de S/ 700 lleva el DNI que el comprador dio al pagar', async () => {
    const c = await cobro(null, '40506089');
    const { llamadas, respuestas, deps } = entorno();
    respuestas.SendInvoice = await aceptado(SERIES.serieBoleta, 1);
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    const comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: r.comprobanteId! } });
    expect(comp).toMatchObject({ tipo: 'BOLETA', ruc: null, dniReceptor: '40506089' });
    expect(llamadas[0]!.cuerpo).toMatchObject({ COD_TIP_CPE: '03', COD_TIP_NIF_RECP: '1', NUM_NIF_RECP: '40506089', NOM_RZN_SOC_RECP: 'Ana Quispe' });
  });

  it('CP-163 · en proceso en SUNAT queda pendiente; la consulta periódica lo confirma, descarga los archivos y envía el correo', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { archivos, enviados, llamadas, respuestas, deps } = entorno();
    respuestas.SendInvoice = { estado_documento: '101', errors: '' };
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    expect(r).toMatchObject({ resultado: 'emitido', estado: 'PENDIENTE' });
    let comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: r.comprobanteId! } });
    expect(comp.motivo).toContain('En proceso en SUNAT');
    expect(comp.s3KeyPdf).toBeNull();
    expect(enviados).toHaveLength(0);

    // Sigue en proceso: la consulta no cambia nada.
    respuestas.GetEstatusInvoice = { estado_documento: '101' };
    expect(await consultarPendientes(prisma, deps)).toMatchObject({ resueltos: 0, errores: [] });
    expect((await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } })).estado).toBe('PENDIENTE');

    // SUNAT lo aceptó: GetEstatusInvoice → 102 y GetInvoice trae los archivos.
    respuestas.GetEstatusInvoice = { estado_documento: '102', sunat_description: 'aceptado', codigo_hash: 'hash-tardio' };
    respuestas.GetInvoice = await aceptado(SERIES.serieFactura, 1);
    const consulta = await consultarPendientes(prisma, deps);
    expect(consulta).toMatchObject({ resueltos: 1, errores: [] });
    comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } });
    expect(comp).toMatchObject({ estado: 'ACEPTADO', hashCpe: 'hash-tardio', intentos: 1 });
    expect(comp.s3KeyPdf && archivos.has(comp.s3KeyPdf)).toBe(true);
    expect(comp.s3KeyCdr && archivos.has(comp.s3KeyCdr)).toBe(true);
    expect(enviados).toHaveLength(1);
    const consultas = llamadas.filter((l) => l.metodo !== 'SendInvoice');
    expect(consultas.map((l) => l.metodo)).toEqual(['GetEstatusInvoice', 'GetEstatusInvoice', 'GetInvoice']);
    expect(consultas[2]!.cuerpo).toMatchObject({ NUM_SERIE_CPE: SERIES.serieFactura, NUM_CORRE_CPE: '00000001', COD_FORM_IMPR: '001' });
    // Ya resuelto: la siguiente consulta no lo toma.
    expect(await consultarPendientes(prisma, deps)).toMatchObject({ consultados: 0, resueltos: 0 });
  });

  it('un error de Mifact deja el comprobante pendiente con el motivo; corregido, se reenvía con el mismo número', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { respuestas, deps } = entorno();
    respuestas.SendInvoice = { estado_documento: '', errors: 'El token no corresponde al RUC emisor' };
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    let comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: r.comprobanteId! } });
    expect(comp).toMatchObject({ estado: 'PENDIENTE', motivo: 'Mifact no lo emitió: El token no corresponde al RUC emisor', numero: 1, intentos: 1 });
    respuestas.SendInvoice = await aceptado(SERIES.serieFactura, 1);
    await procesarComprobante(prisma, { cobroId: c.id, comprobanteId: comp.id }, deps);
    comp = await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } });
    expect(comp).toMatchObject({ estado: 'ACEPTADO', numero: 1, intentos: 2 });
  });

  it('sin respuesta (red caída o 5xx) lanza para que la cola reintente y queda para la consulta periódica', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { respuestas, deps } = entorno();
    respuestas.SendInvoice = 'red';
    await expect(procesarComprobante(prisma, { cobroId: c.id }, deps)).rejects.toThrow(/No se pudo conectar con Mifact/);
    const comp = await prisma.comprobante.findFirstOrThrow({ where: { cobroId: c.id } });
    expect(comp).toMatchObject({ estado: 'PENDIENTE', intentos: 1 });
    expect(comp.enviadoEn).not.toBeNull();
    expect(comp.motivo).toContain('Sin respuesta del proveedor');
    respuestas.SendInvoice = 503;
    await expect(procesarComprobante(prisma, { cobroId: c.id }, deps)).rejects.toThrow(/HTTP 503/);
    // Mifact sí lo había recibido: la consulta lo encuentra aceptado.
    respuestas.GetEstatusInvoice = { estado_documento: '102' };
    respuestas.GetInvoice = await aceptado(SERIES.serieFactura, 1);
    expect(await consultarPendientes(prisma, deps)).toMatchObject({ resueltos: 1, errores: [] });
    expect((await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } })).estado).toBe('ACEPTADO');
  });

  it('aceptado con observaciones (103) es válido ante SUNAT: se envía por correo y no se vuelve a emitir', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { enviados, llamadas, respuestas, deps } = entorno();
    respuestas.SendInvoice = await aceptado(SERIES.serieFactura, 1, '103');
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    expect(r).toMatchObject({ estado: 'OBSERVADO', motivo: 'Aceptado con observaciones: 4332 - Observación de prueba' });
    expect(enviados).toHaveLength(1);
    await procesarComprobante(prisma, { cobroId: c.id, comprobanteId: r.comprobanteId! }, deps);
    expect(llamadas.filter((l) => l.metodo === 'SendInvoice')).toHaveLength(1);
  });

  it('rechazado por SUNAT (104) queda rechazado, sin correo', async () => {
    const c = await cobro(RUC_CLIENTE);
    const { enviados, respuestas, deps } = entorno();
    respuestas.SendInvoice = { estado_documento: '104', sunat_responsecode: '2017', sunat_description: 'El número de documento de identidad del receptor debe ser RUC' };
    const r = await procesarComprobante(prisma, { cobroId: c.id }, deps);
    expect(r).toMatchObject({ estado: 'RECHAZADO', motivo: 'Rechazado por SUNAT: 2017 · El número de documento de identidad del receptor debe ser RUC' });
    expect(enviados).toHaveLength(0);
  });
});
