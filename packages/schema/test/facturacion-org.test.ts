import { describe, expect, it } from 'vitest';
import { validarDatosFacturacion, validarMedioPrueba } from '../src/facturacion-org.js';

const base = { razonSocial: '  Minera Andina   SAC ', ruc: '20131312955', direccion: 'Av. Arequipa 123, Lima', correoFacturacion: 'Pagos@Minera.pe', tipoComprobantePreferido: 'FACTURA' };
const campos = (r: ReturnType<typeof validarDatosFacturacion>) => (r.ok ? [] : r.errores.map((e) => e.campo));

describe('HU-1711 · datos de facturación', () => {
  it('factura con RUC válido: recorta y normaliza', () => {
    expect(validarDatosFacturacion({ ...base, ruc: '2013-1312 955' })).toEqual({
      ok: true, datos: { razonSocial: 'Minera Andina SAC', ruc: '20131312955', direccion: 'Av. Arequipa 123, Lima', correoFacturacion: 'pagos@minera.pe', tipoComprobantePreferido: 'FACTURA' },
    });
  });

  it('la factura exige el RUC con su dígito verificador', () => {
    expect(campos(validarDatosFacturacion({ ...base, ruc: '' }))).toEqual(['ruc']);
    expect(campos(validarDatosFacturacion({ ...base, ruc: '20131312956' }))).toEqual(['ruc']);
    expect(campos(validarDatosFacturacion({ ...base, ruc: '2013131295' }))).toEqual(['ruc']);
  });

  it('la boleta admite el RUC vacío (y uno válido si lo escribe)', () => {
    expect(validarDatosFacturacion({ ...base, ruc: '', direccion: '', tipoComprobantePreferido: 'BOLETA' })).toMatchObject({ ok: true, datos: { ruc: null, direccion: null, tipoComprobantePreferido: 'BOLETA' } });
    expect(validarDatosFacturacion({ ...base, tipoComprobantePreferido: 'BOLETA' })).toMatchObject({ ok: true, datos: { ruc: '20131312955' } });
    expect(campos(validarDatosFacturacion({ ...base, ruc: '123', tipoComprobantePreferido: 'BOLETA' }))).toEqual(['ruc']);
  });

  it('rechaza el correo, la razón social con HTML, el tipo desconocido y lo demasiado largo', () => {
    expect(campos(validarDatosFacturacion({ ...base, correoFacturacion: 'pagos@' }))).toEqual(['correoFacturacion']);
    expect(campos(validarDatosFacturacion({ ...base, razonSocial: '<b>Minera</b>' }))).toEqual(['razonSocial']);
    expect(campos(validarDatosFacturacion({ ...base, tipoComprobantePreferido: 'TICKET' }))).toEqual(['tipoComprobantePreferido']);
    expect(campos(validarDatosFacturacion({ ...base, direccion: 'x'.repeat(201) }))).toEqual(['direccion']);
    expect(campos(validarDatosFacturacion(null))).toEqual(['tipoComprobantePreferido', 'razonSocial', 'correoFacturacion']);
  });
});

describe('HU-1711 · medio de pago con la pasarela de pruebas', () => {
  it('guarda solo los 4 últimos dígitos de una tarjeta de prueba', () => {
    expect(validarMedioPrueba({ tarjeta: '4111 1111 1111 1111' })).toEqual({ ok: true, ultimos4Digitos: '1111' });
    expect(validarMedioPrueba({ tarjeta: '4000-0000-0000-0002' })).toEqual({ ok: true, ultimos4Digitos: '0002' });
  });

  it('rechaza una tarjeta que no es de prueba, el vacío y el CVV', () => {
    expect(validarMedioPrueba({ tarjeta: '5555555555554444' })).toMatchObject({ ok: false, errores: [{ campo: 'tarjeta' }] });
    expect(validarMedioPrueba({})).toMatchObject({ ok: false, errores: [{ campo: 'tarjeta' }] });
    expect(validarMedioPrueba({ tarjeta: '4111111111111111', cvv: '123' })).toMatchObject({ ok: false, errores: [{ campo: 'cvv' }] });
  });
});
