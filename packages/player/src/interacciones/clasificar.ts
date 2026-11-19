// INT-02 · Clasificar: cada elemento se lleva a un grupo eligiéndolo en su lista de botones (dedo, ratón o teclado);
// al comprobar se marcan aciertos y errores con su retroalimentación. Puntaje = % bien clasificados.
// SUP-31 · También se arrastra desde su asa (⠿) hasta la etiqueta del grupo, con ratón o con el dedo; los botones siguen.
import { barajar, h, vaciar } from '../dom.ts';
import { t } from '../textos.ts';
import type { TextoI18n, Visual } from '../tipos.ts';
import { arrastrable, bajoPuntero } from './arrastre.ts';
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
    // Las etiquetas de los grupos son las zonas donde se suelta lo arrastrado (solo puntero: el teclado usa los botones).
    const zonas = grupos.map((g) => h('span', { class: 'ap-etiqueta ap-soltar', 'data-zona': g.id }, t(g.etiqueta, ctx.idioma)));
    const grupoEn = (x: number, y: number): string | null => {
      const z = bajoPuntero(x, y, raiz)?.closest<HTMLElement>('[data-zona], [data-grupo]');
      return z && raiz.contains(z) ? (z.dataset.zona ?? z.dataset.grupo ?? null) : null;
    };
    const marcarZona = (g: string | null) => { for (const z of zonas) z.classList.toggle('ap-sobre', z.dataset.zona === g); };
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
      const asa = h('span', { class: 'ap-asa', 'aria-hidden': 'true', title: ctx.tx.arrastrar }, '⠿');
      const contenido = h('div', { class: 'ap-elemento-contenido' }, visual(e.contenido, ctx));
      const fila = h('li', { class: 'ap-elemento', 'data-elemento': e.id },
        h('div', { class: 'ap-elemento-cabeza' }, asa, contenido),
        h('div', { class: 'ap-grupos', role: 'group', 'aria-label': ctx.tx.grupoDe(nombre) }, botones),
        retro);
      arrastrable(asa, {
        fantasma: () => contenido,
        activo: () => !botones[0]?.disabled,
        alMover: (x, y) => marcarZona(grupoEn(x, y)),
        alSoltar: (x, y) => {
          const g = grupoEn(x, y);
          const b = botones.find((boton) => boton.dataset.grupo === g);
          if (!b) return;
          b.click();
          const grupo = grupos.find((gr) => gr.id === g);
          if (grupo) ctx.anunciar(`${nombre}: ${t(grupo.etiqueta, ctx.idioma)}`);
        },
        alTerminar: () => marcarZona(null),
      });
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
      h('div', { class: 'ap-leyenda', 'aria-hidden': 'true' }, zonas),
      h('ul', { class: 'ap-elementos' }, filas.map((f) => f.fila)),
      h('div', { class: 'ap-acciones' }, comprobar),
      pie);
  };
  empezar(0);
  return raiz;
};
