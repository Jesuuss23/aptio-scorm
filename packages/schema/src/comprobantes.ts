/**
 * HU-1707 · Comprobantes electrónicos SUNAT (REQ-087, CP-148, CP-149, RN-18-4, RN-18-5, RN-18-9). Reglas puras:
 * - factura si el receptor tiene un RUC válido (11 dígitos y dígito verificador) y boleta si no;
 * - la base sin IGV y el IGV de 18 % a partir del total cobrado, al céntimo y en la moneda del cobro;
 * - la detracción, solo activa por configuración, en facturas en soles desde el umbral (por validar con el contador);
 * - el número «F001-00000001» y el XML UBL 2.1 de la factura, la boleta o la nota de crédito, sin firmar (SUP-314: lo
 *   firma el OSE o el certificado del emisor cuando se elija el proveedor, DA-09).
 */
import { IGV } from './planes.js';
import type { ErrorCampo } from './planes.js';

export type { ErrorCampo };
export const TIPOS_COMPROBANTE = ['FACTURA', 'BOLETA', 'NOTA_CREDITO'] as const;
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number];
export const ESTADOS_COMPROBANTE = ['PENDIENTE', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO'] as const;
export type EstadoComprobante = (typeof ESTADOS_COMPROBANTE)[number];
export type MonedaComprobante = 'PEN' | 'USD';

/** Catálogo 01 de SUNAT: tipo de documento. */
export const CODIGO_TIPO: Record<TipoComprobante, string> = { FACTURA: '01', BOLETA: '03', NOTA_CREDITO: '07' };
/** Leyenda de la detracción (SPOT), por validar con el contador (RN-18-5). */
export const LEYENDA_DETRACCION = 'Operación sujeta al Sistema de Pago de Obligaciones Tributarias con el Gobierno Central';
export const SERIES_POR_DEFECTO = { serieFactura: 'F001', serieBoleta: 'B001', serieNotaFactura: 'FC01', serieNotaBoleta: 'BC01' } as const;
/** DA-09 · Los proveedores OSE conocidos. Hoy solo el simulado (SUP-314): el real se suma cuando se elija y contrate. */
export const PROVEEDORES_OSE = [{ codigo: 'pruebas', nombre: 'OSE de pruebas (simulado)', soloPruebas: true }] as const;
export type CodigoOse = (typeof PROVEEDORES_OSE)[number]['codigo'];
export const esCodigoOse = (x: unknown): x is CodigoOse => PROVEEDORES_OSE.some((p) => p.codigo === x);

/** El aviso del OSE (webhook) ya leído: qué comprobante y en qué estado quedó. */
export interface EventoOse { id: string; serie: string; numero: number; estado: Exclude<EstadoComprobante, 'PENDIENTE'>; motivo: string | null }

/** Lee el cuerpo JSON del webhook del OSE de pruebas: `{ id, serie, numero, estado, motivo? }`. null si no es válido. */
export function leerEventoOse(v: unknown): EventoOse | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim() || o.id.length > 120) return null;
  if (typeof o.serie !== 'string' || !/^[FB][A-Z0-9]{3}$/.test(o.serie)) return null;
  if (typeof o.numero !== 'number' || !Number.isInteger(o.numero) || o.numero < 1 || o.numero > 99_999_999) return null;
  if (o.estado !== 'ACEPTADO' && o.estado !== 'OBSERVADO' && o.estado !== 'RECHAZADO') return null;
  if (o.motivo !== undefined && o.motivo !== null && (typeof o.motivo !== 'string' || o.motivo.length > 500)) return null;
  return { id: o.id.trim(), serie: o.serie, numero: o.numero, estado: o.estado, motivo: typeof o.motivo === 'string' && o.motivo.trim() ? o.motivo.trim() : null };
}

export const LIMITES_FISCALES = { razonSocial: 200, direccion: 250, correo: 254 } as const;

