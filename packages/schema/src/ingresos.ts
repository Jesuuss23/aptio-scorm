/**
 * HU-1710 · Panel de ingresos (REQ-090, CP-152, PNT-35). Reglas puras, sin base de datos, por mes calendario de Lima
 * (`AAAA-MM`, UTC−5 sin horario de verano), comparando el mes elegido con el anterior:
 *
 * - **Ingreso mensual recurrente (MRR) neto**, en soles y en dólares por separado (sin tipo de cambio, SUP-329): las
 *   suscripciones vigentes en el corte (ACTIVA o PAGO_PENDIENTE; nunca CANCELADA ni SUSPENDIDA), con el anual entre 12 al
 *   céntimo y menos el cupón mientras le queden renovaciones con descuento (o si es permanente). Aparte, el «ingreso en
 *   riesgo»: el de las que pidieron cancelar al fin del período.
 * - **Suscripciones activas:** las vigentes en el corte, por moneda.
 * - **Cancelación mensual:** las que pasaron a CANCELADA dentro del mes, entre las vigentes al empezar el mes (0 % sin
 *   base), con la variación en puntos frente al mes anterior.
 * - **Ingreso promedio por cliente (ARPU):** el MRR entre las organizaciones vigentes de esa moneda (0 sin ninguna).
 *
 * El corte es el fin del mes o, en el mes en curso, el momento de la consulta. El estado, el precio y el descuento son
 * los de hoy: no hay historial de cambios de plan ni de suspensiones (SUP-330).
 */
import { descontar, renuevaConDescuento } from './cupones.js';

const LIMA_MS = 5 * 60 * 60 * 1000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

export const MONEDAS_INGRESO = ['PEN', 'USD'] as const;
export type MonedaIngreso = (typeof MONEDAS_INGRESO)[number];
export const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Lo que el cálculo necesita de cada suscripción. */
export interface SuscripcionIngreso {
  organizacionId: string;
  estado: 'ACTIVA' | 'PAGO_PENDIENTE' | 'SUSPENDIDA' | 'CANCELADA';
  ciclo: 'MENSUAL' | 'ANUAL';
  /** Sin IGV por el ciclo: el precio de lista. */
  precioPactadoSinIgv: number;
  moneda: string;
  cancelarAlFin: boolean;
  canceladaEn: Date | null;
  creadoEn: Date;
  porcentajeDescuento: number | null;
  ciclosDescuentoRestantes: number | null;
}

export interface IngresoMoneda {
  moneda: MonedaIngreso;
  /** MRR neto sin IGV. */
  mrr: number;
  /** La parte del MRR de las suscripciones que pidieron cancelar al fin del período. */
  enRiesgo: number;
  activas: number;
  /** MRR entre las organizaciones vigentes de esa moneda. */
  arpu: number;
}

export interface ResumenMes {
  mes: string;
  inicio: Date;
  /** El fin del mes o, en el mes en curso, el momento de la consulta. */
  corte: Date;
  monedas: IngresoMoneda[];
  activas: number;
  vigentesAlInicio: number;
  canceladas: number;
  /** Porcentaje con un decimal. */
  tasaCancelacion: number;
}

export interface PanelIngresos {
  actual: ResumenMes;
  anterior: ResumenMes;
  /** tasaCancelacion del mes menos la del anterior, en puntos con un decimal. */
  variacionCancelacion: number;
}

/** El mes de Lima de un instante (`AAAA-MM`). */
export const mesLima = (d: Date) => new Date(d.getTime() - LIMA_MS).toISOString().slice(0, 7);

/** El primer instante del mes de Lima y el primero del siguiente. */
export function limitesMes(mes: string): { inicio: Date; fin: Date } {
  const m = MES.exec(mes);
  if (!m) throw new RangeError(`Mes no válido: ${mes}`);
  const a = Number(m[1]);
  const n = Number(m[2]);
  return { inicio: new Date(Date.UTC(a, n - 1, 1) + LIMA_MS), fin: new Date(Date.UTC(a, n, 1) + LIMA_MS) };
}

