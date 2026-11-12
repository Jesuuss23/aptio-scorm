// INT-08 · Decisión con consecuencias: el participante elige, ve la consecuencia y sigue al nodo siguiente o termina.
// Puntaje = promedio del camino recorrido.
import { h, vaciar } from '../dom.ts';
import { t } from '../textos.ts';
import type { TextoI18n } from '../tipos.ts';
import { type Actividad, enfocar, intentos, lista, pieResultado } from './comun.ts';

type Opcion = { id: string; texto: TextoI18n; consecuencia: TextoI18n; puntaje: number; siguienteId?: string };
type Nodo = { id: string; situacion: TextoI18n; opciones: Opcion[] };

/** Profundidad máxima del esquema (3) con margen: un nodo que se repite o un camino largo terminan la actividad. */
const PASOS_MAXIMOS = 6;

export const promedio = (puntajes: readonly number[]): number => (puntajes.length ? Math.round(puntajes.reduce((a, b) => a + b, 0) / puntajes.length) : 0);

export const decision: Actividad = (datos, ctx) => {
  const nodos = new Map(lista<Nodo>(datos.nodos).map((n) => [n.id, n]));
  const raiz = h('div', { class: 'ap-decision' });
  const control = intentos(ctx);

  const empezar = (vuelta: number) => {
    const camino: number[] = [];
    const visitados = new Set<string>();
    const fin = () => {
      control.sumar();
      const puntaje = promedio(camino);
      ctx.terminar({ completada: true, puntaje });
      vaciar(raiz, pieResultado(ctx, puntaje, control.quedan(), () => empezar(vuelta + 1)));
    };
    /** `enfocarla`: al pasar a otra situación, el foco va a su texto (HU-1401). */
    const mostrar = (id: string, enfocarla = false) => {
      const nodo = nodos.get(id);
      if (!nodo || visitados.has(id) || camino.length >= PASOS_MAXIMOS) { fin(); return; }
      visitados.add(id);
      const idSituacion = `${ctx.id}-n-${nodo.id}`;
      const consecuencia = h('div', { class: 'ap-retro', 'aria-live': 'polite' });
      const acciones = h('div', { class: 'ap-acciones' });
      const botones = nodo.opciones.map((o) => h('button', {
        type: 'button', class: 'ap-opcion', 'data-opcion': o.id,
        onclick: (ev: Event) => {
          camino.push(o.puntaje);
          botones.forEach((b) => { b.disabled = true; });
          (ev.currentTarget as HTMLElement).classList.add('ap-elegida');
          vaciar(consecuencia, h('p', {}, t(o.consecuencia, ctx.idioma)));
          const sigue = o.siguienteId !== undefined && nodos.has(o.siguienteId) && !visitados.has(o.siguienteId);
          vaciar(acciones, h('button', { type: 'button', class: 'ap-boton ap-primario', onclick: () => (sigue ? mostrar(o.siguienteId!, true) : fin()) }, sigue ? ctx.tx.continuar : ctx.tx.verResultado));
          acciones.querySelector('button')?.focus();
        },
      }, t(o.texto, ctx.idioma)));
      const situacion = h('p', { class: 'ap-situacion', id: idSituacion, tabindex: -1, 'data-enfocar': '' }, t(nodo.situacion, ctx.idioma));
      vaciar(raiz,
        situacion,
        h('div', { class: 'ap-opciones', role: 'group', 'aria-labelledby': idSituacion }, botones),
        consecuencia, acciones);
      if (enfocarla) enfocar(situacion);
    };
    mostrar(String(datos.inicioId));
  };
  empezar(0);
  return raiz;
};
