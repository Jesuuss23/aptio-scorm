/**
 * HU-1709 · Cupones y convenios (REQ-089, CP-151, PNT-37). Reglas puras, sin base de datos:
 *
 * - validar un cupón al crearlo o editarlo: el código en mayúsculas, el porcentaje de 1 a 100, los ciclos con descuento
 *   (vacío = permanente), la vigencia por días de Lima, el límite de usos, los planes y, en los convenios, los dominios de
 *   correo (obligatorios en un convenio y solo en él);
 * - `aplicarCupon`: acepta el cupón o lo rechaza con el motivo (no existe, oculto, aún no empieza, vencido, agotado, no
 *   aplica al plan, el correo no es del convenio o ya lo usó); con un rechazo el total no cambia (CP-151);
 * - el descuento al céntimo sobre el subtotal de lista y el 18 % de IGV sobre la base ya descontada.
 */
import { conIgv, type ErrorCampo, igvDe, SLUG_PLAN } from './planes.js';
import type { ResumenCheckout } from './suscripciones.js';

export const TIPOS_CUPON = ['CAMPANA', 'CONVENIO'] as const;
export type TipoCupon = (typeof TIPOS_CUPON)[number];
/** A–Z, 0–9 y guiones, de 3 a 30 caracteres (el mismo CHECK que la base de datos). */
export const CODIGO_CUPON = /^[A-Z0-9][A-Z0-9-]{2,29}$/;
const DOMINIO = /^(?=.{3,120}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
export const LIMITES_CUPON = { nombre: 80, ciclos: 120, usos: 100_000, dominios: 20, planes: 30 } as const;
/** Lima no tiene horario de verano: UTC−5 todo el año. */
const LIMA_MS = 5 * 60 * 60 * 1000;

/** «  lanzamiento26 » → «LANZAMIENTO26». */
export const normalizarCodigo = (c: unknown) => (typeof c === 'string' ? c.trim().toUpperCase() : '');
/** «@PUCP.edu.pe » → «pucp.edu.pe». */
export const normalizarDominio = (d: unknown) => (typeof d === 'string' ? d.trim().toLowerCase().replace(/^@+/, '') : '');

/** El inicio del día de Lima (00:00) como instante. */
export const inicioDiaLima = (dia: string) => new Date(Date.parse(`${dia}T00:00:00.000Z`) + LIMA_MS);
/** El fin del día de Lima (23:59:59.999) como instante: un cupón vale todo su último día. */
export const finDiaLima = (dia: string) => new Date(Date.parse(`${dia}T00:00:00.000Z`) + LIMA_MS + 24 * 60 * 60 * 1000 - 1);
/** El día de Lima (AAAA-MM-DD) de un instante. */
export const diaLima = (d: Date) => new Date(d.getTime() - LIMA_MS).toISOString().slice(0, 10);
const diaValido = (d: string) => DIA.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00.000Z`)) && new Date(`${d}T00:00:00.000Z`).toISOString().slice(0, 10) === d;

export interface DatosCupon {
  codigo: string; nombre: string; tipo: TipoCupon; porcentaje: number; ciclosDescuento: number | null;
  /** Días de Lima (AAAA-MM-DD), inclusivos; null = sin límite. */
  vigenciaDesde: string | null; vigenciaHasta: string | null;
  limiteUsos: number | null; planesPermitidos: string[]; dominiosCorreo: string[]; visible: boolean; orden: number;
}

export type ResultadoCupon = { ok: true; datos: DatosCupon } | { ok: false; errores: ErrorCampo[] };

const entero = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const vacio = (v: unknown) => v === null || v === undefined || v === '';

/**
 * Valida un cupón completo (al crear) o los campos que llegan (al editar, con `parcial`, sobre el cupón `actual`): el
 * resultado siempre es el cupón entero, para revisar la coherencia de las fechas y de los dominios con el tipo.
 */
export function validarCupon(entrada: unknown, actual?: DatosCupon): ResultadoCupon {
  const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
  const errores: ErrorCampo[] = [];
  const hay = (k: string) => !actual || k in e;
  const tomar = <K extends keyof DatosCupon>(k: K, leer: () => DatosCupon[K] | undefined): DatosCupon[K] | undefined => (hay(k) ? leer() : actual![k]);

  const codigo = tomar('codigo', () => {
    const c = normalizarCodigo(e.codigo);
    if (!CODIGO_CUPON.test(c)) { errores.push({ campo: 'codigo', mensaje: 'El código lleva de 3 a 30 letras, números o guiones, sin espacios' }); return undefined; }
    return c;
  });
  const nombre = tomar('nombre', () => {
    const n = typeof e.nombre === 'string' ? e.nombre.replace(/\s+/g, ' ').trim() : '';
    if (!n || n.length > LIMITES_CUPON.nombre) { errores.push({ campo: 'nombre', mensaje: `Escribe un nombre de hasta ${LIMITES_CUPON.nombre} caracteres` }); return undefined; }
    return n;
  });
  const tipo = tomar('tipo', () => {
    if (vacio(e.tipo) && !actual) return 'CAMPANA';
    if (!TIPOS_CUPON.includes(e.tipo as TipoCupon)) { errores.push({ campo: 'tipo', mensaje: 'El tipo es CAMPANA o CONVENIO' }); return undefined; }
    return e.tipo as TipoCupon;
  });
  const porcentaje = tomar('porcentaje', () => {
    if (!entero(e.porcentaje, 1, 100)) { errores.push({ campo: 'porcentaje', mensaje: 'El descuento es un porcentaje entero de 1 a 100' }); return undefined; }
    return e.porcentaje;
  });
  const ciclosDescuento = tomar('ciclosDescuento', () => {
    if (vacio(e.ciclosDescuento)) return null;
    if (!entero(e.ciclosDescuento, 1, LIMITES_CUPON.ciclos)) { errores.push({ campo: 'ciclosDescuento', mensaje: `Los ciclos con descuento van de 1 a ${LIMITES_CUPON.ciclos}, o vacío si es permanente` }); return undefined; }
    return e.ciclosDescuento;
  });
  const dia = (k: 'vigenciaDesde' | 'vigenciaHasta', etiqueta: string) => tomar(k, () => {
    if (vacio(e[k])) return null;
    if (typeof e[k] !== 'string' || !diaValido(e[k])) { errores.push({ campo: k, mensaje: `${etiqueta} es una fecha AAAA-MM-DD` }); return undefined; }
    return e[k];
  });
  const vigenciaDesde = dia('vigenciaDesde', 'El inicio');
  const vigenciaHasta = dia('vigenciaHasta', 'El vencimiento');
  if (vigenciaDesde && vigenciaHasta && vigenciaHasta < vigenciaDesde) errores.push({ campo: 'vigenciaHasta', mensaje: 'El vencimiento no puede ser antes del inicio' });
  const limiteUsos = tomar('limiteUsos', () => {
    if (vacio(e.limiteUsos)) return null;
    if (!entero(e.limiteUsos, 1, LIMITES_CUPON.usos)) { errores.push({ campo: 'limiteUsos', mensaje: 'El límite de usos es un número entero desde 1, o vacío si no tiene límite' }); return undefined; }
    return e.limiteUsos;
  });
  const planesPermitidos = tomar('planesPermitidos', () => {
    if (vacio(e.planesPermitidos)) return [];
    const l = Array.isArray(e.planesPermitidos) ? e.planesPermitidos : null;
    if (!l || l.length > LIMITES_CUPON.planes || !l.every((x) => typeof x === 'string' && SLUG_PLAN.test(x))) { errores.push({ campo: 'planesPermitidos', mensaje: 'Los planes van por su identificador (minúsculas, números y guiones)' }); return undefined; }
    return [...new Set(l as string[])];
  });
  const dominiosCorreo = tomar('dominiosCorreo', () => {
    if (vacio(e.dominiosCorreo)) return [];
    const l = Array.isArray(e.dominiosCorreo) ? e.dominiosCorreo.map(normalizarDominio).filter(Boolean) : null;
    if (!l || l.length > LIMITES_CUPON.dominios || !l.every((x) => DOMINIO.test(x))) { errores.push({ campo: 'dominiosCorreo', mensaje: 'Escribe dominios como pucp.edu.pe, sin espacios' }); return undefined; }
    return [...new Set(l)];
  });
  if (tipo === 'CONVENIO' && dominiosCorreo && dominiosCorreo.length === 0) errores.push({ campo: 'dominiosCorreo', mensaje: 'Un convenio necesita al menos un dominio de correo, por ejemplo pucp.edu.pe' });
  if (tipo === 'CAMPANA' && dominiosCorreo && dominiosCorreo.length > 0) errores.push({ campo: 'dominiosCorreo', mensaje: 'Solo los convenios se limitan por dominio de correo' });
  const visible = tomar('visible', () => {
    if (vacio(e.visible) && !actual) return true;
    if (typeof e.visible !== 'boolean') { errores.push({ campo: 'visible', mensaje: 'Activo es sí o no' }); return undefined; }
    return e.visible;
  });
  const orden = tomar('orden', () => {
    if (vacio(e.orden) && !actual) return 0;
    if (!entero(e.orden, 0, 10_000)) { errores.push({ campo: 'orden', mensaje: 'El orden es un número entero desde 0' }); return undefined; }
    return e.orden;
  });
  if (errores.length) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      codigo: codigo!, nombre: nombre!, tipo: tipo!, porcentaje: porcentaje!, ciclosDescuento: ciclosDescuento ?? null, vigenciaDesde: vigenciaDesde ?? null, vigenciaHasta: vigenciaHasta ?? null,
      limiteUsos: limiteUsos ?? null, planesPermitidos: planesPermitidos!, dominiosCorreo: dominiosCorreo!, visible: visible!, orden: orden!,
    },
  };
}

/** El cupón como lo lee `aplicarCupon` (la fila de la base de datos). */
export interface CuponAplicable {
  codigo: string; nombre: string; tipo: TipoCupon; porcentaje: number; ciclosDescuento: number | null;
  vigenciaDesde: Date | null; vigenciaHasta: Date | null; limiteUsos: number | null; usos: number;
  planesPermitidos: string[]; dominiosCorreo: string[]; visible: boolean;
}

export const MOTIVOS_CUPON = ['CUPON_NO_EXISTE', 'CUPON_INACTIVO', 'CUPON_NO_VIGENTE', 'CUPON_VENCIDO', 'CUPON_AGOTADO', 'CUPON_NO_APLICA_PLAN', 'CUPON_CORREO_CONVENIO', 'CUPON_YA_USADO'] as const;
export type MotivoCupon = (typeof MOTIVOS_CUPON)[number];

/** El resumen con el cupón: `subtotal` es el precio de lista; IGV y total salen de la base ya descontada. */
export interface ResumenConDescuento extends ResumenCheckout {
  descuento: number;
  /** La base sin IGV que se cobra: subtotal − descuento. */
  base: number;
  cupon: { codigo: string; nombre: string; tipo: TipoCupon; porcentaje: number; ciclosDescuento: number | null } | null;
}

export type ResultadoAplicar =
  | { ok: true; resumen: ResumenConDescuento }
  | { ok: false; codigo: MotivoCupon; mensaje: string; fecha: string | null; resumen: ResumenConDescuento };

export interface ContextoCupon {
  /** El plan elegido (slug y si es a medida). */
  plan: { slug: string; aMedida?: boolean };
  /** El correo del administrador (para los convenios); sin él, un convenio pide escribirlo. */
  correo?: string | null;
  /** Si la empresa (por su correo o su RUC) ya usó este cupón en un alta aprobada. */
  yaUsado?: boolean;
  ahora: Date;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** El resumen sin cupón (descuento 0): el de siempre. */
export const sinDescuento = (r: ResumenCheckout): ResumenConDescuento => ({ ...r, descuento: 0, base: r.subtotal, igv: igvDe(r.subtotal), total: conIgv(r.subtotal), cupon: null });

/** El descuento al céntimo sobre la base de lista y el IGV de 18 % sobre la base descontada. */
export function descontar(lista: number, porcentaje: number): { descuento: number; base: number; igv: number; total: number } {
  const descuento = r2((lista * porcentaje) / 100);
  const base = r2(lista - descuento);
  return { descuento, base, igv: igvDe(base), total: conIgv(base) };
}

/** Si el correo es de alguno de los dominios (o de un subdominio: alumnos.pucp.edu.pe vale para pucp.edu.pe). */
export function correoDelConvenio(correo: string, dominios: readonly string[]): boolean {
  const d = correo.trim().toLowerCase().split('@')[1] ?? '';
  return dominios.some((x) => d === x || d.endsWith(`.${x}`));
}

/** El día de Lima en palabras para el motivo: «31 de diciembre de 2026». */
const fechaLarga = (d: Date) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' }).format(d);

/**
 * CP-151 · Aplica el cupón al resumen del pago o lo rechaza con el motivo. Con un rechazo, el resumen es el de siempre:
 * el total no cambia. El orden de las comprobaciones da el motivo más útil primero.
 */
export function aplicarCupon(cupon: CuponAplicable | null, ctx: ContextoCupon, resumen: ResumenCheckout): ResultadoAplicar {
  const base = sinDescuento(resumen);
  const no = (codigo: MotivoCupon, mensaje: string, fecha: Date | null = null): ResultadoAplicar => ({ ok: false, codigo, mensaje, fecha: fecha ? diaLima(fecha) : null, resumen: base });
  if (!cupon) return no('CUPON_NO_EXISTE', 'Ese cupón no existe: revisa el código');
  if (!cupon.visible) return no('CUPON_INACTIVO', 'Este cupón ya no está disponible');
  const t = ctx.ahora.getTime();
  if (cupon.vigenciaDesde && t < cupon.vigenciaDesde.getTime()) return no('CUPON_NO_VIGENTE', `Este cupón vale desde el ${fechaLarga(cupon.vigenciaDesde)}`, cupon.vigenciaDesde);
  if (cupon.vigenciaHasta && t > cupon.vigenciaHasta.getTime()) return no('CUPON_VENCIDO', `Este cupón venció el ${fechaLarga(cupon.vigenciaHasta)}`, cupon.vigenciaHasta);
  if (cupon.limiteUsos !== null && cupon.usos >= cupon.limiteUsos) return no('CUPON_AGOTADO', 'Este cupón ya se usó todas las veces permitidas');
  if (ctx.plan.aMedida || (cupon.planesPermitidos.length > 0 && !cupon.planesPermitidos.includes(ctx.plan.slug))) return no('CUPON_NO_APLICA_PLAN', 'Este cupón no aplica al plan elegido');
  if (cupon.tipo === 'CONVENIO' && cupon.dominiosCorreo.length > 0) {
    const lista = cupon.dominiosCorreo.join(', ');
    if (!ctx.correo || !correoDelConvenio(ctx.correo, cupon.dominiosCorreo)) return no('CUPON_CORREO_CONVENIO', `Este convenio es para correos de ${lista}: usa tu correo institucional como correo del administrador`);
  }
  if (ctx.yaUsado) return no('CUPON_YA_USADO', 'Tu empresa ya usó este cupón');
  const d = descontar(resumen.subtotal, cupon.porcentaje);
  return {
    ok: true,
    resumen: { ...resumen, descuento: d.descuento, base: d.base, igv: d.igv, total: d.total, cupon: { codigo: cupon.codigo, nombre: cupon.nombre, tipo: cupon.tipo, porcentaje: cupon.porcentaje, ciclosDescuento: cupon.ciclosDescuento } },
  };
}

/** Los ciclos con descuento que le quedan a la suscripción después del alta (null = permanente). */
export const ciclosRestantesTrasAlta = (ciclosDescuento: number | null) => (ciclosDescuento === null ? null : Math.max(0, ciclosDescuento - 1));

/** Si una renovación lleva el descuento de la suscripción: con porcentaje y ciclos por delante (null = permanente). */
export const renuevaConDescuento = (s: { porcentajeDescuento: number | null; ciclosDescuentoRestantes: number | null }) =>
  s.porcentajeDescuento !== null && (s.ciclosDescuentoRestantes === null || s.ciclosDescuentoRestantes > 0);

/** Un ciclo menos tras pagar una renovación con descuento (null sigue permanente). */
export const descontarCiclo = (restantes: number | null) => (restantes === null ? null : Math.max(0, restantes - 1));

/** «−20 % en los primeros 3 pagos», «−20 % en el primer pago» o «−15 % permanente». */
export function beneficioDe(c: { porcentaje: number; ciclosDescuento: number | null }): string {
  if (c.ciclosDescuento === null) return `−${c.porcentaje} % permanente`;
  return c.ciclosDescuento === 1 ? `−${c.porcentaje} % en el primer pago` : `−${c.porcentaje} % en los primeros ${c.ciclosDescuento} pagos`;
}
