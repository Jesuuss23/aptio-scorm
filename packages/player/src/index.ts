// @aptio/player · reproductor único del curso (decisión 3, HU-1101). La vista previa del editor lo importa desde aquí y
// cada paquete exportado lleva el mismo código empaquetado (`pnpm --filter @aptio/player construir`).
export { montar, PALETA_BASE, type EstadoReproductor, type OpcionesReproductor, type Reproductor } from './reproductor.ts';
export { aplanar, modoDe, motivoBloqueo, type Avance, type Motivo, type PantallaPlana } from './navegacion.ts';
export { seguimiento, type EstadoSeguimiento } from './seguimiento.ts';
export type * from './tipos.ts';
