// M03 · Proyectos y Nuevo SCORM (HU-0301 a HU-0303). Lógica compartida por la API y la web.

export const ESTADOS_PROYECTO = ['BORRADOR', 'GENERANDO', 'REVISION', 'ENTREGADO', 'ARCHIVADO'] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];
export const NOMBRE_ESTADO: Record<EstadoProyecto, string> = {
  BORRADOR: 'Por generar', GENERANDO: 'Producción', REVISION: 'Revisión', ENTREGADO: 'Entregado', ARCHIVADO: 'Archivado',
};

export const TONOS = ['Cercano', 'Formal', 'Motivador'] as const;
export const MODOS_IDIOMA = ['unico', 'separados', 'mismo-paquete'] as const;
export const FORMATOS = ['SCORM12', 'SCORM2004', 'HTML', 'NO_DEFINIDO'] as const;

/** LMS destino que ofrece el formulario. «Aún no se sabe» es el valor por defecto (RN-03-2). */
export const LMS_DESTINO = ['Aún no se sabe', 'Moodle 4.5 o superior', 'Blackboard', 'Chamilo', 'Canvas', 'Otro LMS', 'Solo HTML'] as const;

export interface DatosTecnicos {
  lms?: string;
  formato?: (typeof FORMATOS)[number];
  horasCapacitacion?: number;
  porcentajeScorm?: number;
  fechaEntrega?: string;
}

export const PERFILES_LMS = ['GENERICO', 'MOODLE', 'BLACKBOARD', 'CHAMILO', 'CANVAS'] as const;
export type PerfilLms = (typeof PERFILES_LMS)[number];
export const NOMBRE_PERFIL: Record<PerfilLms, string> = {
  GENERICO: 'Genérico', MOODLE: 'Moodle 4.5 o superior', BLACKBOARD: 'Blackboard', CHAMILO: 'Chamilo', CANVAS: 'Canvas',
};

/**
 * Perfil de entrega que se propone (CP-031, docs/08-entregas-y-lms.md). Sin LMS, o con uno que no
 * tiene perfil, se usa el Genérico: el paquete cumple el estándar sin ajustes por LMS.
 */
export function perfilPropuesto(datos?: DatosTecnicos | null): PerfilLms {
  const lms = (datos?.lms ?? '').toLocaleLowerCase('es');
  if (/moodle/.test(lms)) return 'MOODLE';
  if (/blackboard/.test(lms)) return 'BLACKBOARD';
  if (/chamilo/.test(lms)) return 'CHAMILO';
  if (/canvas/.test(lms)) return 'CANVAS';
  return 'GENERICO';
}

/** Supuestos editables de la estimación (RN-03-4, SUP-01). */
export const SUPUESTOS_ESTIMACION = { minutosPorPantalla: 1.2, pantallasPorScorm: 30 };

export interface Estimacion {
  pantallas: number;
  scorm: number;
  /** Solo si se indica cuántos SCORM produce el equipo por mes. */
  meses: number | null;
}

/** CP-032: 48 h, 50 % en SCORM y 30 pantallas por SCORM → ≈ 1.200 pantallas y 40 SCORM. */
export function estimar(entrada: {
  horas: number; porcentajeScorm: number; minutosPorPantalla?: number; pantallasPorScorm?: number; scormPorMes?: number | null;
}): Estimacion | null {
  const minutos = entrada.minutosPorPantalla ?? SUPUESTOS_ESTIMACION.minutosPorPantalla;
  const porScorm = entrada.pantallasPorScorm ?? SUPUESTOS_ESTIMACION.pantallasPorScorm;
  if (!(entrada.horas > 0) || !(entrada.porcentajeScorm > 0) || !(minutos > 0) || !(porScorm > 0)) return null;
  const pantallas = Math.round((entrada.horas * 60 * Math.min(entrada.porcentajeScorm, 100)) / 100 / minutos);
  const scorm = Math.ceil(pantallas / porScorm);
  const meses = entrada.scormPorMes && entrada.scormPorMes > 0 ? Math.round((scorm / entrada.scormPorMes) * 10) / 10 : null;
  return { pantallas, scorm, meses };
}

/** Avance de revisión: pantallas aprobadas sobre el total del curso (0 de 0 si aún no se generó). */
export function avanceDe(documento: unknown): { aprobadas: number; total: number } {
  type Doc = { modulos?: { capsulas?: { pantallas?: { estado?: string }[] }[] }[] };
  const pantallas = ((documento as Doc | null)?.modulos ?? []).flatMap((m) => m.capsulas ?? []).flatMap((c) => c.pantallas ?? []);
  return { aprobadas: pantallas.filter((p) => p.estado === 'aprobado').length, total: pantallas.length };
}
