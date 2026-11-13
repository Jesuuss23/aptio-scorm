// @vitest-environment happy-dom
// HU-0609 · Biblioteca del kit (REQ-017): las 6 piezas se dibujan con los roles de color del kit, así una pieza
// insertada adopta la paleta de la marca; tiene nombre para el lector de pantalla salvo que sea decorativa (RN-14-3).
// Una imagen subida se dibuja con su URL y su texto alternativo.
import { describe, expect, it } from 'vitest';
import { marcadoPieza, PIEZAS, piezaSvg, rolesDePieza } from '../src/biblioteca.ts';
import { montar } from '../src/reproductor.ts';
import type { CursoReproductor, ElementoExtra } from '../src/tipos.ts';
import { cursoLotoBase } from './catalogo.ts';

function abrir(extras: ElementoExtra[], urls: Record<string, string> = {}) {
  const c: CursoReproductor = cursoLotoBase();
  const p = c.modulos.flatMap((m) => m.capsulas.flatMap((x) => x.pantallas)).find((x) => x.id === 'p05')!;
  p.extras = extras;
  const contenedor = document.createElement('div');
  document.body.replaceChildren(contenedor);
  const r = montar(contenedor, c, { urlRecurso: (id) => urls[id], kit: { paleta: { primario: '#0B5394', acento: '#E69138' } } });
  r.ir('p05');
  const sombra = contenedor.shadowRoot!;
  return { el: (id: string) => sombra.querySelector<HTMLElement>(`[data-bloque="${id}"]`)!, raiz: sombra.querySelector<HTMLElement>('.ap-r')! };
}

describe('biblioteca del kit', () => {
  it('son 6 piezas y cada una usa solo colores del kit, como variables', () => {
    expect(PIEZAS).toEqual(['candado', 'alerta', 'tablero', 'escena', 'trofeo', 'casco']);
    for (const p of PIEZAS) {
      const marcado = marcadoPieza(p);
      expect(marcado).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 100 100"/);
      expect(marcado).not.toMatch(/#[0-9a-f]{3,6}/i);
      const usados = [...marcado.matchAll(/var\(--ap-([a-z]+)\)/g)].map((m) => m[1]);
      expect(usados.length).toBeGreaterThan(1);
      expect(new Set(usados)).toEqual(new Set(rolesDePieza(p)));
    }
    expect(rolesDePieza('candado')).toEqual(['secundario', 'primario', 'acento']);
  });

  it('en el reproductor, la pieza se dibuja en línea y toma la paleta del kit del curso', () => {
    const { el, raiz } = abrir([{ id: 'p05-extra-imagen-1', tipo: 'imagen', pieza: 'candado', texto: { es: 'Candado' }, x: 40, y: 30, ancho: 16 }]);
    const fig = el('p05-extra-imagen-1');
    expect(fig.classList.contains('ap-extra-pieza')).toBe(true);
    expect(fig.getAttribute('role')).toBe('img');
    expect(fig.getAttribute('aria-label')).toBe('Candado');
    expect(fig.querySelector('svg.ap-pieza-candado rect')!.getAttribute('style')).toBe('fill:var(--ap-primario)');
    expect(raiz.getAttribute('style')).toContain('--ap-primario:#0B5394');
    expect(raiz.getAttribute('style')).toContain('--ap-acento:#E69138');
  });

  it('una pieza decorativa no tiene nombre para el lector de pantalla', () => {
    const { el } = abrir([{ id: 'p05-extra-imagen-1', tipo: 'imagen', pieza: 'trofeo', texto: { es: 'Trofeo' }, decorativa: true, x: 40, y: 30, ancho: 16 }]);
    const fig = el('p05-extra-imagen-1');
    expect(fig.getAttribute('role')).toBeNull();
    expect(fig.getAttribute('aria-label')).toBeNull();
    expect(fig.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('una imagen subida usa su URL y su texto alternativo (vacío si es decorativa)', () => {
    const id = '7b0c7d0e-1111-4b8f-9d6a-1f2e3d4c5b6a';
    const { el } = abrir([
      { id: 'p05-extra-imagen-1', tipo: 'imagen', recursoId: id, texto: { es: 'Operario con casco' }, x: 10, y: 10, ancho: 20 },
      { id: 'p05-extra-imagen-2', tipo: 'imagen', recursoId: id, texto: { es: 'Fondo' }, decorativa: true, x: 50, y: 10, ancho: 20 },
    ], { [id]: 'https://s3.local/foto.png' });
    expect(el('p05-extra-imagen-1').querySelector('img')!.getAttribute('src')).toBe('https://s3.local/foto.png');
    expect(el('p05-extra-imagen-1').querySelector('img')!.getAttribute('alt')).toBe('Operario con casco');
    expect(el('p05-extra-imagen-2').querySelector('img')!.getAttribute('alt')).toBe('');
  });

  it('piezaSvg y marcadoPieza dibujan lo mismo', () => {
    for (const p of PIEZAS) {
      const svg = piezaSvg(p);
      const div = document.createElement('div');
      div.innerHTML = marcadoPieza(p);
      expect(svg.childElementCount).toBe(div.firstElementChild!.childElementCount);
    }
  });
});
