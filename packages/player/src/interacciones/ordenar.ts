// INT-03 · Ordenar pasos: se muestran desordenados y se mueven con Subir y Bajar. Puntaje = % en su posición; al
// comprobar se muestra el orden correcto. SUP-31 · También se arrastra cada paso desde su asa (⠿), con ratón o con el
// dedo; las flechas siguen para el teclado y el lector de pantalla.
import { barajar, h, vaciar } from '../dom.ts';
import type { Visual } from '../tipos.ts';
import { arrastrable } from './arrastre.ts';
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
    /** Lugar donde caería el paso arrastrado: cuántos de los otros quedan por encima del puntero. */
    const lugarEn = (y: number, desde: number): number => {
      const filas = [...ol.children] as HTMLElement[];
      let lugar = 0;
      filas.forEach((li, k) => {
        if (k === desde) return;
        const r = li.getBoundingClientRect();
        if (y > r.top + r.height / 2) lugar++;
      });
      return lugar;
    };
    const marcarDestino = (lugar: number | null, desde: number) => {
      const filas = [...ol.children] as HTMLElement[];
      const otras = filas.filter((_, k) => k !== desde);
      filas.forEach((li) => li.classList.remove('ap-destino-antes', 'ap-destino-despues'));
      if (lugar === null || lugar === desde) return;
      if (lugar < otras.length) otras[lugar]!.classList.add('ap-destino-antes');
      else otras.at(-1)?.classList.add('ap-destino-despues');
    };
    const llevar = (i: number, lugar: number) => {
      if (lugar === i) return;
      const p = orden[i]!;
      orden = orden.filter((_, k) => k !== i);
      orden.splice(lugar, 0, p);
      dibujar();
      ctx.anunciar(`${textoVisual(p.contenido, ctx.idioma)}: ${ctx.tx.paso(lugar + 1)}`);
    };
    const dibujar = () => {
      vaciar(ol, ...orden.map((p, i) => {
        const asa = fin ? null : h('span', { class: 'ap-asa', 'aria-hidden': 'true', title: ctx.tx.arrastrar }, '⠿');
        const li = h('li', { class: fin ? (p === pasos[i] ? 'ap-paso ap-acierto' : 'ap-paso ap-error') : 'ap-paso', 'data-paso': p.id },
        asa,
        h('span', { class: 'ap-numero', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'ap-paso-texto' }, visual(p.contenido, ctx)),
        fin ? marca(p === pasos[i], ctx.tx) : h('span', { class: 'ap-mover' },
          h('button', { type: 'button', class: 'ap-icono', 'data-mover': '-1', disabled: i === 0, 'aria-label': `${ctx.tx.subir}: ${textoVisual(p.contenido, ctx.idioma)}`, onclick: () => mover(i, -1) }, '↑'),
          h('button', { type: 'button', class: 'ap-icono', 'data-mover': '1', disabled: i === orden.length - 1, 'aria-label': `${ctx.tx.bajar}: ${textoVisual(p.contenido, ctx.idioma)}`, onclick: () => mover(i, 1) }, '↓')),
        );
        if (asa) {
          arrastrable(asa, {
            fantasma: () => li,
            activo: () => !fin,
            alMover: (_x, y) => marcarDestino(lugarEn(y, i), i),
            alSoltar: (_x, y) => llevar(i, lugarEn(y, i)),
            alTerminar: () => marcarDestino(null, i),
          });
        }
        return li;
      }));
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
