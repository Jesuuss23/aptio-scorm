// INT-06 · Exploración: puntos sobre una imagen (área táctil de 44 × 44 px); completada al abrir todos los obligatorios,
// sin puntaje. La imagen de escena la dibuja la etapa de ilustraciones; mientras tanto se ve un marco con el texto alternativo.
import { h, vaciar } from '../dom.ts';
import { t } from '../textos.ts';
import type { TextoI18n } from '../tipos.ts';
import { type Actividad, lista } from './comun.ts';

type Punto = { id: string; x: number; y: number; titulo: TextoI18n; contenido: TextoI18n; obligatorio: boolean };

export const exploracion: Actividad = (datos, ctx) => {
  const puntos = lista<Punto>(datos.puntos);
  const obligatorios = puntos.filter((p) => p.obligatorio);
  const abiertos = new Set<string>();
  let fin = false;
  const alt = t(datos.alt as TextoI18n | undefined, ctx.idioma);
  const url = typeof datos.imagenId === 'string' ? ctx.urlRecurso(datos.imagenId) : undefined;
  const contador = h('p', { class: 'ap-marcador' }, ctx.tx.abiertos(0, puntos.length));
  const panel = h('div', { class: 'ap-panel-punto', 'aria-live': 'polite' });

  const revisar = () => {
    if (!fin && obligatorios.every((p) => abiertos.has(p.id))) {
      fin = true;
      ctx.terminar({ completada: true, puntaje: null });
    }
  };
  const botones = puntos.map((p, i) =>
    h('button', {
      type: 'button', class: 'ap-punto', style: `left:${p.x}%;top:${p.y}%`, 'data-punto': p.id,
      'aria-label': `${ctx.tx.puntoDe(i + 1, puntos.length)}: ${t(p.titulo, ctx.idioma)}`,
      onclick: (ev: Event) => {
        abiertos.add(p.id);
        (ev.currentTarget as HTMLElement).classList.add('ap-visto');
        vaciar(panel, h('p', { class: 'ap-punto-titulo' }, t(p.titulo, ctx.idioma)), h('p', {}, t(p.contenido, ctx.idioma)));
        contador.textContent = ctx.tx.abiertos(abiertos.size, puntos.length);
        revisar();
      },
    }, String(i + 1)),
  );
  // Sin puntos obligatorios no hay nada que exigir.
  queueMicrotask(revisar);
  return h('div', { class: 'ap-exploracion' },
    h('div', { class: 'ap-escena-img' },
      url ? h('img', { src: url, alt }) : h('span', { class: 'ap-sin-imagen', role: 'img', 'aria-label': alt }, alt || ctx.tx.imagenPendiente),
      botones),
    contador, panel);
};
