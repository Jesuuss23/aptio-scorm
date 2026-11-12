// Entrada del paquete: deja el reproductor en `window.AptioReproductor` para el index.html del SCORM o del HTML.
// HU-1202 · `iniciarPaquete` monta el curso y lo conecta con el LMS (SCORM 1.2) si encuentra su API.
// HU-1204 · La versión es la misma que lleva el informe de diagnóstico.
import { VERSION_REPRODUCTOR } from './diagnostico.ts';
import { iniciarPaquete } from './paquete.ts';
import { montar } from './reproductor.ts';

declare global {
  interface Window {
    AptioReproductor: { montar: typeof montar; iniciarPaquete: typeof iniciarPaquete; version: string };
  }
}

window.AptioReproductor = { montar, iniciarPaquete, version: VERSION_REPRODUCTOR };