const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** RUC de 11 dígitos que empieza por 10, 15, 17 o 20 y cuyo último dígito es el verificador de SUNAT (módulo 11). */
export function rucValido(ruc: unknown): ruc is string {
  if (typeof ruc !== 'string' || !/^(10|15|17|20)\d{9}$/.test(ruc)) return false;
  const suma = PESOS_RUC.reduce((n, p, i) => n + p * Number(ruc[i]), 0);
  const dv = 11 - (suma % 11);
  return (dv === 10 ? 0 : dv === 11 ? 1 : dv) === Number(ruc[10]);
}

/** Factura con RUC válido; boleta sin RUC o con uno no válido (RN-18-4). */
export const tipoPara = (ruc: string | null | undefined): 'FACTURA' | 'BOLETA' => (rucValido(ruc ?? '') ? 'FACTURA' : 'BOLETA');

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface Desglose { baseSinIgv: number; igv: number; total: number }

/** Base e IGV desde el total cobrado (que ya trae el IGV): la base se redondea al céntimo y el IGV es la diferencia. */
export function desglosar(total: number): Desglose {
  const t = redondear(total);
  const baseSinIgv = redondear(t / (1 + IGV));
  return { baseSinIgv, igv: redondear(t - baseSinIgv), total: t };
}

export interface ConfigDetraccion { activa: boolean; tasa: number; umbralPen: number }

/** El monto de la detracción, o null si no aplica: apagada, no es factura, no es en soles o no llega al umbral. */
export function detraccionDe(tipo: TipoComprobante, moneda: MonedaComprobante, total: number, c: ConfigDetraccion): number | null {
  if (!c.activa || tipo !== 'FACTURA' || moneda !== 'PEN' || total < c.umbralPen) return null;
  return redondear((total * c.tasa) / 100);
}

/** «F001-00000001». */
export const numeroCompleto = (serie: string, numero: number) => `${serie}-${String(numero).padStart(8, '0')}`;

/** La serie de un comprobante: la nota de crédito usa la de notas del tipo que corrige. */
export function serieDe(tipo: TipoComprobante, s: typeof SERIES_POR_DEFECTO | DatosSeries, referencia?: 'FACTURA' | 'BOLETA'): string {
  if (tipo === 'FACTURA') return s.serieFactura;
  if (tipo === 'BOLETA') return s.serieBoleta;
  return referencia === 'FACTURA' ? s.serieNotaFactura : s.serieNotaBoleta;
}

export interface DatosSeries { serieFactura: string; serieBoleta: string; serieNotaFactura: string; serieNotaBoleta: string }
export interface DatosFiscalesEntrada extends DatosSeries {
  rucEmisor: string | null; razonSocialEmisor: string; direccionEmisor: string; proveedor: string; ambiente: 'pruebas' | 'produccion';
  detraccionActiva: boolean; detraccionTasa: number; detraccionUmbralPen: number;
}

