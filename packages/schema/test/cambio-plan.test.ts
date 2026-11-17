import { describe, expect, it } from 'vitest';
import { diasDelPeriodo, prorrateo, validarCambio } from '../src/cambio-plan.js';

const d = (s: string) => new Date(s);

describe('días del período', () => {
  it('un mes de 30 días a la mitad', () => {
    expect(diasDelPeriodo(d('2026-11-01T15:00:00Z'), d('2026-12-01T15:00:00Z'), d('2026-11-16T15:00:00Z'))).toEqual({ diasPeriodo: 30, diasRestantes: 15 });
  });
  it('meses de 28, 29 y 31 días', () => {
    expect(diasDelPeriodo(d('2027-02-01T00:00:00Z'), d('2027-03-01T00:00:00Z'), d('2027-02-15T00:00:00Z'))).toEqual({ diasPeriodo: 28, diasRestantes: 14 });
    expect(diasDelPeriodo(d('2028-02-01T00:00:00Z'), d('2028-03-01T00:00:00Z'), d('2028-02-15T00:00:00Z'))).toEqual({ diasPeriodo: 29, diasRestantes: 15 });
    expect(diasDelPeriodo(d('2026-12-01T00:00:00Z'), d('2027-01-01T00:00:00Z'), d('2026-12-11T00:00:00Z'))).toEqual({ diasPeriodo: 31, diasRestantes: 21 });
  });
  it('un día empezado cuenta como restante; al vencer, 0', () => {
    const ini = d('2026-11-01T15:00:00Z'); const fin = d('2026-12-01T15:00:00Z');
    expect(diasDelPeriodo(ini, fin, d('2026-12-01T10:00:00Z')).diasRestantes).toBe(1);
    expect(diasDelPeriodo(ini, fin, d('2026-12-02T00:00:00Z')).diasRestantes).toBe(0);
    expect(diasDelPeriodo(ini, fin, d('2026-10-01T00:00:00Z')).diasRestantes).toBe(30);
  });
  it('un año de 365 días', () => {
    expect(diasDelPeriodo(d('2026-11-17T00:00:00Z'), d('2027-11-17T00:00:00Z'), d('2027-05-17T00:00:00Z'))).toEqual({ diasPeriodo: 365, diasRestantes: 184 });
  });
});

describe('prorrateo al céntimo', () => {
  it('CP-147 · de Inicial (S/ 490) a Productora (S/ 1 290) con 15 de 30 días: S/ 400,00 + 72,00 = S/ 472,00', () => {
    expect(prorrateo(490, 1290, 15, 30, 'PEN')).toEqual({ diasPeriodo: 30, diasRestantes: 15, diferenciaSinIgv: 400, igv: 72, total: 472, moneda: 'PEN' });
  });
  it('redondea al céntimo con divisiones no exactas', () => {
    expect(prorrateo(490, 1290, 10, 31, 'PEN')).toMatchObject({ diferenciaSinIgv: 258.06, igv: 46.45, total: 304.51 });
    expect(prorrateo(490, 1290, 1, 28, 'PEN')).toMatchObject({ diferenciaSinIgv: 28.57, igv: 5.14, total: 33.71 });
    expect(prorrateo(490, 1290, 30, 30, 'PEN')).toMatchObject({ diferenciaSinIgv: 800, igv: 144, total: 944 });
  });
  it('anual y en dólares', () => {
    expect(prorrateo(4704, 12384, 184, 365, 'PEN')).toMatchObject({ diferenciaSinIgv: 3871.56, igv: 696.88, total: 4568.44 });
    expect(prorrateo(129, 349, 15, 30, 'USD')).toMatchObject({ diferenciaSinIgv: 110, igv: 19.8, total: 129.8, moneda: 'USD' });
  });
  it('una bajada o sin días no cobra', () => {
    expect(prorrateo(1290, 490, 15, 30, 'PEN')).toMatchObject({ diferenciaSinIgv: 0, igv: 0, total: 0 });
    expect(prorrateo(490, 1290, 0, 30, 'PEN')).toMatchObject({ diferenciaSinIgv: 0, total: 0 });
  });
});

describe('validar el cambio', () => {
  const s = { planId: 'inicial', ciclo: 'MENSUAL' as const, moneda: 'PEN' as const, precioPactadoSinIgv: 490, estado: 'ACTIVA', cancelarAlFin: false };
  const plan = (id: string, precioCiclo: number | null, extra = {}) => ({ id, visible: true, aMedida: false, precioCiclo, ...extra });
  it('subida y bajada', () => {
    expect(validarCambio(s, plan('productora', 1290))).toEqual({ ok: true, tipo: 'SUBIDA', precioNuevo: 1290 });
    expect(validarCambio({ ...s, planId: 'productora', precioPactadoSinIgv: 1290 }, plan('inicial', 490))).toEqual({ ok: true, tipo: 'BAJADA', precioNuevo: 490 });
  });
  it('rechaza: no publicado, el mismo, a medida, sin precio en ese ciclo o moneda, suscripción cancelada', () => {
    const campo = (r: ReturnType<typeof validarCambio>) => (r.ok ? null : r.errores[0]!.campo);
    expect(campo(validarCambio(s, null))).toBe('plan');
    expect(campo(validarCambio(s, plan('productora', 1290, { visible: false })))).toBe('plan');
    expect(campo(validarCambio(s, plan('inicial', 490)))).toBe('plan');
    expect(campo(validarCambio(s, plan('corporativo', null, { aMedida: true })))).toBe('plan');
    expect(validarCambio({ ...s, moneda: 'USD' }, plan('productora', null))).toEqual({ ok: false, errores: [{ campo: 'plan', mensaje: 'Ese plan no se cobra al mes en dólares' }] });
    expect(campo(validarCambio({ ...s, estado: 'CANCELADA' }, plan('productora', 1290)))).toBe('suscripcion');
  });
});