/** El mes anterior (`2026-01` → `2025-12`). */
export function mesAnterior(mes: string): string {
  const { inicio } = limitesMes(mes);
  return mesLima(new Date(inicio.getTime() - 1));
}

/** El mes siguiente (`2026-12` → `2027-01`). */
export function mesSiguiente(mes: string): string {
  const { fin } = limitesMes(mes);
  return mesLima(fin);
}

/** El mes pedido, o el de hoy si no se pide; `null` si no tiene la forma AAAA-MM. */
export function normalizarMes(mes: unknown, ahora: Date): string | null {
  if (mes === undefined || mes === null || mes === '') return mesLima(ahora);
  return typeof mes === 'string' && MES.test(mes.trim()) ? mes.trim() : null;
}

/** Si la suscripción estaba vigente en el instante: creada antes y sin cancelar todavía, y hoy no suspendida. */
export function vigenteEn(s: SuscripcionIngreso, t: Date): boolean {
  if (s.creadoEn.getTime() > t.getTime()) return false;
  if (s.estado === 'SUSPENDIDA') return false;
  if (s.estado === 'CANCELADA') return s.canceladaEn !== null && s.canceladaEn.getTime() > t.getTime();
  return s.canceladaEn === null || s.canceladaEn.getTime() > t.getTime();
}

/** El ingreso de un mes sin IGV: el anual entre 12 al céntimo, menos el cupón si sigue (o es permanente). */
export function ingresoMensual(s: Pick<SuscripcionIngreso, 'ciclo' | 'precioPactadoSinIgv' | 'porcentajeDescuento' | 'ciclosDescuentoRestantes'>): number {
  const lista = s.ciclo === 'ANUAL' ? r2(s.precioPactadoSinIgv / 12) : r2(s.precioPactadoSinIgv);
  return renuevaConDescuento(s) ? descontar(lista, s.porcentajeDescuento!).base : lista;
}

const monedaDe = (m: string): MonedaIngreso | null => ((MONEDAS_INGRESO as readonly string[]).includes(m) ? (m as MonedaIngreso) : null);

export function resumenMes(suscripciones: readonly SuscripcionIngreso[], mes: string, ahora: Date): ResumenMes {
  const { inicio, fin } = limitesMes(mes);
  const corte = new Date(Math.max(inicio.getTime(), Math.min(fin.getTime() - 1, ahora.getTime())));
  const monedas = MONEDAS_INGRESO.map((moneda) => {
    const vigentes = suscripciones.filter((s) => monedaDe(s.moneda) === moneda && vigenteEn(s, corte));
    const mrr = r2(vigentes.reduce((n, s) => n + ingresoMensual(s), 0));
    const enRiesgo = r2(vigentes.filter((s) => s.cancelarAlFin).reduce((n, s) => n + ingresoMensual(s), 0));
    const organizaciones = new Set(vigentes.map((s) => s.organizacionId)).size;
    return { moneda, mrr, enRiesgo, activas: vigentes.length, arpu: organizaciones ? r2(mrr / organizaciones) : 0 };
  });
  const vigentesAlInicio = suscripciones.filter((s) => vigenteEn(s, new Date(inicio.getTime() - 1))).length;
  const canceladas = suscripciones.filter((s) => s.canceladaEn !== null && s.canceladaEn >= inicio && s.canceladaEn < fin && s.canceladaEn <= ahora).length;
  return {
    mes, inicio, corte, monedas, activas: monedas.reduce((n, m) => n + m.activas, 0), vigentesAlInicio, canceladas,
    tasaCancelacion: vigentesAlInicio ? r1((canceladas / vigentesAlInicio) * 100) : 0,
  };
}

/** El panel: el mes elegido y el anterior, con la variación de la cancelación en puntos. */
export function panelIngresos(suscripciones: readonly SuscripcionIngreso[], mes: string, ahora: Date): PanelIngresos {
  const actual = resumenMes(suscripciones, mes, ahora);
  const anterior = resumenMes(suscripciones, mesAnterior(mes), ahora);
  return { actual, anterior, variacionCancelacion: r1(actual.tasaCancelacion - anterior.tasaCancelacion) };
}
