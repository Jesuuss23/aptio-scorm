// HU-1603 · Popups (REQ-076, RN-17-3, CP-131, CP-132): validación, coincidencia de páginas, exclusión del pago y
// `debeMostrarse` con la frecuencia, el popup apagado y la conversión.
import { describe, expect, it } from 'vitest';
import {
  DIA_MS, coincidePaginas, debeMostrarse, esRutaPago, patronPaginas, POPUP_NUEVO, rutaCoincide, rutaInterna, tasaConversion, textoDisparador, textoPaginas, validarPopup,
} from '../src/popups.js';

const AHORA = Date.parse('2026-11-16T15:00:00Z');
const SALIDA = { visible: true, paginas: ['*'], frecuenciaDias: 7 };

describe('debeMostrarse', () => {
  it('CP-131 · un popup de salida ya mostrado no vuelve antes de 7 días', () => {
    expect(debeMostrarse(SALIDA, '/', null, false, AHORA)).toBe(true);
    expect(debeMostrarse(SALIDA, '/', AHORA - 6 * DIA_MS - 23 * 3_600_000, false, AHORA)).toBe(false);
    expect(debeMostrarse(SALIDA, '/precios', AHORA - 1000, false, AHORA)).toBe(false);
    expect(debeMostrarse(SALIDA, '/', AHORA - 7 * DIA_MS, false, AHORA)).toBe(true);
  });

  it('CP-131 · una frecuencia menor que 7 días cuenta como 7 (RN-17-3) y una mayor se respeta', () => {
    expect(debeMostrarse({ ...SALIDA, frecuenciaDias: 1 }, '/', AHORA - 2 * DIA_MS, false, AHORA)).toBe(false);
    expect(debeMostrarse({ ...SALIDA, frecuenciaDias: 30 }, '/', AHORA - 10 * DIA_MS, false, AHORA)).toBe(false);
    expect(debeMostrarse({ ...SALIDA, frecuenciaDias: 30 }, '/', AHORA - 30 * DIA_MS, false, AHORA)).toBe(true);
  });

  it('CP-132 · un popup apagado no se muestra aunque se cumpla todo lo demás', () => {
    expect(debeMostrarse({ ...SALIDA, visible: false }, '/', null, false, AHORA)).toBe(false);
  });

  it('nunca en el pago, solo en sus páginas y nunca más tras dejar el correo', () => {
    expect(debeMostrarse(SALIDA, '/pago', null, false, AHORA)).toBe(false);
    expect(debeMostrarse(SALIDA, '/pago/confirmar', null, false, AHORA)).toBe(false);
    expect(debeMostrarse({ ...SALIDA, paginas: ['/blog/*'] }, '/precios', null, false, AHORA)).toBe(false);
    expect(debeMostrarse({ ...SALIDA, paginas: ['/blog/*'] }, '/blog/guia', null, false, AHORA)).toBe(true);
    expect(debeMostrarse(SALIDA, '/', null, true, AHORA)).toBe(false);
    expect(debeMostrarse(SALIDA, '/', AHORA - 400 * DIA_MS, true, AHORA)).toBe(false);
  });
});

describe('páginas', () => {
  it('rutas exactas, comodín final y todo el sitio', () => {
    expect(rutaCoincide('*', '/cualquier/cosa')).toBe(true);
    expect(rutaCoincide('/precios', '/precios/')).toBe(true);
    expect(rutaCoincide('/precios', '/precios/anual')).toBe(false);
    expect(rutaCoincide('/blog/*', '/blog')).toBe(true);
    expect(rutaCoincide('/blog/*', '/blog/una-entrada')).toBe(true);
    expect(rutaCoincide('/blog/*', '/blogger')).toBe(false);
    expect(rutaCoincide('/*', '/')).toBe(true);
    expect(coincidePaginas(['/', '/precios'], '/')).toBe(true);
    expect(coincidePaginas(['/', '/precios'], '/demo')).toBe(false);
  });

  it('las rutas de pago empiezan con /pago', () => {
    expect(esRutaPago('/pago')).toBe(true);
    expect(esRutaPago('/pagos/2')).toBe(true);
    expect(esRutaPago('/precios')).toBe(false);
  });

  it('una ruta interna empieza con una sola barra y no lleva esquema, dominio ni consulta', () => {
    expect(rutaInterna('/demo')).toBe('/demo');
    expect(rutaInterna('/demo/')).toBe('/demo');
    expect(rutaInterna('/demo#agenda')).toBe('/demo#agenda');
    expect(rutaInterna('/')).toBe('/');
    for (const mala of ['//evil.example', 'https://evil.example', 'javascript:alert(1)', 'demo', '/a/../b', '/a?x=1', '/a\\b', '/a b', '/x#a#b']) expect(rutaInterna(mala)).toBeNull();
    expect(patronPaginas('/blog/*')).toBe('/blog/*');
    expect(patronPaginas('*')).toBe('*');
    expect(patronPaginas('/blog/*/x')).toBeNull();
    expect(patronPaginas('/demo#x')).toBeNull();
  });
});

describe('validarPopup', () => {
  it('acepta el popup nuevo y normaliza las páginas', () => {
    const r = validarPopup({ ...POPUP_NUEVO, paginas: ['/blog/*', '/blog/*', '/precios/'] });
    expect(r).toEqual({ ok: true, datos: { ...POPUP_NUEVO, paginas: ['/blog/*', '/precios'] } });
  });

  it('rechaza una frecuencia menor que 7, una barra que no es «Al cargar», un enlace externo y el pago', () => {
    const r = validarPopup({ ...POPUP_NUEVO, tipo: 'barra', frecuenciaDias: 3, accion: 'enlace_interno', enlaceDestino: '//evil.example', paginas: ['/pago'] });
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['disparador', 'paginas', 'enlaceDestino', 'frecuenciaDias']);
    expect(r.ok ? [] : r.errores.map((e) => e.mensaje)).toContain('La barra solo se muestra «Al cargar»');
  });

  it('el valor del disparador va con su unidad y solo donde aplica', () => {
    expect(validarPopup({ ...POPUP_NUEVO, disparador: 'desplazamiento', valorDisparador: 150 }).ok).toBe(false);
    const r = validarPopup({ ...POPUP_NUEVO, disparador: 'intencion_salida', valorDisparador: 50 });
    expect(r.ok && r.datos.valorDisparador).toBeNull();
    expect(textoDisparador('tiempo', 10)).toBe('Tiempo · 10 s');
    expect(textoDisparador('desplazamiento', 50)).toBe('Desplazamiento · 50 %');
    expect(textoPaginas(['*'])).toBe('Todo el sitio');
  });

  it('textos obligatorios, sin caracteres de control y con límite', () => {
    const r = validarPopup({ ...POPUP_NUEVO, titulo: '', boton: 'a'.repeat(41), nombre: 'x\u0007' });
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['nombre', 'titulo', 'boton']);
  });

  it('la tasa de conversión', () => {
    expect(tasaConversion(0, 0)).toBeNull();
    expect(tasaConversion(2140, 146)).toBe(6.8);
  });
});
