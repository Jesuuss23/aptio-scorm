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
/**
 * DA-09 · Los proveedores OSE conocidos: el simulado (SUP-314, solo fuera de producción) y Mifact (HU-1712), el PSE/OSE
 * real elegido por la empresa. Mifact está disponible donde exista `MIFACT_URL`.
 */
export const PROVEEDORES_OSE = [
  { codigo: 'pruebas', nombre: 'OSE de pruebas (simulado)', soloPruebas: true },
  { codigo: 'mifact', nombre: 'Mifact', soloPruebas: false },
] as const;
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

/**
 * HU-1712 · El RUC de pruebas del ambiente demo de Mifact (su token público es de este RUC). No cumple el dígito
 * verificador, así que solo se admite como emisor en el ambiente de pruebas.
 */
export const RUC_DEMO_MIFACT = '20100100100';
/** El RUC del emisor: válido, o el de la demo de Mifact en el ambiente de pruebas. */
export const rucEmisorValido = (ruc: unknown, ambiente: unknown): ruc is string => rucValido(ruc) || (ruc === RUC_DEMO_MIFACT && ambiente === 'pruebas');

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
  /** HU-1712 · Ubigeo INEI (6 dígitos) del domicilio fiscal y código de anexo SUNAT (4 dígitos, 0000 = principal). */
  ubigeoEmisor: string; codigoAnexo: string;
  /** HU-1712 · Cuenta de detracciones del Banco de la Nación y código SPOT (3 dígitos), obligatorios con la detracción activa. */
  cuentaDetraccion: string; codigoDetraccion: string;
}

// ---------- HU-1712 · DNI del receptor de una boleta ----------

/**
 * Desde estos montos (total con IGV) la boleta debe identificar al comprador con su DNI. S/ 700 es la regla de SUNAT; el
 * equivalente en dólares es un supuesto fijo (SUP-349) hasta validarlo con el contador.
 */
export const UMBRAL_DNI_BOLETA: Record<MonedaComprobante, number> = { PEN: 700, USD: 200 };
export const dniValido = (v: unknown): v is string => typeof v === 'string' && /^\d{8}$/.test(v);
/** La boleta exige DNI si su total supera el umbral de su moneda. La factura nunca (lleva RUC). */
export const exigeDni = (tipo: TipoComprobante | 'FACTURA' | 'BOLETA', total: number, moneda: MonedaComprobante): boolean =>
  tipo === 'BOLETA' && total > UMBRAL_DNI_BOLETA[moneda];
/** Limpia el DNI escrito (sin espacios ni guiones). */
export const normalizarDni = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\s.-]/g, '') : '');
/** El error del campo DNI, o null: formato de 8 dígitos si viene, y obligatorio cuando `exigido`. */
export function errorDni(v: unknown, exigido: boolean, campo = 'dni'): ErrorCampo | null {
  const dni = normalizarDni(v);
  if (!dni) return exigido ? { campo, mensaje: 'Las boletas de más de S/ 700 necesitan el DNI del comprador' } : null;
  return dniValido(dni) ? null : { campo, mensaje: 'El DNI tiene 8 dígitos' };
}

const texto = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Valida los datos fiscales que guarda el superadmin. Las series son de 4 caracteres: F o B y 3 letras o dígitos. */
export function validarDatosFiscales(v: Partial<Record<keyof DatosFiscalesEntrada, unknown>>, proveedores: readonly string[]): ErrorCampo[] {
  const e: ErrorCampo[] = [];
  if (v.rucEmisor !== null && v.rucEmisor !== undefined && v.rucEmisor !== '' && !rucEmisorValido(v.rucEmisor, v.ambiente)) e.push({ campo: 'rucEmisor', mensaje: 'El RUC no es válido' });
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
  // HU-1712 · Mifact pide el ubigeo del emisor; con la detracción activa, la cuenta y el código SPOT.
  const real = v.proveedor === 'mifact';
  const ubigeo = typeof v.ubigeoEmisor === 'string' ? v.ubigeoEmisor : '';
  if (ubigeo ? !/^\d{6}$/.test(ubigeo) : real) e.push({ campo: 'ubigeoEmisor', mensaje: 'El ubigeo INEI tiene 6 dígitos' });
  if (typeof v.codigoAnexo !== 'string' || !/^\d{4}$/.test(v.codigoAnexo)) e.push({ campo: 'codigoAnexo', mensaje: 'El código de anexo tiene 4 dígitos (0000 para el local principal)' });
  const cuenta = typeof v.cuentaDetraccion === 'string' ? v.cuentaDetraccion : '';
  const codigo = typeof v.codigoDetraccion === 'string' ? v.codigoDetraccion : '';
  const exige = real && v.detraccionActiva === true;
  if (cuenta ? !/^[0-9-]{6,30}$/.test(cuenta) : exige) e.push({ campo: 'cuentaDetraccion', mensaje: 'Escribe la cuenta de detracciones del Banco de la Nación (solo dígitos y guiones)' });
  if (codigo ? !/^\d{3}$/.test(codigo) : exige) e.push({ campo: 'codigoDetraccion', mensaje: 'El código SPOT tiene 3 dígitos' });
  return e;
}

export interface ReceptorEntrada { ruc: string | null; razonSocial: string; direccion: string | null; correoFacturacion: string; dni?: string | null }

/** Valida la corrección del receptor de un comprobante observado (CP-149). Una factura exige un RUC válido. */
export function validarReceptor(v: Partial<Record<keyof ReceptorEntrada, unknown>>, tipo: TipoComprobante, montos?: { total: number; moneda: MonedaComprobante }): ErrorCampo[] {
  const e: ErrorCampo[] = [];
  // HU-1712 · La boleta lleva el DNI cuando supera el umbral.
  if (tipo === 'BOLETA') {
    const d = errorDni(v.dni, montos ? exigeDni(tipo, montos.total, montos.moneda) : false);
    if (d) e.push(d);
  }
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
