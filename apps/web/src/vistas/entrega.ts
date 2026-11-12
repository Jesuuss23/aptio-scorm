// HU-1202 · Datos de la vista Entrega (PNT-13): perfiles de LMS con sus recomendaciones y el peso legible.
// HU-1201 · El límite de suspend_data de SCORM 1.2 y los MB con un decimal para la verificación automática.
import type { FormatoExportacion, PerfilExportacion, Recurso } from '../api';

/** Recomendaciones de docs/08-entregas-y-lms.md. La compatibilidad con cada LMS se declara solo después de probarla. */
/** HU-1203 · Formatos que se exportan hoy. */
export const FORMATOS: { id: FormatoExportacion; nombre: string }[] = [
  { id: 'SCORM12', nombre: 'SCORM 1.2 · un solo SCO' },
  { id: 'HTML', nombre: 'HTML autocontenido · para presentar sin LMS' },
];
/** Nombre del formato en el historial. */
export const NOMBRE_FORMATO: Record<string, string> = { SCORM12: 'SCORM 1.2', HTML: 'HTML' };

export const PERFILES: { id: PerfilExportacion; nombre: string; recomendacion: string }[] = [
  { id: 'generico', nombre: 'Genérico (cualquier LMS)', recomendacion: 'Cumple SCORM 1.2 de forma estricta, sin ajustes para ningún LMS. Si el LMS del cliente es desconocido, prueba antes el paquete en SCORM Cloud.' },
  { id: 'moodle', nombre: 'Moodle 4.5+', recomendacion: 'Moodle importa SCORM 1.2 de forma nativa. En la actividad SCORM, elige el método de calificación y el número de intentos.' },
  { id: 'blackboard', nombre: 'Blackboard', recomendacion: 'Blackboard Learn lo abre con su reproductor SCORM integrado. Pruébalo con una cuenta de prueba antes de entregar.' },
  { id: 'chamilo', nombre: 'Chamilo', recomendacion: 'Chamilo no implementa todo el estándar: el paquete ya es simple, con un solo SCO y sin secuenciación.' },
  { id: 'canvas', nombre: 'Canvas', recomendacion: 'Canvas necesita una herramienta LTI de SCORM que la institución debe tener activa; confírmalo con el cliente. Puede importarse como tarea calificada.' },
];

export function megas(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('es-PE')} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('es-PE', { maximumFractionDigits: 1 })} MB`;
}


/** Límite de `cmi.suspend_data` en SCORM 1.2 (CMIString4096). */
export const LIMITE_SUSPEND = 4096;

/** MB con un decimal como máximo, en el formato de es-PE. */
export const mb = (n: number): string => n.toLocaleString('es-PE', { maximumFractionDigits: 1 });

// ---------- HU-1406 · Créditos y licencias ----------

/** Proveedor de lo que arma la plataforma sin IA (subtítulos por letras, el paquete): no sale en los créditos (SUP-64). */
export const PROVEEDOR_APTIO = 'aptio';
export const esDeIa = (r: Pick<Recurso, 'proveedor'>): boolean => Boolean(r.proveedor?.trim()) && r.proveedor!.trim().toLowerCase() !== PROVEEDOR_APTIO;

export const NOMBRE_TIPO_RECURSO: Record<string, string> = {
  AUDIO: 'Voz', IMAGEN: 'Ilustración', SVG: 'Ilustración', VIDEO: 'Video', SUBTITULO: 'Subtítulos', PAQUETE: 'Paquete', DOCUMENTO: 'Documento', FUENTE: 'Fuente',
};
const ORDEN_TIPO = ['AUDIO', 'IMAGEN', 'SVG', 'VIDEO', 'SUBTITULO'];

/**
 * Los recursos generados que usa el curso (los ids de `documento.recursos`), sin paquetes: primero los de IA (voz,
 * ilustraciones, video) y luego lo que armó la plataforma; dentro de cada tipo, por nombre.
 */
export function recursosDelCurso(documento: Record<string, unknown>, recursos: readonly Recurso[]): Recurso[] {
  const lista = Array.isArray(documento.recursos) ? (documento.recursos as { id?: unknown }[]) : [];
  const ids = new Set(lista.map((r) => r?.id).filter((id): id is string => typeof id === 'string'));
  const orden = (t: string) => { const i = ORDEN_TIPO.indexOf(t); return i < 0 ? ORDEN_TIPO.length : i; };
  return recursos
    .filter((r) => ids.has(r.id) && r.tipo !== 'PAQUETE')
    .sort((a, b) => Number(esDeIa(b)) - Number(esDeIa(a)) || orden(a.tipo) - orden(b.tipo) || a.nombre.localeCompare(b.nombre, 'es'));
}
