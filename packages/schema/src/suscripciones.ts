/**
 * HU-1703 · Alta de suscripción desde /precios (REQ-083, CP-143, RN-18-2, RN-18-3, RN-18-5). Reglas puras, las mismas en
 * la API, el script de /pago y las pruebas:
 * - validar los datos de la empresa (razón social, RUC opcional con su dígito verificador, administrador y consentimiento);
 * - el resumen con IGV de 18 % para el ciclo mensual o anual, con el precio efectivo del plan publicado;
 * - factura con RUC y boleta sin RUC;
 * - el fin del período desde la fecha de pago.
 *
 * Los textos son datos no confiables del visitante: se recortan, deben ser texto plano y nunca se interpretan.
 */
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';
import { conIgv, igvDe, type PlanPublico } from './planes.js';

export { RUTA_PAGO } from './planes.js';

export const CICLOS = ['MENSUAL', 'ANUAL'] as const;
export type Ciclo = (typeof CICLOS)[number];
export const esCiclo = (v: unknown): v is Ciclo => typeof v === 'string' && (CICLOS as readonly string[]).includes(v);
export type TipoComprobante = 'FACTURA' | 'BOLETA';
/** HU-1704 · Moneda del cobro: soles por defecto; dólares con Stripe para clientes del exterior (RN-18-9). */
export const MONEDAS = ['PEN', 'USD'] as const;
export type Moneda = (typeof MONEDAS)[number];
export const esMoneda = (v: unknown): v is Moneda => typeof v === 'string' && (MONEDAS as readonly string[]).includes(v);
export const LIMITES_EMPRESA = { razonSocial: 150, nombre: 120, correo: 160 } as const;
/** Pasarela de pruebas (HU-1703; código `pruebas` desde la HU-1704): solo con `SITIO_ENTORNO=pruebas`, cobra en soles y en dólares. */
export const PASARELA_PRUEBA = 'pruebas';
/** Tarjetas de la pasarela de pruebas: la primera aprueba y la segunda rechaza (como las de prueba de las pasarelas). */
export const TARJETAS_PRUEBA = { aprobada: '4111111111111111', rechazada: '4000000000000002' } as const;

const CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const unaLinea = (v: unknown): string => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();
const ACEPTA = new Set<unknown>([true, 'true', 'on', '1', 'si', 'sí']);

/**
 * RUC de SUNAT: 11 dígitos, prefijo 10, 15, 16, 17 o 20, y el último es el dígito verificador del módulo 11 con los
 * pesos 5, 4, 3, 2, 7, 6, 5, 4, 3, 2 (resto 10 → 0 y 11 → 1).
 */
export function rucValido(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  const d = 11 - (suma % 11);
  return (d === 10 ? 0 : d === 11 ? 1 : d) === Number(ruc[10]);
}

export const tipoComprobanteDe = (ruc: string | null): TipoComprobante => (ruc ? 'FACTURA' : 'BOLETA');

export interface DatosEmpresa { razonSocial: string; ruc: string | null; nombreAdmin: string; correoAdmin: string }
export type ResultadoEmpresa = { ok: true; datos: DatosEmpresa; tipoComprobante: TipoComprobante } | { ok: false; errores: ErrorCampo[] };

/** Paso 1 · Empresa. Con RUC (sin espacios ni guiones) se emite factura; sin RUC, boleta. El consentimiento es obligatorio (Ley 29733). */
export function validarEmpresa(entrada: unknown): ResultadoEmpresa {
  const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
  const errores: ErrorCampo[] = [];
  const texto = (campo: 'razonSocial' | 'nombreAdmin', max: number, falta: string, etiqueta: string) => {
    const t = unaLinea(e[campo]);
    if (!t) errores.push({ campo, mensaje: falta });
    else if (t.length > max) errores.push({ campo, mensaje: `${etiqueta} admite hasta ${max} caracteres` });
    else if (!esTextoPlano(t)) errores.push({ campo, mensaje: `${etiqueta} solo admite texto, sin etiquetas HTML` });
    return t;
  };
  const razonSocial = texto('razonSocial', LIMITES_EMPRESA.razonSocial, 'Escribe la razón social o tu nombre', 'La razón social');
  const ruc = unaLinea(e.ruc).replace(/[\s-]/g, '');
  if (ruc && !/^\d{11}$/.test(ruc)) errores.push({ campo: 'ruc', mensaje: 'El RUC tiene 11 dígitos' });
  else if (ruc && !rucValido(ruc)) errores.push({ campo: 'ruc', mensaje: 'Revisa el RUC: el dígito verificador no coincide' });
  const nombreAdmin = texto('nombreAdmin', LIMITES_EMPRESA.nombre, 'Escribe el nombre de quien administrará la cuenta', 'El nombre');
  const correoAdmin = unaLinea(e.correoAdmin).toLowerCase();
  if (!correoAdmin) errores.push({ campo: 'correoAdmin', mensaje: 'Escribe el correo de quien administrará la cuenta' });
  else if (correoAdmin.length > LIMITES_EMPRESA.correo || !CORREO.test(correoAdmin)) errores.push({ campo: 'correoAdmin', mensaje: 'Escribe un correo válido, por ejemplo nombre@empresa.com' });
  if (!ACEPTA.has(e.consentimiento)) errores.push({ campo: 'consentimiento', mensaje: 'Acepta los términos y el tratamiento de tus datos personales para continuar' });
  if (errores.length) return { ok: false, errores };
  return { ok: true, datos: { razonSocial, ruc: ruc || null, nombreAdmin, correoAdmin }, tipoComprobante: tipoComprobanteDe(ruc || null) };
}

