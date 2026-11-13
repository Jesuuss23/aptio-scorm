// HU-1205 · Pasos de la guía del kit de gamificación por LMS (docs/08-entregas-y-lms.md). Los nombres de menú son los
// de la documentación pública de cada plataforma y cambian entre versiones: toda guía lleva la nota «Verificar con la
// versión del cliente». Ningún paso se probó todavía en una instancia real (SUP-162).

export const LMS_KIT = ['generico', 'moodle', 'canvas', 'blackboard', 'chamilo'] as const;
export type LmsKit = (typeof LMS_KIT)[number];
export type IdiomaGuia = 'es' | 'en';

export const NOMBRE_LMS: Record<LmsKit, string> = {
  generico: 'Genérico', moodle: 'Moodle 4.5', canvas: 'Canvas', blackboard: 'Blackboard', chamilo: 'Chamilo',
};
const NOMBRE_LMS_EN: Record<LmsKit, string> = {
  generico: 'Generic', moodle: 'Moodle 4.5', canvas: 'Canvas', blackboard: 'Blackboard', chamilo: 'Chamilo',
};
export const nombreLms = (lms: LmsKit, idioma: IdiomaGuia): string => (idioma === 'en' ? NOMBRE_LMS_EN : NOMBRE_LMS)[lms];

export const VERIFICAR: Record<IdiomaGuia, string> = {
  es: 'Verificar con la versión del cliente: los nombres de los menús y las opciones cambian entre versiones y según lo que active la institución.',
  en: 'Check against the client’s version: menu names and options change between versions and depend on what the institution enables.',
};

export interface SeccionGuia {
  titulo: string;
  pasos: string[];
}

