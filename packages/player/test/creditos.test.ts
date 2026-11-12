// @vitest-environment happy-dom
// HU-1406 · CP-107 · El botón «Créditos» de la barra abre un diálogo modal con el aviso y la tabla de proveedores; el
// fondo queda inerte, Tab no sale del diálogo y Escape o «Cerrar» lo cierran y devuelven el foco al botón. Sin
// créditos no hay botón.
import { afterEach, describe, expect, it } from 'vitest';
import { montar } from '../src/reproductor.ts';
import type { Creditos } from '../src/tipos.ts';
import { cursoLotoBase } from './catalogo.ts';

const CREDITOS: Creditos = {
  aviso: 'Voz e ilustraciones generadas con IA y revisadas por AulasEducativas',
  filas: [
    { que: 'Voz', proveedor: 'Google', modelo: 'es-US-Neural2-A', licencia: 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)' },
    { que: 'Ilustraciones', proveedor: 'Recraft', modelo: 'recraftv3', licencia: 'Recraft · uso comercial (plan de pago)' },
  ],
};

function abrirReproductor(creditos?: Creditos) {
  const contenedor = document.createElement('div');
  document.body.replaceChildren(contenedor);
  const r = montar(contenedor, cursoLotoBase(), { idioma: 'es', ...(creditos ? { creditos } : {}) });
  const sombra = contenedor.shadowRoot!;
  const boton = [...sombra.querySelectorAll<HTMLButtonElement>('.ap-boton-barra')].find((b) => b.textContent === 'Créditos') ?? null;
  return { r, sombra, boton };
}
const tecla = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

afterEach(() => { document.body.replaceChildren(); });

describe('diálogo de créditos (HU-1406)', () => {
  it('sin créditos no hay botón', () => {
    const { r, boton } = abrirReproductor();
    expect(boton).toBeNull();
    r.destruir();
  });

  it('abre un diálogo modal con el aviso y la tabla; el fondo queda inerte y Tab no sale de «Cerrar»', () => {
    const { r, sombra, boton } = abrirReproductor(CREDITOS);
    expect(boton?.getAttribute('aria-haspopup')).toBe('dialog');
    boton!.focus();
    boton!.click();
    const dialogo = sombra.querySelector<HTMLElement>('.ap-creditos')!;
    expect(dialogo.getAttribute('role')).toBe('dialog');
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(sombra.getElementById(dialogo.getAttribute('aria-labelledby')!)?.textContent).toBe('Créditos');
    expect(sombra.getElementById(dialogo.getAttribute('aria-describedby')!)?.textContent).toBe(CREDITOS.aviso);
    expect([...dialogo.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Qué', 'Proveedor', 'Modelo', 'Licencia']);
    expect([...dialogo.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual(
      CREDITOS.filas.map((f) => [f.que, f.proveedor, f.modelo, f.licencia]));
    const cerrar = dialogo.querySelector<HTMLButtonElement>('button')!;
    expect(sombra.activeElement).toBe(cerrar);
    // Todo lo demás de la raíz queda fuera del foco y del árbol de accesibilidad.
    const raiz = dialogo.parentElement!;
    const fondo = [...raiz.children].filter((el) => el !== dialogo) as HTMLElement[];
    expect(fondo.length).toBeGreaterThan(0);
    expect(fondo.every((el) => el.inert && el.getAttribute('aria-hidden') === 'true')).toBe(true);
    tecla(cerrar, 'Tab');
    expect(sombra.activeElement).toBe(cerrar);
    r.destruir();
  });

  it('Escape y «Cerrar» lo cierran, devuelven el foco al botón y quitan el inerte; las flechas no cambian de pantalla', () => {
    const { r, sombra, boton } = abrirReproductor(CREDITOS);
    expect(r.ir(1)).toBe(true);
    boton!.click();
    tecla(sombra.querySelector('.ap-creditos button')!, 'ArrowLeft');
    expect(r.estado().indice).toBe(1);
    tecla(sombra.querySelector('.ap-creditos button')!, 'Escape');
    expect(sombra.querySelector('.ap-creditos')).toBeNull();
    expect(sombra.activeElement).toBe(boton);
    expect([...sombra.querySelector('.ap-r')!.children].some((el) => (el as HTMLElement).inert)).toBe(false);
    boton!.click();
    sombra.querySelector<HTMLButtonElement>('.ap-creditos button')!.click();
    expect(sombra.querySelector('.ap-creditos')).toBeNull();
    expect(sombra.activeElement).toBe(boton);
    r.destruir();
  });
});
