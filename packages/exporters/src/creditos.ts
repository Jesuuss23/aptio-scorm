// HU-1406 · CP-107 · Créditos de IA del paquete (REQ-062, ADR-010). Se arman con la procedencia de los recursos que
// lleva el curso: los que tienen un proveedor de IA (todo menos `aptio`, que marca lo que hace la propia plataforma:
// subtítulos por letras, el paquete; SUP-64). El aviso dice qué se generó con IA y quién lo revisó (la organización):
// «Voz e ilustraciones generadas con IA y revisadas por AulasEducativas». Sin recursos de IA no hay créditos.
import type { Creditos, FilaCreditos, Idioma } from '@aptio/player';

/** Proveedor de lo que genera la propia plataforma sin IA: no sale en los créditos. */
export const PROVEEDOR_APTIO = 'aptio';

/** Procedencia de un recurso tal como la guarda la tabla Recurso. */
export interface ProcedenciaRecurso {
  tipo: string;
  proveedor: string | null;
  modelo: string | null;
  licencia: string | null;
}

type Clase = 'voz' | 'ilustraciones' | 'video' | 'otro';
const CLASE: Record<string, Clase> = { AUDIO: 'voz', IMAGEN: 'ilustraciones', SVG: 'ilustraciones', VIDEO: 'video' };
const ORDEN: Clase[] = ['voz', 'ilustraciones', 'video', 'otro'];
const QUE: Record<Idioma, Record<Clase, string>> = {
  es: { voz: 'Voz', ilustraciones: 'Ilustraciones', video: 'Video', otro: 'Otros recursos' },
  en: { voz: 'Voice', ilustraciones: 'Illustrations', video: 'Video', otro: 'Other resources' },
};

/** Nombre comercial de cada proveedor; uno que no está en la lista se muestra tal cual. */
const NOMBRE_PROVEEDOR: Record<string, string> = {
  google: 'Google', azure: 'Microsoft Azure', elevenlabs: 'ElevenLabs', recraft: 'Recraft', firefly: 'Adobe Firefly',
  ideogram: 'Ideogram', openai: 'OpenAI', anthropic: 'Anthropic', runway: 'Runway', simulado: 'Simulado (pruebas)',
};
export const nombreProveedor = (p: string): string => NOMBRE_PROVEEDOR[p.toLowerCase()] ?? p;

/** true si el recurso se generó con un proveedor de IA. */
export const esDeIa = (r: Pick<ProcedenciaRecurso, 'proveedor'>): boolean => Boolean(r.proveedor?.trim()) && r.proveedor!.trim().toLowerCase() !== PROVEEDOR_APTIO;

/** El aviso de revisión humana según lo que se generó con IA; null si nada. */
export function avisoCreditos(lleva: { voz: boolean; ilustraciones: boolean; otros?: boolean }, organizacion: string, idioma: Idioma = 'es'): string | null {
  const quien = organizacion.trim() || (idioma === 'en' ? 'the production team' : 'el equipo de producción');
  if (idioma === 'en') {
    if (lleva.voz && lleva.ilustraciones) return `AI-generated voice and illustrations, reviewed by ${quien}`;
    if (lleva.voz) return `AI-generated voice, reviewed by ${quien}`;
    if (lleva.ilustraciones) return `AI-generated illustrations, reviewed by ${quien}`;
    return lleva.otros ? `AI-generated content, reviewed by ${quien}` : null;
  }
  if (lleva.voz && lleva.ilustraciones) return `Voz e ilustraciones generadas con IA y revisadas por ${quien}`;
  if (lleva.voz) return `Voz generada con IA y revisada por ${quien}`;
  if (lleva.ilustraciones) return `Ilustraciones generadas con IA y revisadas por ${quien}`;
  return lleva.otros ? `Contenido generado con IA y revisado por ${quien}` : null;
}

/**
 * Créditos del paquete: el aviso y una fila por cada combinación distinta de qué, proveedor, modelo y licencia (las 30
 * narraciones de una misma voz son una sola fila). null si ningún recurso es de IA.
 */
export function armarCreditos(recursos: readonly ProcedenciaRecurso[], organizacion: string, idioma: Idioma = 'es'): Creditos | null {
  const deIa = recursos.filter(esDeIa);
  if (!deIa.length) return null;
  const clases = new Set(deIa.map((r) => CLASE[r.tipo] ?? 'otro'));
  const aviso = avisoCreditos({ voz: clases.has('voz'), ilustraciones: clases.has('ilustraciones'), otros: clases.has('video') || clases.has('otro') }, organizacion, idioma)!;
  const vistas = new Map<string, FilaCreditos & { clase: Clase }>();
  for (const r of deIa) {
    const clase = CLASE[r.tipo] ?? 'otro';
    const fila = { clase, que: QUE[idioma][clase], proveedor: nombreProveedor(r.proveedor!.trim()), modelo: r.modelo?.trim() || '—', licencia: r.licencia?.trim() || '—' };
    vistas.set(JSON.stringify([fila.clase, fila.proveedor, fila.modelo, fila.licencia]), fila);
  }
  const filas = [...vistas.values()]
    .sort((a, b) => ORDEN.indexOf(a.clase) - ORDEN.indexOf(b.clase) || a.proveedor.localeCompare(b.proveedor) || a.modelo.localeCompare(b.modelo))
    .map(({ clase: _clase, ...f }) => f);
  return { aviso, filas };
}
