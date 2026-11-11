// HU-1202 · Arranque del paquete exportado. El index.html del SCORM (y del HTML, HU-1203) llama a `iniciarPaquete` con los
// datos que el exportador deja en `datos.js`: el curso, el kit y las rutas relativas de los recursos. Los SVG del personaje
// y los WebVTT van como texto dentro de los datos, así el paquete no necesita `fetch` y abre también sin servidor.
// HU-1105 · Al volver al curso, si el LMS guardó avance válido, el reproductor pregunta si se continúa donde quedó.
import { aplanar } from './navegacion.ts';
import { montar, type Reproductor } from './reproductor.ts';
import { decidirReanudacion } from './reanudacion.ts';
import { buscarApi, type ConexionScorm12, conectarScorm12, type VentanaLms } from './scorm12.ts';
import { huellaCurso } from './suspend.ts';
import type { CursoReproductor, Idioma, KitReproductor } from './tipos.ts';

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
}

export interface Paquete {
  reproductor: Reproductor;
  lms: ConexionScorm12;
}

export function iniciarPaquete(contenedor: HTMLElement, datos: DatosPaquete, ventana: Window = window): Paquete {
  const orden = aplanar(datos.curso).map((x) => x.pantalla.id);
  const huella = huellaCurso(datos.curso.id, orden);
  const lms = conectarScorm12(buscarApi(ventana as unknown as VentanaLms), {
    orden, idioma: datos.idioma, huella, mejorNota: datos.curso.seguimiento.notaReportada !== 'ultima',
  });
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
    ...(guardado ? { reanudar: { ...guardado, preguntar } } : {}),
    alReanudar: () => { listo = true; },
    alCambiar: (e) => { if (listo) lms.reportar(e); },
  });
  // No se depende de LMSFinish al cerrar la pestaña (cada avance ya hizo LMSCommit), pero se intenta.
  const cerrar = () => lms.terminar();
  ventana.addEventListener('pagehide', cerrar);
  ventana.addEventListener('beforeunload', cerrar);
  return { reproductor, lms };
}