export interface ResumenCheckout {
  plan: string; nombrePlan: string; ciclo: Ciclo;
  /** Soles (o dólares) enteros sin IGV por el ciclo: es el precio pactado (RN-18-2). */
  subtotal: number; igv: number; total: number; moneda: Moneda;
}

/** El plan publicado con lo que hace falta para el resumen (los precios en USD son opcionales en versiones anteriores). */
export type PlanResumible = Pick<PlanPublico, 'slug' | 'nombre' | 'aMedida' | 'precioMes' | 'precioAnual'> & Partial<Pick<PlanPublico, 'precioMesUsd' | 'precioAnualUsd'>>;

/**
 * Paso 2 · Resumen. El mensual cobra el precio al mes; el anual, el precio anual efectivo del plan publicado (propio o
 * con el descuento). En dólares (HU-1704), los precios en USD del plan, también con IGV de 18 % por defecto (SUP-296:
 * el tratamiento de la exportación de servicios se valida con el contador). Null si el plan es a medida, si pide el anual
 * y la página no lo ofrece, o si pide dólares y el plan no tiene precio en USD.
 */
export function resumenCheckout(plan: PlanResumible, ciclo: Ciclo, mostrarAnual: boolean, moneda: Moneda = 'PEN'): ResumenCheckout | null {
  if (plan.aMedida || plan.precioMes === null) return null;
  const mes = moneda === 'USD' ? (plan.precioMesUsd ?? null) : plan.precioMes;
  const anual = moneda === 'USD' ? (plan.precioAnualUsd ?? null) : plan.precioAnual;
  if (mes === null) return null;
  if (ciclo === 'ANUAL' && (!mostrarAnual || anual === null)) return null;
  const subtotal = ciclo === 'ANUAL' ? anual! : mes;
  return { plan: plan.slug, nombrePlan: plan.nombre, ciclo, subtotal, igv: igvDe(subtotal), total: conIgv(subtotal), moneda };
}

/**
 * HU-1704 · Las monedas en que se puede pagar un plan: siempre soles; dólares solo si el plan tiene precio en USD y hay
 * una pasarela visible y activa que cobra en dólares (Stripe; en el entorno de pruebas, también la simulada).
 */
export function monedasDelPlan(plan: Pick<PlanResumible, 'aMedida' | 'precioMesUsd'>, monedasConPasarela: readonly Moneda[]): Moneda[] {
  if (plan.aMedida) return [];
  const usd = (plan.precioMesUsd ?? null) !== null && monedasConPasarela.includes('USD');
  return usd ? ['PEN', 'USD'] : ['PEN'];
}

/** Suma meses en UTC conservando la hora; si el día no existe en el mes de llegada, queda en el último (31 ene → 28 feb). */
export function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha.getTime());
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

/** El fin del período pagado: un mes o un año desde el pago. */
export const finPeriodo = (pago: Date, ciclo: Ciclo): Date => sumarMeses(pago, ciclo === 'ANUAL' ? 12 : 1);

/** «S/ 1,522.20»: dos decimales para los montos del resumen y del cobro. */
export const soles2 = (n: number) => `S/ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** HU-1704 · «US$ 411.82» o «S/ 1,522.20» según la moneda del cobro. */
export const monto2 = (n: number, moneda: string) => (moneda === 'USD' ? `US$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : soles2(n));
/** HU-1704 · El monto en la unidad menor que piden las pasarelas (céntimos o centavos), sin errores de coma flotante. */
export const centimos = (n: number) => Math.round(n * 100);

/** Un identificador de organización a partir de la razón social, con un sufijo para que no choque. */
export function slugOrganizacion(razonSocial: string, sufijo: string): string {
  const base = razonSocial.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return `${base || 'organizacion'}-${sufijo}`;
}

/**
 * El evento que manda una pasarela al webhook, ya leído y con la firma comprobada. HU-1704: con la referencia de la
 * transacción (para reembolsar) y el monto y la moneda cobrados, si la pasarela los informa (se comparan con la solicitud).
 */
export interface EventoPago {
  eventoId: string; solicitudId: string; resultado: 'aprobado' | 'rechazado'; ultimos4: string | null; motivo: string | null;
  referencia?: string | null; monto?: number | null; moneda?: Moneda | null;
}

/** Lee el cuerpo del evento de la pasarela de pruebas (`{ id, tipo: pago.aprobado|pago.rechazado, solicitudId, ultimos4?, motivo?, monto?, moneda? }`). */
export function leerEventoPrueba(cuerpo: unknown): EventoPago | null {
  const e = (cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {}) as Record<string, unknown>;
  const id = typeof e.id === 'string' ? e.id.trim() : '';
  const solicitudId = typeof e.solicitudId === 'string' ? e.solicitudId.trim() : '';
  if (!/^[\w.:-]{1,100}$/.test(id) || !/^[0-9a-f-]{36}$/i.test(solicitudId)) return null;
  if (e.tipo !== 'pago.aprobado' && e.tipo !== 'pago.rechazado') return null;
  const ultimos4 = typeof e.ultimos4 === 'string' && /^\d{4}$/.test(e.ultimos4) ? e.ultimos4 : null;
  const motivo = typeof e.motivo === 'string' && esTextoPlano(e.motivo) ? e.motivo.slice(0, 200) : null;
  const monto = typeof e.monto === 'number' && Number.isFinite(e.monto) && e.monto > 0 ? e.monto : null;
  const moneda = esMoneda(e.moneda) ? e.moneda : null;
  return { eventoId: id, solicitudId: solicitudId.toLowerCase(), resultado: e.tipo === 'pago.aprobado' ? 'aprobado' : 'rechazado', ultimos4, motivo, referencia: id, monto, moneda };
}
