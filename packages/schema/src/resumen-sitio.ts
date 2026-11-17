/**
 * HU-1607 · Resumen del sitio comercial (REQ-080, PNT-24, CP-138). Reglas puras, las mismas en la API, la web y las
 * pruebas:
 * - los períodos (7, 30 y 90 días) en hora de Lima (UTC−5), con hoy incluido, y el período anterior del mismo largo;
 * - la variación porcentual contra el período anterior (null si antes no hubo nada);
 * - el reparto de los leads por origen con el método del mayor resto, para que sume exactamente 100 % (o 0 % sin leads);
 * - la conversión por página: leads con esa página de entrada entre las visitas que empezaron en ella (las 5 primeras);
 * - la visita anónima de `POST /s/_visita` (ruta, idioma, primera página de la sesión y el origen, si lo hay) y los bots.
 */
import { deLima, fechaLima, sumarDias } from './agenda.js';
import { esOrigenLead, ETIQUETA_ORIGEN, normalizarPagina, ORIGENES_LEAD, type OrigenLead } from './leads.js';

export const PERIODOS_RESUMEN = ['7d', '30d', '90d'] as const;
export type PeriodoResumen = (typeof PERIODOS_RESUMEN)[number];
export const PERIODO_POR_DEFECTO: PeriodoResumen = '30d';
export const DIAS_PERIODO: Record<PeriodoResumen, number> = { '7d': 7, '30d': 30, '90d': 90 };
export const ETIQUETA_PERIODO: Record<PeriodoResumen, string> = { '7d': '7 días', '30d': '30 días', '90d': 'Trimestre' };
export const esPeriodoResumen = (v: unknown): v is PeriodoResumen => typeof v === 'string' && (PERIODOS_RESUMEN as readonly string[]).includes(v);

/** Cuántas páginas y próximas demos lista el resumen. */
export const TOPE_PAGINAS_RESUMEN = 5;
export const TOPE_DEMOS_RESUMEN = 5;

/** Un tramo de días de Lima (`desde` y `hasta` incluidos) y sus instantes UTC (`inicio` incluido, `fin` excluido). */
export interface Tramo { desde: string; hasta: string; inicio: Date; fin: Date }
export interface Ventana { periodo: PeriodoResumen; dias: number; actual: Tramo; anterior: Tramo }

const tramo = (desde: string, hasta: string): Tramo => ({ desde, hasta, inicio: deLima(desde, '00:00'), fin: deLima(sumarDias(hasta, 1), '00:00') });

/** El período que termina hoy (en Lima) y el anterior del mismo largo, que termina el día antes de que empiece. */
export function ventanaResumen(periodo: PeriodoResumen, ahora: Date): Ventana {
  const dias = DIAS_PERIODO[periodo];
  const hoy = fechaLima(ahora);
  const desde = sumarDias(hoy, -(dias - 1));
  return { periodo, dias, actual: tramo(desde, hoy), anterior: tramo(sumarDias(desde, -dias), sumarDias(desde, -1)) };
}

/** Los días `AAAA-MM-DD` de un tramo, en orden. */
export function diasDe(t: Pick<Tramo, 'desde' | 'hasta'>): string[] {
  const r: string[] = [];
  for (let d = t.desde; d <= t.hasta; d = sumarDias(d, 1)) r.push(d);
  return r;
}

/** Variación porcentual con un decimal; null si el período anterior fue 0 (no hay contra qué comparar). */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

export interface Indicador { actual: number; anterior: number; variacion: number | null }
export const indicador = (actual: number, anterior: number): Indicador => ({ actual, anterior, variacion: variacion(actual, anterior) });

export interface OrigenResumen { origen: OrigenLead; etiqueta: string; leads: number; porcentaje: number }

/**
 * Reparto de los leads por origen (CP-138): todos los orígenes del catálogo, de más a menos leads (empates en el orden
 * del catálogo). Los porcentajes son enteros por el método del mayor resto y suman 100 (0 en todos si no hay leads).
 * Un origen fuera del catálogo no se cuenta.
 */
