// HU-1704 · Configuración y elección de pasarelas (REQ-084, RN-18-9).
import { describe, expect, it } from 'vitest';
import {
  CATALOGO_PASARELAS, completarPasarelas, type ConfigPasarela, elegirPasarela, monedasConPasarela, ordenarPasarelas, PASARELAS_POR_DEFECTO, validarCambioPasarela, validarOrdenPasarelas,
} from '../src/pasarelas.js';

const cfg = (c: Partial<ConfigPasarela> & Pick<ConfigPasarela, 'codigo'>): ConfigPasarela => ({ ...PASARELAS_POR_DEFECTO.find((d) => d.codigo === c.codigo)!, ...c });
const todas = () => true;

describe('catálogo', () => {
  it('Culqi cobra en soles, Stripe en dólares y la simulada en ambas', () => {
    expect(CATALOGO_PASARELAS.culqi.monedas).toEqual(['PEN']);
    expect(CATALOGO_PASARELAS.stripe.monedas).toEqual(['USD']);
    expect(CATALOGO_PASARELAS.pruebas.monedas).toEqual(['PEN', 'USD']);
  });
  it('por defecto solo la simulada está visible y todas en modo pruebas', () => {
    expect(PASARELAS_POR_DEFECTO.filter((p) => p.visible).map((p) => p.codigo)).toEqual(['pruebas']);
    expect(new Set(PASARELAS_POR_DEFECTO.map((p) => p.modo))).toEqual(new Set(['pruebas']));
  });
});

describe('validar', () => {
  it('acepta un cambio parcial válido', () => {
    expect(validarCambioPasarela('stripe', { visible: true, modo: 'produccion', nombre: ' Tarjeta (USD) ' })).toEqual([]);
    expect(validarCambioPasarela('culqi', {})).toEqual([]);
  });
  it('marca nombre vacío, largo o con HTML, visible no booleano y modo desconocido', () => {
    expect(validarCambioPasarela('culqi', { nombre: '', visible: 'si', modo: 'real' }).map((e) => e.campo)).toEqual(['nombre', 'visible', 'modo']);
    expect(validarCambioPasarela('culqi', { nombre: 'x'.repeat(41) })[0]!.mensaje).toContain('40');
    expect(validarCambioPasarela('culqi', { nombre: '<b>Culqi</b>' })[0]!.mensaje).toContain('sin etiquetas');
  });
  it('la simulada no admite el modo producción', () => {
    expect(validarCambioPasarela('pruebas', { modo: 'produccion' })[0]!.mensaje).toContain('solo admite el modo pruebas');
  });
  it('el orden lleva cada pasarela una vez', () => {
    expect(validarOrdenPasarelas(['stripe', 'culqi', 'pruebas'])).toEqual([]);
    expect(validarOrdenPasarelas(['stripe', 'culqi'])).toHaveLength(1);
    expect(validarOrdenPasarelas(['stripe', 'stripe', 'pruebas'])).toHaveLength(1);
    expect(validarOrdenPasarelas(['stripe', 'culqi', 'paypal'])).toHaveLength(1);
    expect(validarOrdenPasarelas('stripe')).toHaveLength(1);
  });
});

describe('elegir', () => {
  it('la primera visible y activa, en orden, que cobra la moneda', () => {
    const c = [cfg({ codigo: 'pruebas', orden: 2 }), cfg({ codigo: 'culqi', visible: true, orden: 0 }), cfg({ codigo: 'stripe', visible: true, orden: 1 })];
    expect(elegirPasarela('PEN', c, todas)).toBe('culqi');
    expect(elegirPasarela('USD', c, todas)).toBe('stripe');
    expect(elegirPasarela('USD', c, (x) => x !== 'stripe')).toBe('pruebas');
  });
  it('ignora las ocultas y las que no tienen sus variables; null si ninguna cobra', () => {
    const c = [cfg({ codigo: 'pruebas', visible: false }), cfg({ codigo: 'culqi', visible: true }), cfg({ codigo: 'stripe', visible: false })];
    expect(elegirPasarela('USD', c, todas)).toBeNull();
    expect(elegirPasarela('PEN', c, (x) => x !== 'culqi')).toBeNull();
    expect(monedasConPasarela(c, todas)).toEqual(['PEN']);
    expect(monedasConPasarela(c, () => false)).toEqual([]);
  });
  it('completa las que no tienen fila y ordena por orden', () => {
    const r = completarPasarelas([cfg({ codigo: 'stripe', orden: -1, visible: true })]);
    expect(r.map((p) => p.codigo)).toEqual(['stripe', 'pruebas', 'culqi']);
    expect(ordenarPasarelas([cfg({ codigo: 'culqi', orden: 0 }), cfg({ codigo: 'pruebas', orden: 0 })]).map((p) => p.codigo)).toEqual(['pruebas', 'culqi']);
  });
});
