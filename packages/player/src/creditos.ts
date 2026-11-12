// HU-1406 · CP-107 · Créditos de IA dentro del paquete: el botón «Créditos» de la barra abre un diálogo con el aviso de
// revisión humana («Voz e ilustraciones generadas con IA y revisadas por …») y una tabla con qué se generó, con qué
// proveedor y modelo, y con qué licencia (REQ-062, docs/19-proveedores-y-licencias.md). El diálogo es modal: el resto
// del curso queda inerte, el foco no sale del diálogo y Escape o «Cerrar» lo cierran y devuelven el foco al botón.
import { h } from './dom.ts';
import type { Textos } from './textos.ts';
import type { Creditos } from './tipos.ts';

export interface OpcionesCreditos {
  raiz: HTMLElement;
  sombra: ShadowRoot;
  creditos: Creditos;
  tx: Textos;
  /** El botón que abrió el diálogo: recibe el foco al cerrar. */
  volver: HTMLElement;
}

/** Abre el diálogo de créditos y devuelve la función que lo cierra. */
export function abrirCreditos(o: OpcionesCreditos): () => void {
  const { tx, creditos } = o;
  const fondo = ([...o.raiz.children] as HTMLElement[]).filter((el) => !el.inert);
  // `inert` saca el fondo del foco y de los clics; aria-hidden, del árbol de accesibilidad en lectores que no conocen inert.
  for (const el of fondo) { el.inert = true; el.setAttribute('aria-hidden', 'true'); }
  let abierto = true;
  const cerrar = () => {
    if (!abierto) return;
    abierto = false;
    dialogo.remove();
    for (const el of fondo) { el.inert = false; el.removeAttribute('aria-hidden'); }
    o.volver.focus();
  };
  const boton = h('button', { type: 'button', class: 'ap-nav ap-primario', onclick: cerrar }, tx.cerrar);
  const columnas = [tx.creditosQue, tx.creditosProveedor, tx.creditosModelo, tx.creditosLicencia];
  const dialogo = h('div', {
    class: 'ap-creditos', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ap-creditos-titulo', 'aria-describedby': 'ap-creditos-aviso',
    onkeydown: (ev: Event) => {
      const e = ev as KeyboardEvent;
      if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
      else if (e.key === 'Tab') {
        // El único control es «Cerrar»: el foco se queda ahí.
        e.preventDefault();
        boton.focus();
      }
      // Las flechas no cambian de pantalla mientras el diálogo está abierto.
      e.stopPropagation();
    },
  }, h('div', { class: 'ap-creditos-caja' },
    h('h2', { class: 'ap-creditos-titulo', id: 'ap-creditos-titulo' }, tx.creditos),
    h('p', { class: 'ap-creditos-aviso', id: 'ap-creditos-aviso' }, creditos.aviso),
    creditos.filas.length
      ? h('table', { class: 'ap-creditos-tabla' },
        h('caption', {}, tx.creditosDetalle),
        h('thead', {}, h('tr', {}, columnas.map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, creditos.filas.map((f) => h('tr', {}, h('th', { scope: 'row' }, f.que), h('td', {}, f.proveedor), h('td', {}, f.modelo), h('td', {}, f.licencia)))))
      : null,
    h('div', { class: 'ap-reanudar-botones' }, boton)));
  o.raiz.append(dialogo);
  boton.focus();
  return cerrar;
}
