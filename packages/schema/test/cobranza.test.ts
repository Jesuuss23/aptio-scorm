// HU-1708 · Calendario de cobranza (RN-18-8, CP-150), monto de renovación y período siguiente.
import { describe, expect, it } from 'vitest';
import { cobroPruebaAprueba, diaDeCobranza, fechaDelPaso, montoRenovacion, periodoAlPagar, periodoRenovado, siguientePaso } from '../src/cobranza.js';

const FIN = new Date('2026-12-10T15:00:00Z');
const dia = (n: number, horas = 0) => new Date(FIN.getTime() + n * 86_400_000 + horas * 3_600_000);

describe('calendario de cobranza', () => {
  it('intenta los días 0, 1, 3 y 7 y suspende el día 10', () => {
    expect([0, 1, 2, 3, 4].map((n) => fechaDelPaso(FIN, n).toISOString())).toEqual([dia(0), dia(1), dia(3), dia(7), dia(10)].map((d) => d.toISOString()));
  });
  it('dice qué toca según los intentos hechos y la fecha', () => {
    expect(siguientePaso(FIN, 0, dia(0, -1))).toEqual({ tipo: 'esperar', hasta: dia(0) });
    expect(siguientePaso(FIN, 0, dia(0))).toEqual({ tipo: 'intento', numero: 0 });
    expect(siguientePaso(FIN, 1, dia(0, 12))).toEqual({ tipo: 'esperar', hasta: dia(1) });
    expect(siguientePaso(FIN, 1, dia(1))).toEqual({ tipo: 'intento', numero: 1 });
    expect(siguientePaso(FIN, 2, dia(3))).toEqual({ tipo: 'intento', numero: 2 });
    expect(siguientePaso(FIN, 3, dia(7))).toEqual({ tipo: 'intento', numero: 3 });
    expect(siguientePaso(FIN, 4, dia(9, 23))).toEqual({ tipo: 'esperar', hasta: dia(10) });
    expect(siguientePaso(FIN, 4, dia(10))).toEqual({ tipo: 'suspender' });
    // Atrasado (el worker estuvo detenido): un paso por vez.
    expect(siguientePaso(FIN, 1, dia(12))).toEqual({ tipo: 'intento', numero: 1 });
    expect(diaDeCobranza(FIN, dia(3, 5))).toBe(3);
  });
});

describe('monto y período de la renovación', () => {
  const s = { planId: 'productora', precioPactadoSinIgv: 1290, moneda: 'PEN' as const };
  it('renueva al precio pactado más IGV, o al publicado del plan de la bajada programada', () => {
    expect(montoRenovacion(s, null)).toEqual({ planId: 'productora', montoSinIgv: 1290, igv: 232.2, total: 1522.2, moneda: 'PEN' });
    expect(montoRenovacion(s, { id: 'inicial', precioCiclo: 490 })).toEqual({ planId: 'inicial', montoSinIgv: 490, igv: 88.2, total: 578.2, moneda: 'PEN' });
    // El plan de la bajada ya no se cobra en ese ciclo: se mantiene el pactado.
    expect(montoRenovacion(s, { id: 'inicial', precioCiclo: null })).toMatchObject({ planId: 'productora', total: 1522.2 });
  });
  it('ancla el período al fin del anterior; ya suspendida, empieza el día del pago', () => {
    const r = periodoRenovado(FIN, 'MENSUAL');
    expect(r.fin.toISOString()).toBe('2027-01-10T15:00:00.000Z');
    expect(periodoAlPagar(r, 'MENSUAL', false, dia(5))).toBe(r);
    const tarde = periodoAlPagar(r, 'MENSUAL', true, dia(12));
    expect([tarde.inicio.toISOString(), tarde.fin.toISOString()]).toEqual(['2026-12-22T15:00:00.000Z', '2027-01-22T15:00:00.000Z']);
    expect(periodoRenovado(FIN, 'ANUAL').fin.toISOString()).toBe('2027-12-10T15:00:00.000Z');
  });
  it('la tarjeta de prueba 0002 rechaza el cobro automático', () => {
    expect(cobroPruebaAprueba('1111')).toBe(true);
    expect(cobroPruebaAprueba(null)).toBe(true);
    expect(cobroPruebaAprueba('0002')).toBe(false);
  });
});
