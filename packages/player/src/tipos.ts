// Lo que el reproductor lee del documento del curso (packages/schema/esquemas/curso-v0.schema.json). Los tipos son
// propios para que el reproductor no dependa de ningún otro paquete: el mismo código va en la vista previa y en el SCORM.

export type Idioma = 'es' | 'en';
export type TextoI18n = { es?: string; en?: string };
export type RolColor = 'primario' | 'secundario' | 'acento' | 'texto' | 'blanco' | 'alerta' | 'fondo';

export interface Visual {
  texto?: TextoI18n;
  recursoId?: string;
  alt?: TextoI18n;
}

export type BloqueTexto = { id: string; tipo: 'texto'; rol: 'titulo' | 'subtitulo' | 'cuerpo' | 'destacado'; contenido: TextoI18n };
export type BloqueImagen = { id: string; tipo: 'imagen'; recursoId: string; decorativa: boolean; alt?: TextoI18n };
export type BloquePersonaje = { id: string; tipo: 'personaje'; recursoId: string; pose?: string; lado?: 'izquierda' | 'derecha' };
export type BloqueInteraccion = { id: string; tipo: 'interaccion'; interaccion: Interaccion };
export type BloqueVideo = { id: string; tipo: 'video'; recursoId: string; reglas?: { impedirAdelantar: boolean; porcentajeMinimo: number } };
export type Bloque = BloqueTexto | BloqueImagen | BloquePersonaje | BloqueInteraccion | BloqueVideo;

export type TipoInteraccion = 'INT-01' | 'INT-02' | 'INT-03' | 'INT-04' | 'INT-05' | 'INT-06' | 'INT-07' | 'INT-08';
export interface Interaccion {
  tipo: TipoInteraccion;
  modo: 'formativa' | 'sumativa';
  peso?: number;
  instruccion?: TextoI18n;
  datos: Record<string, unknown>;
}

export interface Pantalla {
  id: string;
  titulo: TextoI18n;
  tipo: string;
  obligatoria: boolean;
  bloques: Bloque[];
  disposicion?: string;
  fondo?: RolColor;
  fondoRecursoId?: string;
  narracion?: { texto: TextoI18n; personajeBloqueId?: string; porIdioma?: Partial<Record<Idioma, AudioNarracion>> };
  /** HU-0602 · Retoques del editor por id de bloque o de extra (RN-06-1). */
  ajustes?: Record<string, AjusteElemento>;
  /** HU-0606 · Elementos agregados en el editor, sobre la pantalla (RN-06-1). */
  extras?: ElementoExtra[];
}

/** Elemento agregado en el editor (curso-v0 `elementoExtra`): posición y ancho en % de la pantalla. */
export interface ElementoExtra {
  id: string;
  tipo: 'titulo' | 'texto' | 'dato' | 'boton' | 'imagen' | 'insignia' | 'forma' | 'personaje';
  texto?: TextoI18n;
  recursoId?: string;
  x: number;
  y: number;
  ancho: number;
  alClic?: 'nada' | 'siguiente' | 'retroalimentacion' | 'ventana' | 'audio' | 'puntos';
}

/** Retoque de un elemento (curso-v0 `ajusteElemento`). Lo que el reproductor aún no usa (desplazamiento, tiempos) se ignora. */
export interface AjusteElemento {
  tamanoCqw?: number;
  escala?: number;
  color?: RolColor;
  relleno?: RolColor;
  alineacion?: 'izquierda' | 'centro' | 'derecha';
  animacion?: 'auto' | 'ninguna' | 'aparecer' | 'deslizar' | 'zoom' | 'rebotar';
  retardoS?: number;
  finS?: number;
  anclaPalabra?: number;
  oculto?: boolean;
  desplazamiento?: { x: number; y: number; dispositivo?: 'todos' | 'escritorio' | 'celular' };
}

/** Audio de la narración en un idioma (etapas 6 a 8): el recurso, su duración, las marcas [ms, boca] y el WebVTT. */
export interface AudioNarracion {
  recursoAudioId?: string;
  duracionMs?: number;
  bocas?: [number, string][];
  subtitulosId?: string;
}

export interface Capsula {
  id: string;
  titulo: TextoI18n;
  pantallas: Pantalla[];
}

export interface Modulo {
  id: string;
  titulo: TextoI18n;
  capsulas: Capsula[];
}

export type ModoNavegacion = 'libre' | 'condiciones' | 'secuencial';

export interface Navegacion {
  patron?: string;
  modo?: ModoNavegacion;
  siguienteSeHabilita?: 'siempre' | 'narracion' | 'actividad';
  mostrar?: string[];
  atajosTeclado?: boolean;
}

export interface Seguimiento {
  criterioCompletado: 'pantallas-obligatorias' | 'sumativa';
  notaMinima: number;
  intentosMaximos?: number | null;
  notaReportada?: 'mejor' | 'ultima';
}

export interface Recurso {
  id: string;
  tipo: string;
  nombre: string;
}

export interface CursoReproductor {
  id: string;
  metadatos: { titulo: TextoI18n };
  idiomas: Idioma[];
  modulos: Modulo[];
  seguimiento: Seguimiento;
  recursos: Recurso[];
  navegacion?: Navegacion;
}

/** Colores y letras del kit del cliente. Sin kit se usa el estilo base. */
export interface KitReproductor {
  paleta?: Partial<Record<RolColor, string>>;
  tipografias?: { titulos?: string; textos?: string };
  personaje?: string | null;
}

/** Resultado de una actividad: puntaje 0–100 o null si no califica (tarjetas, exploración). */
export interface ResultadoActividad {
  completada: boolean;
  puntaje: number | null;
}

/** Lo que se reportaría al LMS (SCORM 1.2: cmi.core.lesson_status y cmi.core.score.raw). */
export type EstadoLeccion = 'incomplete' | 'completed' | 'passed' | 'failed';
