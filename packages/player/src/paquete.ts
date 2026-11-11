// HU-1202 · Arranque del paquete exportado. El index.html del SCORM (y del HTML, HU-1203) llama a `iniciarPaquete` con los
// datos que el exportador deja en `datos.js`: el curso, el kit y las rutas relativas de los recursos. Los SVG del personaje
// y los WebVTT van como texto dentro de los datos, así el paquete no necesita `fetch` y abre también sin servidor.
import { aplanar } from './navegacion.ts';
import { montar, type Reproductor } from './reproductor.ts';
import { buscarApi, type ConexionScorm12, conectarScorm12, type VentanaLms } from './scorm12.ts';
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
  const lms = conectarScorm12(buscarApi(ventana as unknown as VentanaLms), { orden, idioma: datos.idioma });
  const reproductor = montar(contenedor, datos.curso, {
    idioma: datos.idioma,
    ...(datos.kit ? { kit: datos.kit } : {}),
    urlRecurso: (id) => datos.rutas[id],
    cargarSvg: async (id) => datos.svgs?.[id],
    cargarSubtitulos: async (id) => datos.subtitulos?.[id],
    alCambiar: (e) => { lms.reportar(e); },
  });
  // No se depende de LMSFinish al cerrar la pestaña (cada avance ya hizo LMSCommit), pero se intenta.
  const cerrar = () => lms.terminar();
  ventana.addEventListener('pagehide', cerrar);
  ventana.addEventListener('beforeunload', cerrar);
  return { reproductor, lms };
}
