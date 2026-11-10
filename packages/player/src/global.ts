// Entrada del paquete: deja el reproductor en `window.AptioReproductor` para el index.html del SCORM o del HTML.
import { montar } from './reproductor.ts';

declare global {
  interface Window {
    AptioReproductor: { montar: typeof montar; version: string };
  }
}

window.AptioReproductor = { montar, version: '0.1.0' };
