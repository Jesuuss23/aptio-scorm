// @aptio/player · reproductor único del curso (decisión 3, HU-1101). La vista previa del editor lo importa desde aquí y
// cada paquete exportado lleva el mismo código empaquetado (`pnpm --filter @aptio/player construir`).
export { montar, PALETA_BASE, type EstadoReproductor, type OpcionesReproductor, type Reproductor } from './reproductor.ts';
export { aplanar, modoDe, motivoBloqueo, type Avance, type Motivo, type PantallaPlana } from './navegacion.ts';
export { seguimiento, type EstadoSeguimiento } from './seguimiento.ts';
export type * from './tipos.ts';
export { animarBoca, bocaDisponible, bocaEn, type MarcasBoca, mostrarBoca, mostrarPose, parpadear, type ColoresUniforme, MARCADORES_KIT, type RelojAudio, svgEnLinea } from './boca.ts';
export { type Cue, cueEn, leerVtt } from './subtitulos.ts';
export { activoEn, duracionDe, ESCALONADO_S, type TiempoElemento, tiemposDe } from './tiempos.ts';
export { aciertaVideo, mmss, preguntaAlcanzada, preguntasVideo, videoCompleto } from './video.ts';
export { buscarApi, conectarScorm12, LIMITE_SUSPEND, NIVELES_ADL, tiempoScorm, type ApiScorm12, type ConexionScorm12, type OpcionesScorm12, type VentanaLms } from './scorm12.ts';
export { codificarSuspend, type DatosSuspend, huellaCurso, leerSuspend } from './suspend.ts';
export { decidirReanudacion, estadoReanudado, type GuardadoLms, type Reanudacion } from './reanudacion.ts';
export { iniciarPaquete, type DatosPaquete, type Paquete } from './paquete.ts';
export { ELEMENTOS_PRIVADOS, informeDiagnostico, type InformeDiagnostico, type LlamadaLms, MAXIMO_LLAMADAS, MAXIMO_VALOR, navegadorResumido, type PasoBusqueda, RegistroDiagnostico, VERSION_REPRODUCTOR } from './diagnostico.ts';
