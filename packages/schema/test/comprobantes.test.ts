// HU-1707 · Reglas de los comprobantes SUNAT: tipo por RUC, desglose con IGV, detracción, numeración y XML UBL 2.1.
import { describe, expect, it } from 'vitest';
import {
  desglosar, detraccionDe, esCodigoOse, leerEventoOse, montoEnLetras, nombreArchivo, numeroCompleto, rucValido, SERIES_POR_DEFECTO, serieDe, tipoPara,
  validarDatosFiscales, validarReceptor, xmlUbl, type DatosXml,
} from '../src/comprobantes.js';

/** Comprueba que el XML esté bien formado: cada etiqueta abierta se cierra en orden. */
function bienFormado(xml: string): boolean {
  const pila: string[] = [];
  for (const [, cierre, nombre, auto] of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (auto) continue;
    if (cierre) { if (pila.pop() !== nombre) return false; } else pila.push(nombre!);
  }
  return pila.length === 0;
}

const EMISOR = { ruc: '20000000001', razonSocial: 'Grupo de Soluciones Creativas SAC', direccion: 'Av. Ejemplo 123, Lima' };
const base = (o: Partial<DatosXml> = {}): DatosXml => ({
  tipo: 'FACTURA', serie: 'F001', numero: 1, emitidoEn: new Date('2026-11-17T20:30:00Z'), moneda: 'PEN', emisor: EMISOR,
  receptor: { ruc: '20000000001', razonSocial: 'Minera Andina SAC', direccion: null }, descripcion: 'Suscripción Productora (mensual)',
  baseSinIgv: 400, igv: 72, total: 472, ...o,
});

describe('RUC y tipo de comprobante (RN-18-4)', () => {
  it('acepta un RUC con su dígito verificador y rechaza los demás', () => {
    expect(rucValido('20000000001')).toBe(true);
    expect(rucValido('20000000002')).toBe(false);
    expect(rucValido('2000000000')).toBe(false);
    expect(rucValido('30000000001')).toBe(false);
    expect(rucValido(20000000001)).toBe(false);
    // El verificador 10 se escribe 0 y el 11, 1: se recorren todos los posibles para un prefijo.
    const validos = Array.from({ length: 10 }, (_, d) => `2010007097${d}`).filter(rucValido);
    expect(validos).toHaveLength(1);
  });
  it('factura con RUC válido; boleta sin RUC o con uno no válido', () => {
    expect(tipoPara('20000000001')).toBe('FACTURA');
    expect(tipoPara(null)).toBe('BOLETA');
    expect(tipoPara('20000000002')).toBe('BOLETA');
  });
});

describe('desglose y detracción (RN-18-5, RN-18-9)', () => {
  it('saca la base al céntimo y el IGV como diferencia, que siempre suman el total', () => {
    expect(desglosar(472)).toEqual({ baseSinIgv: 400, igv: 72, total: 472 });
    expect(desglosar(81.42)).toEqual({ baseSinIgv: 69, igv: 12.42, total: 81.42 });
    expect(desglosar(1522.2)).toEqual({ baseSinIgv: 1290, igv: 232.2, total: 1522.2 });
    for (const t of [0.01, 1, 99.99, 304.51, 4568.44, 129.8]) {
      const d = desglosar(t);
      expect(Math.round((d.baseSinIgv + d.igv) * 100)).toBe(Math.round(t * 100));
    }
  });
  it('solo con la detracción activa, en facturas en soles y desde el umbral', () => {
    const c = { activa: true, tasa: 12, umbralPen: 700 };
    expect(detraccionDe('FACTURA', 'PEN', 1522.2, c)).toBe(182.66);
    expect(detraccionDe('FACTURA', 'PEN', 699.99, c)).toBeNull();
    expect(detraccionDe('BOLETA', 'PEN', 1522.2, c)).toBeNull();
    expect(detraccionDe('FACTURA', 'USD', 1522.2, c)).toBeNull();
    expect(detraccionDe('FACTURA', 'PEN', 1522.2, { ...c, activa: false })).toBeNull();
  });
});

describe('numeración y series', () => {
  it('formatea el número con 8 dígitos y elige la serie por tipo', () => {
    expect(numeroCompleto('F001', 1)).toBe('F001-00000001');
    expect(numeroCompleto('B001', 12345678)).toBe('B001-12345678');
    expect(serieDe('FACTURA', SERIES_POR_DEFECTO)).toBe('F001');
    expect(serieDe('BOLETA', SERIES_POR_DEFECTO)).toBe('B001');
    expect(serieDe('NOTA_CREDITO', SERIES_POR_DEFECTO, 'FACTURA')).toBe('FC01');
    expect(serieDe('NOTA_CREDITO', SERIES_POR_DEFECTO, 'BOLETA')).toBe('BC01');
    expect(nombreArchivo('20000000001', 'FACTURA', 'F001', 7)).toBe('20000000001-01-F001-00000007');
  });
  it('escribe el monto en letras', () => {
    expect(montoEnLetras(472, 'PEN')).toBe('CUATROCIENTOS SETENTA Y DOS CON 00/100 SOLES');
    expect(montoEnLetras(1522.2, 'PEN')).toBe('MIL QUINIENTOS VEINTIDÓS CON 20/100 SOLES');
    expect(montoEnLetras(100, 'USD')).toBe('CIEN CON 00/100 DÓLARES AMERICANOS');
    expect(montoEnLetras(21_001.05, 'PEN')).toBe('VEINTIUN MIL UNO CON 05/100 SOLES');
    expect(montoEnLetras(0.5, 'PEN')).toBe('CERO CON 50/100 SOLES');
  });
});

