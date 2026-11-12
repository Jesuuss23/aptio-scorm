// HU-0804 · Paquete bilingüe (RN-08-4): español e inglés en el mismo paquete, con el botón de idioma del reproductor.
// El curso del paquete pasa a `idiomas: ['es', 'en']` y `modoIdioma: 'mismo-paquete'`; entran los recursos de los dos
// idiomas. El inglés de cada texto es obligatorio (el esquema lo exige con los dos idiomas); la voz en inglés no.
import type { CursoReproductor } from '@aptio/player';
import { textosDe } from '@aptio/schema/traduccion';

export type ModoIdioma = 'unico' | 'mismo-paquete';
export const IDIOMAS_BILINGUE = ['es', 'en'] as const;

/** Copia del curso como lo lleva el paquete bilingüe. */
export function cursoBilingue<T extends CursoReproductor>(curso: T): T {
  return { ...structuredClone(curso), idiomas: [...IDIOMAS_BILINGUE], modoIdioma: 'mismo-paquete' } as T;
}

/** Textos del curso con su inglés escrito, del total. */
export function textosEnIngles(curso: unknown): { traducidos: number; total: number } {
  const textos = textosDe(curso);
  return { traducidos: textos.filter((t) => t.en?.trim()).length, total: textos.length };
}

/** Pantallas con narración que no tienen audio en inglés (en inglés muestran la narración como texto). */
export function pantallasSinVozIngles(curso: CursoReproductor): number {
  const pantallas = (curso.modulos ?? []).flatMap((m) => (m.capsulas ?? []).flatMap((c) => c.pantallas ?? []));
  return pantallas.filter((p) => p.narracion?.texto && !p.narracion.porIdioma?.en?.recursoAudioId).length;
}
