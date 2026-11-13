// HU-1304 · Conexiones IA: qué proveedor y modelo usa cada tarea de la organización, su clave (solo «configurada sí o
// no», RN-13-3) y su límite de gasto mensual (RN-04-7). Lo comparten la API, el worker y la pantalla Empresa › Conexiones IA.

/** Las tareas de la lista cerrada, con el mismo nombre que el enum TareaProveedor. */
export const TAREAS_CONEXION = ['TEXTO', 'PANTALLAS', 'TRADUCCION', 'CALIDAD', 'VOZ', 'IMAGEN', 'BOCA', 'TRANSCRIPCION'] as const;
export type TareaConexion = (typeof TAREAS_CONEXION)[number];

export interface OpcionProveedor {
  proveedor: string;
  nombre: string;
  /** Todavía sin ejecutor: se muestra deshabilitada («próximamente»). */
  proximamente?: boolean;
  /** Variable de entorno con la clave (nunca se guarda en la base ni se devuelve). */
  variableClave?: string;
}

export interface DefinicionConexion {
  tarea: TareaConexion;
  nombre: string;
  opciones: OpcionProveedor[];
  /** El proveedor no se elige: hay uno solo (Imagen, Boca, Transcripción). */
  fijo: boolean;
  /** Proveedor y modelo cuando la organización no configuró nada (los del entorno). */
  proveedorPorDefecto: string;
  modeloPorDefecto: string;
  /** Modelos que se pueden elegir (los de texto deben tener tarifa registrada). */
  modelos: string[];
  /** USD estimados por SCORM (los del prototipo). */
  costoEstimadoScorm: number;
}

/** Modelos de Claude con tarifa registrada en `TARIFAS` de @aptio/ai (el worker rechaza otro). */
export const MODELOS_CLAUDE = ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-haiku-5-5'];
const CLAUDE: OpcionProveedor = { proveedor: 'anthropic', nombre: 'Claude (Anthropic)', variableClave: 'ANTHROPIC_API_KEY' };
const texto = (tarea: TareaConexion, nombre: string, costoEstimadoScorm: number): DefinicionConexion => ({
  tarea, nombre, opciones: [CLAUDE], fijo: false, proveedorPorDefecto: 'anthropic', modeloPorDefecto: 'claude-opus-5-5', modelos: MODELOS_CLAUDE, costoEstimadoScorm,
});

export const CONEXIONES: DefinicionConexion[] = [
  texto('TEXTO', 'Resumen, estructura y guion', 0.9),
  texto('PANTALLAS', 'Pantallas animadas', 1.6),
  texto('TRADUCCION', 'Traducción al inglés', 0.5),
  texto('CALIDAD', 'Control de calidad', 0.2),
  {
    tarea: 'VOZ', nombre: 'Voz', fijo: false, proveedorPorDefecto: 'google', modeloPorDefecto: 'tts-v1', modelos: [], costoEstimadoScorm: 1.3,
    opciones: [
      { proveedor: 'google', nombre: 'Google Text-to-Speech', variableClave: 'GOOGLE_TTS_API_KEY' },
      { proveedor: 'elevenlabs', nombre: 'ElevenLabs', variableClave: 'ELEVENLABS_API_KEY' },
      { proveedor: 'azure', nombre: 'Azure Speech', proximamente: true },
    ],
  },
  {
    tarea: 'IMAGEN', nombre: 'Ilustraciones', fijo: true, proveedorPorDefecto: 'pendiente', modeloPorDefecto: '-', modelos: [], costoEstimadoScorm: 1.8,
    opciones: [{ proveedor: 'pendiente', nombre: 'Por definir (etapa de ilustraciones)', proximamente: true }],
  },
  {
    tarea: 'BOCA', nombre: 'Boca del personaje', fijo: true, proveedorPorDefecto: 'rhubarb', modeloPorDefecto: 'rhubarb', modelos: [], costoEstimadoScorm: 0,
    opciones: [{ proveedor: 'rhubarb', nombre: 'Automática desde el audio (Rhubarb)' }],
  },
  {
    tarea: 'TRANSCRIPCION', nombre: 'Transcripción de video y audio', fijo: true, proveedorPorDefecto: 'google', modeloPorDefecto: 'speech-v1', modelos: [], costoEstimadoScorm: 0.1,
    opciones: [{ proveedor: 'google', nombre: 'Google Speech-to-Text', variableClave: 'GOOGLE_TTS_API_KEY' }],
  },
];

export const definicionConexion = (tarea: TareaConexion): DefinicionConexion => CONEXIONES.find((c) => c.tarea === tarea)!;

/** La tarea de la ruta (`texto`, `voz`…) en mayúsculas; null si no es de la lista cerrada. */
export function tareaDeRuta(valor: string): TareaConexion | null {
  const t = valor.toUpperCase();
  return (TAREAS_CONEXION as readonly string[]).includes(t) ? (t as TareaConexion) : null;
}

/** El tipo de una tarea de IA de texto (IA-##): pantallas, traducción, calidad o texto. */
export function tipoDeTareaIA(tarea: string): TareaConexion {
  if (tarea === 'IA-15' || tarea === 'IA-16') return 'PANTALLAS';
  if (tarea === 'IA-10') return 'TRADUCCION';
  if (tarea === 'IA-12') return 'CALIDAD';
  return 'TEXTO';
}

/** Voz por idioma de la conexión de voz (`parametros.voces`). */
export type VocesConexion = Partial<Record<'es' | 'en', string>>;

/** Lima no cambia de hora: el mes de Lima empieza el día 1 a las 05:00 UTC. */
const DESFASE_LIMA_MS = 5 * 3600_000;
/** Inicio (incluido) del mes de Lima que contiene `ahora`, en UTC. */
export function inicioMesLima(ahora: Date): Date {
  const lima = new Date(ahora.getTime() - DESFASE_LIMA_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), 1) + DESFASE_LIMA_MS);
}

/** Código del error de un trabajo detenido por el límite de gasto (CP-100). */
export const CODIGO_LIMITE_GASTO = 'LIMITE_GASTO';
export function mensajeLimiteGasto(nombreTarea: string, gastoUsd: number, limiteUsd: number): string {
  return `${CODIGO_LIMITE_GASTO}: la tarea «${nombreTarea}» llegó a su límite de gasto del mes (USD ${gastoUsd.toFixed(2)} de ${limiteUsd.toFixed(2)}). Sube el límite en Empresa › Conexiones IA y continúa.`;
}
export const esLimiteGasto = (mensaje: string | null | undefined) => !!mensaje?.startsWith(`${CODIGO_LIMITE_GASTO}:`);
