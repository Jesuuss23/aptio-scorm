// HU-0401 · Las 11 etapas del generador (docs/14-modulos.md, M04), en orden, con su nombre para la pantalla.
import type { DefinicionModelo, Disposicion, Paleta, RolColor } from './marca.js';

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

// ---------- Etapa 3 · Storyboard y guion (HU-0404) ----------

/** Palabras máximas por pantalla (CP-040): pasar el límite no rechaza el guion, lo deja con advertencia. */
export const LIMITE_PALABRAS = { textoPantalla: 30, narracion: 45 } as const;
export type CampoGuion = keyof typeof LIMITE_PALABRAS;

/** Cuenta palabras: separadas por espacios y con al menos una letra o cifra («·» o «—» sueltos no cuentan). */
export const contarPalabras = (texto: string) => texto.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;

export interface OrigenGuion {
  tipo: 'documento' | 'ia' | 'manual';
  documentoId?: string;
  /** Nombre del archivo del cliente, para mostrar la trazabilidad sin otra consulta. */
  archivo?: string;
  paginas?: number[];
  revisado: boolean;
}

export interface PantallaGuion {
  id: string;
  tipo: TipoPantalla;
  titulo: string;
  textoPantalla: string;
  narracion: string;
  visual: string;
  actividad?: { tipo: string; consigna: string };
  objetivoIds: string[];
  origen: OrigenGuion;
  notas?: string;
  palabras: Record<CampoGuion, number>;
}

export interface AdvertenciaGuion {
  pantallaId: string;
  campo: CampoGuion;
  palabras: number;
  limite: number;
}

/** Lo que guarda la etapa STORYBOARD_GUION (salida de IA-05 por cápsula) y recibe la etapa 4. */
export interface GuionCurso {
  capsulas: { id: string; moduloId: string; titulo: { es?: string; en?: string }; pantallas: PantallaGuion[] }[];
  advertencias: AdvertenciaGuion[];
}

/** Advertencias de longitud de un guion: cada campo de cada pantalla que pasa su límite de palabras. */
export function advertenciasDeLongitud(pantallas: Pick<PantallaGuion, 'id' | 'textoPantalla' | 'narracion'>[]): AdvertenciaGuion[] {
  return pantallas.flatMap((p) => (Object.keys(LIMITE_PALABRAS) as CampoGuion[])
    .map((campo) => ({ pantallaId: p.id, campo, palabras: contarPalabras(p[campo]), limite: LIMITE_PALABRAS[campo] }))
    .filter((a) => a.palabras > a.limite));
}

// ---------- Etapa 4 · Pantallas con el kit (HU-0406) ----------

/** Disposición que corresponde a cada actividad del catálogo (IA-15 v2). Las tarjetas (INT-04) van en una lista. */
export const DISPOSICION_DE_ACTIVIDAD: Record<string, Disposicion> = {
  'INT-01': 'memoria', 'INT-02': 'clasificar', 'INT-03': 'ordenar', 'INT-04': 'lista', 'INT-05': 'quiz',
  'INT-06': 'hotspot', 'INT-07': 'vf', 'INT-08': 'decision',
};
/** Disposiciones que solo tienen sentido con los datos de una actividad (los da IA-07). */
export const DISPOSICIONES_DE_JUEGO: readonly Disposicion[] = ['memoria', 'clasificar', 'ordenar', 'hotspot'];

/** Campos que llena IA-15 (IA-15.salida.schema.json). */
export interface CamposPantalla {
  titulo: string;
  subtitulo?: string;
  texto?: string;
  dato?: string;
  datoGrande?: string;
  numero?: string;
  items?: { icono?: string; titulo: string; texto?: string }[];
  burbuja?: string;
  situacion?: string;
  pregunta?: string;
  afirmacion?: string;
  opciones?: string[];
  correcta?: number;
  retroOk?: string;
  retroNo?: string;
}

export interface PedidoImagen {
  id: string;
  uso: 'principal' | 'icono' | 'fondo' | 'escena';
  descripcion: string;
}

/** Datos de una actividad (salida de IA-07 sin `pantallaId`): van tal cual en `bloque.interaccion` del curso. */
export interface InteraccionGenerada {
  modo: 'formativa' | 'sumativa';
  peso?: number;
  instruccion: { es?: string; en?: string };
  datos: Record<string, unknown>;
}

/** Una pantalla compuesta: lo que pidió el guion más la disposición y los campos de IA-15. */
export interface PantallaCompuesta {
  id: string;
  /** Lugar en el curso, desde 1: con varias a la vez, una pantalla puede quedar lista antes que la anterior. */
  orden: number;
  capsulaId: string;
  titulo: string;
  disposicion: Disposicion;
  fondo: RolColor;
  campos: CamposPantalla;
  personaje?: { pose: string; lado: 'izquierda' | 'derecha' };
  /** Los dibuja la etapa 5 (Ilustraciones). */
  pedidosImagen: PedidoImagen[];
  /** La actividad del guion con sus datos (IA-07, HU-0407), listos para el bloque `interaccion` del curso. */
  actividad?: { tipo: string; consigna: string; interaccion?: InteraccionGenerada };
  motivo?: string;
}

/**
 * Lo que guarda la etapa PANTALLAS. Mientras corre guarda las pantallas listas (CP-043: se ven en Producción sin
 * esperar al resto); al terminar, además, el curso validado (CP-042).
 */
export interface PantallasCurso {
  total: number;
  kit: { nombre: string; paleta: Paleta; tipografias: { titulos: string; textos: string }; personaje: string | null };
  /** El modelo que usa cada disposición: el del cliente o el del estilo base. */
  modelos: Partial<Record<Disposicion, DefinicionModelo>>;
  pantallas: PantallaCompuesta[];
  advertencias: string[];
  curso?: { id: string; version: number };
}

/** Tramos de 3 o más pantallas seguidas con la misma disposición (la regla de IA-15 es no repetir 3 veces). */
export function repeticionesSeguidas(pantallas: Pick<PantallaCompuesta, 'id' | 'disposicion'>[]): { ids: string[]; disposicion: Disposicion }[] {
  const tramos: { ids: string[]; disposicion: Disposicion }[] = [];
  let actual: { ids: string[]; disposicion: Disposicion } | null = null;
  for (const p of pantallas) {
    if (actual && actual.disposicion === p.disposicion) actual.ids.push(p.id);
    else {
      if (actual && actual.ids.length >= 3) tramos.push(actual);
      actual = { ids: [p.id], disposicion: p.disposicion };
    }
  }
  if (actual && actual.ids.length >= 3) tramos.push(actual);
  return tramos;
}

// ---------- Etapa 6 · Voz en español (HU-0701) ----------

/** Una narración lista: la pantalla, su duración real y la voz con que se dijo. */
export interface NarracionLista {
  pantallaId: string;
  titulo: string;
  texto: string;
  duracionMs: number;
  voz: string;
  /** Términos del diccionario de pronunciación aplicados (p. ej. «LOTO»). */
  pronunciados: string[];
}

/** Resultado (y avance, mientras corre) de la etapa 6. */
export interface VozCurso {
  total: number;
  cursoId: string;
  narraciones: NarracionLista[];
  simulada: boolean;
}

/** «4 min 12 s» a partir de milisegundos. */
export function duracionLegible(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60} s` : `${s} s`;
}
