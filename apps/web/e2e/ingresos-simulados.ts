// HU-1710 · Panel de ingresos simulado con las mismas reglas que la API (`panelIngresos` de @aptio/schema/ingresos).
import { normalizarMes, panelIngresos, type SuscripcionIngreso } from '@aptio/schema/ingresos';

/** Una suscripción simulada, con las fechas en ISO. */
export type SuscripcionIngresoSim = Omit<SuscripcionIngreso, 'canceladaEn' | 'creadoEn'> & { canceladaEn?: string | null; creadoEn?: string };
export interface IngresosSitioSim {
  suscripciones: SuscripcionIngresoSim[];
  /** El momento de la consulta (por defecto, ahora). */
  ahora?: string;
}

export function panelIngresosSim(d: IngresosSitioSim | undefined, q: URLSearchParams): { status: number; body: unknown } {
  const ahora = d?.ahora ? new Date(d.ahora) : new Date();
  const mes = normalizarMes(q.get('mes') ?? undefined, ahora);
  if (!mes) return { status: 422, body: { codigo: 'NO_VALIDO', mensaje: 'El mes va como AAAA-MM', detalles: [{ campo: 'mes', mensaje: 'El mes va como AAAA-MM' }] } };
  const filas: SuscripcionIngreso[] = (d?.suscripciones ?? []).map((s) => ({ ...s, canceladaEn: s.canceladaEn ? new Date(s.canceladaEn) : null, creadoEn: new Date(s.creadoEn ?? '2026-01-10T15:00:00Z') }));
  const p = panelIngresos(filas, mes, ahora);
  const dto = (r: typeof p.actual) => ({ ...r, inicio: r.inicio.toISOString(), corte: r.corte.toISOString() });
  return { status: 200, body: { actual: dto(p.actual), anterior: dto(p.anterior), variacionCancelacion: p.variacionCancelacion } };
}
