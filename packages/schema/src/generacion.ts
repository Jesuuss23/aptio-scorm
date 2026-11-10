// HU-0401 · Las 11 etapas del generador (docs/14-modulos.md, M04), en orden, con su nombre para la pantalla.
export const ETAPAS = [
  'RESUMEN_MATERIAL', 'OBJETIVOS_ESTRUCTURA', 'STORYBOARD_GUION', 'PANTALLAS', 'ILUSTRACIONES', 'VOZ_ES', 'BOCA', 'SUBTITULOS',
  'VERSION_EN', 'CONTROL_CALIDAD', 'PAQUETE',
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const NOMBRE_ETAPA: Record<Etapa, string> = {
  RESUMEN_MATERIAL: 'Leer y resumir el material',
  OBJETIVOS_ESTRUCTURA: 'Objetivos y estructura',
  STORYBOARD_GUION: 'Storyboard y guion',
  PANTALLAS: 'Pantallas con el kit',
  ILUSTRACIONES: 'Ilustraciones',
  VOZ_ES: 'Voz en español',
  BOCA: 'Boca del personaje',
  SUBTITULOS: 'Subtítulos',
  VERSION_EN: 'Versión en inglés',
  CONTROL_CALIDAD: 'Control de calidad',
  PAQUETE: 'Paquete de prueba',
};

export const ESTADOS_TRABAJO = ['EN_COLA', 'EN_CURSO', 'COMPLETADO', 'ERROR', 'CANCELADO'] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];
/** Una generación en estos estados impide lanzar otra en el mismo proyecto (RN-04-3, CP-037). */
export const ACTIVOS: readonly EstadoTrabajo[] = ['EN_COLA', 'EN_CURSO'];
/** Tarea de la cola `ia` que ejecuta una generación completa en el worker. */
export const TAREA_GENERAR = 'GENERAR';
/** Detalle de una etapa cuyo ejecutor aún no existe (se habilita en sprints siguientes). */
export const DETALLE_PROXIMAMENTE = 'Se habilita en un sprint siguiente';
