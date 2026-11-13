import { describe, expect, it } from 'vitest';
import { BYTES_CABECERA, PERMITIDOS, verificarContenido, verificarTipo } from '../src/index.js';

const PDF = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n');
// Cabecera de un ejecutable de Windows (MZ … PE).
const EXE = (() => {
  const b = new Uint8Array(512);
  b.set([0x4d, 0x5a], 0);
  b.set([0x80, 0, 0, 0], 0x3c);
  b.set([0x50, 0x45, 0, 0], 0x80);
  return b;
})();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

describe('tipo real de los archivos (RN-14-1)', () => {
  it('acepta un PDF declarado como PDF', async () => {
    expect(await verificarTipo(PDF, 'application/pdf')).toEqual({ valido: true, mimeReal: 'application/pdf' });
  });

  it('CP-034: rechaza un .exe renombrado a .pdf', async () => {
    const r = await verificarTipo(EXE, 'application/pdf');
    expect(r.valido).toBe(false);
    expect(r.mimeReal).toBe('application/x-msdownload');
  });

  it('rechaza un PNG declarado como PDF y lo que no reconoce', async () => {
    expect((await verificarTipo(PNG, 'application/pdf')).valido).toBe(false);
    expect(await verificarTipo(new TextEncoder().encode('texto plano'), 'application/pdf')).toMatchObject({ valido: false });
  });

  it('rechaza tipos fuera de la lista; el SVG no se acepta por cabecera porque se sanea aparte', async () => {
    expect(PERMITIDOS['image/svg+xml']).toMatchObject({ tipo: 'SVG' });
    expect((await verificarTipo(PNG, 'image/svg+xml')).valido).toBe(false);
    expect(await verificarTipo(PNG, 'application/x-msdownload')).toMatchObject({ valido: false });
  });

  it('lee más bytes solo cuando un docx parece un zip genérico', async () => {
    const pedidos: number[] = [];
    // Un zip cuya primera entrada no es de Office.
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0x61, 0x2e, 0x74, 0x78, 0x74]);
    const r = await verificarContenido(async (n) => {
      pedidos.push(n);
      return zip;
    }, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(r.valido).toBe(false);
    expect(pedidos).toEqual([BYTES_CABECERA, 1024 * 1024]);

    pedidos.length = 0;
    await verificarContenido(async (n) => {
      pedidos.push(n);
      return PDF;
    }, 'application/pdf');
    expect(pedidos).toEqual([BYTES_CABECERA]);
  });

  it('HU-0206 · acepta un zip de curso anterior por su contenido y rechaza un PDF declarado como zip', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0x61, 0x2e, 0x63, 0x73, 0x73]);
    expect(PERMITIDOS['application/zip']).toMatchObject({ tipo: 'DOCUMENTO' });
    expect(await verificarTipo(zip, 'application/zip')).toMatchObject({ valido: true, mimeReal: 'application/zip' });
    expect(await verificarTipo(PDF, 'application/zip')).toMatchObject({ valido: false, mimeReal: 'application/pdf' });
  });
});
