// M05 · Revisión: lo que comparten el worker, la API y la web (pantallas del curso y origen de cada pantalla). Las reglas
// del control de calidad viven en `calidad.ts` (HU-0505) y se reexportan aquí.

export type { CategoriaObservacion, ContextoCalidad, ObservacionRegla, SeveridadObservacion, TipoObservacion } from './calidad.js';
export { LIMITES, observacionesDePantalla, observacionesRegla } from './calidad.js';

type Texto = { es?: string; en?: string };
type Origen = { tipo: 'documento' | 'ia' | 'manual'; documentoId?: string; paginas?: number[]; revisado: boolean };
type BloqueDoc = {
  id: string; tipo: string; rol?: string; contenido?: Texto; origen?: Origen; decorativa?: boolean; alt?: Texto;
  interaccion?: { tipo: string; datos: Record<string, unknown> };
};
type PistaDoc = { estado?: string; recursoAudioId?: string; subtitulosId?: string };
export type PantallaDoc = {
  id: string; titulo: Texto; tipo: string; estado: string; obligatoria: boolean; disposicion?: string;
  bloques: BloqueDoc[]; narracion?: { texto: Texto; porIdioma?: { es?: PistaDoc; en?: PistaDoc } }; objetivoIds?: string[];
};
type RecursoDoc = { id: string; tipo: string; nombre: string };
export type CursoDoc = { modulos: { capsulas: { pantallas: PantallaDoc[] }[] }[]; recursos?: RecursoDoc[]; objetivos?: { id: string; texto: Texto }[] };

/** Las pantallas del curso en orden. */
export const pantallasDe = (doc: CursoDoc): PantallaDoc[] => doc.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

/** Nombre corto del documento: sin extensión. */
const nombreCorto = (nombre: string) => nombre.replace(/\.[a-z0-9]{2,5}$/i, '');

/**
 * De dónde sale el texto de la pantalla (trazabilidad): las páginas del documento del cliente, p. ej. «Manual p. 12»
 * (CP-047), o la IA si nada viene de un documento.
 */
export function origenDe(p: PantallaDoc, recursos: RecursoDoc[] = []): { tipo: 'documento' | 'ia' | 'manual'; etiqueta: string } {
  const porDocumento = new Map<string, Set<number>>();
  let manual = false;
  for (const b of p.bloques) {
    if (b.origen?.tipo === 'documento' && b.origen.documentoId) {
      const paginas = porDocumento.get(b.origen.documentoId) ?? new Set<number>();
      for (const n of b.origen.paginas ?? []) paginas.add(n);
      porDocumento.set(b.origen.documentoId, paginas);
    } else if (b.origen?.tipo === 'manual') {
      manual = true;
    }
  }
  if (porDocumento.size) {
    const etiqueta = [...porDocumento].map(([id, paginas]) => {
      const nombre = nombreCorto(recursos.find((r) => r.id === id)?.nombre ?? 'Documento del cliente');
      const lista = [...paginas].sort((a, b) => a - b);
      return lista.length ? `${nombre} p. ${lista.join(', ')}` : nombre;
    }).join(' · ');
    return { tipo: 'documento', etiqueta };
  }
  return manual ? { tipo: 'manual', etiqueta: 'Escrito por el equipo' } : { tipo: 'ia', etiqueta: 'Redactado por la IA' };
}
