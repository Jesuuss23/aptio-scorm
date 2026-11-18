// HU-1712 · Adaptador de Mifact (CP-162, CP-163) sin red: el JSON de SendInvoice contra los ejemplos oficiales de Mifact
// (github.com/mifact/apijson, factura, boleta con y sin DNI, nota de crédito y detracción), el mapeo de estados, la
// lectura de la respuesta y los errores (4xx, 5xx, tiempo de espera y `errors`).
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { DatosEnvio, EnvioOse } from '../src/ose/contrato.js';
import {
  armarConsultaMifact, armarJsonMifact, ErrorRedMifact, fechaLima, leerRespuestaMifact, mapearEstado, proveedorMifact,
} from '../src/ose/mifact.js';

const TOKEN = 'token-de-pruebas';
/** Las claves que usan los ejemplos oficiales (factura tradicional, boleta, nota de crédito y detracción 1001). */
const CLAVES_EJEMPLOS = new Set([
  'TOKEN', 'COD_TIP_NIF_EMIS', 'NUM_NIF_EMIS', 'NOM_RZN_SOC_EMIS', 'NOM_COMER_EMIS', 'COD_UBI_EMIS', 'TXT_DMCL_FISC_EMIS',
  'COD_TIP_NIF_RECP', 'NUM_NIF_RECP', 'NOM_RZN_SOC_RECP', 'TXT_DMCL_FISC_RECEP', 'FEC_EMIS', 'FEC_VENCIMIENTO', 'COD_TIP_CPE',
  'NUM_SERIE_CPE', 'NUM_CORRE_CPE', 'COD_MND', 'TIP_CAMBIO', 'TXT_CORREO_ENVIO', 'COD_PRCD_CARGA', 'MNT_TOT_GRAVADO',
  'MNT_TOT_TRIB_IGV', 'MNT_TOT', 'COD_PTO_VENTA', 'ENVIAR_A_SUNAT', 'RETORNA_XML_ENVIO', 'RETORNA_XML_CDR', 'RETORNA_PDF',
  'COD_FORM_IMPR', 'TXT_VERS_UBL', 'TXT_VERS_ESTRUCT_UBL', 'COD_ANEXO_EMIS', 'COD_TIP_OPE_SUNAT', 'COD_TIP_NC', 'TXT_DESC_MTVO',
  'MNT_TOT_DETRACCION', 'POR_DETRACCION', 'NRO_CUENTA_DETRAC', 'COD_TIP_DETRACCION', 'MNT_PENDIENTE', 'items', 'docs_referenciado',
]);
const CLAVES_ITEM = new Set([
  'COD_ITEM', 'COD_UNID_ITEM', 'CANT_UNID_ITEM', 'VAL_UNIT_ITEM', 'PRC_VTA_UNIT_ITEM', 'VAL_VTA_ITEM', 'MNT_BRUTO', 'MNT_PV_ITEM',
  'COD_TIP_PRC_VTA', 'COD_TIP_AFECT_IGV_ITEM', 'COD_TRIB_IGV_ITEM', 'POR_IGV_ITEM', 'MNT_IGV_ITEM', 'TXT_DESC_ITEM',
]);

const EMITIDO = new Date('2026-11-18T03:30:00Z'); // 17/11 a las 22:30 en Lima
const base = (cambios: Partial<DatosEnvio> = {}): DatosEnvio => ({
  tipo: 'FACTURA', serie: 'F001', numero: 27, emitidoEn: EMITIDO, moneda: 'PEN',
  emisor: { ruc: '20100100100', razonSocial: 'Grupo de Soluciones Creativas SAC', direccion: 'Av. Ejemplo 123, Lima', ubigeo: '150101', codigoAnexo: '0000' },
  receptor: { ruc: '20131312955', dni: null, razonSocial: 'Minera Andina SAC', direccion: 'Jr. Cliente 45' },
  descripcion: 'Suscripción Productora de Aptio SCORM (mensual)', baseSinIgv: 1290, igv: 232.2, total: 1522.2,
  detraccion: null, referencia: null,
  ...cambios,
});
const envio = (d: DatosEnvio): EnvioOse => ({ tipo: d.tipo, serie: d.serie, numero: d.numero, rucEmisor: d.emisor.ruc, receptorRuc: d.receptor.ruc, ambiente: 'pruebas', xml: '<x/>', datos: d });

