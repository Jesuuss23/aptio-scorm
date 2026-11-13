// HU-1403 · Nombres y reglas puras de las copias: la carpeta de cada copia en el bucket de respaldos, el día de Lima
// al que pertenece, la retención de 14 días y la conexión a PostgreSQL sin la clave en la línea de comandos.

/** Días que se guarda una copia (SUP-156). */
export const RETENCION_DIAS = 14;
/** Archivos de cada copia dentro de su carpeta. */
export const ARCHIVO_VOLCADO = 'base.dump';
export const ARCHIVO_MANIFIESTO = 'manifiesto.json';
export const CARPETA_OBJETOS = 'objetos/';

/** Bucket de respaldos (SUP-157): separado del de recursos; en la nube lo crea la infraestructura (HU-1405). */
export const bucketRespaldosDesdeEnv = (env: NodeJS.ProcessEnv = process.env) => env.S3_BUCKET_RESPALDOS ?? 'aptio-scorm-respaldos';

/** Carpeta de una copia: su inicio en UTC sin «:» ni «.», p. ej. `2026-11-13T08-00-00-000Z`. */
export const carpetaDe = (fecha: Date) => fecha.toISOString().replace(/[:.]/g, '-');

const CARPETA = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\/?$/;
/** Inicio de la copia desde el nombre de su carpeta; null si no es una carpeta de copia. */
export function fechaDeCarpeta(carpeta: string): Date | null {
  const m = CARPETA.exec(carpeta);
  if (!m) return null;
  const fecha = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Día de Lima (UTC−05:00, sin cambio de hora) de un instante, como `AAAA-MM-DD`. */
export const diaLima = (fecha: Date) => new Date(fecha.getTime() - 5 * 3600_000).toISOString().slice(0, 10);

/** Límite de la retención: lo que empezó antes de este instante se purga. */
export const limiteRetencion = (ahora: Date, dias = RETENCION_DIAS) => new Date(ahora.getTime() - dias * 24 * 3600_000);

/**
 * La copia a restaurar: `cuando` es un día de Lima (`AAAA-MM-DD`, se toma la última copia completa de ese día) o el
 * nombre exacto de una carpeta. Devuelve null si no hay ninguna.
 */
export function elegirCarpeta(carpetas: string[], cuando: string): string | null {
  const limpias = carpetas.map((c) => c.replace(/\/$/, '')).filter((c) => fechaDeCarpeta(c));
  if (limpias.includes(cuando)) return cuando;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cuando)) return null;
  const delDia = limpias.filter((c) => diaLima(fechaDeCarpeta(c)!) === cuando).sort();
  return delDia.at(-1) ?? null;
}

/** Variables de libpq para pg_dump y pg_restore: la clave va por PGPASSWORD, nunca en los argumentos (se verían en `ps`). */
export function entornoPg(url: string): Record<string, string> {
  const u = new URL(url);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('La URL de la base debe ser postgresql://');
  const base = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!base) throw new Error('La URL de la base no dice qué base usar');
  return {
    PGHOST: u.hostname || 'localhost',
    PGPORT: u.port || '5432',
    PGDATABASE: base,
    ...(u.username ? { PGUSER: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { PGPASSWORD: decodeURIComponent(u.password) } : {}),
  };
}

/** Misma base (servidor, puerto y nombre), sin importar usuario, clave ni parámetros. */
export function mismaBase(a: string, b: string): boolean {
  const x = entornoPg(a);
  const y = entornoPg(b);
  const host = (h: string) => (h === '127.0.0.1' || h === '::1' ? 'localhost' : h.toLowerCase());
  return host(x.PGHOST!) === host(y.PGHOST!) && x.PGPORT === y.PGPORT && x.PGDATABASE === y.PGDATABASE;
}

/** Binario de PostgreSQL (`PG_BIN_DIR` fija la versión, p. ej. la 16 del servidor). */
export const binarioPg = (nombre: 'pg_dump' | 'pg_restore', env: NodeJS.ProcessEnv = process.env) =>
  env.PG_BIN_DIR ? `${env.PG_BIN_DIR.replace(/\/$/, '')}/${nombre}` : nombre;
