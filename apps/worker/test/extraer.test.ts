import { afterAll, describe, expect, it } from 'vitest';
import { extraerDocx, extraerPptx } from '../src/extraer/ooxml.js';
import { cerrarOcr, ocrTesseract } from '../src/extraer/ocr.js';
import { extraerPdf } from '../src/extraer/pdf.js';
import { docxDePrueba, pdfDePrueba, pptxDePrueba } from './documentos.js';

afterAll(() => cerrarOcr());

describe('extracción de texto por página (HU-0304)', () => {
  it('CP-033 · un PDF de 84 páginas da el texto de cada una; la escaneada pasa por OCR y se marca', async () => {
    const pdf = await pdfDePrueba(84, [42]);
    const avances: number[] = [];
    const paginas = await extraerPdf(pdf, ocrTesseract, (hechas) => {
      avances.push(hechas);
    });
    expect(paginas).toHaveLength(84);
    expect(paginas[0]).toEqual({ n: 1, texto: 'Página 1: antes de intervenir un equipo, aplica el bloqueo con candado personal.', escaneada: false });
    expect(paginas.filter((p) => p.escaneada).map((p) => p.n)).toEqual([42]);
    expect(paginas[41]!.texto.toUpperCase()).toContain('BLOQUEO Y ETIQUETADO');
    expect(avances.at(-1)).toBe(84);
  }, 120_000);

  it('Word: separa las páginas por sus saltos', async () => {
    const docx = await docxDePrueba([['Bloqueo y etiquetado', 'Objetivo del procedimiento'], ['Paso 1: avisa al área']]);
    expect(await extraerDocx(docx)).toEqual([
      { n: 1, texto: 'Bloqueo y etiquetado\nObjetivo del procedimiento', escaneada: false },
      { n: 2, texto: 'Paso 1: avisa al área', escaneada: false },
    ]);
  });

  it('PowerPoint: una página por diapositiva, en el orden de la presentación', async () => {
    const pptx = await pptxDePrueba([['Portada', 'Bloqueo y etiquetado'], ['Energía cero']]);
    expect(await extraerPptx(pptx)).toEqual([
      { n: 1, texto: 'Portada\nBloqueo y etiquetado', escaneada: false },
      { n: 2, texto: 'Energía cero', escaneada: false },
    ]);
  });
});
