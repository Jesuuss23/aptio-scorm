// HU-0609 · Biblioteca del kit (REQ-017): 6 ilustraciones SVG propias que se dibujan con los roles de color del kit
// (`--ap-primario`, `--ap-acento`…), así toman la paleta de la marca en el editor, la vista previa y el paquete, sin
// archivos ni almacenamiento. Cada forma lleva su color en `style` (no en el atributo `fill`) para que `var()` funcione.
import type { RolColor } from './tipos.ts';

export const PIEZAS = ['candado', 'alerta', 'tablero', 'escena', 'trofeo', 'casco'] as const;
export type Pieza = (typeof PIEZAS)[number];

/** Una forma de la pieza: etiqueta SVG, atributos y el rol del kit para el relleno o el trazo. */
type Forma = [tag: string, attrs: Record<string, string>, relleno: RolColor | null, trazo?: RolColor];

const FORMAS: Record<Pieza, Forma[]> = {
  candado: [
    ['path', { d: 'M32 44V32a18 18 0 0 1 36 0v12', 'stroke-width': '8', 'stroke-linecap': 'round' }, null, 'secundario'],
    ['rect', { x: '20', y: '42', width: '60', height: '46', rx: '8' }, 'primario'],
    ['circle', { cx: '50', cy: '60', r: '7' }, 'acento'],
    ['rect', { x: '47', y: '62', width: '6', height: '14', rx: '3' }, 'acento'],
  ],
  alerta: [
    ['path', { d: 'M50 10 92 86H8Z', 'stroke-width': '4', 'stroke-linejoin': 'round' }, 'acento', 'texto'],
    ['rect', { x: '45', y: '34', width: '10', height: '30', rx: '5' }, 'texto'],
    ['circle', { cx: '50', cy: '74', r: '5.5' }, 'texto'],
  ],
  tablero: [
    ['rect', { x: '14', y: '10', width: '72', height: '80', rx: '6' }, 'primario'],
    ['rect', { x: '22', y: '18', width: '56', height: '64', rx: '3' }, 'blanco'],
    ['rect', { x: '30', y: '28', width: '12', height: '20', rx: '2' }, 'secundario'],
    ['rect', { x: '58', y: '28', width: '12', height: '20', rx: '2' }, 'acento'],
    ['rect', { x: '30', y: '58', width: '40', height: '6', rx: '3' }, 'alerta'],
    ['rect', { x: '30', y: '68', width: '24', height: '6', rx: '3' }, 'secundario'],
  ],
  escena: [
    ['rect', { x: '4', y: '8', width: '92', height: '84', rx: '8' }, 'fondo', 'primario'],
    ['circle', { cx: '74', cy: '28', r: '9' }, 'acento'],
    ['rect', { x: '18', y: '38', width: '30', height: '40' }, 'primario'],
    ['rect', { x: '26', y: '48', width: '6', height: '8' }, 'blanco'],
    ['rect', { x: '36', y: '48', width: '6', height: '8' }, 'blanco'],
    ['path', { d: 'M4 78h92v6a8 8 0 0 1-8 8H12a8 8 0 0 1-8-8Z' }, 'secundario'],
  ],
  trofeo: [
    ['path', { d: 'M30 18h40v14a20 20 0 0 1-40 0Z' }, 'acento'],
    ['path', { d: 'M30 24H18a10 10 0 0 0 14 14M70 24h12a10 10 0 0 1-14 14', 'stroke-width': '5' }, null, 'acento'],
    ['rect', { x: '45', y: '52', width: '10', height: '18' }, 'acento'],
    ['rect', { x: '30', y: '70', width: '40', height: '14', rx: '3' }, 'primario'],
    ['path', { d: 'M50 26l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1Z' }, 'blanco'],
  ],
  casco: [
    ['path', { d: 'M18 66a32 32 0 0 1 64 0Z' }, 'acento'],
    ['rect', { x: '44', y: '28', width: '12', height: '38', rx: '4' }, 'secundario'],
    ['rect', { x: '8', y: '64', width: '84', height: '12', rx: '6' }, 'primario'],
  ],
};

const estilo = (relleno: RolColor | null, trazo?: RolColor) =>
  `fill:${relleno ? `var(--ap-${relleno})` : 'none'}${trazo ? `;stroke:var(--ap-${trazo})` : ''}`;

export const esPieza = (v: unknown): v is Pieza => typeof v === 'string' && (PIEZAS as readonly string[]).includes(v);

/** Los roles del kit que usa la pieza (para mostrarlos o probarlos). */
export const rolesDePieza = (p: Pieza): RolColor[] =>
  [...new Set(FORMAS[p].flatMap(([, , relleno, trazo]) => [relleno, trazo].filter((r): r is RolColor => Boolean(r))))];

/** El marcado SVG de la pieza, con sus colores como variables del kit. Sirve fuera del reproductor (galería del editor). */
export function marcadoPieza(p: Pieza): string {
  const formas = FORMAS[p].map(([tag, attrs, relleno, trazo]) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} style="${estilo(relleno, trazo)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="ap-pieza ap-pieza-${p}" aria-hidden="true" focusable="false">${formas}</svg>`;
}

/** La pieza como elemento SVG del documento (lo que dibuja el reproductor). */
export function piezaSvg(p: Pieza, doc: Document = document): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', `ap-pieza ap-pieza-${p}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs, relleno, trazo] of FORMAS[p]) {
    const el = doc.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.setAttribute('style', estilo(relleno, trazo));
    svg.append(el);
  }
  return svg;
}
