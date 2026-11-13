/**
 * HU-1505 · Datos ficticios del sitio comercial (REQ-067, RN-16-3): el entorno del sitio y las reglas de bloqueo. En
 * producción, un ficticio visible bloquea publicar y nunca sale en el sitio público; en pruebas se publica con aviso y
 * los ficticios salen marcados. Lo usan la API, el worker (vía `@aptio/db`) y la consola web.
 */
import { COLECCIONES } from './sitio-contenido.js';

export type EntornoSitio = 'produccion' | 'pruebas';

/** Lee `SITIO_ENTORNO`: solo `pruebas` (sin importar mayúsculas ni espacios) es pruebas; todo lo demás, producción. */
export function entornoSitio(valor: string | undefined | null): EntornoSitio {
  return valor?.trim().toLowerCase() === 'pruebas' ? 'pruebas' : 'produccion';
}

export interface ElementoFicticio {
  id: string;
  coleccion: string;
  orden: number;
  visible: boolean;
  ficticio: boolean;
}

/** Los ficticios visibles, por colección (en el orden del catálogo) y luego por orden. */
export function ficticiosVisibles<T extends ElementoFicticio>(elementos: readonly T[]): T[] {
  const pos = (c: string) => {
    const i = (COLECCIONES as readonly string[]).indexOf(c);
    return i < 0 ? COLECCIONES.length : i;
  };
  return elementos.filter((e) => e.ficticio && e.visible).sort((a, b) => pos(a.coleccion) - pos(b.coleccion) || a.orden - b.orden);
}

/** CP-116 · En producción, cualquier ficticio visible del sitio bloquea la publicación. En pruebas nunca bloquea (CP-117). */
export function bloqueaPublicacion(entorno: EntornoSitio, ficticiosVisiblesCount: number): boolean {
  return entorno === 'produccion' && ficticiosVisiblesCount > 0;
}

/** Segunda defensa: en producción el sitio público nunca muestra un ficticio, aunque esté visible. */
export function elementosParaPublico<T extends { ficticio: boolean }>(entorno: EntornoSitio, elementos: readonly T[]): T[] {
  return entorno === 'produccion' ? elementos.filter((e) => !e.ficticio) : [...elementos];
}