function soloClavesOficiales(json: Record<string, unknown>) {
  for (const k of Object.keys(json)) expect(CLAVES_EJEMPLOS, `clave ${k}`).toContain(k);
  for (const item of json.items as Record<string, unknown>[]) for (const k of Object.keys(item)) expect(CLAVES_ITEM, `clave ${k}`).toContain(k);
}

describe('JSON de SendInvoice (CP-162)', () => {
  it('factura: RUC del receptor, montos con 2 decimales, unidad ZZ, gravada (10), operación 0101 y PDF A4', () => {
    const j = armarJsonMifact(base(), TOKEN);
    soloClavesOficiales(j);
    expect(j).toMatchObject({
      TOKEN, COD_TIP_NIF_EMIS: '6', NUM_NIF_EMIS: '20100100100', COD_UBI_EMIS: '150101', COD_ANEXO_EMIS: '0000',
      COD_TIP_NIF_RECP: '6', NUM_NIF_RECP: '20131312955', NOM_RZN_SOC_RECP: 'Minera Andina SAC', TXT_DMCL_FISC_RECEP: 'Jr. Cliente 45',
      FEC_EMIS: '2026-11-17', COD_TIP_CPE: '01', NUM_SERIE_CPE: 'F001', NUM_CORRE_CPE: '00000027', COD_MND: 'PEN', COD_PRCD_CARGA: '001',
      MNT_TOT_GRAVADO: '1290.00', MNT_TOT_TRIB_IGV: '232.20', MNT_TOT: '1522.20',
      ENVIAR_A_SUNAT: 'true', RETORNA_XML_ENVIO: 'true', RETORNA_XML_CDR: 'true', RETORNA_PDF: 'true', COD_FORM_IMPR: '001',
      TXT_VERS_UBL: '2.1', TXT_VERS_ESTRUCT_UBL: '2.0', COD_TIP_OPE_SUNAT: '0101',
    });
    expect(j).not.toHaveProperty('TXT_CORREO_ENVIO'); // el correo lo envía Aptio
    expect(j).not.toHaveProperty('TIP_CAMBIO');
    expect(j.items).toEqual([{
      COD_ITEM: 'APTIO-SERV', COD_UNID_ITEM: 'ZZ', CANT_UNID_ITEM: '1', VAL_UNIT_ITEM: '1290.00', PRC_VTA_UNIT_ITEM: '1522.20', VAL_VTA_ITEM: '1290.00',
      MNT_BRUTO: '1290.00', MNT_PV_ITEM: '1522.20', COD_TIP_PRC_VTA: '01', COD_TIP_AFECT_IGV_ITEM: '10', COD_TRIB_IGV_ITEM: '1000', POR_IGV_ITEM: '18',
      MNT_IGV_ITEM: '232.20', TXT_DESC_ITEM: 'Suscripción Productora de Aptio SCORM (mensual)',
    }]);
  });

  it('boleta con DNI: tipo de documento 1 y el DNI', () => {
    const j = armarJsonMifact(base({ tipo: 'BOLETA', serie: 'B001', receptor: { ruc: null, dni: '40506089', razonSocial: 'María Gonzales', direccion: null } }), TOKEN);
    soloClavesOficiales(j);
    expect(j).toMatchObject({ COD_TIP_CPE: '03', NUM_SERIE_CPE: 'B001', COD_TIP_NIF_RECP: '1', NUM_NIF_RECP: '40506089', NOM_RZN_SOC_RECP: 'María Gonzales', TXT_DMCL_FISC_RECEP: '-' });
  });

  it('boleta sin DNI (hasta S/ 700): tipo 0, «00000000» y cliente sin nombre', () => {
    const j = armarJsonMifact(base({ tipo: 'BOLETA', serie: 'B001', total: 118, baseSinIgv: 100, igv: 18, receptor: { ruc: null, dni: null, razonSocial: 'Ana', direccion: null } }), TOKEN);
    expect(j).toMatchObject({ COD_TIP_NIF_RECP: '0', NUM_NIF_RECP: '00000000', NOM_RZN_SOC_RECP: 'CLIENTE SIN NOMBRE', TXT_DMCL_FISC_RECEP: 'SIN DIRECCION', MNT_TOT: '118.00' });
  });

  it('nota de crédito: tipo 07, motivo 06 (devolución total) y el comprobante que corrige', () => {
    const j = armarJsonMifact(base({
      tipo: 'NOTA_CREDITO', serie: 'FC01', numero: 3,
      referencia: { tipo: 'FACTURA', serie: 'F001', numero: 27, emitidoEn: new Date('2026-11-10T15:00:00Z'), motivo: 'Devolución total por reembolso del pago' },
    }), TOKEN);
    soloClavesOficiales(j);
    expect(j).toMatchObject({
      COD_TIP_CPE: '07', NUM_SERIE_CPE: 'FC01', NUM_CORRE_CPE: '00000003', COD_TIP_NC: '06', TXT_DESC_MTVO: 'Devolución total por reembolso del pago',
      docs_referenciado: [{ COD_TIP_DOC_REF: '01', NUM_SERIE_CPE_REF: 'F001', NUM_CORRE_CPE_REF: '00000027', FEC_DOC_REF: '2026-11-10' }],
    });
  });

  it('factura con detracción: operación 1001, monto, tasa, cuenta, código SPOT y el pendiente de pago', () => {
    const j = armarJsonMifact(base({ detraccion: { monto: 182.66, tasa: 12, cuenta: '00-000-123456', codigo: '022' } }), TOKEN);
    soloClavesOficiales(j);
    expect(j).toMatchObject({ COD_TIP_OPE_SUNAT: '1001', MNT_TOT_DETRACCION: '182.66', POR_DETRACCION: '12.00', NRO_CUENTA_DETRAC: '00-000-123456', COD_TIP_DETRACCION: '022', MNT_PENDIENTE: '1339.54' });
  });

  it('la consulta lleva el token, el RUC, el comprobante y la fecha; GetInvoice pide los 3 archivos en A4', () => {
    const ref = { tipo: 'BOLETA' as const, serie: 'B001', numero: 9, emitidoEn: EMITIDO, rucEmisor: '20100100100' };
    expect(armarConsultaMifact(ref, TOKEN)).toEqual({ TOKEN, NUM_NIF_EMIS: '20100100100', COD_TIP_CPE: '03', NUM_SERIE_CPE: 'B001', NUM_CORRE_CPE: '00000009', FEC_EMIS: '2026-11-17' });
    expect(armarConsultaMifact(ref, TOKEN, true)).toMatchObject({ RETORNA_XML_ENVIO: 'true', RETORNA_XML_CDR: 'true', RETORNA_PDF: 'true', COD_FORM_IMPR: '001' });
  });

  it('la fecha de emisión es la de Lima', () => {
    expect(fechaLima(new Date('2026-11-18T04:59:59Z'))).toBe('2026-11-17');
    expect(fechaLima(new Date('2026-11-18T05:00:00Z'))).toBe('2026-11-18');
  });
});

