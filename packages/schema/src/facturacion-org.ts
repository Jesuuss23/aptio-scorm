/**
 * HU-1711 · Portal de facturación de la organización (REQ-091, CP-153, PNT-40). Reglas puras, las mismas en la API, la
 * consola y las pruebas:
 *
 * - `validarDatosFacturacion`: razón social en texto plano, correo de facturación válido, dirección opcional y la
 *   preferencia FACTURA o BOLETA; la factura exige un RUC de 11 dígitos con el dígito verificador de SUNAT y la boleta
 *   admite el RUC vacío.
 * - `validarMedioPrueba`: el cambio de tarjeta con la pasarela de pruebas (SUP-331). Solo acepta una tarjeta de prueba y
 *   devuelve únicamente sus 4 últimos dígitos: el número completo y el CVV nunca se guardan.
 *
 * Los textos son datos no confiables del administrador: se recortan, deben ser texto plano y nunca se interpretan.
 */
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';
import { rucValido, TARJETAS_PRUEBA, type TipoComprobante } from './suscripciones.js';
import { errorDni, exigeDni, type MonedaComprobante, normalizarDni } from './comprobantes.js';

export const TIPOS_COMPROBANTE = ['FACTURA', 'BOLETA'] as const;
export const LIMITES_FACTURACION = { razonSocial: 150, direccion: 200, correo: 160 } as const;
const CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const unaLinea = (v: unknown): string => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();

export interface DatosFacturacion {
  razonSocial: string;
  ruc: string | null;
  direccion: string | null;
  correoFacturacion: string;
  tipoComprobantePreferido: TipoComprobante;
  /** HU-1712 · DNI de 8 dígitos para la boleta. */
  dni: string | null;
}
export type ResultadoFacturacion = { ok: true; datos: DatosFacturacion } | { ok: false; errores: ErrorCampo[] };

/**
 * `importe` (HU-1712): el total con IGV del plan vigente. Con él, la boleta exige el DNI si supera S/ 700 (o su
 * equivalente en dólares, `exigeDni`); sin él, el DNI solo se valida si viene.
 */
export function validarDatosFacturacion(entrada: unknown, importe?: { total: number; moneda: MonedaComprobante }): ResultadoFacturacion {
  const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
  const errores: ErrorCampo[] = [];
  const tipo = e.tipoComprobantePreferido;
  if (tipo !== 'FACTURA' && tipo !== 'BOLETA') errores.push({ campo: 'tipoComprobantePreferido', mensaje: 'Elige factura o boleta' });
  const razonSocial = unaLinea(e.razonSocial);
  if (!razonSocial) errores.push({ campo: 'razonSocial', mensaje: 'Escribe la razón social o el nombre' });
  else if (razonSocial.length > LIMITES_FACTURACION.razonSocial) errores.push({ campo: 'razonSocial', mensaje: `La razón social admite hasta ${LIMITES_FACTURACION.razonSocial} caracteres` });
  else if (!esTextoPlano(razonSocial)) errores.push({ campo: 'razonSocial', mensaje: 'La razón social solo admite texto, sin etiquetas HTML' });
  const ruc = unaLinea(e.ruc).replace(/[\s-]/g, '');
  if (ruc && !/^\d{11}$/.test(ruc)) errores.push({ campo: 'ruc', mensaje: 'El RUC tiene 11 dígitos' });
  else if (ruc && !rucValido(ruc)) errores.push({ campo: 'ruc', mensaje: 'Revisa el RUC: el dígito verificador no coincide' });
  else if (!ruc && tipo === 'FACTURA') errores.push({ campo: 'ruc', mensaje: 'Para recibir factura escribe el RUC' });
  const direccion = unaLinea(e.direccion);
  if (direccion.length > LIMITES_FACTURACION.direccion) errores.push({ campo: 'direccion', mensaje: `La dirección admite hasta ${LIMITES_FACTURACION.direccion} caracteres` });
  else if (direccion && !esTextoPlano(direccion)) errores.push({ campo: 'direccion', mensaje: 'La dirección solo admite texto, sin etiquetas HTML' });
  const correo = unaLinea(e.correoFacturacion).toLowerCase();
  if (!correo) errores.push({ campo: 'correoFacturacion', mensaje: 'Escribe el correo de facturación' });
  else if (correo.length > LIMITES_FACTURACION.correo || !CORREO.test(correo)) errores.push({ campo: 'correoFacturacion', mensaje: 'Escribe un correo válido, por ejemplo pagos@empresa.com' });
  const dni = tipo === 'BOLETA' ? normalizarDni(e.dni) : '';
  if (tipo === 'BOLETA') {
    const d = errorDni(dni, importe ? exigeDni('BOLETA', importe.total, importe.moneda) : false);
    if (d) errores.push(d);
  }
  if (errores.length) return { ok: false, errores };
  return { ok: true, datos: { razonSocial, ruc: ruc || null, direccion: direccion || null, correoFacturacion: correo, tipoComprobantePreferido: tipo as TipoComprobante, dni: dni || null } };
}

export type ResultadoMedio = { ok: true; ultimos4Digitos: string } | { ok: false; errores: ErrorCampo[] };

/**
 * El cambio de tarjeta con la pasarela de pruebas: solo una tarjeta de prueba (4111 1111 1111 1111 aprueba los cobros
 * automáticos y 4000 0000 0000 0002 los rechaza). Devuelve los 4 últimos dígitos; el número no sale de aquí.
 */
export function validarMedioPrueba(entrada: unknown): ResultadoMedio {
  const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
  if ('cvv' in e || 'cvc' in e) return { ok: false, errores: [{ campo: 'cvv', mensaje: 'No envíes el código de seguridad: no se pide ni se guarda' }] };
  const numero = (typeof e.tarjeta === 'string' ? e.tarjeta : '').replace(/[\s-]/g, '');
  if (!numero) return { ok: false, errores: [{ campo: 'tarjeta', mensaje: 'Escribe el número de la tarjeta de prueba' }] };
  if (numero !== TARJETAS_PRUEBA.aprobada && numero !== TARJETAS_PRUEBA.rechazada) {
    return { ok: false, errores: [{ campo: 'tarjeta', mensaje: 'Usa una tarjeta de prueba: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza' }] };
  }
  return { ok: true, ultimos4Digitos: numero.slice(-4) };
}
