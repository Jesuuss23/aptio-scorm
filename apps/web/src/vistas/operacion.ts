// HU-1403 · Formatos de Empresa › Operación: tamaño de una copia, duración y fecha de Lima.
import type { EstadoRespaldo } from '@aptio/schema/operacion';

/** 1 234 567 → «1.2 MB» (base 1024). */
export function bytes(n: number | null): string {
  if (n === null) return '—';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toLocaleString('es-PE', { maximumFractionDigits: 1 })} ${unidades[i]}`;
}

/** 950 → «950 ms», 65 000 → «1 min 5 s», 3 725 000 → «1 h 2 min». */
export function duracion(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
}

export const fechaLima = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });

export const ESTADO_RESPALDO: Record<EstadoRespaldo, { texto: string; chip: string }> = {
  EN_CURSO: { texto: 'En curso', chip: 'aviso' },
  EXITOSO: { texto: 'Exitosa', chip: 'validado' },
  FALLIDO: { texto: 'Fallida', chip: 'error' },
  EXPIRADO: { texto: 'Expirada', chip: '' },
};
