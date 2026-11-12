// HU-1401 · Contraste WCAG 2.2: razón de contraste y variante legible de un color del kit (SUP-63).
import { describe, expect, it } from 'vitest';
import { colorLegible, contraste, luminancia, rgb } from '../src/contraste.ts';
import { PALETA_BASE } from '../src/reproductor.ts';

describe('contraste (HU-1401)', () => {
  it('lee #rgb y #rrggbb, y rechaza lo que no es hexadecimal', () => {
    expect(rgb('#fff')).toEqual([255, 255, 255]);
    expect(rgb('#2E7D6B')).toEqual([46, 125, 107]);
    expect(rgb('rgb(0,0,0)')).toBeNull();
    expect(rgb('#12345')).toBeNull();
  });

  it('calcula la luminancia relativa y la razón como WCAG 2.2', () => {
    expect(luminancia('#000000')).toBe(0);
    expect(luminancia('#FFFFFF')).toBe(1);
    expect(contraste('#000', '#fff')).toBe(21);
    expect(contraste('#fff', '#fff')).toBe(1);
    // Valores de referencia: #767676 sobre blanco es el gris más claro que llega a 4,5:1.
    expect(contraste('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(contraste('#FFFFFF', '#767676')).toBeCloseTo(contraste('#767676', '#FFFFFF'), 10);
  });

  it('un verde de kit con 2,8:1 sobre blanco (#4CAF50) se oscurece hasta 4,5:1 sin cambiar de tono', () => {
    expect(contraste('#4CAF50', '#FFFFFF')).toBeLessThan(3);
    const legible = colorLegible('#4CAF50', ['#FFFFFF', '#F5F7FA']);
    expect(contraste(legible, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contraste(legible, '#F5F7FA')).toBeGreaterThanOrEqual(4.5);
    // Sigue siendo verde (el canal G manda) y es el primer paso que cumple: no se oscurece de más.
    const [r, g, b] = rgb(legible)!;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(contraste(legible, '#F5F7FA')).toBeLessThan(4.8);
  });

  it('el secundario del estilo base ya cumple como texto: el ✓ no cambia sin kit', () => {
    expect(contraste(PALETA_BASE.secundario, PALETA_BASE.blanco)).toBeGreaterThanOrEqual(4.5);
    expect(colorLegible(PALETA_BASE.secundario, [PALETA_BASE.blanco, PALETA_BASE.fondo])).toBe(PALETA_BASE.secundario);
  });

  it('un color que ya cumple vuelve tal cual: el kit no se toca si no hace falta', () => {
    expect(colorLegible('#12355B', ['#FFFFFF', '#F5F7FA'])).toBe('#12355B');
    expect(colorLegible(PALETA_BASE.alerta, [PALETA_BASE.blanco, PALETA_BASE.fondo])).toBe(PALETA_BASE.alerta);
  });

  it('el foco pide 3:1; con fondos oscuros el color se aclara', () => {
    const foco = colorLegible(PALETA_BASE.acento, [PALETA_BASE.blanco, PALETA_BASE.fondo], 3);
    expect(contraste(PALETA_BASE.acento, PALETA_BASE.fondo)).toBeLessThan(3);
    expect(contraste(foco, PALETA_BASE.fondo)).toBeGreaterThanOrEqual(3);
    expect(contraste(foco, PALETA_BASE.fondo)).toBeLessThan(4.5);
    const sobreOscuro = colorLegible('#12355B', ['#0E1512'], 4.5);
    expect(luminancia(sobreOscuro)).toBeGreaterThan(luminancia('#12355B'));
    expect(contraste(sobreOscuro, '#0E1512')).toBeGreaterThanOrEqual(4.5);
  });

  it('lo que no se puede medir se deja como está', () => {
    expect(colorLegible('tomato', ['#FFFFFF'])).toBe('tomato');
    expect(colorLegible('#6DA398', ['var(--x)'])).toBe('#6DA398');
  });
});
