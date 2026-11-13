/**
 * Catálogo cerrado de bloques del sitio comercial y lógica pura de orden
 * (HU-1503, REQ-066, RN-16-2). Lo usan la API y la consola web.
 */

/** Tipos de bloque con su nombre visible y, si lo tiene, de dónde salen sus datos. */
export const CATALOGO_BLOQUES = {
  hero: { nombre: 'Portada' },
  confianza: { nombre: 'Franja de confianza' },
  metricas: { nombre: 'Cifras', fuente: 'Contenido › Cifras' },
  logos: { nombre: 'Logos de clientes', fuente: 'Contenido › Logos' },
  pasos: { nombre: 'Cómo funciona', fuente: 'Contenido › Pasos' },
  funcionalidades: { nombre: 'Funcionalidades', fuente: 'Contenido › Funcionalidades' },
  lms: { nombre: 'Compatibilidad LMS', fuente: 'Contenido › LMS' },
  planes: { nombre: 'Planes (resumen)', fuente: 'Planes' },
  testimonios: { nombre: 'Testimonios', fuente: 'Contenido › Testimonios' },
  faq: { nombre: 'Preguntas frecuentes', fuente: 'Contenido › Preguntas' },
  cta: { nombre: 'Llamada final' },
  fhero: { nombre: 'Portada de funcionalidad' },
  comparacion: { nombre: 'Antes y ahora' },
  precios: { nombre: 'Planes y precios', fuente: 'Planes' },
  comparativa: { nombre: 'Tabla comparativa', fuente: 'Planes › Comparativa' },
  bloglista: { nombre: 'Blog (WordPress)', fuente: 'Blog (WordPress)' },
  sectores: { nombre: 'Sectores', fuente: 'Páginas › Landings de sector' },
  agendador: { nombre: 'Agendador', fuente: 'Agendamiento' },
} as const satisfies Record<string, { nombre: string; fuente?: string }>;

export type TipoBloque = keyof typeof CATALOGO_BLOQUES;

export const TIPOS_BLOQUE = Object.keys(CATALOGO_BLOQUES) as TipoBloque[];

export function esTipoBloque(tipo: unknown): tipo is TipoBloque {
  return typeof tipo === 'string' && Object.hasOwn(CATALOGO_BLOQUES, tipo);
}

export function nombreBloque(tipo: string): string {
  return esTipoBloque(tipo) ? CATALOGO_BLOQUES[tipo].nombre : tipo;
}

export function fuenteBloque(tipo: string): string | undefined {
  return esTipoBloque(tipo) ? (CATALOGO_BLOQUES[tipo] as { fuente?: string }).fuente : undefined;
}

export interface BloqueOrdenable {
  id: string;
  orden: number;
  visible: boolean;
}

/** Ordena por `orden` sin mutar la lista. */
export function ordenarBloques<T extends BloqueOrdenable>(bloques: readonly T[]): T[] {
  return [...bloques].sort((a, b) => a.orden - b.orden);
}

/** Posición que toma un bloque nuevo: al final, sin huecos. */
export function ordenAlFinal(bloques: readonly BloqueOrdenable[]): number {
  return bloques.length === 0 ? 0 : Math.max(...bloques.map((b) => b.orden)) + 1;
}

export function contarVisibles(bloques: readonly BloqueOrdenable[]): number {
  return bloques.filter((b) => b.visible).length;
}

/** Bloques que ve el público: solo los visibles y en su orden (RN-16-2). */
export function bloquesPublicos<T extends BloqueOrdenable>(bloques: readonly T[]): T[] {
  return ordenarBloques(bloques).filter((b) => b.visible);
}

export type ErrorOrden =
  | { tipo: 'DUPLICADO'; id: string }
  | { tipo: 'AJENO'; id: string }
  | { tipo: 'FALTANTE'; id: string };

/**
 * Comprueba que `ids` sea exactamente el conjunto de bloques de la página,
 * sin repetidos ni ajenos ni faltantes. Devuelve el primer problema o `null`.
 */
export function validarOrden(actuales: readonly { id: string }[], ids: readonly string[]): ErrorOrden | null {
  const propios = new Set(actuales.map((b) => b.id));
  const vistos = new Set<string>();
  for (const id of ids) {
    if (vistos.has(id)) return { tipo: 'DUPLICADO', id };
    if (!propios.has(id)) return { tipo: 'AJENO', id };
    vistos.add(id);
  }
  for (const b of actuales) if (!vistos.has(b.id)) return { tipo: 'FALTANTE', id: b.id };
  return null;
}

/** Aplica un orden ya validado: cada bloque toma su posición en `ids`. */
export function aplicarOrden<T extends BloqueOrdenable>(actuales: readonly T[], ids: readonly string[]): T[] {
  const error = validarOrden(actuales, ids);
  if (error) throw new Error(`Orden inválido: ${error.tipo} ${error.id}`);
  const porId = new Map(actuales.map((b) => [b.id, b]));
  return ids.map((id, orden) => ({ ...porId.get(id)!, orden }));
}

/** Lista de ids tras mover un bloque una posición; igual si está en el extremo. */
export function moverBloque(ids: readonly string[], id: string, paso: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= ids.length) return [...ids];
  const nuevos = [...ids];
  [nuevos[i], nuevos[j]] = [nuevos[j]!, nuevos[i]!];
  return nuevos;
}

/** Reasigna 0, 1, 2… tras borrar un bloque, conservando el orden relativo. */
export function compactarOrden<T extends BloqueOrdenable>(bloques: readonly T[]): T[] {
  return ordenarBloques(bloques).map((b, orden) => ({ ...b, orden }));
}
