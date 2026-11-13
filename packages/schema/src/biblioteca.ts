// HU-0609 · Imágenes de los extras (REQ-046, REQ-017): un extra «imagen» muestra una pieza de la biblioteca del kit
// (`pieza`, se dibuja con los colores del kit) o una imagen subida al proyecto (`recursoId`, imagen o SVG del curso),
// nunca las dos. Reglas puras que usan el validador del curso, la API y la web.

export const PIEZAS_KIT = ['candado', 'alerta', 'tablero', 'escena', 'trofeo', 'casco'] as const;
export type PiezaKit = (typeof PIEZAS_KIT)[number];
/** Texto alternativo con que empieza cada pieza al insertarla (se puede cambiar en Propiedades). */
export const NOMBRE_PIEZA: Record<PiezaKit, string> = {
  candado: 'Candado', alerta: 'Señal de alerta', tablero: 'Tablero eléctrico', escena: 'Planta industrial', trofeo: 'Trofeo', casco: 'Casco de seguridad',
};
/** Los tipos de recurso del curso que puede mostrar un extra imagen. */
export const TIPOS_IMAGEN = ['imagen', 'svg'] as const;

type ExtraImagen = { id: string; tipo: string; recursoId?: string; pieza?: string; decorativa?: boolean };

/**
 * Errores de los extras de una pantalla. `tiposRecurso` da el tipo de cada recurso del curso por id. Lista vacía = válidos.
 * - `pieza` y `decorativa` solo en un extra imagen; nunca `pieza` y `recursoId` juntos.
 * - El `recursoId` de un extra imagen es una imagen o un SVG del curso.
 */
export function erroresExtras(ruta: string, extras: readonly ExtraImagen[] | undefined, tiposRecurso: ReadonlyMap<string, string>): string[] {
  const errores: string[] = [];
  (extras ?? []).forEach((e, i) => {
    const donde = `${ruta}/extras/${i}`;
    if (e.tipo !== 'imagen') {
      if (e.pieza !== undefined) errores.push(`${donde}: solo un extra imagen puede llevar una pieza del kit`);
      if (e.decorativa !== undefined) errores.push(`${donde}: solo un extra imagen puede ser decorativo`);
      return;
    }
    if (e.pieza !== undefined && e.recursoId !== undefined) errores.push(`${donde}: usa una pieza del kit o una imagen subida, no las dos`);
    if (e.recursoId !== undefined) {
      const tipo = tiposRecurso.get(e.recursoId);
      if (tipo !== undefined && !(TIPOS_IMAGEN as readonly string[]).includes(tipo)) errores.push(`${donde}: el recurso «${e.recursoId}» es ${tipo}, no una imagen`);
    }
  });
  return errores;
}

/** Texto alternativo inicial de una imagen subida: el nombre del archivo sin extensión, guiones ni guiones bajos. */
export function altDeArchivo(nombre: string): string {
  const base = nombre.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 120) || 'Imagen';
}

/**
 * Posición de una imagen soltada en el lienzo, en % de la pantalla: centrada en el punto donde se soltó y recortada para
 * que quede entera dentro. `punto` es relativo a la pantalla (px desde su esquina), `caja` su tamaño en px, `ancho` y
 * `proporcion` (alto / ancho de la imagen) los de la imagen, el ancho en % del ancho de la pantalla.
 */
export function posicionSoltada(punto: { x: number; y: number }, caja: { ancho: number; alto: number }, ancho: number, proporcion = 1): { x: number; y: number; ancho: number } {
  const w = Math.min(100, Math.max(1, ancho));
  const altoPct = caja.alto > 0 ? (w * proporcion * caja.ancho) / caja.alto : 0;
  const cx = caja.ancho > 0 ? (punto.x / caja.ancho) * 100 : 50;
  const cy = caja.alto > 0 ? (punto.y / caja.alto) * 100 : 50;
  const redondo = (v: number) => Math.round(v * 10) / 10;
  const recortar = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));
  return { x: redondo(recortar(cx - w / 2, 100 - w)), y: redondo(recortar(cy - altoPct / 2, 100 - Math.min(100, altoPct))), ancho: w };
}
