// INT-04 · Tarjetas que se voltean: completada al voltear todas; sin puntaje (siempre formativa).
import { h, vaciar } from '../dom.ts';
import type { Visual } from '../tipos.ts';
import { type Actividad, lista, textoVisual, visual } from './comun.ts';

type Tarjeta = { id: string; frente: Visual; reverso: Visual };

export const tarjetas: Actividad = (datos, ctx) => {
  const todas = lista<Tarjeta>(datos.tarjetas);
  const vistas = new Set<string>();
  let fin = false;
  const botones = todas.map((x) => {
    const b = h('button', { type: 'button', class: 'ap-tarjeta', 'aria-pressed': 'false', 'data-tarjeta': x.id });
    const pintar = (volteada: boolean) => {
      b.setAttribute('aria-pressed', String(volteada));
      b.classList.toggle('ap-volteada', volteada);
      b.setAttribute('aria-label', `${textoVisual(x.frente, ctx.idioma)}${volteada ? `: ${textoVisual(x.reverso, ctx.idioma)}` : ` · ${ctx.tx.voltear}`}`);
      vaciar(b, visual(volteada ? x.reverso : x.frente, ctx));
    };
    b.addEventListener('click', () => {
      const volteada = b.getAttribute('aria-pressed') !== 'true';
      pintar(volteada);
      vistas.add(x.id);
      if (!fin && vistas.size === todas.length) {
        fin = true;
        ctx.anunciar(ctx.tx.completada);
        ctx.terminar({ completada: true, puntaje: null });
      }
    });
    pintar(false);
    return b;
  });
  return h('div', { class: 'ap-tarjetas' }, botones);
};
