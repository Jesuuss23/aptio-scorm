// Documentos de prueba generados en la prueba: así no se guardan binarios en el repositorio.
import { createCanvas } from '@napi-rs/canvas';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/** PDF con páginas de texto y, en las indicadas, una imagen con texto (página escaneada). */
export async function pdfDePrueba(total: number, escaneadas: number[] = [], textoEscaneado = 'BLOQUEO Y ETIQUETADO'): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= total; n++) {
    const pagina = pdf.addPage([595, 842]);
    if (escaneadas.includes(n)) {
      const lienzo = createCanvas(1190, 400);
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1190, 400);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 72px sans-serif';
      ctx.fillText(textoEscaneado, 60, 220);
      const png = await pdf.embedPng(lienzo.toBuffer('image/png'));
      pagina.drawImage(png, { x: 0, y: 500, width: 595, height: 200 });
    } else {
      pagina.drawText(`Página ${n}: antes de intervenir un equipo, aplica el bloqueo con candado personal.`, { x: 40, y: 780, size: 11, font: fuente });
    }
  }
  return pdf.save();
}

export async function docxDePrueba(paginas: string[][]): Promise<Uint8Array> {
  const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const salto = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const cuerpo = paginas.map((ps) => ps.map(p).join('')).join(salto);
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}</w:body></w:document>`);
  return zip.generateAsync({ type: 'uint8array' });
}

export async function pptxDePrueba(diapositivas: string[][]): Promise<Uint8Array> {
  const zip = new JSZip();
  const ids = diapositivas.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('');
  zip.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${ids}</p:sldIdLst></p:presentation>`);
  // Orden de archivos distinto al de la presentación, como pasa al reordenar diapositivas.
  const rels = diapositivas.map((_, i) => `<Relationship Id="rId${i + 1}" Target="slides/slide${diapositivas.length - i}.xml"/>`).join('');
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
  diapositivas.forEach((textos, i) => {
    const ps = textos.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('');
    zip.file(`ppt/slides/slide${diapositivas.length - i}.xml`, `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${ps}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  });
  return zip.generateAsync({ type: 'uint8array' });
}
