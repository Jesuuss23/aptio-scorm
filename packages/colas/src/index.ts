// Colas de trabajos largos y eventos de avance (HU-0105, M15).
// La API encola y escucha; el worker procesa y publica. Ambos usan estos nombres y formatos.
import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';

/** Colas separadas por tipo de trabajo (docs/01-arquitectura.md). */
export const COLAS = ['ia', 'voz', 'media', 'export'] as const;
export type NombreCola = (typeof COLAS)[number];

/** HU-1202 · Tarea de la cola `export`: arma el paquete de una Exportacion (`trabajoId` es su id). */
export const TAREA_EXPORTAR = 'EXPORTAR';

/**
 * HU-1404 y HU-1403 · Cola de mantenimiento, fuera de COLAS (no son trabajos de IA): el borrado de documentos vencidos y
 * la copia de seguridad diaria, ambos a las 3:00 de Lima. «Respaldar ahora» encola la copia con el id fijo de la manual.
 */
export const COLA_MANTENIMIENTO = 'mantenimiento';
export const TAREA_RESPALDO = 'respaldar';
export const PATRON_RESPALDO = '0 3 * * *';
export const ID_RESPALDO_MANUAL = 'respaldo-manual';
/** HU-1502 · Publica las páginas del sitio programadas cuya hora ya llegó (CP-111): cada 30 s, antes del minuto. */
export const TAREA_PUBLICAR_PAGINAS = 'publicar-paginas';
export const CADA_PUBLICAR_PAGINAS_MS = 30_000;
/**
 * HU-1508 · Pre-renderiza una versión del sitio al bucket (DA-08). Se encola al crear cada versión, con `jobId`
 * `sitio-prerender-v{numero}` para no repetirla.
 */
export const TAREA_PRERENDER = 'sitio-prerender';
export interface DatosPrerender { numero: number }
export const idPrerender = (numero: number) => `sitio-prerender-v${numero}`;
/**
 * HU-1511 · Volver a renderizar la versión vigente porque cambió algo de fuera de la instantánea (el blog). Lleva un id
 * propio: con el de la versión, BullMQ ignoraría el pedido mientras otro render de esa versión está en curso.
 */
export const idRehacerPrerender = (numero: number) => `sitio-prerender-v${numero}-r${Date.now()}`;
/**
 * HU-1511 · Sincroniza el blog con WordPress (REQ-070). El worker la revisa cada minuto y solo lee WordPress si pasó la
 * frecuencia elegida (15, 30 o 60 min); «Sincronizar ahora» la encola con `forzar` y el id fijo `blog-sincronizar-manual`.
 */
export const TAREA_BLOG = 'blog-sincronizar';
export const CADA_BLOG_MS = 60_000;
export const ID_BLOG_MANUAL = 'blog-sincronizar-manual';
export interface DatosBlog { forzar?: boolean; solicitadoPorId?: string }
export interface DatosRespaldo {
  origen: 'programado' | 'manual';
  solicitadoPorId?: string;
}

export const esCola = (valor: string): valor is NombreCola => (COLAS as readonly string[]).includes(valor);

/** Datos con los que se encola un trabajo. El detalle vive en TrabajoIA (base de datos). */
export interface DatosTrabajo {
  trabajoId: string;
  organizacionId: string;
  /** Tarea de IA (IA-01 … IA-18) o tarea de voz, media o exportación. */
  tarea: string;
  /** HU-0503 · La pantalla de una regeneración en cascada (`trabajoId` es entonces el curso). */
  pantallaId?: string;
  /** HU-0504 · El pedido de una propuesta de la IA (IA-16; HU-1002: IA-17 con tipo `alineacion`, sin pantalla); `trabajoId` es entonces el TrabajoIA. */
  propuesta?: { cursoId: string; tipo: string; texto?: string; /** HU-1104 · Tipo `patron` (IA-14): recomendar o crear. */ modo?: string;
    /** HU-0903 · Tipo `pausas-video` (IA-09): el bloque de video y el material con su transcripción. */ bloqueId?: string; materialId?: string };
  /** HU-0802 · El curso cuyos textos pendientes se traducen (IA-10); `trabajoId` es entonces el TrabajoIA. */
  traduccion?: { cursoId: string };
  /** HU-0505 · El curso que revisa el control de calidad (IA-12); `trabajoId` es entonces el TrabajoIA. */
  calidad?: { cursoId: string };
  /**
   * HU-0704 · Una grabación del cliente como narración en español de `pantallaId` (`trabajoId` es entonces el curso):
   * el material de audio, el recurso que se usa (original o limpio) y quién autorizó usarla y cuándo (RN-07-4).
   */
  grabacion?: { materialId: string; recursoId: string; version: 'original' | 'limpio'; autorizadoPor: string; autorizadoEn: string };
  /** HU-0206 · El kit propuesto desde un ZIP o PDF del cliente (IA-18 v2); `trabajoId` es entonces el TrabajoIA. */
  kit?: { clienteId: string; recursoId: string };
}

export type EstadoTrabajo = 'EN_COLA' | 'EN_CURSO' | 'COMPLETADO' | 'ERROR' | 'CANCELADO';

/** Evento que la web recibe por SSE. */
export interface EventoTrabajo {
  tipo: 'estado' | 'progreso';
  trabajoId: string;
  organizacionId: string;
  cola: NombreCola;
  tarea: string;
  estado: EstadoTrabajo;
  /** 0 a 100. */
  progreso: number;
  mensaje?: string;
  /** Fecha ISO de emisión. */
  en: string;
}

/** Canal de Redis donde el worker publica los eventos y la API los reparte. */
export const CANAL_EVENTOS = 'aptio:eventos';

export function opcionesRedis(env: NodeJS.ProcessEnv = process.env): ConnectionOptions & { host: string; port: number } {
  return {
    host: env.REDIS_HOST ?? 'localhost',
    port: Number(env.REDIS_PORT ?? 6379),
    // BullMQ lo exige en los workers; en la API evita que un comando espere para siempre.
    maxRetriesPerRequest: null,
  };
}

/** Conexión de Redis para publicar o suscribirse. `lazyConnect` evita conectar hasta usarla. */
export function crearRedis(env: NodeJS.ProcessEnv = process.env): Redis {
  return new Redis({ ...opcionesRedis(env), lazyConnect: true });
}

/** Prefijo de las claves de BullMQ en Redis. Las pruebas usan uno propio para no cruzarse con un worker de desarrollo. */
export const prefijoColas = (env: NodeJS.ProcessEnv = process.env): string => env.COLAS_PREFIJO ?? 'aptio';

export function crearCola(nombre: NombreCola, env: NodeJS.ProcessEnv = process.env): Queue<DatosTrabajo> {
  return new Queue<DatosTrabajo>(nombre, {
    connection: opcionesRedis(env),
    prefix: prefijoColas(env),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 24 * 3600, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
}

export async function publicarEvento(redis: Redis, evento: EventoTrabajo): Promise<void> {
  await redis.publish(CANAL_EVENTOS, JSON.stringify(evento));
}

/** Lee un mensaje del canal; descarta lo que no tenga la forma de un evento. */
export function leerEvento(mensaje: string): EventoTrabajo | null {
  try {
    const e = JSON.parse(mensaje) as Partial<EventoTrabajo>;
    if (typeof e.trabajoId !== 'string' || typeof e.organizacionId !== 'string' || !e.cola || !esCola(e.cola)) return null;
    return e as EventoTrabajo;
  } catch {
    return null;
  }
}
