// Word y PowerPoint → texto por página. Word: saltos de página manuales o los que Word dejó al guardar
// (lastRenderedPageBreak). PowerPoint: una página por diapositiva, en el orden de la presentación.
import { DOMParser, type Element } from '@xmldom/xmldom';
import JSZip from 'jszip';
import type { Pagina } from './tipos.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const xml = (texto: string) => new DOMParser().parseFromString(texto, 'text/xml');
const limpiar = (t: string) => t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

async function leer(zip: JSZip, ruta: string): Promise<string> {
  const f = zip.file(ruta);
  if (!f) throw new Error(`El archivo no tiene ${ruta}`);
  return f.async('string');
}

export async function extraerDocx(bytes: Uint8Array): Promise<Pagina[]> {
  const doc = xml(await leer(await JSZip.loadAsync(bytes), 'word/document.xml'));
  const paginas: string[] = [''];
  const recorrer = (nodo: Element) => {
    for (const hijo of Array.from(nodo.childNodes as unknown as ArrayLike<Element>)) {
      if (hijo.nodeType !== 1 || hijo.namespaceURI !== W) {
        if (hijo.nodeType === 1) recorrer(hijo);
        continue;
      }
      const nombre = hijo.localName;
      if (nombre === 't') paginas[paginas.length - 1] += hijo.textContent ?? '';
      else if (nombre === 'tab') paginas[paginas.length - 1] += ' ';
      else if (nombre === 'lastRenderedPageBreak' || (nombre === 'br' && hijo.getAttributeNS(W, 'type') === 'page')) {
        if (paginas[paginas.length - 1]!.trim()) paginas.push('');
      } else {
        recorrer(hijo);
        if (nombre === 'p') paginas[paginas.length - 1] += '\n';
      }
    }
  };
  recorrer(doc.documentElement!);
  return paginas.map(limpiar).filter((t, i, l) => t || l.length === 1).map((texto, i) => ({ n: i + 1, texto, escaneada: false }));
}

export async function extraerPptx(bytes: Uint8Array): Promise<Pagina[]> {
  const zip = await JSZip.loadAsync(bytes);
  const presentacion = xml(await leer(zip, 'ppt/presentation.xml'));
  const relaciones = xml(await leer(zip, 'ppt/_rels/presentation.xml.rels'));
  const destino = new Map<string, string>();
  for (const rel of Array.from(relaciones.getElementsByTagName('Relationship'))) destino.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '');
  const ids = Array.from(presentacion.getElementsByTagNameNS(P, 'sldId')).map((s) => s.getAttributeNS(R, 'id') ?? '');
  const paginas: Pagina[] = [];
  for (const [i, id] of ids.entries()) {
    const ruta = `ppt/${(destino.get(id) ?? '').replace(/^\/?ppt\//, '').replace(/^\.\.\//, '')}`;
    const diapositiva = xml(await leer(zip, ruta));
    const parrafos = Array.from(diapositiva.getElementsByTagNameNS(A, 'p')).map((p) =>
      Array.from(p.getElementsByTagNameNS(A, 't')).map((t) => t.textContent ?? '').join(''));
    paginas.push({ n: i + 1, texto: limpiar(parrafos.filter((t) => t.trim()).join('\n')), escaneada: false });
  }
  return paginas;
}
