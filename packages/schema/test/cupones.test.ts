import { describe, expect, it } from 'vitest';
import {
  aplicarCupon, beneficioDe, ciclosRestantesTrasAlta, correoDelConvenio, type CuponAplicable, descontar, descontarCiclo, diaLima, finDiaLima, inicioDiaLima, renuevaConDescuento, validarCupon,
} from '../src/cupones.js';
import type { ResumenCheckout } from '../src/suscripciones.js';

const resumen: ResumenCheckout = { plan: 'productora', nombrePlan: 'Productora', ciclo: 'MENSUAL', subtotal: 1290, igv: 232.2, total: 1522.2, moneda: 'PEN' };
const cupon = (x: Partial<CuponAplicable> = {}): CuponAplicable => ({
  codigo: 'LANZAMIENTO26', nombre: 'Lanzamiento', tipo: 'CAMPANA', porcentaje: 20, ciclosDescuento: 3, vigenciaDesde: inicioDiaLima('2026-11-01'), vigenciaHasta: finDiaLima('2026-12-31'),
  limiteUsos: 50, usos: 18, planesPermitidos: [], dominiosCorreo: [], visible: true, ...x,
});
const ahora = new Date('2026-11-17T15:00:00Z');
const ctx = { plan: { slug: 'productora' }, correo: 'ana@empresa.pe', ahora };

describe('HU-1709 · aplicarCupon (CP-151)', () => {
  it('aplica −20 % al céntimo con el IGV sobre la base descontada', () => {
    const r = aplicarCupon(cupon(), ctx, resumen);
    expect(r).toMatchObject({ ok: true, resumen: { subtotal: 1290, descuento: 258, base: 1032, igv: 185.76, total: 1217.76, cupon: { codigo: 'LANZAMIENTO26', porcentaje: 20, ciclosDescuento: 3 } } });
  });

  it('CP-151 · un cupón vencido se rechaza con el motivo y el total no cambia', () => {
    const r = aplicarCupon(cupon(), { ...ctx, ahora: new Date('2027-01-01T05:00:00Z') }, resumen);
    expect(r).toMatchObject({ ok: false, codigo: 'CUPON_VENCIDO', mensaje: 'Este cupón venció el 31 de diciembre de 2026', fecha: '2026-12-31' });
    expect(r.resumen).toMatchObject({ subtotal: 1290, descuento: 0, base: 1290, igv: 232.2, total: 1522.2, cupon: null });
    // Vale todo su último día de Lima (23:59 del 31 de diciembre es 04:59 UTC del 1 de enero).
    expect(aplicarCupon(cupon(), { ...ctx, ahora: new Date('2027-01-01T04:59:00Z') }, resumen).ok).toBe(true);
  });

  it('rechaza cada caso con su motivo', () => {
    const motivo = (c: CuponAplicable | null, x: Partial<typeof ctx & { yaUsado: boolean; plan: { slug: string; aMedida?: boolean } }> = {}) => {
      const r = aplicarCupon(c, { ...ctx, ...x }, resumen);
      return r.ok ? 'OK' : r.codigo;
    };
    expect(motivo(null)).toBe('CUPON_NO_EXISTE');
    expect(motivo(cupon({ visible: false }))).toBe('CUPON_INACTIVO');
    expect(motivo(cupon({ vigenciaDesde: inicioDiaLima('2026-12-01') }))).toBe('CUPON_NO_VIGENTE');
    expect(motivo(cupon({ usos: 50 }))).toBe('CUPON_AGOTADO');
    expect(motivo(cupon({ limiteUsos: null, usos: 999 }))).toBe('OK');
    expect(motivo(cupon({ planesPermitidos: ['inicial'] }))).toBe('CUPON_NO_APLICA_PLAN');
    expect(motivo(cupon(), { plan: { slug: 'corporativo', aMedida: true } })).toBe('CUPON_NO_APLICA_PLAN');
    expect(motivo(cupon(), { yaUsado: true })).toBe('CUPON_YA_USADO');
  });

  it('un convenio pide un correo de sus dominios, también de un subdominio', () => {
    const conv = cupon({ codigo: 'CONVENIO-EDU', tipo: 'CONVENIO', porcentaje: 15, ciclosDescuento: null, vigenciaHasta: null, limiteUsos: null, dominiosCorreo: ['pucp.edu.pe'] });
    const r = aplicarCupon(conv, { ...ctx, correo: 'ana@empresa.pe' }, resumen);
    expect(r).toMatchObject({ ok: false, codigo: 'CUPON_CORREO_CONVENIO', mensaje: 'Este convenio es para correos de pucp.edu.pe: usa tu correo institucional como correo del administrador' });
    expect(aplicarCupon(conv, { ...ctx, correo: null }, resumen).ok).toBe(false);
    expect(aplicarCupon(conv, { ...ctx, correo: 'Ana@Alumnos.PUCP.edu.pe' }, resumen)).toMatchObject({ ok: true, resumen: { descuento: 193.5, base: 1096.5, igv: 197.37, total: 1293.87 } });
    expect(correoDelConvenio('x@notpucp.edu.pe', ['pucp.edu.pe'])).toBe(false);
  });

  it('el redondeo al céntimo en dólares y en el anual', () => {
    expect(descontar(411, 15)).toEqual({ descuento: 61.65, base: 349.35, igv: 62.88, total: 412.23 });
    expect(descontar(12384, 33)).toEqual({ descuento: 4086.72, base: 8297.28, igv: 1493.51, total: 9790.79 });
    expect(descontar(490, 100)).toEqual({ descuento: 490, base: 0, igv: 0, total: 0 });
  });

  it('los ciclos con descuento: el alta usa uno; null es permanente', () => {
    expect(ciclosRestantesTrasAlta(3)).toBe(2);
    expect(ciclosRestantesTrasAlta(1)).toBe(0);
    expect(ciclosRestantesTrasAlta(null)).toBeNull();
    expect(renuevaConDescuento({ porcentajeDescuento: 20, ciclosDescuentoRestantes: 2 })).toBe(true);
    expect(renuevaConDescuento({ porcentajeDescuento: 20, ciclosDescuentoRestantes: 0 })).toBe(false);
    expect(renuevaConDescuento({ porcentajeDescuento: 15, ciclosDescuentoRestantes: null })).toBe(true);
    expect(renuevaConDescuento({ porcentajeDescuento: null, ciclosDescuentoRestantes: null })).toBe(false);
    expect(descontarCiclo(2)).toBe(1);
    expect(descontarCiclo(null)).toBeNull();
    expect(beneficioDe({ porcentaje: 20, ciclosDescuento: 3 })).toBe('−20 % en los primeros 3 pagos');
    expect(beneficioDe({ porcentaje: 15, ciclosDescuento: null })).toBe('−15 % permanente');
  });
});

