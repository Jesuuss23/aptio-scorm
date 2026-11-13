// HU-1502 · Ayudas de «Sitio web › Páginas» (PNT-25): estados, la hora de Lima del selector y la forma de la ruta.
import type { PaginaSitio } from '../api';

/** Misma regla que la API (`RUTA_SITIO` de `@aptio/db`). */
export const RUTA_SITIO = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;
export const MENSAJE_RUTA = 'La ruta empieza con / y solo lleva minúsculas, números y guiones, por ejemplo /precios o /sectores/mineria.';

export const ESTADO_PAGINA: Record<PaginaSitio['estado'], { texto: string; chip: string }> = {
  BORRADOR: { texto: 'Borrador', chip: '' },
  PROGRAMADA: { texto: 'Programada', chip: 'aviso' },
  PUBLICADA: { texto: 'Publicada', chip: 'validado' },
};

export const NOMBRE_IDIOMA: Record<PaginaSitio['idioma'], string> = { es: 'Español', en: 'Inglés' };

/** Lima no tiene horario de verano: siempre UTC−05:00. */
const LIMA_MS = 5 * 3600_000;

/** Valor de `<input type="datetime-local">` (hora de Lima) → ISO con zona para la API. */
export const limaAIso = (local: string): string | null => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00-05:00` : null);

/** Fecha ISO → valor del selector en hora de Lima. */
export const isoALima = (iso: string): string => new Date(new Date(iso).getTime() - LIMA_MS).toISOString().slice(0, 16);

/** Primer minuto que se puede programar (el siguiente al actual), en hora de Lima. */
export const minimoProgramable = (ahora = new Date()): string => isoALima(new Date(Math.floor(ahora.getTime() / 60_000) * 60_000 + 60_000).toISOString());

export const fechaHoraLima = (iso: string) =>
  `${new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' })} (Lima)`;
