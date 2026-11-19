// SUP-104 · Glosario, ayuda y panel de accesibilidad del reproductor (REQ-041, PNT-12). Cada uno es un diálogo modal como
// «Créditos»: el resto del curso queda inerte, Tab no sale del diálogo, Escape o «Cerrar» lo cierran y el foco vuelve al
// botón que lo abrió. Las preferencias de accesibilidad (tamaño del texto, alto contraste, menos movimiento) se aplican
// al instante y se recuerdan en el navegador; sin almacenamiento, duran lo que dure la página.
import { h } from './dom.ts';
import { t } from './textos.ts';
import type { Textos } from './textos.ts';
import type { Idioma, TextoI18n } from './tipos.ts';

export interface TerminoGlosario { id: string; termino: TextoI18n; definicion: TextoI18n }

interface OpcionesDialogo {
  raiz: HTMLElement;
  tx: Textos;
  /** Sufijo de los ids (`ap-<id>-titulo`) y clase del diálogo (`ap-panel-<id>`). */
  id: string;
  titulo: string;
  contenido: (Node | null)[];
  /** El botón que abrió el diálogo: recibe el foco al cerrar. */
  volver: HTMLElement;
  /** El control que recibe el foco al abrir (por defecto, «Cerrar»). */
  foco?: () => HTMLElement | null;
}

