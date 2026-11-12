/* Archivo generado desde esquemas/curso-v0.schema.json con `pnpm --filter @aptio/schema generar`. No editar a mano. */

/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "id".
 */
export type Id = string;
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "idioma".
 */
export type Idioma = 'es' | 'en';
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "estadoContenido".
 */
export type EstadoContenido = 'borrador' | 'propuesta-ia' | 'aprobado';
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "bloque".
 */
export type Bloque = {
  id: Id;
  tipo: 'texto' | 'imagen' | 'personaje' | 'interaccion' | 'video';
};
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "rolColor".
 */
export type RolColor = 'primario' | 'secundario' | 'acento' | 'texto' | 'blanco' | 'alerta' | 'fondo';
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "boca".
 */
export type Boca = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "interaccion".
 */
export type Interaccion = {
  tipo: 'INT-01' | 'INT-02' | 'INT-03' | 'INT-04' | 'INT-05' | 'INT-06' | 'INT-07' | 'INT-08';
  modo: 'formativa' | 'sumativa';
  peso?: number;
  instruccion?: TextoI18N;
  datos: {};
};
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "marcadorVideo".
 */
export type MarcadorVideo = {
  id: Id;
  tiempoMs: number;
  tipo: 'pregunta' | 'punto' | 'capitulo';
  obligatorio: boolean;
  pregunta?: PreguntaQuiz;
  titulo?: TextoI18N;
  contenido?: TextoI18N;
  posicion?: {
    x: number;
    y: number;
  };
  origen?: Origen;
};

/**
 * Fuente de verdad del curso: contenido por idioma, pantallas, interacciones, narración, recursos y seguimiento. Referencia recursos por id, nunca por ruta.
 */
