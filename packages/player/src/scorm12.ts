// HU-1202 · Adaptador SCORM 1.2 del paquete. Implementación estricta y defensiva del estándar (docs/08-entregas-y-lms.md):
// busca la API con el algoritmo de ADL (ventanas padre y luego `opener`), usa solo elementos obligatorios de cmi.core y
// cmi.suspend_data, respeta los 4096 caracteres de suspend_data y nunca rompe la navegación si el LMS responde con error.
// Sin API (HTML abierto fuera de un LMS) no hace nada. Es igual para todos los perfiles de LMS (RN-12-1).
import type { EstadoReproductor } from './reproductor.ts';
import type { ResultadoActividad } from './tipos.ts';

/** La API que un LMS SCORM 1.2 deja en `window.API`. */
export interface ApiScorm12 {
  LMSInitialize(v: ''): string;
  LMSFinish(v: ''): string;
  LMSGetValue(elemento: string): string;
  LMSSetValue(elemento: string, valor: string): string;
  LMSCommit(v: ''): string;
  LMSGetLastError(): string;
  LMSGetErrorString(codigo: string): string;
  LMSGetDiagnostic(codigo: string): string;
}

/** Lo mínimo de una ventana que se recorre para buscar la API (permite probar sin navegador). */
export interface VentanaLms {
  API?: unknown;
  parent?: VentanaLms | null;
  opener?: VentanaLms | null;
}

/** Límite de suspend_data en SCORM 1.2 (CMIString4096). */
export const LIMITE_SUSPEND = 4096;
/** El algoritmo de ADL sube como máximo 7 niveles de ventanas padre antes de rendirse. */
export const NIVELES_ADL = 7;

const esApi = (x: unknown): x is ApiScorm12 =>
  typeof x === 'object' && x !== null && typeof (x as ApiScorm12).LMSInitialize === 'function' && typeof (x as ApiScorm12).LMSSetValue === 'function';

/** Lee `ventana.API` sin fallar cuando la ventana es de otro origen (el navegador lanza al tocarla). */
function apiDe(ventana: VentanaLms | null | undefined): ApiScorm12 | null {
  try {
    return ventana && esApi(ventana.API) ? ventana.API : null;
  } catch {
    return null;
  }
}

function padreDe(ventana: VentanaLms): VentanaLms | null {
  try {
    return ventana.parent && ventana.parent !== ventana ? ventana.parent : null;
  } catch {
    return null;
  }
}

/** Sube por las ventanas padre desde `ventana` (ella incluida) hasta encontrar la API o pasar los niveles de ADL. */
function subir(ventana: VentanaLms | null): ApiScorm12 | null {
  let actual = ventana;
  for (let nivel = 0; actual && nivel <= NIVELES_ADL; nivel++) {
    const api = apiDe(actual);
    if (api) return api;
    actual = padreDe(actual);
  }
  return null;
}

/** Algoritmo de búsqueda de ADL: primero la propia ventana y sus padres; si no está, la ventana que abrió esta y sus padres. */
export function buscarApi(ventana: VentanaLms): ApiScorm12 | null {
  const propia = subir(ventana);
  if (propia) return propia;
  let abridora: VentanaLms | null = null;
  try {
    abridora = ventana.opener ?? null;
  } catch {
    abridora = null;
  }
  return abridora ? subir(abridora) : null;
}

