// HU-0605 · Lógica del panel Diseños (sin DOM): qué diseños se ofrecen, cómo se llaman y el curso de una sola pantalla
// que dibuja cada miniatura.
import type { CursoReproductor } from '@aptio/player';
import { DISENOS_CONTENIDO, disenosPara, esDisenoContenido, NOMBRE_DISENO, NOMBRE_DISPOSICION, type Disposicion } from '@aptio/schema/marca';
import type { CursoDoc, PantallaDoc } from '@aptio/schema/revision';

export type ConDisposicion = PantallaDoc & { disposicion?: string; ajustes?: unknown };

export const nombreDiseno = (d: string | undefined) =>
  esDisenoContenido(d) ? NOMBRE_DISENO[d] : (NOMBRE_DISPOSICION[d as Disposicion] ?? d ?? 'Idea + ilustración');

/** Los diseños que muestra el panel, siempre en el mismo orden; una disposición de texto (como la portada) va primero. */
export function opcionesDiseno(p: ConDisposicion): string[] {
  if (!disenosPara(p).length) return [];
  const actual = p.disposicion ?? 'idea';
  return esDisenoContenido(actual) ? [...DISENOS_CONTENIDO] : [actual, ...DISENOS_CONTENIDO];
}

/** El curso con una sola pantalla, en la disposición pedida. Los ajustes solo valen para la disposición en que se hicieron (RN-06-3). */
export function cursoConDiseno(doc: CursoDoc, p: ConDisposicion, disposicion: string): CursoReproductor {
  const pantalla: ConDisposicion = { ...p, disposicion };
  if (disposicion !== (p.disposicion ?? 'idea')) delete pantalla.ajustes;
  const [modulo] = doc.modulos;
  const [capsula] = modulo!.capsulas;
  return { ...doc, modulos: [{ ...modulo!, capsulas: [{ ...capsula!, pantallas: [pantalla] }] }] } as unknown as CursoReproductor;
}