/** `{nota}` se cambia por la nota mínima del curso (o por «la nota que decida el equipo» si el curso no la tiene). */
const PASOS: Record<LmsKit, Record<IdiomaGuia, SeccionGuia[]>> = {
  moodle: {
    es: [
      { titulo: 'Antes de empezar', pasos: [
        'Confirma que las insignias están activas en el sitio (Administración del sitio › Insignias) y que el curso tiene activada la finalización de actividad (Configuración del curso › Finalización).',
        'Sube cada cápsula como actividad SCORM (Agregar una actividad o recurso › Paquete SCORM).',
      ] },
      { titulo: 'Finalización de actividad', pasos: [
        'En cada actividad SCORM, abre Configuración › Finalización de actividad y agrega como condición «Recibir una calificación aprobatoria» o el estado «Aprobado» o «Completado» que informa el paquete.',
        'En la calificación de la actividad, deja como nota para aprobar {nota}.',
      ] },
      { titulo: 'Restricción de acceso (orden de desbloqueo)', pasos: [
        'En cada cápsula que no sea la primera, abre Configuración › Restricciones de acceso › Añadir restricción › Finalización de actividad.',
        'Elige la cápsula anterior según el plan y la condición «debe estar marcada como completada».',
      ] },
      { titulo: 'Insignias', pasos: [
        'En el curso, entra a Más › Insignias › Añadir una nueva insignia. Usa el nombre del plan y sube su PNG de la carpeta insignias/png.',
        'En Criterios, agrega «Finalización de actividad» y elige la cápsula (insignia de cápsula) o todas las cápsulas del módulo (insignia de módulo). Para la insignia del curso, usa «Finalización del curso».',
        'Pulsa «Habilitar acceso» para activar la insignia. Una vez que alguien la recibe, sus criterios ya no se pueden cambiar.',
      ] },
    ],
    en: [
      { titulo: 'Before you start', pasos: [
        'Make sure badges are enabled on the site (Site administration › Badges) and that the course has completion tracking enabled (Course settings › Completion tracking).',
        'Upload each capsule as a SCORM activity (Add an activity or resource › SCORM package).',
      ] },
      { titulo: 'Activity completion', pasos: [
        'In each SCORM activity, open Settings › Activity completion and add «Receive a passing grade» or the «Passed» or «Completed» status reported by the package.',
        'In the activity grade settings, set the grade to pass to {nota}.',
      ] },
      { titulo: 'Restrict access (unlock order)', pasos: [
        'In every capsule except the first, open Settings › Restrict access › Add restriction › Activity completion.',
        'Choose the previous capsule from the plan and the condition «must be marked complete».',
      ] },
      { titulo: 'Badges', pasos: [
        'In the course, go to More › Badges › Add a new badge. Use the name from the plan and upload its PNG from the insignias/png folder.',
        'Under Criteria, add «Activity completion» and choose the capsule (capsule badge) or every capsule of the module (module badge). For the course badge, use «Course completion».',
        'Click «Enable access» to activate the badge. Once someone earns it, its criteria can no longer be changed.',
      ] },
    ],
  },
  canvas: {
    es: [
      { titulo: 'Antes de empezar', pasos: [
        'Canvas no abre SCORM por sí solo: la institución debe tener activa una herramienta LTI de SCORM. Sube cada cápsula con esa herramienta y créala como tarea calificada.',
        'Canvas tampoco trae insignias propias: se otorgan con Canvas Credentials (antes Badgr) u otra herramienta de Open Badges que la institución tenga integrada.',
      ] },
      { titulo: 'Requisitos y prerrequisitos (orden de desbloqueo)', pasos: [
        'En Módulos, agrupa las cápsulas como en el plan. En la configuración de cada módulo, agrega el requisito «Obtener una puntuación de al menos {nota}» en la tarea de la cápsula.',
        'Marca la opción de que los alumnos completen los requisitos en orden secuencial, y agrega como prerrequisito el módulo anterior.',
      ] },
      { titulo: 'Insignias', pasos: [
        'En la herramienta de insignias, crea una insignia por cada fila del plan con su nombre y su PNG de la carpeta insignias/png.',
        'Liga cada insignia a la finalización del módulo correspondiente; la del curso, al último módulo o a la finalización del curso, según lo que permita la herramienta.',
      ] },
    ],
    en: [
      { titulo: 'Before you start', pasos: [
        'Canvas does not play SCORM on its own: the institution needs an active SCORM LTI tool. Upload each capsule with that tool and create it as a graded assignment.',
        'Canvas has no built-in badges either: they are awarded with Canvas Credentials (formerly Badgr) or another Open Badges tool the institution has integrated.',
      ] },
      { titulo: 'Requirements and prerequisites (unlock order)', pasos: [
        'In Modules, group the capsules as in the plan. In each module’s settings, add the requirement «Score at least {nota}» on the capsule assignment.',
        'Check the option for students to complete the requirements in sequential order, and add the previous module as a prerequisite.',
      ] },
      { titulo: 'Badges', pasos: [
        'In the badge tool, create one badge per row of the plan with its name and its PNG from the insignias/png folder.',
        'Link each badge to the completion of its module; the course badge, to the last module or to course completion, depending on what the tool allows.',
      ] },
    ],
  },
  blackboard: {
    es: [
      { titulo: 'Antes de empezar', pasos: [
        'Sube cada cápsula como contenido SCORM con el reproductor integrado y activa la calificación para que la nota llegue al Centro de calificaciones.',
      ] },
      { titulo: 'Condiciones de acceso (orden de desbloqueo)', pasos: [
        'En Learn Ultra, abre las condiciones de liberación de cada cápsula que no sea la primera; en Learn Original, usa Entrega adaptativa.',
        'Pon como regla que la cápsula anterior tenga una nota de al menos {nota}.',
      ] },
      { titulo: 'Insignias', pasos: [
        'Usa Logros (Achievements): crea un logro de tipo insignia por cada fila del plan, con su nombre y su PNG de la carpeta insignias/png.',
        'Como criterio, elige la nota o la finalización de la cápsula; para la insignia de módulo, todas sus cápsulas; para la del curso, todas las del curso.',
      ] },
    ],
    en: [
      { titulo: 'Before you start', pasos: [
        'Upload each capsule as SCORM content with the built-in player and enable grading so the score reaches the Grade Center.',
      ] },
      { titulo: 'Release conditions (unlock order)', pasos: [
        'In Learn Ultra, open the release conditions of every capsule except the first; in Learn Original, use Adaptive Release.',
        'Set the rule that the previous capsule has a score of at least {nota}.',
      ] },
      { titulo: 'Badges', pasos: [
        'Use Achievements: create one badge-type achievement per row of the plan, with its name and its PNG from the insignias/png folder.',
        'As criteria, choose the score or completion of the capsule; for the module badge, all of its capsules; for the course badge, every capsule in the course.',
      ] },
    ],
  },
  chamilo: {
    es: [
      { titulo: 'Antes de empezar', pasos: [
        'Importa cada cápsula en Lecciones (Itinerarios de aprendizaje) con la opción de importar SCORM.',
      ] },
      { titulo: 'Prerrequisitos (orden de desbloqueo)', pasos: [
        'En la configuración de cada lección que no sea la primera, elige como prerrequisito la lección anterior según el plan.',
        'Si la institución lo permite, pide una nota mínima de {nota} en el prerrequisito.',
      ] },
      { titulo: 'Insignias', pasos: [
        'Chamilo otorga insignias a través de Competencias: la administración del sitio crea una competencia por fila del plan y le sube su PNG de la carpeta insignias/png como insignia.',
        'Liga cada competencia a la evaluación (Cuaderno de evaluación) de la lección o del curso para que se otorgue al aprobar.',
      ] },
    ],
    en: [
      { titulo: 'Before you start', pasos: [
        'Import each capsule into Learning paths with the SCORM import option.',
      ] },
      { titulo: 'Prerequisites (unlock order)', pasos: [
        'In the settings of every learning path except the first, set the previous one from the plan as its prerequisite.',
        'If the institution allows it, require a minimum score of {nota} on the prerequisite.',
      ] },
      { titulo: 'Badges', pasos: [
        'Chamilo awards badges through Skills: the site administrator creates one skill per row of the plan and uploads its PNG from the insignias/png folder as the badge.',
        'Link each skill to the assessment (Gradebook) of the learning path or the course so it is awarded on passing.',
      ] },
    ],
  },
  generico: {
    es: [
      { titulo: 'Antes de empezar', pasos: [
        'Confirma con el cliente qué ofrece su LMS: seguimiento de la finalización de actividades, condiciones de acceso o prerrequisitos, e insignias o certificados (muchos usan Open Badges).',
        'Sube cada cápsula como paquete SCORM 1.2 y comprueba que el LMS registra el estado y la nota.',
      ] },
      { titulo: 'Orden de desbloqueo', pasos: [
        'Con las condiciones de acceso del LMS, haz que cada cápsula se abra al completar la anterior, en el orden del plan, con una nota mínima de {nota}.',
      ] },
      { titulo: 'Insignias', pasos: [
        'Crea una insignia por fila del plan con su nombre y su imagen: PNG de 512 × 512 px de la carpeta insignias/png, o SVG si el LMS lo acepta.',
        'Otórgala con el criterio del plan: completar la cápsula, todas las cápsulas del módulo o el curso.',
      ] },
    ],
    en: [
      { titulo: 'Before you start', pasos: [
        'Confirm with the client what their LMS offers: activity completion tracking, access conditions or prerequisites, and badges or certificates (many use Open Badges).',
        'Upload each capsule as a SCORM 1.2 package and check that the LMS records the status and the score.',
      ] },
      { titulo: 'Unlock order', pasos: [
        'With the LMS access conditions, make each capsule open when the previous one is complete, in the order of the plan, with a minimum score of {nota}.',
      ] },
      { titulo: 'Badges', pasos: [
        'Create one badge per row of the plan with its name and image: 512 × 512 px PNG from the insignias/png folder, or SVG if the LMS accepts it.',
        'Award it with the criterion in the plan: completing the capsule, every capsule of the module or the course.',
      ] },
    ],
  },
};

export function pasosGuia(lms: LmsKit, idioma: IdiomaGuia, notaMinima: number | null): SeccionGuia[] {
  const nota = notaMinima === null ? (idioma === 'en' ? 'the score the team decides' : 'la nota que decida el equipo') : String(notaMinima);
  return PASOS[lms][idioma].map((s) => ({ titulo: s.titulo, pasos: s.pasos.map((p) => p.replaceAll('{nota}', nota)) }));
}
