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
export const LIMITES_EMPRESA = { razonSocial: 150, nombre: 120, correo: 160 } as const;
/** Pasarela de pruebas (HU-1703): solo con `SITIO_ENTORNO=pruebas`. Las reales llegan con la HU-1704. */
export const PASARELA_PRUEBA = 'prueba';
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
  /** Soles enteros sin IGV por el ciclo: es el precio pactado (RN-18-2). */
  subtotal: number; igv: number; total: number; moneda: 'PEN';
}

/**
 * Paso 2 · Resumen. El mensual cobra el precio al mes; el anual, el precio anual efectivo del plan publicado (propio o
 * con el descuento). Null si el plan es a medida o si pide el anual y la página no lo ofrece.
 */
export function resumenCheckout(plan: Pick<PlanPublico, 'slug' | 'nombre' | 'aMedida' | 'precioMes' | 'precioAnual'>, ciclo: Ciclo, mostrarAnual: boolean): ResumenCheckout | null {
  if (plan.aMedida || plan.precioMes === null) return null;
  if (ciclo === 'ANUAL' && (!mostrarAnual || plan.precioAnual === null)) return null;
  const subtotal = ciclo === 'ANUAL' ? plan.precioAnual! : plan.precioMes;
  return { plan: plan.slug, nombrePlan: plan.nombre, ciclo, subtotal, igv: igvDe(subtotal), total: conIgv(subtotal), moneda: 'PEN' };
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

/** Un identificador de organización a partir de la razón social, con un sufijo para que no choque. */
export function slugOrganizacion(razonSocial: string, sufijo: string): string {
  const base = razonSocial.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return `${base || 'organizacion'}-${sufijo}`;
}

/** El evento que manda una pasarela al webhook, ya leído y con la firma comprobada. */
export interface EventoPago { eventoId: string; solicitudId: string; resultado: 'aprobado' | 'rechazado'; ultimos4: string | null; motivo: string | null }

/** Lee el cuerpo del evento de la pasarela de pruebas (`{ id, tipo: pago.aprobado|pago.rechazado, solicitudId, ultimos4?, motivo? }`). */
export function leerEventoPrueba(cuerpo: unknown): EventoPago | null {
  const e = (cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {}) as Record<string, unknown>;
  const id = typeof e.id === 'string' ? e.id.trim() : '';
  const solicitudId = typeof e.solicitudId === 'string' ? e.solicitudId.trim() : '';
  if (!/^[\w.:-]{1,100}$/.test(id) || !/^[0-9a-f-]{36}$/i.test(solicitudId)) return null;
  if (e.tipo !== 'pago.aprobado' && e.tipo !== 'pago.rechazado') return null;
  const ultimos4 = typeof e.ultimos4 === 'string' && /^\d{4}$/.test(e.ultimos4) ? e.ultimos4 : null;
  const motivo = typeof e.motivo === 'string' && esTextoPlano(e.motivo) ? e.motivo.slice(0, 200) : null;
  return { eventoId: id, solicitudId: solicitudId.toLowerCase(), resultado: e.tipo === 'pago.aprobado' ? 'aprobado' : 'rechazado', ultimos4, motivo };
}