describe('XML UBL 2.1', () => {
  it('CP-148 · una factura en soles: tipo 01, emisor, receptor con RUC, IGV y total', () => {
    const x = xmlUbl(base());
    expect(bienFormado(x)).toBe(true);
    expect(x).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
    expect(x).toContain('<cbc:ID>F001-00000001</cbc:ID>');
    expect(x).toContain('<cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>');
    expect(x).toContain('<cbc:IssueDate>2026-11-17</cbc:IssueDate>');
    expect(x).toContain('<cbc:IssueTime>15:30:00</cbc:IssueTime>');
    expect(x).toContain('<cbc:ID schemeID="6">20000000001</cbc:ID>');
    expect(x).toContain('<cbc:TaxAmount currencyID="PEN">72.00</cbc:TaxAmount>');
    expect(x).toContain('<cbc:PayableAmount currencyID="PEN">472.00</cbc:PayableAmount>');
    expect(x).toContain('CUATROCIENTOS SETENTA Y DOS CON 00/100 SOLES');
    expect(x).not.toContain('Detraccion');
  });
  it('una boleta en dólares sin documento del receptor', () => {
    const x = xmlUbl(base({ tipo: 'BOLETA', serie: 'B001', moneda: 'USD', receptor: { ruc: null, razonSocial: 'Ana <Pérez> & Cía', direccion: null } }));
    expect(bienFormado(x)).toBe(true);
    expect(x).toContain('>03</cbc:InvoiceTypeCode>');
    expect(x).toContain('<cbc:ID schemeID="0">-</cbc:ID>');
    expect(x).toContain('Ana &lt;Pérez&gt; &amp; Cía');
    expect(x).toContain('currencyID="USD"');
  });
  it('una nota de crédito con la referencia al comprobante y el motivo', () => {
    const x = xmlUbl(base({ tipo: 'NOTA_CREDITO', serie: 'FC01', numero: 3, referencia: { tipo: 'FACTURA', serie: 'F001', numero: 1, motivo: 'Reembolso del pago' } }));
    expect(bienFormado(x)).toBe(true);
    expect(x).toContain('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
    expect(x).toContain('<cbc:ReferenceID>F001-00000001</cbc:ReferenceID>');
    expect(x).toContain('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
    expect(x).toContain('<cac:CreditNoteLine>');
    expect(x).not.toContain('InvoiceTypeCode');
  });
  it('con detracción: el tipo de operación, la leyenda y el monto', () => {
    const x = xmlUbl(base({ total: 1522.2, baseSinIgv: 1290, igv: 232.2, detraccion: { monto: 182.66, tasa: 12 } }));
    expect(bienFormado(x)).toBe(true);
    expect(x).toContain('listID="1001"');
    expect(x).toContain('languageLocaleID="2006"');
    expect(x).toContain('<cbc:Amount currencyID="PEN">182.66</cbc:Amount>');
  });
});

describe('validaciones', () => {
  const fiscales = { rucEmisor: '20000000001', razonSocialEmisor: 'Grupo SAC', direccionEmisor: 'Lima', ...SERIES_POR_DEFECTO, proveedor: 'pruebas', ambiente: 'pruebas', detraccionActiva: false, detraccionTasa: 12, detraccionUmbralPen: 700 };
  it('datos fiscales: series con su letra, distintas, proveedor conocido y detracción con números válidos', () => {
    expect(validarDatosFiscales(fiscales, ['pruebas'])).toEqual([]);
    expect(validarDatosFiscales({ ...fiscales, rucEmisor: null }, ['pruebas'])).toEqual([]);
    const e = validarDatosFiscales({ ...fiscales, rucEmisor: '123', serieFactura: 'B001', serieNotaBoleta: 'B001', proveedor: 'nubefact', detraccionTasa: 0 }, ['pruebas']).map((x) => x.campo);
    expect(e).toEqual(expect.arrayContaining(['rucEmisor', 'serieFactura', 'serieNotaFactura', 'proveedor', 'detraccionTasa']));
  });
  it('CP-149 · el receptor corregido: una factura exige RUC válido y el correo debe ser válido', () => {
    expect(validarReceptor({ ruc: '20000000001', razonSocial: 'Minera', direccion: null, correoFacturacion: 'pagos@minera.pe' }, 'FACTURA')).toEqual([]);
    expect(validarReceptor({ ruc: null, razonSocial: 'Ana', direccion: null, correoFacturacion: 'ana@correo.pe' }, 'BOLETA')).toEqual([]);
    expect(validarReceptor({ ruc: '', razonSocial: '', correoFacturacion: 'no' }, 'FACTURA').map((x) => x.campo)).toEqual(['ruc', 'razonSocial', 'correoFacturacion']);
  });
});

describe('aviso del OSE', () => {
  it('lee el evento con su estado y rechaza los que no tienen la forma', () => {
    expect(leerEventoOse({ id: 'ev-1', serie: 'F001', numero: 7, estado: 'ACEPTADO' })).toEqual({ id: 'ev-1', serie: 'F001', numero: 7, estado: 'ACEPTADO', motivo: null });
    expect(leerEventoOse({ id: 'ev-2', serie: 'B001', numero: 1, estado: 'RECHAZADO', motivo: ' Error 2017 ' })?.motivo).toBe('Error 2017');
    for (const malo of [null, 'x', { id: '', serie: 'F001', numero: 1, estado: 'ACEPTADO' }, { id: 'a', serie: 'X001', numero: 1, estado: 'ACEPTADO' }, { id: 'a', serie: 'F001', numero: 0, estado: 'ACEPTADO' }, { id: 'a', serie: 'F001', numero: 1, estado: 'PENDIENTE' }]) {
      expect(leerEventoOse(malo)).toBeNull();
    }
    expect(esCodigoOse('pruebas')).toBe(true);
    expect(esCodigoOse('nubefact')).toBe(false);
  });
});