const texto = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Valida los datos fiscales que guarda el superadmin. Las series son de 4 caracteres: F o B y 3 letras o dígitos. */
export function validarDatosFiscales(v: Partial<Record<keyof DatosFiscalesEntrada, unknown>>, proveedores: readonly string[]): ErrorCampo[] {
  const e: ErrorCampo[] = [];
  if (v.rucEmisor !== null && v.rucEmisor !== undefined && v.rucEmisor !== '' && !rucValido(v.rucEmisor)) e.push({ campo: 'rucEmisor', mensaje: 'El RUC no es válido' });
  if (!texto(v.razonSocialEmisor, LIMITES_FISCALES.razonSocial)) e.push({ campo: 'razonSocialEmisor', mensaje: 'Escribe la razón social del emisor' });
  if (!texto(v.direccionEmisor, LIMITES_FISCALES.direccion)) e.push({ campo: 'direccionEmisor', mensaje: 'Escribe el domicilio fiscal del emisor' });
  const series: [keyof DatosSeries, RegExp, string][] = [
    ['serieFactura', /^F[A-Z0-9]{3}$/, 'Una serie de factura empieza con F y tiene 4 caracteres'],
    ['serieBoleta', /^B[A-Z0-9]{3}$/, 'Una serie de boleta empieza con B y tiene 4 caracteres'],
    ['serieNotaFactura', /^F[A-Z0-9]{3}$/, 'La nota de una factura usa una serie que empieza con F'],
    ['serieNotaBoleta', /^B[A-Z0-9]{3}$/, 'La nota de una boleta usa una serie que empieza con B'],
  ];
  for (const [campo, re, mensaje] of series) if (typeof v[campo] !== 'string' || !re.test(v[campo] as string)) e.push({ campo, mensaje });
  const usadas = series.map(([c]) => v[c]).filter((x) => typeof x === 'string');
  if (new Set(usadas).size !== usadas.length) e.push({ campo: 'serieNotaFactura', mensaje: 'Cada serie debe ser distinta' });
  if (typeof v.proveedor !== 'string' || !proveedores.includes(v.proveedor)) e.push({ campo: 'proveedor', mensaje: 'Elige un proveedor disponible' });
  if (v.ambiente !== 'pruebas' && v.ambiente !== 'produccion') e.push({ campo: 'ambiente', mensaje: 'Elige pruebas o producción' });
  if (typeof v.detraccionActiva !== 'boolean') e.push({ campo: 'detraccionActiva', mensaje: 'Indica si se aplica la detracción' });
  if (typeof v.detraccionTasa !== 'number' || !(v.detraccionTasa > 0 && v.detraccionTasa <= 100)) e.push({ campo: 'detraccionTasa', mensaje: 'Un porcentaje mayor que 0 y hasta 100' });
  if (typeof v.detraccionUmbralPen !== 'number' || !(v.detraccionUmbralPen >= 0 && v.detraccionUmbralPen <= 1_000_000)) e.push({ campo: 'detraccionUmbralPen', mensaje: 'Un monto en soles de 0 a 1.000.000' });
  return e;
}

export interface ReceptorEntrada { ruc: string | null; razonSocial: string; direccion: string | null; correoFacturacion: string }

/** Valida la corrección del receptor de un comprobante observado (CP-149). Una factura exige un RUC válido. */
export function validarReceptor(v: Partial<Record<keyof ReceptorEntrada, unknown>>, tipo: TipoComprobante): ErrorCampo[] {
  const e: ErrorCampo[] = [];
  const conRuc = tipo === 'FACTURA';
  if (conRuc ? !rucValido(v.ruc) : v.ruc !== null && v.ruc !== undefined && v.ruc !== '' && !rucValido(v.ruc)) e.push({ campo: 'ruc', mensaje: conRuc ? 'Una factura necesita un RUC válido' : 'El RUC no es válido' });
  if (!texto(v.razonSocial, LIMITES_FISCALES.razonSocial)) e.push({ campo: 'razonSocial', mensaje: 'Escribe la razón social o el nombre' });
  if (v.direccion !== null && v.direccion !== undefined && (typeof v.direccion !== 'string' || v.direccion.length > LIMITES_FISCALES.direccion)) e.push({ campo: 'direccion', mensaje: `Hasta ${LIMITES_FISCALES.direccion} caracteres` });
  if (typeof v.correoFacturacion !== 'string' || v.correoFacturacion.length > LIMITES_FISCALES.correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.correoFacturacion)) e.push({ campo: 'correoFacturacion', mensaje: 'Escribe un correo válido' });
  return e;
}

// ---------- Monto en letras (leyenda 1000 de SUNAT) ----------

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function hastaMil(n: number): string {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100;
  const resto = r < 30 ? UNIDADES[r]! : `${DECENAS[Math.floor(r / 10)]}${r % 10 ? ` Y ${UNIDADES[r % 10]}` : ''}`;
  return [CENTENAS[c], resto].filter(Boolean).join(' ');
}

