// HU-1202 · Adaptador SCORM 1.2 del paquete. Implementación estricta y defensiva del estándar (docs/08-entregas-y-lms.md):
// busca la API con el algoritmo de ADL (ventanas padre y luego `opener`), usa solo elementos obligatorios de cmi.core y
// cmi.suspend_data, respeta los 4096 caracteres de suspend_data y nunca rompe la navegación si el LMS responde con error.
// Sin API (HTML abierto fuera de un LMS) no hace nada. Es igual para todos los perfiles de LMS (RN-12-1).
import type { EstadoReproductor } from './reproductor.ts';
import { codificarSuspend, huellaCurso } from './suspend.ts';

export { codificarSuspend, type DatosSuspend, huellaCurso, leerSuspend } from './suspend.ts';

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

// ---------- Conexión con el LMS ----------

export interface OpcionesScorm12 {
  /** Ids de pantalla en el orden del curso, para `suspend_data`. */
  orden: readonly string[];
  idioma: string;
  /** HU-1105 · Huella del curso para suspend_data v2 (`huellaCurso`); por defecto, la del orden de pantallas. */
  huella?: string;
  /** HU-1105 · true (por defecto): nunca se envía una nota menor que la que el LMS ya tenía («mejor nota»). */
  mejorNota?: boolean;
  /** Avisos del adaptador (errores del LMS, suspend_data muy largo). Por defecto, `console.warn`. */
  avisar?: (mensaje: string) => void;
  /** Reloj en ms; se cambia en las pruebas. */
  ahora?: () => number;
}

export interface ConexionScorm12 {
  /** true si encontró la API y el LMS aceptó LMSInitialize. */
  conectado: boolean;
  /** Lo que el LMS tenía guardado al entrar (lo usa la reanudación, HU-1105). */
  inicial: { entrada: string; ubicacion: string; suspendData: string; estado: string; nota: string };
  /** Envía al LMS lo que cambió del estado y hace LMSCommit si hubo cambios. Devuelve true si guardó algo. */
  reportar(estado: Pick<EstadoReproductor, 'pantallaId' | 'nota' | 'leccion' | 'vistas' | 'resultados'>): boolean;
  /** Guarda el tiempo de la sesión, hace LMSCommit y LMSFinish. Solo la primera vez. */
  terminar(): void;
}

/** Orden de los estados de SCORM 1.2 para no degradar uno ya alcanzado. */
const RANGO: Record<string, number | undefined> = {
  'not attempted': 0, browsed: 0, incomplete: 0, failed: 1, completed: 2, passed: 3,
};

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
  const inicial = { entrada: '', ubicacion: '', suspendData: '', estado: '', nota: '' };
  const huella = opciones.huella ?? huellaCurso('', opciones.orden);
  const mejorNota = opciones.mejorNota !== false;
  /** HU-1105 · El estado más alto que tuvo el LMS en este intento: nunca se envía uno menor (un «passed» no vuelve a «incomplete»). */
  let piso = 0;
  let notaPiso: number | null = null;
  if (conectado) {
    inicial.entrada = leer('cmi.core.entry');
    inicial.ubicacion = leer('cmi.core.lesson_location');
    inicial.suspendData = leer('cmi.suspend_data');
    inicial.estado = leer('cmi.core.lesson_status');
    inicial.nota = leer('cmi.core.score.raw');
    piso = RANGO[inicial.estado] ?? 0;
    const n = Number(inicial.nota);
    if (mejorNota && inicial.nota.trim() !== '' && Number.isFinite(n)) notaPiso = n;
    // «not attempted» (o vacío) pasa a «incomplete» al entrar; un estado ya cerrado no se toca hasta que cambie.
    // No se hace LMSCommit al entrar: lo guardado no cambia hasta el primer avance (y, si hay que preguntar si se
    // reanuda, hasta que el participante elige, HU-1105).
    if (inicial.estado === '' || inicial.estado === 'not attempted') escribir('cmi.core.lesson_status', 'incomplete');
    escribir('cmi.core.exit', 'suspend');
  }

  return {
    conectado,
    inicial,
    reportar(estado) {
      if (!conectado || terminado) return false;
      let cambio = false;
      cambio = escribir('cmi.core.lesson_location', estado.pantallaId) || cambio;
      const rango = RANGO[estado.leccion] ?? 0;
      if (rango >= piso) {
        piso = rango;
        cambio = escribir('cmi.core.lesson_status', estado.leccion) || cambio;
      }
      const nota = estado.nota === null ? null : Math.round(estado.nota);
      if (nota !== null && (notaPiso === null || nota >= notaPiso)) {
        if (mejorNota) notaPiso = nota;
        cambio = escribir('cmi.core.score.min', '0') || cambio;
        cambio = escribir('cmi.core.score.max', '100') || cambio;
        cambio = escribir('cmi.core.score.raw', String(nota)) || cambio;
      }
      const suspend = codificarSuspend(opciones.orden, { idioma: opciones.idioma, vistas: estado.vistas, resultados: estado.resultados }, huella);
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