const ENFOCABLES = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Diálogo modal dentro del reproductor. Devuelve la función que lo cierra. */
export function abrirDialogo(o: OpcionesDialogo): () => void {
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
  const boton = h('button', { type: 'button', class: 'ap-nav ap-primario', onclick: cerrar }, o.tx.cerrar);
  const caja = h('div', { class: 'ap-creditos-caja ap-panel-caja' },
    h('h2', { class: 'ap-creditos-titulo', id: `ap-${o.id}-titulo` }, o.titulo),
    ...o.contenido,
    h('div', { class: 'ap-reanudar-botones' }, boton));
  const dialogo = h('div', {
    class: `ap-creditos ap-panel ap-panel-${o.id}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `ap-${o.id}-titulo`,
    onkeydown: (ev: Event) => {
      const e = ev as KeyboardEvent;
      if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
      else if (e.key === 'Tab') {
        // El foco da la vuelta dentro del diálogo.
        const lista = [...caja.querySelectorAll<HTMLElement>(ENFOCABLES)];
        const activo = (o.raiz.getRootNode() as Document | ShadowRoot).activeElement;
        const i = lista.indexOf(activo as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); lista.at(-1)?.focus(); }
        else if (!e.shiftKey && i === lista.length - 1) { e.preventDefault(); lista[0]?.focus(); }
      }
      // Las flechas no cambian de pantalla mientras el diálogo está abierto.
      e.stopPropagation();
    },
  }, caja);
  o.raiz.append(dialogo);
  (o.foco?.() ?? boton).focus();
  return cerrar;
}

// ---------- Glosario ----------

/** Términos en orden alfabético del idioma, con el buscador. */
export function abrirGlosario(o: { raiz: HTMLElement; tx: Textos; idioma: Idioma; terminos: readonly TerminoGlosario[]; volver: HTMLElement }): () => void {
  const { tx, idioma } = o;
  const orden = [...o.terminos]
    .map((x) => ({ id: x.id, termino: t(x.termino, idioma), definicion: t(x.definicion, idioma) }))
    .filter((x) => x.termino)
    .sort((a, b) => a.termino.localeCompare(b.termino, idioma, { sensitivity: 'base' }));
  const normal = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const lista = h('dl', { class: 'ap-glosario-lista' });
  const cuenta = h('p', { class: 'ap-glosario-cuenta', role: 'status' });
  const buscador = h('input', { type: 'search', class: 'ap-glosario-buscar', id: 'ap-glosario-buscar', autocomplete: 'off' }) as HTMLInputElement;
  const pintar = () => {
    const q = normal(buscador.value.trim());
    const visibles = orden.filter((x) => !q || normal(x.termino).includes(q) || normal(x.definicion).includes(q));
    lista.replaceChildren(...visibles.flatMap((x) => [h('dt', { 'data-termino': x.id }, x.termino), h('dd', {}, x.definicion)]));
    cuenta.textContent = visibles.length ? tx.glosarioCuenta(visibles.length) : tx.glosarioSinResultados;
  };
  buscador.addEventListener('input', pintar);
  pintar();
  return abrirDialogo({
    raiz: o.raiz, tx, id: 'glosario', titulo: tx.glosario, volver: o.volver, foco: () => buscador,
    contenido: [h('label', { class: 'ap-glosario-etiqueta', for: 'ap-glosario-buscar' }, tx.glosarioBuscar), buscador, cuenta, lista],
  });
}

// ---------- Ayuda ----------

/** Cómo se usa el curso, con lo que este curso tiene encendido. */
export function abrirAyuda(o: { raiz: HTMLElement; tx: Textos; volver: HTMLElement; atajos: boolean; conTemario: boolean; conAccesibilidad: boolean; conGlosario: boolean }): () => void {
  const { tx } = o;
  const seccion = (titulo: string, ...textos: string[]) => h('section', { class: 'ap-ayuda-seccion' }, h('h3', {}, titulo), ...textos.map((x) => h('p', {}, x)));
  return abrirDialogo({
    raiz: o.raiz, tx, id: 'ayuda', titulo: tx.ayuda, volver: o.volver,
    contenido: [
      seccion(tx.ayudaAvanzarTitulo, tx.ayudaAvanzar, ...(o.atajos ? [tx.ayudaAtajos] : [])),
      o.conTemario ? seccion(tx.temario, tx.ayudaTemario) : null,
      seccion(tx.ayudaActividadesTitulo, tx.ayudaActividades, tx.ayudaArrastrar),
      seccion(tx.subtitulos, tx.ayudaSubtitulos),
      seccion(tx.ayudaAvanceTitulo, tx.ayudaAvance),
      o.conGlosario ? seccion(tx.glosario, tx.ayudaGlosario) : null,
      o.conAccesibilidad ? seccion(tx.accesibilidad, tx.ayudaAccesibilidad) : null,
    ],
  });
}

// ---------- Accesibilidad ----------

export type TamanoTexto = 'normal' | 'grande' | 'muy-grande';
export interface PreferenciasAccesibilidad { texto: TamanoTexto; contraste: boolean; movimiento: boolean }

export const CLAVE_ACCESIBILIDAD = 'aptio-accesibilidad';
export const PREFERENCIAS_BASE: PreferenciasAccesibilidad = { texto: 'normal', contraste: false, movimiento: false };
const TAMANOS: readonly TamanoTexto[] = ['normal', 'grande', 'muy-grande'];

export function leerPreferencias(): PreferenciasAccesibilidad {
  try {
    const p = JSON.parse(globalThis.localStorage?.getItem(CLAVE_ACCESIBILIDAD) ?? 'null') as Partial<PreferenciasAccesibilidad> | null;
    return {
      texto: TAMANOS.includes(p?.texto as TamanoTexto) ? (p!.texto as TamanoTexto) : 'normal',
      contraste: p?.contraste === true,
      movimiento: p?.movimiento === true,
    };
  } catch {
    return { ...PREFERENCIAS_BASE };
  }
}

export function guardarPreferencias(p: PreferenciasAccesibilidad): void {
  try {
    globalThis.localStorage?.setItem(CLAVE_ACCESIBILIDAD, JSON.stringify(p));
  } catch {
    // Sin almacenamiento, la preferencia dura lo que dure la página.
  }
}

/** Pone las preferencias en la raíz del reproductor (los estilos hacen el resto). */
export function aplicarPreferencias(raiz: HTMLElement, p: PreferenciasAccesibilidad): void {
  raiz.dataset.texto = p.texto;
  raiz.classList.toggle('ap-alto-contraste', p.contraste);
  raiz.classList.toggle('ap-sin-movimiento', p.movimiento);
}

export function abrirAccesibilidad(o: {
  raiz: HTMLElement; tx: Textos; volver: HTMLElement;
  preferencias: PreferenciasAccesibilidad;
  cambiar: (p: PreferenciasAccesibilidad) => void;
  /** Subtítulos: su estado y cómo cambiarlo (el mismo que el botón CC). */
  subtitulos?: { valor: boolean; cambiar: (si: boolean) => void } | null;
}): () => void {
  const { tx } = o;
  let p = { ...o.preferencias };
  const poner = (cambio: Partial<PreferenciasAccesibilidad>) => { p = { ...p, ...cambio }; o.cambiar(p); };
  const nombres: Record<TamanoTexto, string> = { normal: tx.textoNormal, grande: tx.textoGrande, 'muy-grande': tx.textoMuyGrande };
  const radios = TAMANOS.map((x) => h('label', { class: 'ap-opcion-panel' },
    h('input', { type: 'radio', name: 'ap-tamano-texto', value: x, checked: p.texto === x, onchange: () => poner({ texto: x }) }),
    ` ${nombres[x]}`));
  const casilla = (texto: string, valor: boolean, cambiar: (si: boolean) => void, detalle?: string) => h('label', { class: 'ap-opcion-panel' },
    h('input', { type: 'checkbox', checked: valor, onchange: (ev: Event) => cambiar((ev.currentTarget as HTMLInputElement).checked) }),
    ` ${texto}`, detalle ? h('small', {}, detalle) : null);
  const primero = () => o.raiz.querySelector<HTMLInputElement>(`.ap-panel-accesibilidad input[value="${p.texto}"]`);
  return abrirDialogo({
    raiz: o.raiz, tx, id: 'accesibilidad', titulo: tx.accesibilidad, volver: o.volver, foco: primero,
    contenido: [
      h('fieldset', { class: 'ap-panel-grupo' }, h('legend', {}, tx.tamanoTexto), ...radios),
      casilla(tx.altoContraste, p.contraste, (si) => poner({ contraste: si }), tx.altoContrasteDetalle),
      casilla(tx.menosMovimiento, p.movimiento, (si) => poner({ movimiento: si }), tx.menosMovimientoDetalle),
      o.subtitulos ? casilla(tx.subtitulos, o.subtitulos.valor, o.subtitulos.cambiar, tx.subtitulosDetalle) : null,
    ],
  });
}