export interface CursoDeCapsulasEsquemaV0 {
  versionEsquema: '0.1.0' | '0.2.0';
  id: Id;
  metadatos: {
    titulo: TextoI18N;
    descripcion?: TextoI18N;
    cliente: {
      id: Id;
      nombre: string;
    };
    publico: string;
    nivel?: 'basico' | 'intermedio' | 'avanzado';
    duracionEstimadaMin: number;
    autor?: string;
    creado: string;
    actualizado: string;
  };
  /**
   * @minItems 1
   */
  idiomas: [Idioma, ...Idioma[]];
  /**
   * unico: un idioma; separados: un paquete por idioma; mismo-paquete: todos los idiomas en un paquete con selector.
   */
  modoIdioma: 'unico' | 'separados' | 'mismo-paquete';
  kitMarcaId: Id;
  /**
   * @minItems 1
   */
  objetivos: [
    {
      id: Id;
      texto: TextoI18N;
      nivelBloom: 'recordar' | 'comprender' | 'aplicar' | 'analizar' | 'evaluar' | 'crear';
    },
    ...{
      id: Id;
      texto: TextoI18N;
      nivelBloom: 'recordar' | 'comprender' | 'aplicar' | 'analizar' | 'evaluar' | 'crear';
    }[]
  ];
  /**
   * @minItems 1
   */
  modulos: [Modulo, ...Modulo[]];
  seguimiento: {
    criterioCompletado: 'pantallas-obligatorias' | 'sumativa';
    notaMinima: number;
    intentosMaximos?: number | null;
    notaReportada: 'mejor' | 'ultima';
  };
  recursos: Recurso[];
  /**
   * Forma de recorrer la cápsula (patrón) y reglas de avance. Opcional: si falta, se usa patrón clásico con actividades obligatorias.
   */
  navegacion?: {
    patron?: 'clasico' | 'historias' | 'vertical' | 'mapa' | 'hub' | 'ramificado' | 'inmersivo' | 'personalizado';
    patronPersonalizado?: {
      nombre: string;
      base: 'clasico' | 'historias' | 'vertical' | 'mapa' | 'hub' | 'ramificado' | 'inmersivo';
      progreso: 'barra' | 'segmentos' | 'puntos' | 'porcentaje' | 'ninguno';
      avance: 'botones' | 'deslizar-y-botones' | 'desplazar';
      menu: 'temario' | 'mapa' | 'temas' | 'ninguno';
      marcador?: boolean;
      barra?: 'arriba' | 'abajo' | 'flotante' | 'ninguna';
      origen?: 'usuario' | 'ia';
    };
    modo?: 'libre' | 'condiciones' | 'secuencial';
    siguienteSeHabilita?: 'siempre' | 'narracion' | 'actividad';
    reanudar?: 'preguntar' | 'automatica' | 'no';
    mostrar?: (
      | 'temario'
      | 'progreso'
      | 'contador'
      | 'botones'
      | 'glosario'
      | 'recursos'
      | 'ayuda'
      | 'accesibilidad'
      | 'puntos'
      | 'idioma'
    )[];
    objetivosAlInicio?: boolean;
    atajosTeclado?: boolean;
  };
  gamificacion?: {
    nivel?: 'ninguna' | 'ligera' | 'completa';
    puntosPorAcierto?: number;
    insignias?: {
      id: Id;
      nombre: TextoI18N;
      recursoId?: Id;
      condicion: {
        tipo: 'completar-capsula' | 'completar-modulo' | 'nota-minima-interaccion';
        refId: Id;
        valor?: number;
      };
    }[];
  };
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "textoI18n".
 */
export interface TextoI18N {
  es?: string;
  en?: string;
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "modulo".
 */
export interface Modulo {
  id: Id;
  titulo: TextoI18N;
  /**
   * @minItems 1
   */
  capsulas: [Capsula, ...Capsula[]];
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "capsula".
 */
export interface Capsula {
  id: Id;
  titulo: TextoI18N;
  /**
   * @minItems 1
   */
  objetivoIds: [Id, ...Id[]];
  duracionEstimadaMin: number;
  /**
   * @minItems 1
   */
  pantallas: [Pantalla, ...Pantalla[]];
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "pantalla".
 */
export interface Pantalla {
  id: Id;
  titulo: TextoI18N;
  tipo: 'portada' | 'contenido' | 'interactiva' | 'evaluacion' | 'video' | 'cierre';
  objetivoIds?: Id[];
  /**
   * Nivel de Bloom de la pantalla para la alineación (HU-1001). Si falta, se toma el de su disposición.
   */
  nivelBloom?: 'recordar' | 'comprender' | 'aplicar' | 'analizar' | 'evaluar' | 'crear';
  /**
   * id de plantilla de pantalla del estilo del kit
   */
  plantilla: string;
  estado: EstadoContenido;
  obligatoria: boolean;
  /**
   * @minItems 1
   */
  bloques: [Bloque, ...Bloque[]];
  narracion?: Narracion;
  fondoRecursoId?: Id;
  /**
   * Composición de la pantalla generada (v0.2). La define el generador a partir de las pantallas modelo del kit; el editor puede cambiarla.
   */
  disposicion?:
    | 'portada'
    | 'objetivos'
    | 'personaje'
    | 'dato'
    | 'idea'
    | 'lista'
    | 'memoria'
    | 'clasificar'
    | 'ordenar'
    | 'decision'
    | 'video'
    | 'hotspot'
    | 'quiz'
    | 'vf'
    | 'resumen'
    | 'seccion'
    | 'resultados'
    | 'cierre';
  /**
   * Color de fondo de la pantalla como rol del kit (v0.2).
   */
  fondo?: 'primario' | 'secundario' | 'acento' | 'texto' | 'blanco' | 'alerta' | 'fondo';
  /**
   * Retoques del editor por elemento (clave = id del bloque o del elemento de la disposición). Se guardan aparte del contenido para que la IA pueda regenerar textos sin perderlos (v0.2).
   */
  ajustes?: {
    [k: string]: AjusteElemento;
  };
  /**
   * Elementos agregados a mano en el editor sobre la pantalla generada (v0.2).
   */
  extras?: ElementoExtra[];
  /**
   * Disparadores simples del editor (HU-0610): cuando llega un segundo de la línea de tiempo o termina la voz, mostrar u ocultar un elemento o ir a otra pantalla. Como mucho 10 por pantalla (regla adicional).
   */
  disparadores?: Disparador[];
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "narracion".
 */
export interface Narracion {
  texto: TextoI18N;
  personajeBloqueId?: Id;
  porIdioma: {
    es?: AudioNarracion;
    en?: AudioNarracion;
  };
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "audioNarracion".
 */
export interface AudioNarracion {
  estado: 'pendiente' | 'generado' | 'desactualizado';
  recursoAudioId?: Id;
  voz: {
    proveedor: 'google' | 'azure' | 'elevenlabs' | 'cliente';
    voz: string;
    velocidad?: number;
  };
  hashTexto: string;
  duracionMs?: number;
  /**
   * Marcas [tiempoMs, boca] ordenadas por tiempo.
   */
  bocas?: never[][];
  subtitulosId?: Id;
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "ajusteElemento".
 */
export interface AjusteElemento {
  /**
   * Tamaño de texto en % del ancho de la pantalla
   */
  tamanoCqw?: number;
  escala?: number;
  color?: RolColor;
  relleno?: RolColor;
  alineacion?: 'izquierda' | 'centro' | 'derecha';
  /**
   * Desplazamiento en % del ancho de la pantalla (modo libre). Por dispositivo cuando aplica.
   */
  desplazamiento?: {
    x: number;
    y: number;
    dispositivo?: 'todos' | 'escritorio' | 'celular';
  };
  animacion?: 'auto' | 'ninguna' | 'aparecer' | 'deslizar' | 'zoom' | 'rebotar';
  /**
   * Línea de tiempo: segundo en que aparece el elemento, desde el inicio de la pantalla
   */
  retardoS?: number;
  /**
   * Línea de tiempo: segundo en que sale. Sin valor, queda hasta el final de la pantalla
   */
  finS?: number;
  /**
   * Índice de la palabra de la narración con la que aparece. Si la narración cambia, el tiempo se recalcula con las marcas de la nueva voz
   */
  anclaPalabra?: number;
  oculto?: boolean;
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "elementoExtra".
 */
export interface ElementoExtra {
  id: Id;
  tipo: 'titulo' | 'texto' | 'dato' | 'boton' | 'imagen' | 'insignia' | 'forma' | 'personaje';
  texto?: TextoI18N;
  recursoId?: Id;
  x: number;
  y: number;
  ancho: number;
  alClic?: 'nada' | 'siguiente' | 'retroalimentacion' | 'ventana' | 'audio' | 'puntos';
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "disparador".
 */
export interface Disparador {
  id: Id;
  cuando: {
    evento: 'tiempo' | 'fin-voz';
    /**
     * Con evento «tiempo»: segundo de la línea de tiempo (0 a 600, regla adicional)
     */
    segundo?: number;
  };
  accion: {
    tipo: 'mostrar' | 'ocultar' | 'ir-a';
    /**
     * Con mostrar u ocultar: id de un bloque o de un extra de la pantalla (las claves de `ajustes`)
     */
    elementoId?: string;
    /**
     * Con ir-a: id de otra pantalla del curso
     */
    pantallaId?: string;
  };
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "recurso".
 */
export interface Recurso {
  id: Id;
  tipo: 'imagen' | 'svg' | 'audio' | 'video' | 'subtitulos' | 'lottie' | 'documento';
  origen: 'biblioteca' | 'generado' | 'subido' | 'cliente';
  nombre: string;
  mime: string;
  idioma?: Idioma;
  bytes?: number;
  licencia?: string;
  /**
   * ids de capas detectadas en un SVG
   */
  capas?: string[];
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "origen".
 */
export interface Origen {
  tipo: 'documento' | 'ia' | 'manual';
  documentoId?: Id;
  paginas?: number[];
  revisado: boolean;
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "animacion".
 */
export interface Animacion {
  movimiento: 'aparecer' | 'deslizar' | 'rebotar' | 'flotar' | 'latir' | 'senalar' | 'parpadear';
  /**
   * id de la capa SVG a animar; si falta, se anima la pieza completa
   */
  capa?: string;
  retardoMs?: number;
  duracionMs?: number;
  repetir?: boolean;
}
/**
 * Texto o imagen para opciones, cartas y elementos de interacción.
 *
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "visual".
 */
export interface Visual {
  texto?: TextoI18N;
  recursoId?: Id;
  alt?: TextoI18N;
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "preguntaQuiz".
 */
export interface PreguntaQuiz {
  id: Id;
  objetivoId?: Id;
  /**
   * Nivel de Bloom de la pregunta para la alineación (HU-1001). Si falta, se toma el de la pantalla.
   */
  nivelBloom?: 'recordar' | 'comprender' | 'aplicar' | 'analizar' | 'evaluar' | 'crear';
  enunciado: TextoI18N;
  seleccionMultiple?: boolean;
  /**
   * @minItems 2
   * @maxItems 6
   */
  opciones:
    | [
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        },
        {
          id: Id;
          contenido: Visual;
          correcta: boolean;
        }
      ];
  retroalimentacion: {
    correcta: TextoI18N;
    incorrecta: TextoI18N;
  };
  origen?: Origen1;
}
/**
 * HU-1002 · Una pregunta que creó o cambió la IA queda marcada sin revisar.
 */
export interface Origen1 {
  tipo: 'documento' | 'ia' | 'manual';
  documentoId?: Id;
  paginas?: number[];
  revisado: boolean;
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "datosMemoria".
 */
export interface DatosMemoria {
  /**
   * @minItems 3
   * @maxItems 8
   */
  pares:
    | [
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        }
      ]
    | [
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        }
      ]
    | [
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        }
      ]
    | [
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        }
      ]
    | [
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        }
      ]
    | [
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        },
        {
          id: Id;
          a: Visual;
          b: Visual;
        }
      ];
  intentosMaximos?: number;
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "datosClasificar".
 */
export interface DatosClasificar {
  /**
   * @minItems 2
   * @maxItems 4
   */
  grupos:
    | [
        {
          id: Id;
          etiqueta: TextoI18N;
        },
        {
          id: Id;
          etiqueta: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          etiqueta: TextoI18N;
        },
        {
          id: Id;
          etiqueta: TextoI18N;
        },
        {
          id: Id;
          etiqueta: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          etiqueta: TextoI18N;
        },
        {
          id: Id;
          etiqueta: TextoI18N;
        },
        {
          id: Id;
          etiqueta: TextoI18N;
        },
        {
          id: Id;
          etiqueta: TextoI18N;
        }
      ];
  /**
   * @minItems 4
   * @maxItems 12
   */
  elementos:
    | [
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        },
        {
          id: Id;
          contenido: Visual;
          grupoCorrecto: Id;
          retroalimentacion?: TextoI18N;
        }
      ];
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "datosOrdenar".
 */
export interface DatosOrdenar {
  /**
   * @minItems 3
   * @maxItems 8
   */
  pasos:
    | [
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        }
      ]
    | [
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        },
        {
          id: Id;
          contenido: Visual;
        }
      ];
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "datosTarjetas".
 */
export interface DatosTarjetas {
  /**
   * @minItems 2
   * @maxItems 8
   */
  tarjetas:
    | [
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        }
      ]
    | [
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        }
      ]
    | [
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        }
      ]
    | [
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        }
      ]
    | [
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        }
      ]
    | [
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        }
      ]
    | [
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        },
        {
          id: Id;
          frente: Visual;
          reverso: Visual;
        }
      ];
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "datosQuiz".
 */
export interface DatosQuiz {
  /**
   * @minItems 3
   * @maxItems 15
   */
  preguntas:
    | [PreguntaQuiz, PreguntaQuiz, PreguntaQuiz]
    | [PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz]
    | [PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz]
    | [PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz]
    | [PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz]
    | [PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz, PreguntaQuiz]
    | [
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz
      ]
    | [
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz
      ]
    | [
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz
      ]
    | [
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz
      ]
    | [
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz
      ]
    | [
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz
      ]
    | [
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz,
        PreguntaQuiz
      ];
  segundosPorPregunta?: number;
  vidas?: number;
  preguntasPorIntento?: number;
  barajarOpciones?: boolean;
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "datosExploracion".
 */
export interface DatosExploracion {
  imagenId: Id;
  alt: TextoI18N;
  /**
   * @minItems 1
   * @maxItems 10
   */
  puntos:
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ]
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ]
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ]
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ]
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ]
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ]
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ]
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ]
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ]
    | [
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        },
        {
          id: Id;
          x: number;
          y: number;
          titulo: TextoI18N;
          contenido: TextoI18N;
          obligatorio: boolean;
        }
      ];
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "datosDeslizar".
 */
export interface DatosDeslizar {
  /**
   * @minItems 4
   * @maxItems 12
   */
  afirmaciones:
    | [
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        }
      ]
    | [
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        },
        {
          id: Id;
          texto: TextoI18N;
          verdadera: boolean;
          retroalimentacion: TextoI18N;
        }
      ];
}
/**
 * This interface was referenced by `CursoDeCapsulasEsquemaV0`'s JSON-Schema
 * via the `definition` "datosDecision".
 */
export interface DatosDecision {
  inicioId: Id;
  /**
   * @minItems 1
   */
  nodos: [
    {
      id: Id;
      situacion: TextoI18N;
      /**
       * @minItems 2
       * @maxItems 3
       */
      opciones:
        | [
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            },
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            }
          ]
        | [
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            },
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            },
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            }
          ];
    },
    ...{
      id: Id;
      situacion: TextoI18N;
      /**
       * @minItems 2
       * @maxItems 3
       */
      opciones:
        | [
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            },
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            }
          ]
        | [
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            },
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            },
            {
              id: Id;
              texto: TextoI18N;
              consecuencia: TextoI18N;
              recursoId?: Id;
              puntaje: number;
              siguienteId?: Id;
            }
          ];
    }[]
  ];
}