describe('estados y respuesta de Mifact', () => {
  it.each([
    ['102', 'ACEPTADO'], ['103', 'OBSERVADO'], ['104', 'RECHAZADO'], ['101', 'PENDIENTE'], ['108', 'PENDIENTE'], ['105', 'PENDIENTE'], ['', 'PENDIENTE'],
  ])('estado_documento %s → %s', (codigo, estado) => {
    expect(mapearEstado({ estado_documento: codigo }).estado).toBe(estado);
  });

  it('los motivos explican el estado; `errors` sin estado deja el comprobante pendiente', () => {
    expect(mapearEstado({ estado_documento: '104', sunat_responsecode: '2800', sunat_description: 'El dato ingresado en el tipo de documento no es válido' }).motivo)
      .toBe('Rechazado por SUNAT: 2800 · El dato ingresado en el tipo de documento no es válido');
    expect(mapearEstado({ estado_documento: '103', sunat_note: '4332 - La dirección no es válida' }).motivo).toBe('Aceptado con observaciones: 4332 - La dirección no es válida');
    expect(mapearEstado({ estado_documento: '', errors: 'El token no corresponde al RUC emisor' })).toEqual({ estado: 'PENDIENTE', motivo: 'Mifact no lo emitió: El token no corresponde al RUC emisor' });
    expect(mapearEstado({ estado_documento: '105' }).motivo).toContain('105');
  });

  it('lee la respuesta plana, envuelta en «…Result» o como texto JSON', () => {
    expect(leerRespuestaMifact({ estado_documento: '102' })).toEqual({ estado_documento: '102' });
    expect(leerRespuestaMifact({ SendInvoiceResult: { estado_documento: '102' } })).toEqual({ estado_documento: '102' });
    expect(leerRespuestaMifact({ SendInvoiceResult: '{"estado_documento":"103"}' })).toEqual({ estado_documento: '103' });
    expect(leerRespuestaMifact('no es json')).toEqual({});
  });
});