/** CMITimespan de SCORM 1.2: HHHH:MM:SS (horas de 2 a 4 dígitos). */
export function tiempoScorm(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const horas = Math.min(9999, Math.floor(total / 3600));
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(horas)}:${dos(Math.floor((total % 3600) / 60))}:${dos(total % 60)}`;
}

// ---------- suspend_data compacto ----------
// Formato v1: `1|<idioma>|<vistas>|<resultados>`. Las pantallas van por su posición en el curso (el paquete queda ligado a
// una versión del curso, RN-12-4). Vistas como rangos «0-12,15»; resultados como «posición:completada:puntaje», con «-»
// si la actividad no califica. Ejemplo: `1|es|0-27|6:1:-,27:1:80`.

export interface DatosSuspend {
  idioma: string;
  vistas: string[];
  resultados: Record<string, ResultadoActividad>;
}

function rangos(posiciones: number[]): string {
  const orden = [...new Set(posiciones)].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < orden.length; ) {
    let j = i;
    while (j + 1 < orden.length && orden[j + 1] === orden[j]! + 1) j++;
    partes.push(j === i ? String(orden[i]) : `${orden[i]}-${orden[j]}`);
    i = j + 1;
  }
  return partes.join(',');
}

/** Codifica avance y resultados para `cmi.suspend_data`. `orden` son los ids de pantalla en el orden del curso. */
export function codificarSuspend(orden: readonly string[], datos: DatosSuspend): string {
  const posicion = new Map(orden.map((id, i) => [id, i]));
  const vistas = datos.vistas.map((id) => posicion.get(id)).filter((n): n is number => n !== undefined);
  const resultados = Object.entries(datos.resultados)
    .map(([id, r]) => [posicion.get(id), r] as const)
    .filter((x): x is readonly [number, ResultadoActividad] => x[0] !== undefined)
    .sort((a, b) => a[0] - b[0])
    .map(([n, r]) => `${n}:${r.completada ? 1 : 0}:${r.puntaje === null ? '-' : Math.round(r.puntaje)}`);
  return `1|${datos.idioma}|${rangos(vistas)}|${resultados.join(',')}`;
}

/** Lee lo que dejó `codificarSuspend`; devuelve null si el texto no es de este formato (otro paquete o vacío). */
export function leerSuspend(orden: readonly string[], texto: string): DatosSuspend | null {
  const partes = texto.split('|');
  if (partes.length !== 4 || partes[0] !== '1') return null;
  const [, idioma = '', textoVistas = '', textoResultados = ''] = partes;
  const id = (n: number) => orden[n];
  const vistas: string[] = [];
  for (const parte of textoVistas ? textoVistas.split(',') : []) {
    const [a, b = a] = parte.split('-').map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    for (let n = a!; n <= b!; n++) { const x = id(n); if (x) vistas.push(x); }
  }
  const resultados: Record<string, ResultadoActividad> = {};
  for (const parte of textoResultados ? textoResultados.split(',') : []) {
    const [n, c, p] = parte.split(':');
    const x = id(Number(n));
    if (!x || (c !== '0' && c !== '1') || p === undefined) return null;
    resultados[x] = { completada: c === '1', puntaje: p === '-' ? null : Number(p) };
  }
  return { idioma, vistas, resultados };
}

// ---------- Conexión con el LMS ----------

export interface OpcionesScorm12 {
  /** Ids de pantalla en el orden del curso, para `suspend_data`. */
  orden: readonly string[];
  idioma: string;
  /** Avisos del adaptador (errores del LMS, suspend_data muy largo). Por defecto, `console.warn`. */
  avisar?: (mensaje: string) => void;
  /** Reloj en ms; se cambia en las pruebas. */
  ahora?: () => number;
}

export interface ConexionScorm12 {
  /** true si encontró la API y el LMS aceptó LMSInitialize. */
  conectado: boolean;
  /** Lo que el LMS tenía guardado al entrar (lo usa la reanudación, HU-1105). */
  inicial: { entrada: string; ubicacion: string; suspendData: string; estado: string };
  /** Envía al LMS lo que cambió del estado y hace LMSCommit si hubo cambios. Devuelve true si guardó algo. */
  reportar(estado: Pick<EstadoReproductor, 'pantallaId' | 'nota' | 'leccion' | 'vistas' | 'resultados'>): boolean;
  /** Guarda el tiempo de la sesión, hace LMSCommit y LMSFinish. Solo la primera vez. */
  terminar(): void;
}

/** Inicia la comunicación con el LMS. Nunca lanza: sin API o con errores del LMS, el curso sigue funcionando. */
export function conectarScorm12(api: ApiScorm12 | null, opciones: OpcionesScorm12): ConexionScorm12 {
  const avisar = opciones.avisar ?? ((m: string) => console.warn(`[Aptio SCORM] ${m}`));
  const ahora = opciones.ahora ?? (() => Date.now());
  const inicio = ahora();
  const enviados = new Map<string, string>();
  let terminado = false;
  let avisoLargo = false;

  /** Revisa el último error del LMS después de una llamada; avisa y sigue. Las escrituras deben responder "true". */
  const revisar = (llamada: string, respuesta: unknown, lectura: boolean): boolean => {
    let codigo = '0';
    try { codigo = String(api?.LMSGetLastError() ?? '0'); } catch { codigo = '0'; }
    if (codigo !== '0' && codigo !== '') {
      let detalle = '';
      try { detalle = String(api?.LMSGetErrorString(codigo) ?? ''); } catch { detalle = ''; }
      avisar(`${llamada} respondió el error ${codigo}${detalle ? ` (${detalle})` : ''}.`);
      return false;
    }
    if (!lectura && String(respuesta) !== 'true') {
      avisar(`${llamada} respondió ${String(respuesta)}.`);
      return false;
    }
    return true;
  };
  const llamar = (llamada: string, f: () => string, lectura = false): string | null => {
    try {
      const r = f();
      return revisar(llamada, r, lectura) ? String(r ?? '') : null;
    } catch (e) {
      avisar(`${llamada} falló: ${e instanceof Error ? e.message : String(e)}.`);
      return null;
    }
  };
  const leer = (elemento: string): string => (api ? llamar(`LMSGetValue("${elemento}")`, () => api.LMSGetValue(elemento), true) ?? '' : '');
  const escribir = (elemento: string, valor: string): boolean => {
    if (!api || enviados.get(elemento) === valor) return false;
    if (llamar(`LMSSetValue("${elemento}")`, () => api.LMSSetValue(elemento, valor)) === null) return false;
    enviados.set(elemento, valor);
    return true;
  };
  const guardar = () => api && llamar('LMSCommit', () => api.LMSCommit(''));

  const conectado = api !== null && llamar('LMSInitialize', () => api.LMSInitialize('')) !== null;
  const inicial = { entrada: '', ubicacion: '', suspendData: '', estado: '' };
  if (conectado) {
    inicial.entrada = leer('cmi.core.entry');
    inicial.ubicacion = leer('cmi.core.lesson_location');
    inicial.suspendData = leer('cmi.suspend_data');
    inicial.estado = leer('cmi.core.lesson_status');
    // «not attempted» (o vacío) pasa a «incomplete» al entrar; un estado ya cerrado no se toca hasta que cambie.
    if (inicial.estado === '' || inicial.estado === 'not attempted') escribir('cmi.core.lesson_status', 'incomplete');
    escribir('cmi.core.exit', 'suspend');
    guardar();
  }

  return {
    conectado,
    inicial,
    reportar(estado) {
      if (!conectado || terminado) return false;
      let cambio = false;
      cambio = escribir('cmi.core.lesson_location', estado.pantallaId) || cambio;
      cambio = escribir('cmi.core.lesson_status', estado.leccion) || cambio;
      if (estado.nota !== null) {
        cambio = escribir('cmi.core.score.min', '0') || cambio;
        cambio = escribir('cmi.core.score.max', '100') || cambio;
        cambio = escribir('cmi.core.score.raw', String(Math.round(estado.nota))) || cambio;
      }
      const suspend = codificarSuspend(opciones.orden, { idioma: opciones.idioma, vistas: estado.vistas, resultados: estado.resultados });
      if (suspend.length <= LIMITE_SUSPEND) cambio = escribir('cmi.suspend_data', suspend) || cambio;
      else if (!avisoLargo) {
        avisoLargo = true;
        avisar(`suspend_data tendría ${suspend.length} caracteres y el límite es ${LIMITE_SUSPEND}: no se guarda el avance detallado.`);
      }
      if (cambio) {
        escribir('cmi.core.session_time', tiempoScorm(ahora() - inicio));
        guardar();
      }
      return cambio;
    },
    terminar() {
      if (!conectado || terminado) return;
      terminado = true;
      escribir('cmi.core.session_time', tiempoScorm(ahora() - inicio));
      guardar();
      llamar('LMSFinish', () => api!.LMSFinish(''));
    },
  };
}
