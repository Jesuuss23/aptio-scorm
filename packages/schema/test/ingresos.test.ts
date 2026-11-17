import { describe, expect, it } from 'vitest';
import {
  ingresoMensual, limitesMes, mesAnterior, mesLima, mesSiguiente, normalizarMes, panelIngresos, resumenMes, type SuscripcionIngreso, vigenteEn,
} from '../src/ingresos.js';

const ahora = new Date('2026-11-17T20:00:00Z');
let n = 0;
const sus = (x: Partial<SuscripcionIngreso> = {}): SuscripcionIngreso => ({
  organizacionId: `org-${++n}`, estado: 'ACTIVA', ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, moneda: 'PEN', cancelarAlFin: false, canceladaEn: null,
  creadoEn: new Date('2026-09-01T15:00:00Z'), porcentajeDescuento: null, ciclosDescuentoRestantes: null, ...x,
});
const pen = (r: ReturnType<typeof resumenMes>) => r.monedas.find((m) => m.moneda === 'PEN')!;
const usd = (r: ReturnType<typeof resumenMes>) => r.monedas.find((m) => m.moneda === 'USD')!;

describe('HU-1710 · meses de Lima', () => {
  it('el mes empieza a las 00:00 de Lima (05:00 UTC) y el anterior y el siguiente cruzan el año', () => {
    expect(limitesMes('2026-11')).toEqual({ inicio: new Date('2026-11-01T05:00:00.000Z'), fin: new Date('2026-12-01T05:00:00.000Z') });
    expect(mesLima(new Date('2026-12-01T04:59:59.999Z'))).toBe('2026-11');
    expect(mesLima(new Date('2026-12-01T05:00:00.000Z'))).toBe('2026-12');
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesSiguiente('2026-12')).toBe('2027-01');
    expect(normalizarMes(undefined, ahora)).toBe('2026-11');
    expect(normalizarMes('2026-10', ahora)).toBe('2026-10');
    for (const malo of ['2026-13', '2026-1', '26-11', 'noviembre', 202611]) expect(normalizarMes(malo, ahora)).toBeNull();
    expect(() => limitesMes('2026-00')).toThrow(RangeError);
  });

  it('una cancelación a las 23:59 de Lima del 31 de octubre cuenta en octubre, no en noviembre', () => {
    const s = [sus({ estado: 'CANCELADA', canceladaEn: new Date('2026-11-01T04:59:00Z') }), sus()];
    expect(resumenMes(s, '2026-10', ahora).canceladas).toBe(1);
    expect(resumenMes(s, '2026-11', ahora).canceladas).toBe(0);
    expect(resumenMes(s, '2026-11', ahora).vigentesAlInicio).toBe(1);
  });
});

