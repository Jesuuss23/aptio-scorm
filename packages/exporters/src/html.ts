// HU-1203 · HTML autocontenido (CP-093): la misma carpeta que el paquete SCORM 1.2, sin `imsmanifest.xml`, con un
// LEEME.txt y `modo: 'html'` en datos.js. El reproductor, en ese modo, no busca la API de SCORM ni ofrece el modo
// diagnóstico: el curso funciona completo, sin seguimiento (docs/08). Todo es relativo y nada se pide a internet, así que
// abre con doble clic desde `file://`. El ZIP es determinista, igual que el SCORM.
import { armarContenido, comprimir, type EntradaScorm12, type PaqueteScorm12 } from './scorm12.ts';

export type EntradaHtml = Omit<EntradaScorm12, 'incluirDiagnostico'>;

export const LEEME_HTML = (titulo: string) => `${titulo}

Descomprime y abre index.html con doble clic.

Funciona sin internet y sin LMS, en cualquier navegador actual. No guarda el avance ni la nota:
para registrar el seguimiento de los participantes, usa el paquete SCORM en el LMS.
`;

export async function construirHtml(entrada: EntradaHtml): Promise<PaqueteScorm12> {
  const { contenido, lista, faltantes, idioma, titulo } = armarContenido(entrada, { modo: 'html' });
  contenido.set('LEEME.txt', LEEME_HTML(titulo));
  const orden = [lista[0]!, 'LEEME.txt', ...lista.slice(1)];
  const zip = await comprimir(orden.map((r) => [r, contenido.get(r)!]));
  return { zip, archivos: orden, faltantes, idioma };
}
