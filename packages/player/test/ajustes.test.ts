// HU-0602 · Los retoques del editor en el reproductor: tamaño relativo, color del kit, alineación y animación.
import { describe, expect, it } from 'vitest';
import { estiloAjuste } from '../src/ajustes.ts';
import { ESTILOS } from '../src/estilos.ts';
import type { RolColor } from '../src/tipos.ts';

describe('estiloAjuste', () => {
  it('un texto toma tamaño en cqw, el color del rol del kit y la alineación', () => {
    expect(estiloAjuste({ tamanoCqw: 4.5, color: 'acento', alineacion: 'centro' }, 'texto')).toEqual({
      estilo: 'font-size:4.5cqw;color:var(--ap-acento);text-align:center', clase: '',
    });
  });

  it('el color siempre es una variable del kit: un valor que no es un rol se ignora', () => {
    expect(estiloAjuste({ color: '#ff0000' as RolColor }, 'texto').estilo).toBe('');
    expect(estiloAjuste({ color: 'red;background:url(x)' as RolColor }, 'texto').estilo).toBe('');
  });

  it('el tamaño se mantiene en el rango del esquema y nunca en píxeles', () => {
    expect(estiloAjuste({ tamanoCqw: 50 }, 'texto').estilo).toBe('font-size:20cqw');
    expect(estiloAjuste({ tamanoCqw: 0.1 }, 'texto').estilo).toBe('font-size:0.5cqw');
  });

  it('la imagen y el personaje usan la escala; no toman color ni alineación', () => {
    expect(estiloAjuste({ escala: 1.2, color: 'acento', alineacion: 'derecha' }, 'personaje')).toEqual({ estilo: 'scale:1.2', clase: '' });
    expect(estiloAjuste({ escala: 0.8 }, 'imagen').estilo).toBe('scale:0.8');
    expect(estiloAjuste({ escala: 2, tamanoCqw: 3 }, 'interaccion').estilo).toBe('');
  });

  it('cada animación tiene su clase; «auto» y «ninguna» no animan (SUP-41)', () => {
    for (const a of ['aparecer', 'deslizar', 'zoom', 'rebotar'] as const) {
      expect(estiloAjuste({ animacion: a }, 'texto').clase).toBe(`ap-anim-${a}`);
      expect(ESTILOS).toContain(`@keyframes ap-${a}{`);
    }
    expect(estiloAjuste({ animacion: 'auto' }, 'texto').clase).toBe('');
    expect(estiloAjuste({ animacion: 'ninguna' }, 'texto').clase).toBe('');
  });

  it('con «reducir movimiento» no hay animaciones', () => {
    expect(ESTILOS).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\*\{transition:none!important;animation:none!important\}\}/);
  });

  it('HU-0603 · el desplazamiento va en cqw con translate, según el dispositivo, y dentro de ±100 %', () => {
    expect(estiloAjuste({ desplazamiento: { x: 12.5, y: -3 } }, 'imagen')).toEqual({ estilo: '--ap-dx:12.5cqw;--ap-dy:-3cqw', clase: 'ap-desp' });
    expect(estiloAjuste({ desplazamiento: { x: 1, y: 2, dispositivo: 'celular' } }, 'texto').clase).toBe('ap-desp-celular');
    expect(estiloAjuste({ desplazamiento: { x: 1, y: 2, dispositivo: 'escritorio' }, animacion: 'zoom' }, 'personaje').clase).toBe('ap-anim-zoom ap-desp-escritorio');
    expect(estiloAjuste({ desplazamiento: { x: 300, y: -250 } }, 'imagen').estilo).toBe('--ap-dx:100cqw;--ap-dy:-100cqw');
    expect(estiloAjuste({ desplazamiento: { x: 0, y: 0 } }, 'imagen')).toEqual({ estilo: '', clase: '' });
    expect(estiloAjuste({ desplazamiento: { x: 5, y: 5 } }, 'interaccion')).toEqual({ estilo: '', clase: '' });
    expect(ESTILOS).toContain('.ap-desp{translate:var(--ap-dx) var(--ap-dy)}');
    expect(ESTILOS).not.toMatch(/--ap-d[xy]:[^;]*px/);
  });
});