export function repartoOrigen(conteos: Partial<Record<string, number>>): OrigenResumen[] {
  const filas = ORIGENES_LEAD.map((origen, i) => ({ origen, i, leads: Math.max(0, Math.trunc(conteos[origen] ?? 0)) }));
  const total = filas.reduce((s, f) => s + f.leads, 0);
  const pct = new Map<OrigenLead, number>(filas.map((f) => [f.origen, 0]));
  if (total > 0) {
    const exactos = filas.map((f) => ({ ...f, base: Math.floor((f.leads * 100) / total), resto: (f.leads * 100) % total }));
    let faltan = 100 - exactos.reduce((s, f) => s + f.base, 0);
    exactos.forEach((f) => pct.set(f.origen, f.base));
    for (const f of [...exactos].sort((a, b) => b.resto - a.resto || b.leads - a.leads || a.i - b.i)) {
      if (faltan <= 0) break;
      if (f.resto === 0) continue;
      pct.set(f.origen, pct.get(f.origen)! + 1);
      faltan--;
    }
  }
  return [...filas]
    .sort((a, b) => b.leads - a.leads || a.i - b.i)
    .map((f) => ({ origen: f.origen, etiqueta: ETIQUETA_ORIGEN[f.origen], leads: f.leads, porcentaje: pct.get(f.origen)! }));
}

export interface PaginaConversion { ruta: string; visitas: number; leads: number; conversion: number }

/**
 * Las páginas con más conversiones: leads con esa página de entrada entre las visitas que empezaron en ella, en % con
 * un decimal. Solo las que tienen visitas y al menos un lead; de mayor a menor conversión, luego más leads, más visitas
 * y la ruta. Hasta `tope`.
 */
export function conversionPaginas(visitas: ReadonlyMap<string, number> | Record<string, number>, leads: ReadonlyMap<string, number> | Record<string, number>, tope = TOPE_PAGINAS_RESUMEN): PaginaConversion[] {
  const v = visitas instanceof Map ? visitas : new Map(Object.entries(visitas));
  const l = leads instanceof Map ? leads : new Map(Object.entries(leads));
  const r: PaginaConversion[] = [];
  for (const [ruta, n] of l) {
    const vis = v.get(ruta) ?? 0;
    if (n > 0 && vis > 0) r.push({ ruta, visitas: vis, leads: n, conversion: Math.round((n / vis) * 1000) / 10 });
  }
  return r.sort((a, b) => b.conversion - a.conversion || b.leads - a.leads || b.visitas - a.visitas || a.ruta.localeCompare(b.ruta)).slice(0, tope);
}

export interface DiaResumen { dia: string; visitas: number; leads: number; demos: number }

/** La serie diaria del tramo, con 0 en los días sin datos. */
export function serieDiaria(t: Pick<Tramo, 'desde' | 'hasta'>, datos: { visitas?: Record<string, number>; leads?: Record<string, number>; demos?: Record<string, number> }): DiaResumen[] {
  return diasDe(t).map((dia) => ({ dia, visitas: datos.visitas?.[dia] ?? 0, leads: datos.leads?.[dia] ?? 0, demos: datos.demos?.[dia] ?? 0 }));
}

/** Cuenta por día de Lima los instantes de una lista. */
export function contarPorDia(instantes: readonly (Date | string)[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const x of instantes) {
    const d = fechaLima(typeof x === 'string' ? new Date(x) : x);
    r[d] = (r[d] ?? 0) + 1;
  }
  return r;
}

/** `POST /s/_visita`: la vista de una página, sin datos personales. */
export interface VisitaSitio { ruta: string; idioma: 'es' | 'en'; primeraPagina: boolean; origen: string | null }
export const LIMITES_VISITA = { ruta: 300, origen: 60 } as const;

/**
 * Valida el cuerpo de `POST /s/_visita`. La ruta se normaliza como la página de entrada de un lead (sin consulta, ancla
 * ni barra final; quita la base `/s`), así las visitas y los leads se cruzan por la misma ruta. `origen` es opcional:
 * un origen del catálogo o un `utm_source` corto en texto plano; si no vale, queda null. Devuelve null si no es válida.
 */
export function validarVisita(v: unknown, base = ''): VisitaSitio | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.ruta !== 'string' || o.ruta.length > LIMITES_VISITA.ruta) return null;
  const ruta = normalizarPagina(o.ruta, base);
  if (!ruta || ruta.startsWith('/_')) return null;
  const idioma = o.idioma === 'en' ? 'en' : o.idioma === 'es' || o.idioma === undefined ? 'es' : null;
  if (!idioma || typeof o.primeraPagina !== 'boolean') return null;
  const origen = typeof o.origen === 'string' && (esOrigenLead(o.origen) || /^[\w.-]{1,60}$/.test(o.origen)) ? o.origen : null;
  return { ruta, idioma, primeraPagina: o.primeraPagina, origen };
}

/** Bots, rastreadores, vistas previas de enlaces y medidores (Lighthouse): no cuentan como visitas. Sin agente, tampoco. */
const BOTS = /bot\b|bot\/|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl\/|wget\/|python-|go-http|node-fetch|axios|java\//i;
export function esBot(agente: string | null | undefined): boolean {
  return !agente || agente.trim().length < 10 || BOTS.test(agente);
}
