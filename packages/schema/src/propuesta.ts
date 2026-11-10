// HU-0504 · Propuestas de la IA (IA-16 v2, SUP-39): un JSON Patch relativo a una pantalla. Lo comparten el worker
// (comprueba la propuesta antes de guardarla), la API (la aplica) y la web (muestra las variantes antes de aplicar).
import { aplicarPatch, claves, type OperacionPatch } from './patch.js';
import { type CursoDoc, type PantallaDoc, pantallasDe } from './revision.js';

/** Pedidos de la HU-0504 que se calculan en el S5. «Otra ilustración» llega con las ilustraciones (S9). */
export const TIPOS_PROPUESTA = ['mas-visual', 'menos-texto', 'actividad', 'variantes', 'libre'] as const;
export type TipoPropuesta = (typeof TIPOS_PROPUESTA)[number];
export const TAREA_PROPUESTA = 'IA-16';
export const NOMBRE_PROPUESTA: Record<TipoPropuesta, string> = {
  'mas-visual': 'Más visual', 'menos-texto': 'Menos texto', actividad: 'Convertir en actividad', variantes: 'Ver 3 variantes', libre: 'Pedido libre',
};

export type Variante = { nombre: string; disposicion: string; patch: OperacionPatch[] };
/** Lo que guarda `Propuesta.cambios`: el patch, o las 3 variantes. */
export type CambiosPropuesta = { patch: OperacionPatch[] } | { variantes: Variante[] };

/** SUP-39: la propuesta no toca el id, el estado ni la narración (su audio, boca y subtítulos). */
export function rutaProtegida(ruta: string): boolean {
  const [primera] = claves(ruta);
  return primera === undefined || primera === 'id' || primera === 'estado' || primera === 'narracion';
}

/** Errores de un patch antes de aplicarlo: rutas protegidas. */
export function erroresRutas(patch: readonly OperacionPatch[]): string[] {
  const errores: string[] = [];
  patch.forEach((o, i) => {
    for (const r of [o.path, 'from' in o ? o.from : undefined]) {
      if (r === undefined) continue;
      try {
        if (rutaProtegida(r)) errores.push(`Operación ${i + 1}: la ruta «${r}» no se puede cambiar (id, estado o narración)`);
      } catch (e) {
        errores.push(`Operación ${i + 1}: ${(e as Error).message}`);
      }
    }
  });
  return errores;
}

type Bloque = PantallaDoc['bloques'][number] & { origen?: { tipo: string; revisado: boolean; documentoId?: string; paginas?: number[] } };

/**
 * Aplica el patch a la pantalla y marca como propuesta de la IA lo que cambió (trazabilidad): los textos nuevos o
 * cambiados llevan `origen.tipo = ia` sin revisar, conservando el documento y la página de donde venían.
 */
export function aplicarEnPantalla(pantalla: PantallaDoc, patch: readonly OperacionPatch[]): PantallaDoc {
  const errores = erroresRutas(patch);
  if (errores.length) throw new Error(errores.join('; '));
  const nueva = aplicarPatch(pantalla, patch);
  const antes = new Map((pantalla.bloques as Bloque[]).map((b) => [b.id, JSON.stringify(b)]));
  for (const b of nueva.bloques as Bloque[]) {
    if (antes.get(b.id) === JSON.stringify(b) || b.tipo !== 'texto') continue;
    b.origen = { ...(b.origen ?? {}), tipo: 'ia', revisado: false };
  }
  return nueva;
}

/** El patch que se aplica: el de la propuesta o el de la variante elegida. */
export function patchDe(cambios: CambiosPropuesta, varianteIndice?: number): OperacionPatch[] {
  if ('patch' in cambios) return cambios.patch;
  const v = cambios.variantes[varianteIndice ?? -1];
  if (!v) throw new RangeError('Elige una de las variantes');
  return v.patch;
}

/** Una copia del curso con la pantalla cambiada por el patch. Lanza un error si la pantalla no existe o el patch falla. */
export function cursoConPropuesta<T extends CursoDoc>(doc: T, pantallaId: string, patch: readonly OperacionPatch[]): T {
  const copia = structuredClone(doc);
  for (const m of copia.modulos) {
    for (const c of m.capsulas) {
      const i = c.pantallas.findIndex((p) => p.id === pantallaId);
      if (i >= 0) {
        c.pantallas[i] = aplicarEnPantalla(c.pantallas[i]!, patch);
        return copia;
      }
    }
  }
  throw new Error(`El curso no tiene la pantalla ${pantallaId}`);
}

/**
 * Huella de lo que una propuesta puede cambiar en la pantalla (RN-05-4, SUP-39): todo menos el estado de aprobación y
 * los datos de la voz. Si difiere de la de `versionBase`, la propuesta está vencida.
 */
export function huellaPantalla(doc: CursoDoc, pantallaId: string): string | null {
  const p = pantallasDe(doc).find((x) => x.id === pantallaId);
  if (!p) return null;
  const { estado: _estado, narracion, ...resto } = p as PantallaDoc & { narracion?: { texto: unknown } };
  return JSON.stringify({ ...resto, narracion: narracion?.texto ?? null });
}

/** Pantalla para el prompt: sin los datos de la voz (audio, boca y hash), que la IA no debe tocar. */
export function pantallaParaPrompt(p: PantallaDoc): unknown {
  const { narracion, ...resto } = p as PantallaDoc & { narracion?: { texto: unknown } };
  return narracion ? { ...resto, narracion: { texto: narracion.texto } } : resto;
}
