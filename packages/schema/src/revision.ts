// M05 · Revisión: reglas sin IA que comparten el worker (al terminar la etapa 4), la API (al editar una pantalla) y la
// web (origen de cada pantalla). El control de calidad completo con IA llega en el S7 (HU-1001).

export type SeveridadObservacion = 'info' | 'aviso' | 'bloquea-entrega';
export type TipoObservacion = 'CALIDAD' | 'ALINEACION' | 'IDIOMA' | 'ACCESIBILIDAD' | 'MATERIAL_FALTANTE';

export interface ObservacionRegla {
  pantallaId: string;
  tipo: TipoObservacion;
  severidad: SeveridadObservacion;
  mensaje: string;
}

type Texto = { es?: string; en?: string };
type Origen = { tipo: 'documento' | 'ia' | 'manual'; documentoId?: string; paginas?: number[]; revisado: boolean };
type BloqueDoc = { id: string; tipo: string; rol?: string; contenido?: Texto; origen?: Origen; decorativa?: boolean; alt?: Texto };
export type PantallaDoc = {
  id: string; titulo: Texto; tipo: string; estado: string; obligatoria: boolean; disposicion?: string;
  bloques: BloqueDoc[]; narracion?: { texto: Texto }; objetivoIds?: string[];
};
type RecursoDoc = { id: string; tipo: string; nombre: string };
export type CursoDoc = { modulos: { capsulas: { pantallas: PantallaDoc[] }[] }[]; recursos?: RecursoDoc[] };

/** Las pantallas del curso en orden. */
export const pantallasDe = (doc: CursoDoc): PantallaDoc[] => doc.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

const palabras = (t: string | undefined) => (t?.trim() ? t.trim().split(/\s+/).length : 0);

/** Límites de microaprendizaje (guía de disposiciones de IA-15 y docs/20-guia-diseno.md). */
export const LIMITES = { palabrasEnPantalla: 30, palabrasDatoGrande: 6, palabrasNarracion: 90 } as const;

/** Observaciones por reglas de una pantalla; `anteriores` son las disposiciones de las dos pantallas previas. */
export function observacionesDePantalla(p: PantallaDoc, anteriores: (string | undefined)[] = []): ObservacionRegla[] {
  const obs: ObservacionRegla[] = [];
  const agregar = (tipo: TipoObservacion, severidad: SeveridadObservacion, mensaje: string) => obs.push({ pantallaId: p.id, tipo, severidad, mensaje });
  const textos = p.bloques.filter((b) => b.tipo === 'texto');
  const enPantalla = textos.filter((b) => b.rol !== 'titulo').reduce((n, b) => n + palabras(b.contenido?.es), 0);
  if (enPantalla > LIMITES.palabrasEnPantalla) {
    agregar('CALIDAD', 'aviso', `Tiene ${enPantalla} palabras en pantalla; el máximo es ${LIMITES.palabrasEnPantalla}. Pasa el detalle a la narración.`);
  }
  for (const b of textos.filter((x) => x.id.endsWith('-dato-grande'))) {
    const n = palabras(b.contenido?.es);
    if (n > LIMITES.palabrasDatoGrande) agregar('CALIDAD', 'aviso', `El dato destacado tiene ${n} palabras; el máximo es ${LIMITES.palabrasDatoGrande}.`);
  }
  const narracion = palabras(p.narracion?.texto.es);
  if (narracion > LIMITES.palabrasNarracion) {
    agregar('CALIDAD', 'aviso', `La narración tiene ${narracion} palabras (≈ ${Math.round(narracion / 2.5)} s); el máximo es ${LIMITES.palabrasNarracion}.`);
  }
  for (const b of p.bloques.filter((x) => x.tipo === 'imagen' && x.decorativa === false && !x.alt?.es?.trim())) {
    agregar('ACCESIBILIDAD', 'bloquea-entrega', `La imagen ${b.id} no tiene texto alternativo.`);
  }
  if (p.disposicion && anteriores.length === 2 && anteriores.every((d) => d === p.disposicion)) {
    agregar('CALIDAD', 'aviso', `Es la tercera pantalla seguida con la disposición «${p.disposicion}». Cambia la composición para que no canse.`);
  }
  return obs;
}

/** Observaciones por reglas de todo el curso. */
export function observacionesRegla(doc: CursoDoc): ObservacionRegla[] {
  const lista = pantallasDe(doc);
  return lista.flatMap((p, i) => observacionesDePantalla(p, i >= 2 ? [lista[i - 2]!.disposicion, lista[i - 1]!.disposicion] : []));
}

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
