// HU-0702 · Boca sincronizada sin video (decisión 7): el personaje es un SVG con capas `boca_A`…`boca_X` y en cada
// cuadro se muestra la que toca según el tiempo del audio (`requestAnimationFrame` sobre `audio.currentTime`). En pausa
// o al terminar, reposo (X). Si al personaje le falta una boca se usa la más cercana (RN-07-3: G→B, H→C).

export type MarcasBoca = readonly (readonly [number, string])[];

/** Bocas de reemplazo cuando el personaje no trae la pedida; al final, el reposo. */
const REEMPLAZO: Record<string, string[]> = { G: ['B'], H: ['C'], A: ['X'], B: ['C', 'X'], C: ['D', 'B'], D: ['C'], E: ['F', 'C'], F: ['E', 'A'] };

/** Boca que toca en el instante `ms` (búsqueda binaria; antes de la primera marca, reposo). */
export function bocaEn(marcas: MarcasBoca, ms: number): string {
  let a = 0;
  let b = marcas.length - 1;
  let r = -1;
  while (a <= b) {
    const m = (a + b) >> 1;
    if (marcas[m]![0] <= ms) {
      r = m;
      a = m + 1;
    } else b = m - 1;
  }
  return r < 0 ? 'X' : marcas[r]![1];
}

const capa = (svg: Element, id: string) => svg.querySelector<SVGElement>(`[id="${id}"]`);

/** La boca que se puede mostrar en este personaje: la pedida o su reemplazo. */
export function bocaDisponible(svg: Element, boca: string): string | null {
  for (const b of [boca, ...(REEMPLAZO[boca] ?? []), 'X']) if (capa(svg, `boca_${b}`)) return b;
  return null;
}

/** Muestra una sola capa `boca_*` y deja la elegida en `data-boca` del SVG. Sin capas de boca no hace nada. */
export function mostrarBoca(svg: Element, boca: string): string | null {
  const elegida = bocaDisponible(svg, boca);
  if (!elegida || svg.getAttribute('data-boca') === elegida) return elegida;
  for (const el of svg.querySelectorAll<SVGElement>('[id^="boca_"]')) el.style.display = el.id === `boca_${elegida}` ? 'inline' : 'none';
  svg.setAttribute('data-boca', elegida);
  return elegida;
}

/** Deja visible solo la pose pedida (las poses agrupan cuerpo y brazos; la cabeza es común). */
export function mostrarPose(svg: Element, pose: string) {
  const poses = [...svg.querySelectorAll<SVGElement>('[id^="pose_"]')];
  if (!poses.some((el) => el.id === `pose_${pose}`)) pose = 'neutral';
  for (const el of poses) el.style.display = el.id === `pose_${pose}` ? 'inline' : 'none';
}

export interface RelojAudio {
  /** Tiempo actual del audio en ms. */
  ms(): number;
  sonando(): boolean;
}

export interface Cuadros {
  pedir: (cb: () => void) => number;
  cancelar: (id: number) => void;
}

const CUADROS_NAVEGADOR: Cuadros = {
  pedir: (cb) => requestAnimationFrame(cb),
  cancelar: (id) => cancelAnimationFrame(id),
};

/**
 * En cada cuadro, busca el personaje con `buscar` (puede llegar después: el SVG se carga aparte) y le pone la boca
 * del instante del audio. Devuelve cómo detenerlo.
 */
export function animarBoca(buscar: () => Element | null, reloj: RelojAudio, marcas: () => MarcasBoca | undefined, cuadros: Cuadros = CUADROS_NAVEGADOR): () => void {
  let id = 0;
  let vivo = true;
  const paso = () => {
    if (!vivo) return;
    const svg = buscar();
    const m = marcas();
    if (svg && m) mostrarBoca(svg, reloj.sonando() ? bocaEn(m, reloj.ms()) : 'X');
    id = cuadros.pedir(paso);
  };
  paso();
  return () => {
    vivo = false;
    cuadros.cancelar(id);
  };
}

/** Parpadeo cada 2 a 6 s (150 ms con los ojos cerrados), salvo que el participante pida menos movimiento. */
export function parpadear(buscar: () => Element | null, azar: () => number = Math.random): () => void {
  const quieto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (quieto) return () => undefined;
  let t: ReturnType<typeof setTimeout>;
  const ojos = (cerrados: boolean) => {
    const svg = buscar();
    const abiertos = svg && capa(svg, 'ojos_abiertos');
    const cerradosEl = svg && capa(svg, 'ojos_cerrados');
    if (!abiertos || !cerradosEl) return;
    abiertos.style.display = cerrados ? 'none' : 'inline';
    cerradosEl.style.display = cerrados ? 'inline' : 'none';
  };
  const ciclo = () => {
    t = setTimeout(() => {
      ojos(true);
      t = setTimeout(() => {
        ojos(false);
        ciclo();
      }, 150);
    }, 2000 + azar() * 4000);
  };
  ojos(false);
  ciclo();
  return () => clearTimeout(t);
}

const PROHIBIDOS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed']);

/** Colores marcadores del uniforme y el color del kit que los reemplaza (`docs/20-guia-diseno.md`). */
export const MARCADORES_KIT = { '#0000fe': 'primario', '#00fe00': 'secundario', '#fe0000': 'acento' } as const;
export type ColoresUniforme = Partial<Record<(typeof MARCADORES_KIT)[keyof typeof MARCADORES_KIT], string>>;

const recolorear = (valor: string, kit: ColoresUniforme) =>
  valor.replace(/#(0000fe|00fe00|fe0000)\b/gi, (m) => kit[MARCADORES_KIT[m.toLowerCase() as keyof typeof MARCADORES_KIT]] ?? m);

/**
 * El SVG del personaje (ya saneado al subirlo, HU-0203) como nodo para insertarlo en línea y animar sus capas. Por
 * si acaso se vuelven a quitar scripts, eventos y enlaces `javascript:`. El uniforme toma los colores del kit. Devuelve
 * null si no es un SVG legible.
 */
export function svgEnLinea(marcado: string, documento: Document = document, kit: ColoresUniforme = {}): SVGSVGElement | null {
  const xml = new DOMParser().parseFromString(marcado, 'image/svg+xml');
  const raiz = xml.documentElement;
  if (raiz.nodeName.toLowerCase() !== 'svg' || xml.getElementsByTagName('parsererror').length) return null;
  // Los comentarios no se dibujan y pueden ser largos: fuera.
  const comentarios = xml.createTreeWalker(raiz, 128 /* NodeFilter.SHOW_COMMENT */);
  const quitar: Node[] = [];
  while (comentarios.nextNode()) quitar.push(comentarios.currentNode);
  for (const c of quitar) c.parentNode?.removeChild(c);
  for (const el of [...raiz.querySelectorAll('*')]) {
    if (PROHIBIDOS.has(el.localName.toLowerCase())) {
      el.remove();
      continue;
    }
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
      else if (a.name === 'fill' || a.name === 'stroke' || a.name === 'style' || a.name === 'stop-color') el.setAttribute(a.name, recolorear(a.value, kit));
    }
  }
  const svg = documento.importNode(raiz, true) as unknown as SVGSVGElement;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}
