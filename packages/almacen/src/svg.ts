// Saneado de SVG (HU-0203, CP-024, RN-14-1). Un SVG es código: puede llevar scripts, manejadores `on*`,
// enlaces javascript: o cargar recursos externos. Se reconstruye con una lista cerrada de elementos y
// atributos; todo lo demás se quita y se informa. Nunca se guarda el archivo original.
import { DOMParser, type Element, MIME_TYPE, type Node, XMLSerializer } from '@xmldom/xmldom';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Elementos de dibujo que exporta Illustrator. Sin script, foreignObject, image, animate ni set. */
const ELEMENTOS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern',
]);

/** Atributos de presentación y geometría. Los `on*` y cualquier otro quedan fuera. */
const ATRIBUTOS = new Set([
  'id', 'class', 'style', 'transform', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fx', 'fy', 'offset', 'preserveAspectRatio', 'version',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'display',
  'visibility', 'stop-color', 'stop-opacity', 'clip-path', 'clip-rule', 'mask', 'gradientUnits',
  'gradientTransform', 'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform',
  'clipPathUnits', 'maskUnits', 'maskContentUnits', 'href', 'xlink:href', 'xmlns', 'xmlns:xlink',
  'data-name', 'enable-background', 'xml:space', 'overflow', 'mix-blend-mode', 'isolation',
]);

/** url(...) o un href solo pueden apuntar a un elemento del mismo SVG. */
const REFERENCIA_EXTERNA = /url\(\s*['"]?\s*(?!#)|@import|expression\s*\(|javascript:/i;

export interface SvgSaneado {
  svg: string;
  /** Lo que se quitó, para avisar al diseñador: «script», «atributo onclick», … */
  eliminados: string[];
  ids: string[];
  viewBox: string | null;
}

export class SvgNoValido extends Error {}

export function sanearSvg(texto: string): SvgSaneado {
  const eliminados = new Set<string>();
  // Sin DOCTYPE: evita entidades declaradas en el archivo (bombas de expansión, entidades externas).
  if (/<!DOCTYPE|<!ENTITY/i.test(texto)) {
    eliminados.add('declaración DOCTYPE');
    texto = texto.replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '');
  }
  const errores: string[] = [];
  let raiz: Element | null;
  try {
    raiz = new DOMParser({
      onError: (nivel: string, mensaje: string) => {
        if (nivel !== 'warning') errores.push(mensaje);
      },
    }).parseFromString(texto, MIME_TYPE.XML_SVG_IMAGE).documentElement;
  } catch {
    throw new SvgNoValido('El archivo no es un SVG válido');
  }
  if (errores.length || !raiz || raiz.localName !== 'svg' || (raiz.namespaceURI && raiz.namespaceURI !== SVG_NS)) {
    throw new SvgNoValido('El archivo no es un SVG válido');
  }

  const ids: string[] = [];
  const limpiar = (el: Element) => {
    for (const hijo of [...(el.childNodes as unknown as Iterable<Node>)]) {
      if (hijo.nodeType === hijo.COMMENT_NODE || hijo.nodeType === hijo.PROCESSING_INSTRUCTION_NODE) {
        el.removeChild(hijo);
        continue;
      }
      if (hijo.nodeType !== hijo.ELEMENT_NODE) continue;
      const h = hijo as Element;
      const nombre = h.localName ?? h.nodeName;
      if (!ELEMENTOS.has(nombre) || (h.namespaceURI && h.namespaceURI !== SVG_NS)) {
        eliminados.add(nombre);
        el.removeChild(h);
        continue;
      }
      if (h.localName === 'style' && REFERENCIA_EXTERNA.test(h.textContent ?? '')) {
        eliminados.add('estilo con recursos externos');
        el.removeChild(h);
        continue;
      }
      limpiarAtributos(h);
      limpiar(h);
    }
  };
  const limpiarAtributos = (el: Element) => {
    for (const a of [...(el.attributes as unknown as Iterable<{ name: string; value: string; namespaceURI: string | null }>)]) {
      const nombre = a.name;
      const permitido = ATRIBUTOS.has(nombre) && !/^on/i.test(nombre);
      const valor = a.value.trim();
      const esEnlace = nombre === 'href' || nombre === 'xlink:href';
      if (!permitido || (esEnlace && !valor.startsWith('#')) || REFERENCIA_EXTERNA.test(valor)) {
        eliminados.add(/^on/i.test(nombre) ? 'atributos on*' : `atributo ${nombre}`);
        el.removeAttribute(nombre);
        continue;
      }
      if (nombre === 'id') ids.push(valor);
    }
  };
  limpiarAtributos(raiz);
  limpiar(raiz);
  if (!raiz.getAttribute('xmlns')) raiz.setAttribute('xmlns', SVG_NS);
  if ([...(raiz.attributes as unknown as Iterable<{ value: string }>)].some((a) => a.value === XLINK_NS) === false && /xlink:href/.test(raiz.toString())) {
    raiz.setAttribute('xmlns:xlink', XLINK_NS);
  }
  return {
    svg: new XMLSerializer().serializeToString(raiz),
    eliminados: [...eliminados],
    ids,
    viewBox: raiz.getAttribute('viewBox'),
  };
}
