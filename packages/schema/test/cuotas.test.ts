// HU-1705 · Cuotas de cápsulas: ventanas mensuales (también en planes anuales), lo disponible y el precio con IGV.
import { describe, expect, it } from 'vitest';
import { calcularCuota, origenDelConsumo, precioAdicionales, precioUnitarioAdicional, validarCantidadAdicionales, ventanaMensual } from '../src/cuotas.js';

const d = (s: string) => new Date(s);

describe('ventanaMensual', () => {
  it('un plan mensual: la ventana es el mes del período', () => {
    expect(ventanaMensual(d('2026-11-10T15:00:00Z'), d('2026-11-17T12:00:00Z'))).toEqual({ inicio: d('2026-11-10T15:00:00Z'), fin: d('2026-12-10T15:00:00Z') });
  });
  it('un plan anual se cuenta por meses desde su inicio', () => {
    const v = ventanaMensual(d('2026-03-05T00:00:00Z'), d('2026-11-17T00:00:00Z'));
    expect(v).toEqual({ inicio: d('2026-11-05T00:00:00Z'), fin: d('2026-12-05T00:00:00Z') });
  });
  it('el borde exacto abre la ventana siguiente', () => {
    expect(ventanaMensual(d('2026-01-15T00:00:00Z'), d('2026-02-15T00:00:00Z')).inicio).toEqual(d('2026-02-15T00:00:00Z'));
    expect(ventanaMensual(d('2026-01-15T00:00:00Z'), d('2026-02-14T23:59:59Z')).inicio).toEqual(d('2026-01-15T00:00:00Z'));
  });
  it('un inicio el 31 se ajusta en febrero y vuelve al 31 en marzo', () => {
    const a = d('2026-01-31T10:00:00Z');
    expect(ventanaMensual(a, d('2026-02-28T12:00:00Z'))).toEqual({ inicio: d('2026-02-28T10:00:00Z'), fin: d('2026-03-31T10:00:00Z') });
    expect(ventanaMensual(a, d('2026-02-27T12:00:00Z'))).toEqual({ inicio: d('2026-01-31T10:00:00Z'), fin: d('2026-02-28T10:00:00Z') });
  });
  it('antes del inicio, la primera ventana', () => {
    expect(ventanaMensual(d('2026-11-20T00:00:00Z'), d('2026-11-17T00:00:00Z')).inicio).toEqual(d('2026-11-20T00:00:00Z'));
  });
});

describe('calcularCuota', () => {
  it('CP-146 · 20 de 20 deja 0 disponibles; las adicionales suman', () => {
    expect(calcularCuota({ capsulasMes: 20, adicionales: 0, usadas: 20 })).toEqual({ ilimitada: false, incluidas: 20, adicionales: 0, usadas: 20, disponibles: 0 });
    expect(calcularCuota({ capsulasMes: 20, adicionales: 2, usadas: 21 }).disponibles).toBe(1);
    expect(calcularCuota({ capsulasMes: 5, adicionales: 0, usadas: 7 }).disponibles).toBe(0);
  });
  it('sin suscripción o a medida, sin límite', () => {
    expect(calcularCuota(null)).toMatchObject({ ilimitada: true, disponibles: null });
    expect(calcularCuota({ capsulasMes: null, adicionales: 0, usadas: 40 })).toMatchObject({ ilimitada: true, usadas: 40, disponibles: null });
  });
  it('las incluidas se gastan antes que las adicionales', () => {
    expect(origenDelConsumo(calcularCuota({ capsulasMes: 20, adicionales: 1, usadas: 19 }))).toBe('CUOTA');
    expect(origenDelConsumo(calcularCuota({ capsulasMes: 20, adicionales: 1, usadas: 20 }))).toBe('ADICIONAL');
    expect(origenDelConsumo(calcularCuota(null))).toBe('CUOTA');
  });
});

describe('adicionales', () => {
  it('de 1 a 10, enteros', () => {
    for (const ok of [1, 10]) expect(validarCantidadAdicionales(ok)).toEqual([]);
    for (const mal of [0, 11, 1.5, '2', null]) expect(validarCantidadAdicionales(mal)).toHaveLength(1);
  });
  it('precio con IGV de 18 % en soles', () => {
    expect(precioAdicionales(89, 1, 'PEN')).toEqual({ cantidad: 1, unitario: 89, subtotal: 89, igv: 16.02, total: 105.02, moneda: 'PEN' });
    expect(precioAdicionales(69, 3, 'PEN')).toMatchObject({ subtotal: 207, igv: 37.26, total: 244.26 });
  });
  it('unitario en la moneda de la suscripción; en dólares, en proporción al precio en USD', () => {
    const plan = { capsulaAdicional: 69, precioMes: 1290, precioMesUsd: 349 };
    expect(precioUnitarioAdicional(plan, 'PEN')).toBe(69);
    expect(precioUnitarioAdicional(plan, 'USD')).toBe(19);
    expect(precioUnitarioAdicional({ ...plan, precioMesUsd: null }, 'USD')).toBeNull();
    expect(precioUnitarioAdicional({ ...plan, capsulaAdicional: null }, 'PEN')).toBeNull();
    expect(precioUnitarioAdicional({ capsulaAdicional: 1, precioMes: 1000, precioMesUsd: 10 }, 'USD')).toBe(1);
  });
});
