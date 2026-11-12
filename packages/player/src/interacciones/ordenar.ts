// INT-03 · Ordenar pasos: se muestran desordenados y se mueven con Subir y Bajar. Puntaje = % en su posición; al
// comprobar se muestra el orden correcto.
import { barajar, h, vaciar } from '../dom.ts';
import type { Visual } from '../tipos.ts';
import { type Actividad, enfocar, intentos, lista, marca, pieResultado, porcentaje, textoVisual, visual } from './comun.ts';

type Paso = { id: string; contenido: Visual };

/** Orden barajado que nunca empieza resuelto. */
export function desordenar<T>(pasos: readonly T[], clave: string): T[] {
  const orden = barajar(pasos, clave);
  return orden.every((p, i) => p === pasos[i]) && orden.length > 1 ? [...orden.slice(1), orden[0]!] : orden;
}

export const ordenar: Actividad = (datos, ctx) => {
  const pasos = lista<Paso>(datos.pasos);
  const raiz = h('div', { class: 'ap-ordenar' });
  const control = intentos(ctx);

  const empezar = (vuelta: number) => {
    let orden = desordenar(pasos, `${ctx.id}-ordenar-${vuelta}`);
    let fin = false;
    const ol = h('ol', { class: 'ap-pasos' });
    const pie = h('div');
    const comprobar = h('button', { type: 'button', class: 'ap-boton ap-primario' }, ctx.tx.comprobar);

    const mover = (i: number, d: -1 | 1) => {
      const j = i + d;
      if (j < 0 || j >= orden.length) return;
      orden = [...orden];
      [orden[i], orden[j]] = [orden[j]!, orden[i]!];
      dibujar();
      // HU-1401 · En el primer o el último lugar esa flecha se desactiva: el foco pasa a la otra del mismo paso.
      const fila = ol.querySelector(`[data-paso="${orden[j]!.id}"]`);
      const misma = fila?.querySelector<HTMLButtonElement>(`[data-mover="${d}"]`);
      enfocar(misma && !misma.disabled ? misma : fila?.querySelector<HTMLButtonElement>(`[data-mover="${-d}"]`));
      ctx.anunciar(`${textoVisual(orden[j]!.contenido, ctx.idioma)}: ${ctx.tx.paso(j + 1)}`);
    };
    const dibujar = () => {
      vaciar(ol, ...orden.map((p, i) => h('li', { class: fin ? (p === pasos[i] ? 'ap-paso ap-acierto' : 'ap-paso ap-error') : 'ap-paso', 'data-paso': p.id },
        h('span', { class: 'ap-numero', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'ap-paso-texto' }, visual(p.contenido, ctx)),
        fin ? marca(p === pasos[i], ctx.tx) : h('span', { class: 'ap-mover' },
          h('button', { type: 'button', class: 'ap-icono', 'data-mover': '-1', disabled: i === 0, 'aria-label': `${ctx.tx.subir}: ${textoVisual(p.contenido, ctx.idioma)}`, onclick: () => mover(i, -1) }, '↑'),
          h('button', { type: 'button', class: 'ap-icono', 'data-mover': '1', disabled: i === orden.length - 1, 'aria-label': `${ctx.tx.bajar}: ${textoVisual(p.contenido, ctx.idioma)}`, onclick: () => mover(i, 1) }, '↓')),
      )));
    };
    comprobar.addEventListener('click', () => {
      fin = true;
      dibujar();
      comprobar.remove();
      control.sumar();
      const puntaje = porcentaje(orden.filter((p, i) => p === pasos[i]).length, pasos.length);
      ctx.terminar({ completada: true, puntaje });
      vaciar(pie,
        h('p', { class: 'ap-nota' }, `${ctx.tx.ordenCorrecto} ${pasos.map((p, i) => `${i + 1}. ${textoVisual(p.contenido, ctx.idioma)}`).join(' · ')}`),
        pieResultado(ctx, puntaje, control.quedan(), () => empezar(vuelta + 1)));
    });
    dibujar();
    vaciar(raiz, ol, h('div', { class: 'ap-acciones' }, comprobar), pie);
  };
  empezar(0);
  return raiz;
};