describe('HU-1710 · ingreso mensual recurrente (CP-152)', () => {
  it('el anual cuenta entre 12 al céntimo', () => {
    expect(ingresoMensual({ ciclo: 'ANUAL', precioPactadoSinIgv: 12384, porcentajeDescuento: null, ciclosDescuentoRestantes: null })).toBe(1032);
    expect(ingresoMensual({ ciclo: 'ANUAL', precioPactadoSinIgv: 1000, porcentajeDescuento: null, ciclosDescuentoRestantes: null })).toBe(83.33);
    expect(ingresoMensual({ ciclo: 'MENSUAL', precioPactadoSinIgv: 490, porcentajeDescuento: null, ciclosDescuentoRestantes: null })).toBe(490);
  });

  it('resta el cupón vigente (con renovaciones pendientes o permanente) y no el ya agotado', () => {
    expect(ingresoMensual({ ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, porcentajeDescuento: 20, ciclosDescuentoRestantes: 2 })).toBe(1032);
    expect(ingresoMensual({ ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, porcentajeDescuento: 15, ciclosDescuentoRestantes: null })).toBe(1096.5);
    expect(ingresoMensual({ ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, porcentajeDescuento: 20, ciclosDescuentoRestantes: 0 })).toBe(1290);
    expect(ingresoMensual({ ciclo: 'ANUAL', precioPactadoSinIgv: 1000, porcentajeDescuento: 10, ciclosDescuentoRestantes: 1 })).toBe(75);
  });

  it('S/ 13,834 al mes con ACTIVA y PAGO_PENDIENTE; excluye la CANCELADA y la SUSPENDIDA; dólares aparte', () => {
    const s = [
      sus({ precioPactadoSinIgv: 490 }),
      sus({ precioPactadoSinIgv: 1290 }),
      sus({ precioPactadoSinIgv: 1290, estado: 'PAGO_PENDIENTE' }),
      sus({ precioPactadoSinIgv: 2990 }),
      sus({ precioPactadoSinIgv: 2990, cancelarAlFin: true }),
      sus({ ciclo: 'ANUAL', precioPactadoSinIgv: 28704 }),
      sus({ ciclo: 'ANUAL', precioPactadoSinIgv: 28704 }),
      sus({ precioPactadoSinIgv: 2990, estado: 'CANCELADA', canceladaEn: new Date('2026-11-10T15:00:00Z') }),
      sus({ precioPactadoSinIgv: 1290, estado: 'SUSPENDIDA' }),
      sus({ precioPactadoSinIgv: 349, moneda: 'USD' }),
    ];
    const r = resumenMes(s, '2026-11', ahora);
    expect(pen(r)).toEqual({ moneda: 'PEN', mrr: 13834, enRiesgo: 2990, activas: 7, arpu: 1976.29 });
    expect(usd(r)).toEqual({ moneda: 'USD', mrr: 349, enRiesgo: 0, activas: 1, arpu: 349 });
    expect(r.activas).toBe(8);
    expect(r.corte).toEqual(ahora);
    // Al empezar noviembre estaban vigentes 9 (la cancelada sí; la suspendida no): 1 de 9 = 11.1 %.
    expect(r).toMatchObject({ vigentesAlInicio: 9, canceladas: 1, tasaCancelacion: 11.1 });
  });

  it('sin suscripciones todo es 0, sin dividir entre 0', () => {
    const p = panelIngresos([], '2026-11', ahora);
    expect(p.actual.monedas).toEqual([{ moneda: 'PEN', mrr: 0, enRiesgo: 0, activas: 0, arpu: 0 }, { moneda: 'USD', mrr: 0, enRiesgo: 0, activas: 0, arpu: 0 }]);
    expect(p.actual.tasaCancelacion).toBe(0);
    expect(p.variacionCancelacion).toBe(0);
  });

  it('el ARPU cuenta organizaciones y una creada después del corte no entra', () => {
    const s = [sus({ organizacionId: 'a', precioPactadoSinIgv: 1000 }), sus({ organizacionId: 'a', precioPactadoSinIgv: 500 }), sus({ creadoEn: new Date('2026-11-20T15:00:00Z') })];
    expect(pen(resumenMes(s, '2026-11', ahora))).toMatchObject({ mrr: 1500, activas: 2, arpu: 1500 });
    expect(vigenteEn(s[2]!, ahora)).toBe(false);
  });
});

describe('HU-1710 · cancelación mensual', () => {
  it('compara con el mes anterior en puntos', () => {
    const s = [
      ...Array.from({ length: 8 }, () => sus()),
      sus({ estado: 'CANCELADA', canceladaEn: new Date('2026-10-15T15:00:00Z') }),
      sus({ estado: 'CANCELADA', canceladaEn: new Date('2026-10-20T15:00:00Z') }),
      sus({ estado: 'CANCELADA', canceladaEn: new Date('2026-11-05T15:00:00Z') }),
    ];
    const p = panelIngresos(s, '2026-11', ahora);
    // Octubre: 2 de 11 = 18.2 %. Noviembre: 1 de 9 = 11.1 %.
    expect(p.anterior).toMatchObject({ mes: '2026-10', vigentesAlInicio: 11, canceladas: 2, tasaCancelacion: 18.2 });
    expect(p.actual).toMatchObject({ mes: '2026-11', vigentesAlInicio: 9, canceladas: 1, tasaCancelacion: 11.1 });
    expect(p.variacionCancelacion).toBe(-7.1);
    // En el mes anterior, la cancelada en noviembre todavía cuenta en el MRR al corte de octubre.
    expect(pen(p.anterior).activas).toBe(9);
    expect(pen(p.anterior).mrr).toBe(11610);
  });
});
