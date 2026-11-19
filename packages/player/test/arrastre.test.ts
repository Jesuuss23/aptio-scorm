// @vitest-environment happy-dom
// SUP-31 · El arrastre con Pointer Events: un toque sin moverse no arrastra, pasar el umbral crea el fantasma (sin ids ni
// datos del original), soltar avisa dónde y Escape o pointercancel cancelan sin soltar.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { arrastrable, UMBRAL_ARRASTRE } from '../src/interacciones/arrastre.ts';

const evento = (tipo: string, x: number, y: number, extra: PointerEventInit = {}) =>
  new PointerEvent(tipo, { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, ...extra });

function preparar(activo = () => true) {
  const r = document.createElement('div');
  r.className = 'ap-r';
  const item = document.createElement('li');
  item.id = 'paso-1';
  item.dataset.paso = 'p1';
  item.textContent = 'Paso 1';
  const asa = document.createElement('span');
  item.append(asa);
  r.append(item);
  document.body.replaceChildren(r);
  const alSoltar = vi.fn();
  const alTerminar = vi.fn();
  const alEmpezar = vi.fn();
  arrastrable(asa, { fantasma: () => item, activo, alSoltar, alTerminar, alEmpezar });
  return { r, asa, alSoltar, alTerminar, alEmpezar };
}

afterEach(() => document.body.replaceChildren());

describe('arrastrable (SUP-31)', () => {
  it('un toque sin pasar el umbral no arrastra ni suelta', () => {
    const { asa, alSoltar, alEmpezar } = preparar();
    asa.dispatchEvent(evento('pointerdown', 10, 10));
    asa.dispatchEvent(evento('pointermove', 10 + UMBRAL_ARRASTRE - 2, 10));
    asa.dispatchEvent(evento('pointerup', 10 + UMBRAL_ARRASTRE - 2, 10));
    expect(alEmpezar).not.toHaveBeenCalled();
    expect(alSoltar).not.toHaveBeenCalled();
  });

  it('al pasar el umbral dibuja el fantasma dentro del reproductor y al soltar avisa el punto', () => {
    const { r, asa, alSoltar, alTerminar } = preparar();
    asa.dispatchEvent(evento('pointerdown', 10, 10));
    asa.dispatchEvent(evento('pointermove', 40, 60));
    const fantasma = r.querySelector('.ap-fantasma')!;
    expect(fantasma).not.toBeNull();
    expect(fantasma.getAttribute('aria-hidden')).toBe('true');
    expect(fantasma.id).toBe('');
    expect(fantasma.hasAttribute('data-paso')).toBe(false);
    expect(asa.classList.contains('ap-arrastrando')).toBe(true);
    asa.dispatchEvent(evento('pointerup', 50, 80));
    expect(alSoltar).toHaveBeenCalledWith(50, 80);
    expect(alTerminar).toHaveBeenCalledTimes(1);
    expect(r.querySelector('.ap-fantasma')).toBeNull();
  });

  it('Escape y pointercancel cancelan sin soltar', () => {
    const { r, asa, alSoltar, alTerminar } = preparar();
    asa.dispatchEvent(evento('pointerdown', 10, 10));
    asa.dispatchEvent(evento('pointermove', 60, 60));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    asa.dispatchEvent(evento('pointerup', 60, 60));
    expect(r.querySelector('.ap-fantasma')).toBeNull();
    asa.dispatchEvent(evento('pointerdown', 10, 10));
    asa.dispatchEvent(evento('pointermove', 60, 60));
    asa.dispatchEvent(evento('pointercancel', 60, 60));
    asa.dispatchEvent(evento('pointerup', 60, 60));
    expect(alSoltar).not.toHaveBeenCalled();
    expect(alTerminar).toHaveBeenCalledTimes(2);
  });

  it('cuando la actividad ya no admite cambios, no arrastra', () => {
    const { r, asa, alEmpezar } = preparar(() => false);
    asa.dispatchEvent(evento('pointerdown', 10, 10));
    asa.dispatchEvent(evento('pointermove', 60, 60));
    expect(alEmpezar).not.toHaveBeenCalled();
    expect(r.querySelector('.ap-fantasma')).toBeNull();
  });
});
