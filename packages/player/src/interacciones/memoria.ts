// INT-01 · Memoria: se voltean dos cartas; si forman pareja quedan visibles. Las dos que no forman pareja se tapan al
// voltear la siguiente (sin relojes: cada quien mira el tiempo que necesita).
import { barajar, h, vaciar } from '../dom.ts';
import type { Visual } from '../tipos.ts';
import { type Actividad, intentos, lista, pieResultado, puntajeMemoria, textoVisual, visual } from './comun.ts';

type Par = { id: string; a: Visual; b: Visual };

export const memoria: Actividad = (datos, ctx) => {
  const pares = lista<Par>(datos.pares);
  const maximo = typeof datos.intentosMaximos === 'number' ? datos.intentosMaximos : null;
  const raiz = h('div', { class: 'ap-memoria' });
  const control = intentos(ctx);

  const empezar = (vuelta: number) => {
    const cartas = barajar(pares.flatMap((p) => [{ par: p.id, v: p.a }, { par: p.id, v: p.b }]), `${ctx.id}-memoria-${vuelta}`);
    const halladas = new Set<string>();
    let abiertas: number[] = [];
    let errores = 0;
    let fin = false;
    const marcador = h('p', { class: 'ap-marcador', 'aria-live': 'off' }, ctx.tx.errores(0));
    const rejilla = h('div', { class: cartas.length > 9 ? 'ap-rejilla ap-cuatro' : 'ap-rejilla' });
    const botones = cartas.map((_, i) => h('button', { type: 'button', class: 'ap-carta', 'data-carta': i, onclick: () => voltear(i) }));
    const pie = h('div');

    const mostrar = (i: number, visible: boolean) => {
      const b = botones[i]!;
      const c = cartas[i]!;
      b.classList.toggle('ap-volteada', visible);
      b.setAttribute('aria-label', visible ? `${ctx.tx.carta(i + 1)}: ${textoVisual(c.v, ctx.idioma)}` : `${ctx.tx.carta(i + 1)}, ${ctx.tx.oculta}`);
      vaciar(b, visible ? visual(c.v, ctx) : h('span', { class: 'ap-dorso', 'aria-hidden': 'true' }, '?'));
    };
    const terminar = () => {
      fin = true;
      cartas.forEach((_, i) => { mostrar(i, true); botones[i]!.disabled = true; });
      control.sumar();
      const puntaje = puntajeMemoria(pares.length, errores);
      ctx.terminar({ completada: true, puntaje });
      vaciar(pie, pieResultado(ctx, puntaje, control.quedan(), () => empezar(vuelta + 1)));
    };
    function voltear(i: number) {
      const c = cartas[i]!;
      if (fin || halladas.has(c.par) || abiertas.includes(i)) return;
      if (abiertas.length === 2) {
        abiertas.forEach((j) => mostrar(j, false));
        abiertas = [];
      }
      mostrar(i, true);
      abiertas.push(i);
      if (abiertas.length < 2) return;
      const [x, y] = abiertas as [number, number];
      if (cartas[x]!.par === cartas[y]!.par) {
        halladas.add(c.par);
        for (const j of [x, y]) {
          botones[j]!.classList.add('ap-pareja');
          botones[j]!.disabled = true;
        }
        abiertas = [];
        ctx.anunciar(ctx.tx.pareja);
        if (halladas.size === pares.length) terminar();
      } else {
        errores++;
        marcador.textContent = ctx.tx.errores(errores);
        ctx.anunciar(ctx.tx.noPareja);
        if (maximo !== null && errores >= maximo) terminar();
      }
    }

    botones.forEach((_, i) => mostrar(i, false));
    rejilla.append(...botones);
    vaciar(raiz, marcador, rejilla, pie);
  };
  empezar(0);
  return raiz;
};