describe('HU-1709 · validarCupon', () => {
  const base = { codigo: ' lanzamiento26 ', nombre: 'Lanzamiento 2026', porcentaje: 20, ciclosDescuento: 3, vigenciaDesde: '2026-11-01', vigenciaHasta: '2026-12-31', limiteUsos: 50 };

  it('normaliza el código y completa los valores por defecto', () => {
    expect(validarCupon(base)).toEqual({
      ok: true,
      datos: { codigo: 'LANZAMIENTO26', nombre: 'Lanzamiento 2026', tipo: 'CAMPANA', porcentaje: 20, ciclosDescuento: 3, vigenciaDesde: '2026-11-01', vigenciaHasta: '2026-12-31', limiteUsos: 50, planesPermitidos: [], dominiosCorreo: [], visible: true, orden: 0 },
    });
  });

  it('rechaza un porcentaje fuera de 1..100, fechas al revés y un código con espacios', () => {
    const r = validarCupon({ ...base, codigo: 'NO VALE', porcentaje: 0, vigenciaDesde: '2026-12-31', vigenciaHasta: '2026-11-01', ciclosDescuento: 0 });
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['codigo', 'porcentaje', 'ciclosDescuento', 'vigenciaHasta']);
    expect(validarCupon({ ...base, porcentaje: 101 }).ok).toBe(false);
    expect(validarCupon({ ...base, vigenciaHasta: '2026-02-30' }).ok).toBe(false);
  });

  it('un convenio necesita dominios y una campaña no los lleva', () => {
    const conv = validarCupon({ ...base, codigo: 'CONVENIO-EDU', tipo: 'CONVENIO', dominiosCorreo: ['@PUCP.edu.pe', 'uni.edu.pe', 'uni.edu.pe'] });
    expect(conv).toMatchObject({ ok: true, datos: { dominiosCorreo: ['pucp.edu.pe', 'uni.edu.pe'] } });
    expect(validarCupon({ ...base, tipo: 'CONVENIO' })).toMatchObject({ ok: false, errores: [{ campo: 'dominiosCorreo' }] });
    expect(validarCupon({ ...base, dominiosCorreo: ['pucp.edu.pe'] })).toMatchObject({ ok: false, errores: [{ campo: 'dominiosCorreo', mensaje: 'Solo los convenios se limitan por dominio de correo' }] });
    expect(validarCupon({ ...base, tipo: 'CONVENIO', dominiosCorreo: ['no es dominio'] }).ok).toBe(false);
  });

  it('al editar, valida solo lo que llega sobre el cupón actual', () => {
    const actual = validarCupon(base);
    if (!actual.ok) throw new Error('base');
    expect(validarCupon({ visible: false }, actual.datos)).toMatchObject({ ok: true, datos: { codigo: 'LANZAMIENTO26', visible: false, porcentaje: 20 } });
    expect(validarCupon({ vigenciaHasta: '2026-10-01' }, actual.datos)).toMatchObject({ ok: false, errores: [{ campo: 'vigenciaHasta' }] });
    expect(validarCupon({ ciclosDescuento: null, limiteUsos: '' }, actual.datos)).toMatchObject({ ok: true, datos: { ciclosDescuento: null, limiteUsos: null } });
  });

  it('los días de Lima', () => {
    expect(inicioDiaLima('2026-12-31').toISOString()).toBe('2026-12-31T05:00:00.000Z');
    expect(finDiaLima('2026-12-31').toISOString()).toBe('2027-01-01T04:59:59.999Z');
    expect(diaLima(finDiaLima('2026-12-31'))).toBe('2026-12-31');
  });
});