/** «CUATROCIENTOS SETENTA Y DOS CON 00/100 SOLES»; hasta 999.999.999. */
export function montoEnLetras(monto: number, moneda: MonedaComprobante): string {
  const t = Math.round(monto * 100);
  const entero = Math.floor(t / 100), cent = t % 100;
  const millones = Math.floor(entero / 1_000_000), miles = Math.floor((entero % 1_000_000) / 1000), resto = entero % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${hastaMil(millones).replace(/UNO$/, 'UN')} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${hastaMil(miles).replace(/UNO$/, 'UN')} MIL`);
  if (resto || !partes.length) partes.push(resto ? hastaMil(resto) : 'CERO');
  return `${partes.join(' ')} CON ${String(cent).padStart(2, '0')}/100 ${moneda === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES'}`;
}

// ---------- XML UBL 2.1 ----------

export interface DatosXml {
  tipo: TipoComprobante; serie: string; numero: number; emitidoEn: Date; moneda: MonedaComprobante;
  emisor: { ruc: string; razonSocial: string; direccion: string };
  receptor: { ruc: string | null; razonSocial: string; direccion: string | null };
  descripcion: string; baseSinIgv: number; igv: number; total: number;
  detraccion?: { monto: number; tasa: number } | null;
  /** Solo en una nota de crédito. */
  referencia?: { tipo: 'FACTURA' | 'BOLETA'; serie: string; numero: number; motivo: string } | null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const m = (n: number) => n.toFixed(2);
const fechaLima = (d: Date) => {
  const lima = new Date(d.getTime() - 5 * 3_600_000);
  return { fecha: lima.toISOString().slice(0, 10), hora: lima.toISOString().slice(11, 19) };
};

/** El XML UBL 2.1 sin firmar: Invoice (01 factura, 03 boleta) o CreditNote (07) con su referencia y motivo. */
export function xmlUbl(d: DatosXml): string {
  const nota = d.tipo === 'NOTA_CREDITO';
  const raiz = nota ? 'CreditNote' : 'Invoice';
  const ns = nota ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2' : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  const { fecha, hora } = fechaLima(d.emitidoEn);
  const cur = `currencyID="${d.moneda}"`;
  // Catálogo 06: 6 = RUC; 0 = sin documento (boleta, SUP-316).
  const docReceptor = d.receptor.ruc ? { tipo: '6', numero: d.receptor.ruc } : { tipo: '0', numero: '-' };
  const notas = [`<cbc:Note languageLocaleID="1000">${esc(montoEnLetras(d.total, d.moneda))}</cbc:Note>`];
  if (d.detraccion) notas.push(`<cbc:Note languageLocaleID="2006">${esc(LEYENDA_DETRACCION)}</cbc:Note>`);
  const lineas = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${raiz} xmlns="${ns}" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">`,
    '<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>',
    '<cbc:UBLVersionID>2.1</cbc:UBLVersionID>',
    '<cbc:CustomizationID>2.0</cbc:CustomizationID>',
    `<cbc:ID>${esc(numeroCompleto(d.serie, d.numero))}</cbc:ID>`,
    `<cbc:IssueDate>${fecha}</cbc:IssueDate>`,
    `<cbc:IssueTime>${hora}</cbc:IssueTime>`,
    nota ? '' : `<cbc:InvoiceTypeCode listID="${d.detraccion ? '1001' : '0101'}">${CODIGO_TIPO[d.tipo]}</cbc:InvoiceTypeCode>`,
    ...notas,
    `<cbc:DocumentCurrencyCode>${d.moneda}</cbc:DocumentCurrencyCode>`,
    nota && d.referencia ? `<cac:DiscrepancyResponse><cbc:ReferenceID>${esc(numeroCompleto(d.referencia.serie, d.referencia.numero))}</cbc:ReferenceID><cbc:ResponseCode>06</cbc:ResponseCode><cbc:Description>${esc(d.referencia.motivo)}</cbc:Description></cac:DiscrepancyResponse>` : '',
    nota && d.referencia ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(numeroCompleto(d.referencia.serie, d.referencia.numero))}</cbc:ID><cbc:DocumentTypeCode>${CODIGO_TIPO[d.referencia.tipo]}</cbc:DocumentTypeCode></cac:InvoiceDocumentReference></cac:BillingReference>` : '',
    `<cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="6">${esc(d.emisor.ruc)}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName>${esc(d.emisor.razonSocial)}</cbc:RegistrationName><cac:RegistrationAddress><cac:AddressLine><cbc:Line>${esc(d.emisor.direccion)}</cbc:Line></cac:AddressLine></cac:RegistrationAddress></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>`,
    `<cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="${docReceptor.tipo}">${esc(docReceptor.numero)}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName>${esc(d.receptor.razonSocial)}</cbc:RegistrationName>${d.receptor.direccion ? `<cac:RegistrationAddress><cac:AddressLine><cbc:Line>${esc(d.receptor.direccion)}</cbc:Line></cac:AddressLine></cac:RegistrationAddress>` : ''}</cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>`,
    d.detraccion ? `<cac:PaymentTerms><cbc:ID>Detraccion</cbc:ID><cbc:PaymentPercent>${m(d.detraccion.tasa)}</cbc:PaymentPercent><cbc:Amount currencyID="PEN">${m(d.detraccion.monto)}</cbc:Amount></cac:PaymentTerms>` : '',
    `<cac:TaxTotal><cbc:TaxAmount ${cur}>${m(d.igv)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount ${cur}>${m(d.baseSinIgv)}</cbc:TaxableAmount><cbc:TaxAmount ${cur}>${m(d.igv)}</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>`,
    `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount ${cur}>${m(d.baseSinIgv)}</cbc:LineExtensionAmount><cbc:TaxInclusiveAmount ${cur}>${m(d.total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount ${cur}>${m(d.total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`,
    `<cac:${nota ? 'CreditNoteLine' : 'InvoiceLine'}><cbc:ID>1</cbc:ID><cbc:${nota ? 'CreditedQuantity' : 'InvoicedQuantity'} unitCode="ZZ">1</cbc:${nota ? 'CreditedQuantity' : 'InvoicedQuantity'}><cbc:LineExtensionAmount ${cur}>${m(d.baseSinIgv)}</cbc:LineExtensionAmount>`
      + `<cac:PricingReference><cac:AlternativeConditionPrice><cbc:PriceAmount ${cur}>${m(d.total)}</cbc:PriceAmount><cbc:PriceTypeCode>01</cbc:PriceTypeCode></cac:AlternativeConditionPrice></cac:PricingReference>`
      + `<cac:TaxTotal><cbc:TaxAmount ${cur}>${m(d.igv)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount ${cur}>${m(d.baseSinIgv)}</cbc:TaxableAmount><cbc:TaxAmount ${cur}>${m(d.igv)}</cbc:TaxAmount><cac:TaxCategory><cbc:Percent>${m(IGV * 100)}</cbc:Percent><cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode><cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>`
      + `<cac:Item><cbc:Description>${esc(d.descripcion)}</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount ${cur}>${m(d.baseSinIgv)}</cbc:PriceAmount></cac:Price></cac:${nota ? 'CreditNoteLine' : 'InvoiceLine'}>`,
    `</${raiz}>`,
  ];
  return lineas.filter(Boolean).join('\n');
}

/** El nombre de archivo que usa SUNAT: «RUC-01-F001-00000001». */
export const nombreArchivo = (rucEmisor: string, tipo: TipoComprobante, serie: string, numero: number) => `${rucEmisor}-${CODIGO_TIPO[tipo]}-${numeroCompleto(serie, numero)}`;
