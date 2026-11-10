// PDF → texto por página. Una página con muy poco texto se considera escaneada: se dibuja y pasa por OCR.
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Ocr, Pagina } from './tipos.js';

/** Menos caracteres que esto en la capa de texto = página escaneada. */
export const MIN_CARACTERES_TEXTO = 25;

export async function extraerPdf(bytes: Uint8Array, ocr: Ocr, alAvanzar?: (hechas: number, total: number) => Promise<void> | void): Promise<Pagina[]> {
  const doc = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  try {
    const paginas: Pagina[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      let texto = '';
      for (const item of contenido.items) {
        if (!('str' in item)) continue;
        texto += item.str + (item.hasEOL ? '\n' : ' ');
      }
      texto = texto.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
      if (texto.replace(/\s/g, '').length >= MIN_CARACTERES_TEXTO) {
        paginas.push({ n, texto, escaneada: false });
      } else {
        const vista = pagina.getViewport({ scale: 2 });
        const lienzo = createCanvas(Math.ceil(vista.width), Math.ceil(vista.height));
        const ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        await pagina.render({ canvas: lienzo as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vista }).promise;
        paginas.push({ n, texto: await ocr(lienzo.toBuffer('image/png')), escaneada: true });
      }
      pagina.cleanup();
      await alAvanzar?.(n, doc.numPages);
    }
    return paginas;
  } finally {
    await doc.destroy();
  }
}
