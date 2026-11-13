// HU-1403 · Observabilidad: ventanas de 24 h y de 7 días de Lima, errores por proveedor (LIMITE_GASTO aparte, fallos de
// cola sin proveedor) y tiempo y costo promedio por etapa.
import { describe, expect, it } from 'vitest';
import { agruparErrores, inicioDiaLima, nombreProveedor, resumirEtapas, ventanasErrores } from '../src/operacion.js';

// Viernes 13 de noviembre de 2026, 01:00 en Lima.
const AHORA = new Date('2026-11-13T06:00:00Z');
const t = (id: string, proveedor: string, estado: string, creadoEn: string, error: string | null = null) => ({ id, proveedor, estado, error, creadoEn: new Date(creadoEn) });

describe('ventanas', () => {
  it('24 h hacia atrás y 7 días de Lima desde las 00:00 de hace 6 días', () => {
    const v = ventanasErrores(AHORA);
    expect(v.desde24h.toISOString()).toBe('2026-11-12T06:00:00.000Z');
    expect(v.desde7d.toISOString()).toBe('2026-11-07T05:00:00.000Z');
    // A las 23:30 de Lima el día sigue siendo el mismo.
    expect(inicioDiaLima(new Date('2026-11-14T04:30:00Z')).toISOString()).toBe('2026-11-13T05:00:00.000Z');
  });
});

describe('errores por proveedor', () => {
  it('cuenta 24 h y 7 d, separa LIMITE_GASTO y suma los fallos de cola sin proveedor', () => {
    const filas = agruparErrores([
      t('1', 'anthropic', 'ERROR', '2026-11-13T05:00:00Z', 'Salida no válida tras 3 intentos'),
      t('2', 'anthropic', 'ERROR', '2026-11-10T10:00:00Z', '429 rate limit'),
      t('3', 'anthropic', 'COMPLETADO', '2026-11-12T10:00:00Z'),
      t('4', 'anthropic', 'ERROR', '2026-11-12T10:00:00Z', 'LIMITE_GASTO: la tarea «Voz» llegó a su límite'),
      // Fuera de los 7 días de Lima (06/11 23:59 en Lima).
      t('5', 'anthropic', 'ERROR', '2026-11-07T04:59:00Z', 'viejo'),
      t('6', 'google', 'COMPLETADO', '2026-11-12T10:00:00Z'),
      t('7', '-', 'ERROR', '2026-11-12T08:00:00Z', 'LIMITE_GASTO: tope'),
    ], [{ cola: 'export', error: 'ENOSPC', en: new Date('2026-11-13T01:00:00Z') }], AHORA);
    expect(filas).toEqual([
      { proveedor: 'anthropic', errores24h: 1, errores7d: 2, trabajos7d: 4, detenidosPorLimite7d: 1, ultimoError: { mensaje: 'Salida no válida tras 3 intentos', en: '2026-11-13T05:00:00.000Z' } },
      { proveedor: 'cola:export', errores24h: 1, errores7d: 1, trabajos7d: 1, detenidosPorLimite7d: 0, ultimoError: { mensaje: 'ENOSPC', en: '2026-11-13T01:00:00.000Z' } },
      { proveedor: 'google', errores24h: 0, errores7d: 0, trabajos7d: 1, detenidosPorLimite7d: 0, ultimoError: null },
      { proveedor: 'sin-proveedor', errores24h: 0, errores7d: 0, trabajos7d: 1, detenidosPorLimite7d: 1, ultimoError: null },
    ]);
    expect(nombreProveedor('cola:export')).toBe('Plataforma (cola export)');
    expect(nombreProveedor('anthropic')).toBe('Claude (Anthropic)');
  });
});

describe('tiempo y costo por etapa', () => {
  it('promedia solo las completadas con inicio y fin, y devuelve las 11 etapas', () => {
    const e = (etapa: string, estado: string, seg: number | null, costoUsd: number) => ({
      etapa, estado, costoUsd, inicio: seg === null ? null : new Date('2026-11-12T10:00:00Z'), fin: seg === null ? null : new Date(Date.parse('2026-11-12T10:00:00Z') + seg * 1000),
    });
    const r = resumirEtapas([
      e('RESUMEN_MATERIAL', 'COMPLETADO', 60, 0.3), e('RESUMEN_MATERIAL', 'COMPLETADO', 120, 0.5),
      e('RESUMEN_MATERIAL', 'ERROR', 999, 1), e('VOZ_ES', 'COMPLETADO', null, 1.2),
    ]);
    expect(r).toHaveLength(11);
    expect(r[0]).toEqual({ etapa: 'RESUMEN_MATERIAL', nombre: 'Leer y resumir el material', ejecuciones: 2, duracionPromedioMs: 90_000, costoPromedioUsd: 0.4, costoTotalUsd: 0.8 });
    expect(r.find((x) => x.etapa === 'VOZ_ES')).toMatchObject({ ejecuciones: 1, duracionPromedioMs: null, costoPromedioUsd: 1.2 });
    expect(r.find((x) => x.etapa === 'PAQUETE')).toMatchObject({ ejecuciones: 0, duracionPromedioMs: null, costoPromedioUsd: 0 });
  });
});
