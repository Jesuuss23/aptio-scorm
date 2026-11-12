// HU-0610 · Disparadores simples (CP-069, REQ-045): cuando llega un segundo de la línea de tiempo o termina la voz,
// mostrar u ocultar un elemento de la pantalla o ir a otra pantalla. Viven en `disparadores` de la pantalla, junto a los
// retoques del editor (RN-06-1). Esta validación la usan el validador del curso, la API y el editor.

export const EVENTOS_DISPARADOR = ['tiempo', 'fin-voz'] as const;
export const ACCIONES_DISPARADOR = ['mostrar', 'ocultar', 'ir-a'] as const;
export type EventoDisparador = (typeof EVENTOS_DISPARADOR)[number];
export type AccionDisparador = (typeof ACCIONES_DISPARADOR)[number];
export const MAX_DISPARADORES = 10;
export const SEGUNDO_MAXIMO = 600;

export interface Disparador {
  id: string;
  cuando: { evento: EventoDisparador; segundo?: number };
  accion: { tipo: AccionDisparador; elementoId?: string; pantallaId?: string };
}

type PantallaConDisparadores = { id: string; bloques: { id: string }[]; extras?: { id: string }[]; disparadores?: unknown };

/** Los ids que un disparador puede mostrar u ocultar: los bloques y los extras de la pantalla. */
export const elementosDe = (p: Pick<PantallaConDisparadores, 'bloques' | 'extras'>): string[] => [...p.bloques.map((b) => b.id), ...(p.extras ?? []).map((e) => e.id)];

/**
 * Errores de los disparadores de una pantalla. Lista vacía = válidos. `pantallas` son los ids de todas las pantallas del
 * curso (para `ir-a`). Como mucho 10; `segundo` entre 0 y 600, obligatorio con «tiempo»; `elementoId` de la pantalla con
 * mostrar u ocultar; `pantallaId` de otra pantalla del curso con ir-a.
 */
export function erroresDisparadores(p: PantallaConDisparadores, pantallas: Iterable<string>): string[] {
  const lista = p.disparadores;
  if (lista === undefined) return [];
  if (!Array.isArray(lista)) return [`${p.id}: disparadores debe ser una lista`];
  const errores: string[] = [];
  if (lista.length > MAX_DISPARADORES) errores.push(`${p.id}: como mucho ${MAX_DISPARADORES} disparadores por pantalla (hay ${lista.length})`);
  const elementos = new Set(elementosDe(p));
  const destinos = new Set(pantallas);
  const ids = new Set<string>();
  lista.forEach((d: Partial<Disparador> | null, i) => {
    const ruta = `${p.id}/disparadores/${i}`;
    if (!d || typeof d !== 'object') return void errores.push(`${ruta}: no es un disparador`);
    if (typeof d.id !== 'string' || !d.id) errores.push(`${ruta}: falta el id`);
    else if (ids.has(d.id)) errores.push(`${ruta}: el id «${d.id}» se repite`);
    else ids.add(d.id);
    const evento = d.cuando?.evento;
    if (!(EVENTOS_DISPARADOR as readonly unknown[]).includes(evento)) errores.push(`${ruta}/cuando: evento no válido`);
    if (evento === 'tiempo') {
      const s = d.cuando?.segundo;
      if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > SEGUNDO_MAXIMO) errores.push(`${ruta}/cuando: el segundo debe estar entre 0 y ${SEGUNDO_MAXIMO}`);
    }
    const tipo = d.accion?.tipo;
    if (tipo === 'mostrar' || tipo === 'ocultar') {
      const id = d.accion?.elementoId;
      if (!id || !elementos.has(id)) errores.push(`${ruta}/accion: el elemento «${id ?? ''}» no está en la pantalla`);
    } else if (tipo === 'ir-a') {
      const id = d.accion?.pantallaId;
      if (!id || !destinos.has(id)) errores.push(`${ruta}/accion: la pantalla «${id ?? ''}» no está en el curso`);
      else if (id === p.id) errores.push(`${ruta}/accion: ir a la misma pantalla no hace nada`);
    } else errores.push(`${ruta}/accion: acción no válida`);
  });
  return errores;
}

/** Quita los disparadores que apuntan a elementos que ya no están en la pantalla (p. ej. un extra eliminado). */
export function purgarDisparadores<T extends PantallaConDisparadores>(p: T): T {
  if (!Array.isArray(p.disparadores)) return p;
  const elementos = new Set(elementosDe(p));
  const vivos = (p.disparadores as Disparador[]).filter((d) => d.accion?.tipo === 'ir-a' || (d.accion?.elementoId !== undefined && elementos.has(d.accion.elementoId)));
  if (vivos.length) p.disparadores = vivos;
  else delete p.disparadores;
  return p;
}