async function zip(nombre: string, contenido: string) {
  const z = new JSZip();
  z.file(nombre, contenido);
  return (await z.generateAsync({ type: 'nodebuffer' })).toString('base64');
}

type Llamada = { url: string; cuerpo: Record<string, unknown> };
function fetchFalso(responder: (l: Llamada) => Response | Promise<Response>) {
  const llamadas: Llamada[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const l = { url: String(url), cuerpo: JSON.parse(String(init?.body)) as Record<string, unknown> };
    llamadas.push(l);
    return responder(l);
  }) as typeof fetch;
  return { f, llamadas };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

describe('proveedorMifact (CP-162, CP-163)', () => {
  it('aceptado: devuelve el estado, el XML firmado y el CDR (descomprimidos), el PDF, el hash y la cadena del QR', async () => {
    const pdf = Buffer.from('%PDF-1.4 Mifact');
    const { f, llamadas } = fetchFalso(async () => json({
      estado_documento: '102', errors: '', sunat_responsecode: '0', sunat_description: 'La Factura numero F001-00000027, ha sido aceptada',
      xml_enviado: await zip('20100100100-01-F001-00000027.xml', '<Invoice>firmado</Invoice>'),
      cdr_sunat: await zip('R-20100100100-01-F001-00000027.xml', '<ApplicationResponse/>'),
      pdf_bytes: pdf.toString('base64'), codigo_hash: 'hAsH=', cadena_para_codigo_qr: '20100100100|01|F001|00000027|232.20|1522.20|2026-11-17|6|20131312955|',
    }));
    const p = proveedorMifact({ url: 'https://demo.mifact.net.pe/api/invoiceService.svc/', token: TOKEN, fetch: f });
    const r = await p.emitir(envio(base()));
    expect(llamadas[0]!.url).toBe('https://demo.mifact.net.pe/api/invoiceService.svc/SendInvoice');
    expect(llamadas[0]!.cuerpo).toMatchObject({ TOKEN, NUM_SERIE_CPE: 'F001' });
    expect(r).toMatchObject({ estado: 'ACEPTADO', xmlFirmado: '<Invoice>firmado</Invoice>', cdr: '<ApplicationResponse/>', hash: 'hAsH=' });
    expect(r.motivo).toContain('ha sido aceptada');
    expect(r.cadenaQr).toMatch(/^20100100100\|01\|F001/);
    expect(Buffer.from(r.pdf!).toString()).toBe('%PDF-1.4 Mifact');
  });

  it('un 4xx o `errors` deja el comprobante pendiente con el motivo (se reenvía con el mismo número)', async () => {
    const c4 = proveedorMifact({ url: 'https://m', token: TOKEN, fetch: fetchFalso(() => new Response('Bad Request', { status: 400 })).f });
    expect(await c4.emitir(envio(base()))).toEqual({ estado: 'PENDIENTE', motivo: 'Mifact rechazó la solicitud (HTTP 400): Bad Request' });
    const err = proveedorMifact({ url: 'https://m', token: TOKEN, fetch: fetchFalso(() => json({ estado_documento: '', errors: 'RUC emisor no autorizado' })).f });
    expect(await err.emitir(envio(base()))).toMatchObject({ estado: 'PENDIENTE', motivo: 'Mifact no lo emitió: RUC emisor no autorizado' });
  });

  it('un 5xx, la red caída o el tiempo de espera lanzan para que la cola reintente', async () => {
    const c5 = proveedorMifact({ url: 'https://m', token: TOKEN, fetch: fetchFalso(() => new Response('', { status: 503 })).f });
    await expect(c5.emitir(envio(base()))).rejects.toThrow(/HTTP 503/);
    const red = proveedorMifact({ url: 'https://m', token: TOKEN, fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
    await expect(red.emitir(envio(base()))).rejects.toBeInstanceOf(ErrorRedMifact);
    const lento = proveedorMifact({
      url: 'https://m', token: TOKEN, timeoutMs: 20,
      fetch: ((_u: string, init?: RequestInit) => new Promise((_ok, falla) => init?.signal?.addEventListener('abort', () => falla(init.signal!.reason)))) as typeof fetch,
    });
    await expect(lento.emitir(envio(base()))).rejects.toThrow(/no respondió en 0 s/);
  });

  it('en dólares, sin ubigeo o sin la cuenta de detracciones no llama a Mifact y queda pendiente', async () => {
    const { f, llamadas } = fetchFalso(() => json({}));
    const p = proveedorMifact({ url: 'https://m', token: TOKEN, fetch: f });
    expect((await p.emitir(envio(base({ moneda: 'USD' })))).motivo).toContain('tipo de cambio');
    expect((await p.emitir(envio(base({ emisor: { ...base().emisor, ubigeo: '' } })))).motivo).toContain('ubigeo');
    expect((await p.emitir(envio(base({ detraccion: { monto: 1, tasa: 12, cuenta: '', codigo: '' } })))).motivo).toContain('cuenta de detracciones');
    expect(llamadas).toHaveLength(0);
  });

  it('consulta el estado con GetEstatusInvoice y descarga los archivos con GetInvoice', async () => {
    const { f, llamadas } = fetchFalso((l) => (l.url.endsWith('/GetEstatusInvoice')
      ? json({ estado_documento: '101' })
      : json({ estado_documento: '102', pdf_bytes: Buffer.from('%PDF').toString('base64'), xml_enviado: '<Invoice/>', cdr_sunat: '' })));
    const p = proveedorMifact({ url: 'https://m', token: TOKEN, fetch: f });
    const ref = { tipo: 'FACTURA' as const, serie: 'F001', numero: 27, emitidoEn: EMITIDO, rucEmisor: '20100100100' };
    expect((await p.consultar!(ref)).estado).toBe('PENDIENTE');
    const a = await p.obtenerArchivos!(ref);
    expect(a.xmlFirmado).toBe('<Invoice/>');
    expect(a.cdr).toBeUndefined();
    expect(Buffer.from(a.pdf!).toString()).toBe('%PDF');
    expect(llamadas.map((l) => l.url)).toEqual(['https://m/GetEstatusInvoice', 'https://m/GetInvoice']);
    expect(llamadas[1]!.cuerpo).toMatchObject({ COD_FORM_IMPR: '001', RETORNA_PDF: 'true' });
  });
});

// Prueba opcional contra el ambiente demo de Mifact (red real, token público de pruebas). No corre en CI: actívala con
// MIFACT_DEMO=1. Usa un correlativo nuevo cada vez.
describe.skipIf(process.env.MIFACT_DEMO !== '1')('demo de Mifact (opcional)', () => {
  it('emite una boleta de prueba y responde con un estado conocido', async () => {
    const p = proveedorMifact({ url: process.env.MIFACT_URL ?? 'https://demo.mifact.net.pe/api/invoiceService.svc', token: process.env.MIFACT_TOKEN ?? 'gN8zNRBV+/FVxTLwdaZx0w==' });
    const d = base({
      tipo: 'BOLETA', serie: 'B004', numero: Math.floor(Date.now() / 1000) % 99_999_999, emitidoEn: new Date(), total: 118, baseSinIgv: 100, igv: 18,
      emisor: { ...base().emisor, ruc: '20100100100', ubigeo: '103040' }, receptor: { ruc: null, dni: null, razonSocial: 'Cliente', direccion: null },
    });
    const r = await p.emitir(envio(d));
    console.log('Mifact demo:', r.estado, r.motivo);
    expect(['ACEPTADO', 'OBSERVADO', 'PENDIENTE', 'RECHAZADO']).toContain(r.estado);
  }, 60_000);
});
