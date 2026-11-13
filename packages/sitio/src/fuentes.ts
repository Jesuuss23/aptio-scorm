/**
 * HU-1508 · Fuentes del sitio público, alojadas por nosotros (licencia SIL OFL 1.1, paquetes `@fontsource`): Atkinson
 * Hyperlegible para el texto (400 y 700, la 400 se precarga) y Plus Jakarta Sans para los títulos (700 y 800). Solo el
 * subconjunto latino (cubre el español y el inglés). El nombre publicado lleva un trozo de su sha256: el archivo no
 * cambia nunca bajo ese nombre y se puede guardar en caché un año.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const requerir = createRequire(import.meta.url);

export interface Fuente {
  familia: 'Atkinson Hyperlegible' | 'Plus Jakarta Sans';
  peso: 400 | 700 | 800;
  /** Nombre publicado, con el trozo del hash: `atkinson-hyperlegible-400-1a2b3c4d.woff2`. */
  archivo: string;
  /** Ruta del archivo en `node_modules`. */
  origen: string;
  precargar: boolean;
}

const DEFINICION = [
  { familia: 'Atkinson Hyperlegible', paquete: '@fontsource/atkinson-hyperlegible', base: 'atkinson-hyperlegible', peso: 400, precargar: true },
  { familia: 'Atkinson Hyperlegible', paquete: '@fontsource/atkinson-hyperlegible', base: 'atkinson-hyperlegible', peso: 700, precargar: false },
  { familia: 'Plus Jakarta Sans', paquete: '@fontsource/plus-jakarta-sans', base: 'plus-jakarta-sans', peso: 700, precargar: false },
  { familia: 'Plus Jakarta Sans', paquete: '@fontsource/plus-jakarta-sans', base: 'plus-jakarta-sans', peso: 800, precargar: false },
] as const;

let cache: Fuente[] | null = null;

/** Las cuatro fuentes con su nombre publicado (se calcula una vez por proceso). */
export function fuentes(): Fuente[] {
  cache ??= DEFINICION.map((d) => {
    const origen = requerir.resolve(`${d.paquete}/files/${d.base}-latin-${d.peso}-normal.woff2`);
    const hash = createHash('sha256').update(readFileSync(origen)).digest('hex').slice(0, 8);
    return { familia: d.familia, peso: d.peso, archivo: `${d.base}-${d.peso}-${hash}.woff2`, origen, precargar: d.precargar };
  });
  return cache;
}

/** Carpeta pública de las fuentes, dentro de la base del sitio. No choca con una página: las rutas no llevan `_`. */
export const CARPETA_FUENTES = '_fuentes';

/** Los bytes de una fuente por su nombre publicado, o `null` si no es una de las nuestras. */
export function leerFuente(archivo: string): Uint8Array | null {
  const f = fuentes().find((x) => x.archivo === archivo);
  return f ? readFileSync(f.origen) : null;
}
