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

// ---------- Etapa 1 · Leer y resumir (HU-0402) ----------

export type DecisionTema = 'conservar' | 'complementario' | 'omitir';

/** Tema del mapa (IA-01) con la decisión propuesta (IA-02) y el material de donde sale. */
export interface TemaMaterial {
  id: string;
  materialId: string;
  titulo: string;
  resumen: string;
  paginas: number[];
  peso: number;
  tipoContenido: string;
  decision: DecisionTema;
  motivo: string;
}

/** Idea clave (fragmento de IA-03) con su origen: archivo y páginas (CP-038). */
export interface IdeaClave {
  id: string;
  temaId: string;
  materialId: string;
  archivo: string;
  texto: string;
  paginas: number[];
  tipo: 'idea' | 'dato' | 'paso' | 'ejemplo' | 'advertencia' | 'definicion';
  literal: boolean;
}

export interface ActaOmitidos {
  titulo: string;
  temas: { temaId: string; titulo: string; paginas: number[]; motivo: string }[];
  /** Markdown para el cliente. Es una propuesta: el diseñador la revisa antes de enviarla. */
  textoActa: string;
}

/** Lo que guarda la etapa RESUMEN_MATERIAL y recibe la etapa 2. */
export interface ResumenMaterial {
  /** Tema escrito por el equipo cuando no hay documento (o además de él). */
  tema: string | null;
  documentos: { materialId: string; nombre: string; totalPaginas: number }[];
  temas: TemaMaterial[];
  metaMinutos: number | null;
  minutosEstimados: number | null;
  ideas: IdeaClave[];
  acta: ActaOmitidos | null;
  observaciones: string[];
}

// ---------- Etapa 2 · Objetivos y estructura (HU-0403) ----------

export type NivelBloom = 'recordar' | 'comprender' | 'aplicar' | 'analizar' | 'evaluar' | 'crear';
export type TipoPantalla = 'portada' | 'objetivos' | 'contenido' | 'actividad' | 'evaluacion' | 'seccion' | 'resumen' | 'resultados' | 'cierre';

export interface ObjetivoAprendizaje {
  id: string;
  texto: { es?: string; en?: string };
  nivelBloom: NivelBloom;
  verbo: string;
}

export interface PantallaEstructura {
  id: string;
  tipo: TipoPantalla;
  proposito: string;
  objetivoIds: string[];
  fragmentoIds: string[];
  actividadSugerida?: string;
  /** Páginas del material de donde salen sus fragmentos (trazabilidad). */
  paginas: number[];
}

/** Lo que guarda la etapa OBJETIVOS_ESTRUCTURA (salida de IA-04 con el origen de cada pantalla) y recibe la etapa 3. */
export interface EstructuraCurso {
  objetivos: ObjetivoAprendizaje[];
  modulos: {
    id: string;
    titulo: { es?: string; en?: string };
    capsulas: { id: string; titulo: { es?: string; en?: string }; objetivoIds: string[]; duracionEstimadaMin: number; pantallas: PantallaEstructura[] }[];
  }[];
  supuestos: string[];
  /** Pantallas con actividad pedidas (pantallas × %) y logradas. */
  actividades: { minimas: number | null; total: number };
}

const TIPOS_ACTIVIDAD: readonly string[] = ['actividad', 'evaluacion'];
/** Cuenta como pantalla con actividad la de tipo actividad o evaluación, o la que sugiere una interacción (CP-039). */
export const conActividad = (p: { tipo: string; actividadSugerida?: string }) => TIPOS_ACTIVIDAD.includes(p.tipo) || Boolean(p.actividadSugerida);
