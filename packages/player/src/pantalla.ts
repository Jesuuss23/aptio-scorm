// Dibujo de una pantalla desde sus bloques (capa de contenido) con la disposición elegida por el generador (capa de
// presentación). Modo guiado: la disposición acomoda los bloques sola y se adapta al ancho, sin lienzo fijo.
import { h } from './dom.ts';
import { t, type Textos } from './textos.ts';
import type { Bloque, BloqueInteraccion, Idioma, Pantalla, RolColor } from './tipos.ts';

export interface ContextoPantalla {
  idioma: Idioma;
  tx: Textos;
  paleta: Record<RolColor, string>;
  urlRecurso: (id: string) => string | undefined;
  /** Modo revisión: muestra el id de la pantalla y de la actividad. */
  revision: boolean;
  actividad: (b: BloqueInteraccion, p: Pantalla) => HTMLElement;
}

/** Luminancia relativa (WCAG) de un color #RRGGBB. */
export function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return /^#[0-9a-f]{6}$/i.test(hex) ? 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5) : 1;
}

const sufijo = (b: Bloque) => b.id.match(/-(titulo|subtitulo|numero|dato-grande|texto|burbuja|dato|item-\d+)$/)?.[1] ?? '';

/** Silueta neutra mientras el personaje del kit no tenga su SVG cargado (S4 trae las bocas). */
function silueta(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 160');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of [['circle', { cx: '50', cy: '38', r: '24' }], ['path', { d: 'M12 160c0-44 17-70 38-70s38 26 38 70z' }]] as const) {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

export function dibujarPantalla(p: Pantalla, ctx: ContextoPantalla): HTMLElement {
  const disposicion = p.disposicion ?? 'idea';
  const fondo = p.fondo ?? 'fondo';
  const oscuro = luminancia(ctx.paleta[fondo]) < 0.35;
  const idTitulo = `${p.id}-encabezado`;
  const texto: Node[] = [];
  const medios: Node[] = [];
  const actividades: Node[] = [];
  let items: HTMLElement | null = null;
  let conTitulo = false;

  for (const b of p.bloques) {
    if (b.tipo !== 'texto' || !sufijo(b).startsWith('item-')) items = null;
    if (b.tipo === 'texto') {
      const contenido = t(b.contenido, ctx.idioma);
      const s = sufijo(b);
      if (b.rol === 'titulo' && !conTitulo) {
        conTitulo = true;
        texto.push(h('h2', { class: 'ap-titulo-pantalla', id: idTitulo, tabindex: '-1', 'data-bloque': b.id }, contenido));
      } else if (s.startsWith('item-')) {
        if (!items) {
          items = h('ul', { class: 'ap-items' });
          texto.push(items);
        }
        const [cabeza, ...resto] = contenido.split(/:\s(.+)/s);
        items.append(h('li', { 'data-bloque': b.id }, resto.length ? [h('b', {}, `${cabeza}:`), ` ${resto[0]}`] : contenido));
      } else if (s === 'burbuja') {
        texto.push(h('p', { class: 'ap-burbuja', 'data-bloque': b.id }, contenido));
      } else if (s === 'dato-grande') {
        texto.push(h('p', { class: 'ap-dato-grande', 'data-bloque': b.id }, contenido));
      } else if (b.rol === 'destacado') {
        texto.push(h('p', { class: 'ap-dato', 'data-bloque': b.id }, contenido));
      } else if (b.rol === 'subtitulo' || b.rol === 'titulo') {
        texto.push(h('p', { class: s === 'numero' ? 'ap-numero-seccion' : 'ap-subtitulo', 'data-bloque': b.id }, contenido));
      } else {
        texto.push(h('p', { class: 'ap-parrafo', 'data-bloque': b.id }, contenido));
      }
    } else if (b.tipo === 'personaje') {
      const url = ctx.urlRecurso(b.recursoId);
      medios.push(h('figure', { class: `ap-personaje ap-pose-${b.pose ?? 'neutral'} ap-lado-${b.lado ?? 'izquierda'}`, 'aria-hidden': 'true', 'data-bloque': b.id },
        url ? h('img', { src: url, alt: '' }) : silueta()));
    } else if (b.tipo === 'imagen') {
      const url = ctx.urlRecurso(b.recursoId);
      const alt = b.decorativa ? '' : t(b.alt, ctx.idioma);
      medios.push(h('figure', { class: 'ap-imagen', 'data-bloque': b.id },
        url ? h('img', { src: url, alt }) : h('span', { class: 'ap-sin-imagen', role: b.decorativa ? null : 'img', 'aria-label': b.decorativa ? null : alt }, alt || ctx.tx.imagenPendiente)));
    } else if (b.tipo === 'video') {
      const url = ctx.urlRecurso(b.recursoId);
      medios.push(h('figure', { class: 'ap-video', 'data-bloque': b.id },
        url ? h('video', { src: url, controls: true, preload: 'metadata', playsinline: true }) : h('span', { class: 'ap-sin-imagen' }, ctx.tx.videoPendiente)));
    } else if (b.tipo === 'interaccion') {
      actividades.push(h('div', { class: 'ap-actividad', 'data-bloque': b.id, 'data-interaccion': b.interaccion.tipo },
        ctx.revision ? h('span', { class: 'ap-id' }, `${b.interaccion.tipo} · ${b.interaccion.modo}`) : null,
        b.interaccion.instruccion ? h('p', { class: 'ap-instruccion' }, t(b.interaccion.instruccion, ctx.idioma)) : null,
        ctx.actividad(b, p)));
    }
  }
  if (!conTitulo) texto.unshift(h('h2', { class: 'ap-titulo-pantalla', id: idTitulo, tabindex: '-1' }, t(p.titulo, ctx.idioma)));

  return h('section', {
    class: `ap-pantalla ap-d-${disposicion}${oscuro ? ' ap-oscuro' : ''}${medios.length ? ' ap-con-medios' : ''}`,
    style: `--ap-bg:var(--ap-${fondo})`, 'data-pantalla': p.id, 'aria-labelledby': idTitulo,
  },
  ctx.revision ? h('span', { class: 'ap-id ap-id-pantalla' }, p.id) : null,
  h('div', { class: 'ap-contenido' }, h('div', { class: 'ap-texto' }, texto), medios.length ? h('div', { class: 'ap-medios' }, medios) : null),
  actividades);
}
