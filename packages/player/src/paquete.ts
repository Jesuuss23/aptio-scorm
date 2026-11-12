// HU-1202 · Arranque del paquete exportado. El index.html del SCORM (y del HTML, HU-1203) llama a `iniciarPaquete` con los
// datos que el exportador deja en `datos.js`: el curso, el kit y las rutas relativas de los recursos. Los SVG del personaje
// y los WebVTT van como texto dentro de los datos, así el paquete no necesita `fetch` y abre también sin servidor.
// HU-1105 · Al volver al curso, si el LMS guardó avance válido, el reproductor pregunta si se continúa donde quedó.
// HU-1204 · Modo diagnóstico: Ctrl+Alt+Shift+D o ?diagnostico=1 abren el panel para el soporte (nunca se abre solo).
// HU-1203 · Con `modo: 'html'` (HTML autocontenido) no hay LMS: no se busca la API, no se avisa en la consola y no hay
// modo diagnóstico. El curso funciona completo, sin seguimiento.
import { informeDiagnostico, type InformeDiagnostico, RegistroDiagnostico } from './diagnostico.ts';
import { aplanar } from './navegacion.ts';
import { abrirPanelDiagnostico } from './panel-diagnostico.ts';
import { montar, type Reproductor } from './reproductor.ts';
import { decidirReanudacion } from './reanudacion.ts';
import { buscarApi, type ConexionScorm12, conectarScorm12, type VentanaLms } from './scorm12.ts';
import { huellaCurso } from './suspend.ts';
import type { Creditos, CursoReproductor, Idioma, KitReproductor } from './tipos.ts';

export interface DatosPaquete {
  curso: CursoReproductor;
  idioma: Idioma;
  kit?: KitReproductor;
  /** Ruta relativa de cada recurso dentro del paquete, por id (`recursos/aud-p01-es.mp3`). */
  rutas: Record<string, string>;
  /** SVG de los personajes como texto, por id de recurso. */
  svgs?: Record<string, string>;
  /** WebVTT como texto, por id de recurso. */
  subtitulos?: Record<string, string>;
  /** HU-1204 · false: el paquete se exportó sin modo diagnóstico (no responde al atajo ni a ?diagnostico=1). */
  diagnostico?: boolean;
  /** HU-1406 · Créditos de IA; sin recursos de IA no hay créditos ni botón. */
  creditos?: Creditos | null;
  /** HU-1203 · 'html': la carpeta se abre sin LMS (no se busca la API de SCORM). Por defecto, 'scorm12'. */
  modo?: 'scorm12' | 'html';
}

export interface Paquete {
  reproductor: Reproductor;
  lms: ConexionScorm12;
  /** HU-1204 · Abre el panel de diagnóstico (null si el paquete se exportó sin él). */
  diagnostico: (() => void) | null;
  /** HU-1204 · El informe de diagnóstico en este momento. */
  informe: () => InformeDiagnostico;
}

const esAtajoDiagnostico = (e: KeyboardEvent) => e.ctrlKey && e.altKey && e.shiftKey && (e.code === 'KeyD' || e.key.toLowerCase() === 'd');

/**
 * Conecta el paquete con el LMS. En SCORM busca la API con el algoritmo de ADL (y lo anota en el registro); en HTML
 * (HU-1203) no toca las ventanas ni avisa: la conexión queda sin LMS y nada se reporta.
 */
export function conectarPaquete(datos: DatosPaquete, ventana: VentanaLms, registro: RegistroDiagnostico, orden: string[], huella: string): ConexionScorm12 {
  const html = datos.modo === 'html';
  return conectarScorm12(html ? null : buscarApi(ventana, registro), {
    orden, idioma: datos.idioma, huella, mejorNota: datos.curso.seguimiento.notaReportada !== 'ultima', registro,
    ...(html ? { avisar: () => undefined } : {}),
  });
}

export function iniciarPaquete(contenedor: HTMLElement, datos: DatosPaquete, ventana: Window = window): Paquete {
  const orden = aplanar(datos.curso).map((x) => x.pantalla.id);
  const huella = huellaCurso(datos.curso.id, orden);
  const registro = new RegistroDiagnostico();
  const html = datos.modo === 'html';
  const lms = conectarPaquete(datos, ventana as unknown as VentanaLms, registro, orden, huella);
  if (!lms.conectado && !html) console.warn('[Aptio SCORM] No se encontró la API SCORM 1.2: el curso funciona, pero el LMS no recibe avance ni nota. Ctrl+Alt+Shift+D abre el diagnóstico.');
  // HU-1105 · Con avance válido y lejos de la primera pantalla, se pregunta; hasta que se elige no se envía nada al LMS
  // (ni lesson_location ni LMSCommit), para no pisar lo guardado.
  // `navegacion.reanudar` del curso: «no» empieza siempre de cero; «automatica» vuelve sin preguntar.
  const politica = datos.curso.navegacion?.reanudar ?? 'preguntar';
  const guardado = lms.conectado && politica !== 'no' ? decidirReanudacion(lms.inicial, orden, huella) : null;
  const preguntar = politica === 'preguntar';
  let listo = guardado === null || !preguntar;
  const reproductor = montar(contenedor, datos.curso, {
    idioma: datos.idioma,
    ...(datos.kit ? { kit: datos.kit } : {}),
    urlRecurso: (id) => datos.rutas[id],
    cargarSvg: async (id) => datos.svgs?.[id],
    cargarSubtitulos: async (id) => datos.subtitulos?.[id],
    ...(datos.creditos ? { creditos: datos.creditos } : {}),
    ...(guardado ? { reanudar: { ...guardado, preguntar } } : {}),
    alReanudar: () => { listo = true; },
    alCambiar: (e) => { if (listo) lms.reportar(e); },
  });
  // No se depende de LMSFinish al cerrar la pestaña (cada avance ya hizo LMSCommit), pero se intenta.
  const cerrar = () => lms.terminar();
  ventana.addEventListener('pagehide', cerrar);
  ventana.addEventListener('beforeunload', cerrar);

  // ---------- Modo diagnóstico (HU-1204) ----------
  const titulo = datos.curso.metadatos.titulo;
  const informe = () => informeDiagnostico(registro, {
    curso: { id: datos.curso.id, titulo: titulo[datos.idioma] ?? titulo.es ?? titulo.en ?? '', pantallas: orden.length, huella },
    conectado: lms.conectado, inicial: lms.inicial, userAgent: ventana.navigator?.userAgent ?? '', enIframe: enIframe(ventana),
  });
  const sombra = contenedor.shadowRoot;
  const diagnostico = html || datos.diagnostico === false || !sombra ? null : () => { abrirPanelDiagnostico({ sombra, registro, informe }); };
  if (diagnostico) {
    ventana.addEventListener('keydown', (e) => {
      if (!esAtajoDiagnostico(e)) return;
      e.preventDefault();
      diagnostico();
    });
    if (pideDiagnostico(ventana)) diagnostico();
  }
  return { reproductor, lms, diagnostico, informe };
}

function enIframe(ventana: Window): boolean {
  try {
    return ventana.self !== ventana.top;
  } catch {
    return true;
  }
}

function pideDiagnostico(ventana: Window): boolean {
  try {
    return new URLSearchParams(ventana.location?.search ?? '').get('diagnostico') === '1';
  } catch {
    return false;
  }
}
