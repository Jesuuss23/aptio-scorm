// INT-02 · Clasificar: cada elemento se lleva a un grupo eligiéndolo en su lista de botones (dedo, ratón o teclado);
// al comprobar se marcan aciertos y errores con su retroalimentación. Puntaje = % bien clasificados.
import { barajar, h, vaciar } from '../dom.ts';
import { t } from '../textos.ts';
import type { TextoI18n, Visual } from '../tipos.ts';
import { type Actividad, intentos, lista, marca, pieResultado, porcentaje, textoVisual, visual } from './comun.ts';

type Grupo = { id: string; etiqueta: TextoI18n };
type Elemento = { id: string; contenido: Visual; grupoCorrecto: string; retroalimentacion?: TextoI18n };

export const clasificar: Actividad = (datos, ctx) => {
  const grupos = lista<Grupo>(datos.grupos);
  const raiz = h('div', { class: 'ap-clasificar' });
  const control = intentos(ctx);

  const empezar = (vuelta: number) => {
    const elementos = barajar(lista<Elemento>(datos.elementos), `${ctx.id}-clasificar-${vuelta}`);
    const elegido = new Map<string, string>();
    const comprobar = h('button', { type: 'button', class: 'ap-boton ap-primario', disabled: true }, ctx.tx.comprobar);
    const pie = h('div');
    const filas = elementos.map((e) => {
      const nombre = textoVisual(e.contenido, ctx.idioma);
      const botones = grupos.map((g) =>
        h('button', {
          type: 'button', class: 'ap-opcion ap-grupo', 'aria-pressed': 'false', 'data-grupo': g.id,
          onclick: (ev: Event) => {
            elegido.set(e.id, g.id);
            for (const b of botones) b.setAttribute('aria-pressed', String(b === ev.currentTarget));
            comprobar.disabled = elegido.size < elementos.length;
          },
        }, t(g.etiqueta, ctx.idioma)),
      );
      const retro = h('div', { class: 'ap-retro' });
      const fila = h('li', { class: 'ap-elemento', 'data-elemento': e.id },
        h('div', { class: 'ap-elemento-contenido' }, visual(e.contenido, ctx)),
        h('div', { class: 'ap-grupos', role: 'group', 'aria-label': ctx.tx.grupoDe(nombre) }, botones),
        retro);
      return { e, fila, botones, retro };
    });
    comprobar.addEventListener('click', () => {
      let aciertos = 0;
      for (const f of filas) {
        const bien = elegido.get(f.e.id) === f.e.grupoCorrecto;
        if (bien) aciertos++;
        f.fila.classList.add(bien ? 'ap-acierto' : 'ap-error');
        f.botones.forEach((b) => { b.disabled = true; });
        vaciar(f.retro, marca(bien, ctx.tx), f.e.retroalimentacion ? ` ${t(f.e.retroalimentacion, ctx.idioma)}` : '');
      }
      comprobar.remove();
      control.sumar();
      const puntaje = porcentaje(aciertos, filas.length);
      ctx.terminar({ completada: true, puntaje });
      vaciar(pie, pieResultado(ctx, puntaje, control.quedan(), () => empezar(vuelta + 1)));
    });
    vaciar(raiz,
      h('div', { class: 'ap-leyenda', 'aria-hidden': 'true' }, grupos.map((g) => h('span', { class: 'ap-etiqueta' }, t(g.etiqueta, ctx.idioma)))),
      h('ul', { class: 'ap-elementos' }, filas.map((f) => f.fila)),
      h('div', { class: 'ap-acciones' }, comprobar),
      pie);
  };
  empezar(0);
  return raiz;
};
