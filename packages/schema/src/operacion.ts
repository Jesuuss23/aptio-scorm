// HU-1403 · Empresa › Operación (M15, observabilidad mínima): errores por proveedor en 24 h y en 7 días de Lima, colas
// pendientes, tiempo y costo por etapa y las copias de seguridad. Lo comparten la API y la web.
import { esLimiteGasto } from './conexiones.js';
import { type Etapa, ETAPAS, NOMBRE_ETAPA } from './generacion.js';

const DESFASE_LIMA_MS = 5 * 3600_000;
const DIA_MS = 24 * 3600_000;

/** Días que se miran el tiempo y el costo por etapa. */
export const DIAS_ETAPAS = 30;
/** Días que se guardan las copias de seguridad. */
export const RETENCION_RESPALDOS_DIAS = 14;

/** Inicio (incluido) del día de Lima que está `dias` días antes del de `ahora`, en UTC. */
export function inicioDiaLima(ahora: Date, diasAtras = 0): Date {
  const lima = new Date(ahora.getTime() - DESFASE_LIMA_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() - diasAtras) + DESFASE_LIMA_MS);
}

/** Las dos ventanas de errores: las últimas 24 horas y los últimos 7 días de Lima (hoy y los 6 anteriores). */
export function ventanasErrores(ahora: Date): { desde24h: Date; desde7d: Date } {
  return { desde24h: new Date(ahora.getTime() - DIA_MS), desde7d: inicioDiaLima(ahora, 6) };
}

/** Un trabajo de IA de los últimos 7 días (TrabajoIA). */
export interface TrabajoObservado {
  id: string;
  proveedor: string;
  estado: string;
  error: string | null;
  creadoEn: Date;
}

/** Un trabajo fallido de BullMQ que no dejó TrabajoIA (paquete, boca, extracción…). */
export interface FalloCola {
  cola: string;
  error: string;
  en: Date;
}

export interface ErroresProveedor {
  /** `anthropic`, `google`… o `cola:export` para lo que falló en la plataforma sin proveedor. */
  proveedor: string;
  errores24h: number;
  errores7d: number;
  trabajos7d: number;
  /** Detenidos por el límite de gasto en 7 días: no son errores del proveedor (CP-100). */
  detenidosPorLimite7d: number;
  ultimoError: { mensaje: string; en: string } | null;
}

/** Agrupa por proveedor. Los detenidos por LIMITE_GASTO se cuentan aparte; los que no llamaron a nadie («-») van a «sin proveedor». */
export function agruparErrores(trabajos: TrabajoObservado[], fallos: FalloCola[], ahora: Date): ErroresProveedor[] {
  const { desde24h, desde7d } = ventanasErrores(ahora);
  const filas = new Map<string, ErroresProveedor & { ultimo?: Date }>();
  const fila = (proveedor: string) => {
    let f = filas.get(proveedor);
    if (!f) {
      f = { proveedor, errores24h: 0, errores7d: 0, trabajos7d: 0, detenidosPorLimite7d: 0, ultimoError: null };
      filas.set(proveedor, f);
    }
    return f;
  };
  const error = (f: ErroresProveedor & { ultimo?: Date }, mensaje: string, en: Date) => {
    f.errores7d++;
    if (en >= desde24h) f.errores24h++;
    if (!f.ultimo || en > f.ultimo) {
      f.ultimo = en;
      f.ultimoError = { mensaje: mensaje.slice(0, 300), en: en.toISOString() };
    }
  };
  for (const t of trabajos) {
    if (t.creadoEn < desde7d || t.creadoEn > ahora) continue;
    const f = fila(t.proveedor === '-' ? 'sin-proveedor' : t.proveedor);
    f.trabajos7d++;
    if (t.estado !== 'ERROR') continue;
    if (esLimiteGasto(t.error)) f.detenidosPorLimite7d++;
    else error(f, t.error ?? 'Error sin detalle', t.creadoEn);
  }
  for (const x of fallos) {
    if (x.en < desde7d || x.en > ahora) continue;
    const f = fila(`cola:${x.cola}`);
    f.trabajos7d++;
    error(f, x.error, x.en);
  }
  return [...filas.values()]
    .map(({ ultimo: _u, ...f }) => f)
    .sort((a, b) => b.errores7d - a.errores7d || b.errores24h - a.errores24h || a.proveedor.localeCompare(b.proveedor));
}

export interface EtapaObservada {
  etapa: string;
  estado: string;
  inicio: Date | null;
  fin: Date | null;
  costoUsd: number;
}

export interface ResumenEtapa {
  etapa: Etapa;
  nombre: string;
  /** Ejecuciones completadas en la ventana. */
  ejecuciones: number;
  duracionPromedioMs: number | null;
  costoPromedioUsd: number;
  costoTotalUsd: number;
}

/** Tiempo y costo promedio de cada una de las 11 etapas, solo con las que terminaron bien y tienen inicio y fin. */
export function resumirEtapas(etapas: EtapaObservada[]): ResumenEtapa[] {
  const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
  return ETAPAS.map((etapa) => {
    const hechas = etapas.filter((e) => e.etapa === etapa && e.estado === 'COMPLETADO');
    const tiempos = hechas.filter((e) => e.inicio && e.fin).map((e) => e.fin!.getTime() - e.inicio!.getTime());
    const total = hechas.reduce((n, e) => n + e.costoUsd, 0);
    return {
      etapa, nombre: NOMBRE_ETAPA[etapa], ejecuciones: hechas.length,
      duracionPromedioMs: tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null,
      costoPromedioUsd: hechas.length ? r4(total / hechas.length) : 0, costoTotalUsd: r4(total),
    };
  });
}

export interface EstadoCola {
  nombre: string;
  /** En espera, con demora o con prioridad: aún no empiezan. */
  pendientes: number;
  activos: number;
  fallidos: number;
}

export type EstadoRespaldo = 'EN_CURSO' | 'EXITOSO' | 'FALLIDO' | 'EXPIRADO';
export interface RespaldoResumen {
  id: string;
  fecha: string;
  estado: EstadoRespaldo;
  origen: 'programado' | 'manual';
  tamanoBytes: number | null;
  duracionMs: number | null;
  objetos: number | null;
  error: string | null;
}

export interface Operacion {
  generadoEn: string;
  errores: { desde24h: string; desde7d: string; porProveedor: ErroresProveedor[] };
  /** null si Redis no respondió a tiempo. */
  colas: EstadoCola[] | null;
  etapas: { desde: string; porEtapa: ResumenEtapa[] };
  respaldos: { retencionDias: number; ultimoExitoso: string | null; enCurso: boolean; lista: RespaldoResumen[] };
}

/** Nombre legible de la fila de un proveedor. */
export function nombreProveedor(proveedor: string): string {
  const conocidos: Record<string, string> = {
    anthropic: 'Claude (Anthropic)', google: 'Google', elevenlabs: 'ElevenLabs', azure: 'Azure', rhubarb: 'Rhubarb', simulado: 'Modo simulado',
    'sin-proveedor': 'Sin llamar a un proveedor',
  };
  if (proveedor.startsWith('cola:')) return `Plataforma (cola ${proveedor.slice(5)})`;
  return conocidos[proveedor] ?? proveedor;
}
