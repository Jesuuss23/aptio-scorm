// HU-1703 · Reglas del alta de suscripción (REQ-083, CP-143, RN-18-2, RN-18-3).
import { describe, expect, it } from 'vitest';
import {
  finPeriodo, leerEventoPrueba, resumenCheckout, rucValido, slugOrganizacion, soles2, sumarMeses, tipoComprobanteDe, validarEmpresa,
} from '../src/suscripciones.js';

const empresa = { razonSocial: '  Minera  Andina SAC ', ruc: '20131312955', nombreAdmin: 'Ana Quispe', correoAdmin: 'Ana@Minera.PE', consentimiento: true };
const plan = { slug: 'productora', nombre: 'Productora', aMedida: false, precioMes: 1290, precioAnual: 12384 };

describe('RUC', () => {
  it('acepta RUC con el dígito verificador correcto', () => {
    for (const r of ['20131312955', '20100170869', '20600123450', '10400000005']) expect(rucValido(r)).toBe(true);
  });
  it('rechaza un dígito verificador errado, un prefijo inválido o una longitud distinta', () => {
    expect(rucValido('20131312956')).toBe(false);
    expect(rucValido('30131312955')).toBe(false);
    expect(rucValido('2013131295')).toBe(false);
  });
  it('factura con RUC y boleta sin RUC', () => {
    expect(tipoComprobanteDe('20131312955')).toBe('FACTURA');
    expect(tipoComprobanteDe(null)).toBe('BOLETA');
  });
});

describe('validarEmpresa', () => {
  it('recorta los textos, pasa el correo a minúsculas y emite factura con RUC', () => {
    const r = validarEmpresa(empresa);
    expect(r).toEqual({ ok: true, datos: { razonSocial: 'Minera Andina SAC', ruc: '20131312955', nombreAdmin: 'Ana Quispe', correoAdmin: 'ana@minera.pe' }, tipoComprobante: 'FACTURA' });
  });
  it('sin RUC emite boleta; acepta el RUC con espacios o guiones', () => {
    const sin = validarEmpresa({ ...empresa, ruc: '' });
    expect(sin.ok && sin.tipoComprobante).toBe('BOLETA');
    const guiones = validarEmpresa({ ...empresa, ruc: '20-131312955' });
    expect(guiones.ok && guiones.datos.ruc).toBe('20131312955');
  });
  it('marca cada campo con su error', () => {
    const r = validarEmpresa({ razonSocial: '<b>x</b>', ruc: '20131312956', nombreAdmin: '', correoAdmin: 'no-es-correo', consentimiento: false });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores.map((e) => e.campo)).toEqual(['razonSocial', 'ruc', 'nombreAdmin', 'correoAdmin', 'consentimiento']);
    expect(r.errores[1]!.mensaje).toContain('dígito verificador');
  });
  it('el RUC con letras o largo distinto pide 11 dígitos; el consentimiento acepta «on»', () => {
    const r = validarEmpresa({ ...empresa, ruc: '2013A', consentimiento: 'on' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores).toEqual([{ campo: 'ruc', mensaje: 'El RUC tiene 11 dígitos' }]);
  });
  it('una entrada que no es objeto pide todos los campos obligatorios', () => {
    const r = validarEmpresa(null);
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['razonSocial', 'nombreAdmin', 'correoAdmin', 'consentimiento']);
  });
});

describe('resumenCheckout', () => {
  it('mensual: el precio al mes más IGV de 18 %', () => {
    expect(resumenCheckout(plan, 'MENSUAL', true)).toEqual({ plan: 'productora', nombrePlan: 'Productora', ciclo: 'MENSUAL', subtotal: 1290, igv: 232.2, total: 1522.2, moneda: 'PEN' });
  });
  it('anual: el precio anual efectivo más IGV', () => {
    const r = resumenCheckout(plan, 'ANUAL', true);
    expect(r).toMatchObject({ subtotal: 12384, igv: 2229.12, total: 14613.12 });
  });
  it('null si el plan es a medida o si pide el anual y la página no lo ofrece', () => {
    expect(resumenCheckout({ ...plan, aMedida: true, precioMes: null, precioAnual: null }, 'MENSUAL', true)).toBeNull();
    expect(resumenCheckout(plan, 'ANUAL', false)).toBeNull();
  });
  it('los montos con dos decimales', () => {
    expect(soles2(1522.2)).toBe('S/ 1,522.20');
  });
});

describe('período', () => {
  it('un mes o un año desde el pago, conservando la hora', () => {
    const pago = new Date('2026-11-17T15:30:00.000Z');
    expect(finPeriodo(pago, 'MENSUAL').toISOString()).toBe('2026-12-17T15:30:00.000Z');
    expect(finPeriodo(pago, 'ANUAL').toISOString()).toBe('2027-11-17T15:30:00.000Z');
  });
  it('31 de enero más un mes es el último día de febrero', () => {
    expect(sumarMeses(new Date('2027-01-31T10:00:00.000Z'), 1).toISOString()).toBe('2027-02-28T10:00:00.000Z');
    expect(sumarMeses(new Date('2028-01-31T10:00:00.000Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(sumarMeses(new Date('2026-12-15T00:00:00.000Z'), 1).toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });
});

describe('slug y evento', () => {
  it('slug sin tildes ni símbolos, con sufijo', () => {
    expect(slugOrganizacion('Compañía Ñandú & Asociados S.A.C.', 'ab12')).toBe('compania-nandu-asociados-s-a-c-ab12');
    expect(slugOrganizacion('¡¡!!', 'x')).toBe('organizacion-x');
  });
  it('lee el evento de la pasarela de pruebas y descarta lo inválido', () => {
    const id = '0F8FAD5B-D9CB-469F-A165-70867728950E';
    expect(leerEventoPrueba({ id: 'evt_1', tipo: 'pago.aprobado', solicitudId: id, ultimos4: '1111' }))
      .toEqual({ eventoId: 'evt_1', solicitudId: id.toLowerCase(), resultado: 'aprobado', ultimos4: '1111', motivo: null });
    expect(leerEventoPrueba({ id: 'evt_2', tipo: 'pago.rechazado', solicitudId: id, motivo: 'Fondos insuficientes' })?.resultado).toBe('rechazado');
    expect(leerEventoPrueba({ id: 'evt_3', tipo: 'otro', solicitudId: id })).toBeNull();
    expect(leerEventoPrueba({ id: 'evt 4', tipo: 'pago.aprobado', solicitudId: id })).toBeNull();
    expect(leerEventoPrueba('x')).toBeNull();
  });
});
