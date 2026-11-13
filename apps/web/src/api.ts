// Cliente de la API (docs/api/openapi.yaml). Mismo origen: la cookie httpOnly `sesion` viaja sola.
import type { CambioCorreccion, InformeAlineacion as InformeAlineacionBase, NivelBloom, PantallaAfectada } from '@aptio/schema/alineacion';
import type { AjusteElemento, Disparador, ElementoExtra } from '@aptio/player';
import type { DefinicionModelo, Paleta } from '@aptio/schema/marca';
import type { Etapa, EstadoTrabajo } from '@aptio/schema/generacion';
import type { OperacionPatch } from '@aptio/schema/patch';
import type { MarcadorVideo } from '@aptio/schema/marcadores';
import type { EstadoTraduccion } from '@aptio/schema/traduccion';
import type { DatosTecnicos, EstadoProyecto, PerfilLms } from '@aptio/schema/proyecto';
import type { ParametrosNegocio } from '@aptio/schema/rentabilidad';
import type { Operacion } from '@aptio/schema/operacion';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  clienteId: string | null;
  activo: boolean;
  metodos: ('clave' | 'google')[];
}
export type Rol = 'SUPERADMIN' | 'ADMINISTRADOR' | 'DISENADOR_INSTRUCCIONAL' | 'DISENADOR_GRAFICO' | 'PRODUCTOR' | 'REVISOR_CLIENTE';

export const NOMBRE_ROL: Record<Rol, string> = {
  SUPERADMIN: 'Superadmin',
  ADMINISTRADOR: 'Administración',
  DISENADOR_INSTRUCCIONAL: 'Diseño instruccional',
  DISENADOR_GRAFICO: 'Diseño gráfico',
  PRODUCTOR: 'Producción',
  REVISOR_CLIENTE: 'Revisión del cliente',
};

export interface Cliente {
  id: string;
  nombre: string;
  lmsHabitual: string | null;
  idiomas: ('es' | 'en')[];
  notas: string | null;
  retencionDocumentosDias: number;
  tieneKit: boolean;
  creadoEn: string;
}
export type ClienteEntrada = Partial<Pick<Cliente, 'lmsHabitual' | 'idiomas' | 'notas' | 'retencionDocumentosDias'>> & { nombre: string };

/** LMS conocidos; el cliente puede usar otro (decisión 11: cualquier LMS). */
export const OPCIONES_LMS = ['Moodle 4.5 o superior', 'Blackboard', 'Chamilo', 'Canvas'];

/** Roles que registran y editan clientes (la API lo vuelve a verificar). */
export const EDITAN_CLIENTES: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR'];

/** Roles que editan el kit de marca; el productor solo lo ve y el revisor no entra (docs/14-modulos.md). */
export const EDITAN_KIT: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO'];
export const VEN_KIT: Rol[] = [...EDITAN_KIT, 'PRODUCTOR'];
/** Las pantallas modelo las diseñan diseño gráfico y administración (docs/14-modulos.md). */
export const DISENAN_MODELOS: Rol[] = ['ADMINISTRADOR', 'DISENADOR_GRAFICO'];
/** docs/14-modulos.md: crean proyectos y generan administración, diseño instruccional y producción. */
export const CREAN_PROYECTOS: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR'];
/** HU-0205: el glosario y la pronunciación los edita todo el equipo, también producción. */
/** docs/14-modulos.md: editan pantallas todos los del equipo; aprueban administración y diseño instruccional. */
export const EDITAN_PANTALLAS: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR'];
export const APRUEBAN_PANTALLAS: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL'];
/** HU-1001 · Cambian el nivel de Bloom en Alineación; diseño gráfico y producción solo ven, el revisor del cliente no. */
export const EDITAN_ALINEACION: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL'];
export const EDITAN_GLOSARIO: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR'];
/** HU-0703: regenera narraciones todo el equipo; el revisor del cliente no. */
export const REGENERAN_VOZ: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR'];

export interface PantallaModeloEntrada {
  disposicion: string;
  nombre: string;
  definicion: DefinicionModelo;
  orden?: number;
  activa?: boolean;
}
export interface PantallaModelo extends Required<PantallaModeloEntrada> {
  id: string;
  miniaturaRecursoId: string | null;
}

export interface Voz {
  proveedor: 'google' | 'azure' | 'elevenlabs';
  voz: string;
  velocidad?: number;
}
export interface KitEntrada {
  estilo: string;
  paleta: Paleta;
  tipografias: { titulos: string; textos: string };
  logoRecursoId: string | null;
  voces: { es?: Voz; en?: Voz };
  version: number;
}
export interface Personaje {
  recursoId: string;
  nombre: string;
  bocasDisponibles: string[];
  bocasFaltantes: string[];
  reemplazos: Record<string, string>;
  poses: string[];
  avisos: string[];
  eliminadosAlSanear: string[];
  url?: string;
}
export interface Kit extends KitEntrada {
  id: string;
  clienteId: string;
  logoUrl?: string;
  personaje: Personaje | null;
  actualizadoEn: string;
  contraste: { textoFondo: number; cumpleAA: boolean };
  advertencias: { codigo: string; mensaje: string; colores: string[]; relacion: number }[];
}
/** HU-0206 · La propuesta de kit desde un curso anterior o un manual de marca (IA-18 v2). */
export interface PropuestaKit {
  trabajoId: string;
  estado: 'procesando' | 'lista' | 'error';
  recursoId: string;
  nombreArchivo: string;
  creadoEn: string;
  evidencias?: { origen: 'zip' | 'pdf'; leidos: number; colores: { valor: string; veces: number }[]; fuentes: { valor: string; veces: number }[]; avisos: string[] };
  propuesta?: {
    paleta: Paleta;
    tipografias: { titulos: string; texto: string; alternativasLibres?: string[] };
    tipografiaMarca: { titulos: string; texto: string };
    estilo: { ilustracion: string; esquinas: string; tono: string; kit: KitEntrada['estilo'] };
    contrasteOk: boolean;
    evidencias: string[];
    confianza: number;
  };
  avisosTipografia: string[];
  error?: { codigo: string; mensaje: string };
}
export interface Recurso {
  id: string;
  tipo: string;
  origen?: 'BIBLIOTECA' | 'GENERADO' | 'SUBIDO' | 'CLIENTE';
  nombre: string;
  mime: string;
  bytes: number;
  /** HU-1406 · Procedencia (REQ-062): proveedor `aptio` si lo armó la plataforma sin IA. */
  proveedor?: string | null;
  modelo?: string | null;
  licencia?: string | null;
  eliminadosAlSanear?: string[];
  url?: string;
}
/** HU-1406 · Créditos de IA del paquete, tal como saldrán (CP-107). */
export interface Creditos {
  aviso: string;
  filas: { que: string; proveedor: string; modelo: string; licencia: string }[];
}

/** Página extraída del material (HU-0304). `posibleInstruccion`: el texto parece dirigido a la IA (CP-102). */
export interface PaginaMaterial {
  n: number;
  texto: string;
  escaneada: boolean;
  posibleInstruccion?: boolean;
}
export interface Material {
  id: string;
  tipo: 'PDF' | 'WORD' | 'POWERPOINT' | 'VIDEO' | 'AUDIO' | 'TEMA';
  recursoId: string | null;
  nombre: string | null;
  tema: string | null;
  estado: 'pendiente' | 'procesando' | 'listo' | 'error';
  error: string | null;
  paginas: PaginaMaterial[];
  /** Video o audio: transcripción con marcas de tiempo (HU-0305). */
  transcripcion: SegmentoTranscripcion[];
  duracionS: number | null;
  creadoEn: string;
}

export interface SegmentoTranscripcion {
  desde: number;
  hasta: number;
  texto: string;
  posibleInstruccion?: boolean;
}

export interface TerminoGlosario {
  termino: string;
  traduccion: string | null;
  noTraducir: boolean;
}

export interface TerminoPronunciacion {
  idioma: 'es' | 'en';
  escrito: string;
  pronunciado: string;
}

export interface MuestraVoz {
  audioUrl: string;
  ssml: string;
  dicho: string;
  aplicados: string[];
  proveedor: string;
  voz: string;
  simulada: boolean;
}

export interface Proyecto {
  id: string;
  clienteId: string;
  clienteNombre: string;
  nombre: string;
  estado: EstadoProyecto;
  idiomas: ('es' | 'en')[];
  modoIdioma: string;
  publico: string | null;
  tono: string | null;
  pantallasObjetivo: number | null;
  porcentajeActividades: number | null;
  datosTecnicos: DatosTecnicos;
  perfilPropuesto: PerfilLms;
  avance: { aprobadas: number; total: number };
  costoIaUsd: number;
  creadoEn: string;
  actualizadoEn: string;
}

export interface ProyectoEntrada {
  clienteId: string;
  nombre: string;
  idiomas?: ('es' | 'en')[];
  publico?: string;
  tono?: string;
  pantallasObjetivo?: number;
  porcentajeActividades?: number;
  datosTecnicos?: DatosTecnicos;
}

/** HU-0401 · Una generación del SCORM y sus 11 etapas. */
export interface EtapaGeneracion {
  etapa: Etapa;
  orden: number;
  estado: EstadoTrabajo;
  detalle: string | null;
  inicio: string | null;
  fin: string | null;
  costoUsd: number;
}
export interface Generacion {
  id: string;
  proyectoId: string;
  estado: EstadoTrabajo;
  avance: number;
  costoUsd: number;
  parametros: Record<string, unknown>;
  etapas: EtapaGeneracion[];
  creadoEn: string;
  terminadoEn: string | null;
}

/** HU-1101 · Documento del curso del proyecto (lo dibuja el reproductor). */
export interface Curso {
  id: string;
  proyectoId: string;
  versionEsquema: string;
  version: number;
  documento: Record<string, unknown>;
  actualizadoEn: string;
  /** HU-0702 · URL firmada de cada audio de narración, por id de recurso. */
  urlsRecursos?: Record<string, string>;
  /** HU-0702 · SVG del personaje (saneado), por id de recurso. */
  svgPersonajes?: Record<string, string>;
  /** HU-0801 · Texto WebVTT de cada narración, por id de recurso de subtítulos. */
  subtitulos?: Record<string, string>;
}

export type TextoI18n = { es?: string; en?: string };

/** HU-0501 · Observación de una pantalla (reglas, IA o personas). */
/** HU-0506 · Comentario de una pantalla: el texto no se edita; el equipo lo resuelve o lo reabre. */
export interface Comentario {
  id: string; cursoId: string; pantallaId: string; autor: { id: string; nombre: string; rol: Rol }; texto: string;
  resuelto: boolean; resueltoPor: string | null; resueltoEn: string | null; creadoEn: string;
}
/** HU-0506 · Resuelven y reabren comentarios los del equipo (el revisor del cliente solo comenta). */
export const RESUELVEN_COMENTARIOS: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR'];
export const MAX_COMENTARIO = 1000;

export interface Observacion {
  id: string;
  pantallaId: string | null;
  tipo: string;
  severidad: 'info' | 'aviso' | 'bloquea-entrega';
  mensaje: string;
  origen: string;
  resuelta: boolean;
  creadoEn: string;
  /** HU-0505 · Categoría (ortografia, longitud, accesibilidad…), sugerencia de IA-12 y ruta del texto. */
  categoria?: string | null;
  sugerencia?: string | null;
  ruta?: string | null;
}

/** HU-0701 · Narración de una pantalla: ACTUALIZADA se muestra como «Lista». */
/** HU-0703 · Respuesta de `POST /cursos/{id}/narraciones/regenerar`: la generación que se continúa. */
export interface Regeneracion {
  id: string;
  estado: Generacion['estado'];
  eventos: string;
  pendientes: number;
}

export interface Narracion {
  pantallaId: string;
  idioma: 'es' | 'en';
  texto?: string;
  duracionS?: number;
  origen: 'tts' | 'grabacion';
  voz?: string;
  estado: 'ACTUALIZADA' | 'DESACTUALIZADA' | 'GENERANDO' | 'ERROR';
  audioUrl?: string;
  /** HU-0702 · Marcas de boca calculadas del audio. */
  bocas?: unknown[];
  /** HU-0801 · WebVTT firmado. */
  subtitulosUrl?: string;
  /** HU-0704 · Origen grabacion: el material, la versión del audio y quién autorizó usarla y cuándo. */
  grabacion?: { materialId: string; recursoOrigenId?: string; version?: 'original' | 'limpio'; autorizadoPor: string; autorizadoEn: string };
}

/** HU-0704 · Un audio del cliente transcrito, con su versión limpia si se pidió. */
export interface AudioCliente {
  materialId: string;
  recursoId: string;
  nombre: string;
  duracionS: number | null;
  texto: string;
  url: string;
  limpieza: { estado: 'procesando' | 'listo' | 'error'; recursoId?: string; url?: string; error?: string } | null;
}

/** HU-0704 · Respuesta de usar o re-locutar la grabación. */
export interface ResultadoGrabacion {
  version: number;
  estado: 'GENERANDO' | 'DESACTUALIZADA';
  regenerando: string[];
  textoAnterior?: string;
}

/** HU-0502 · Resultado de editar o aprobar. */
export interface CambioResultado {
  version: number;
  /** HU-0503 · Lo que se regenera en cascada: `voz-es`, `boca` y `subtitulos-es`. */
  regenerando: string[];
  aprobadas?: string[];
  pendientes?: string[];
  estado?: string;
  /** HU-0903 · Los ids nuevos de los marcadores sumados al video y por qué se omitió alguno. */
  agregados?: string[];
  observaciones?: string[];
  /** HU-1002 · Pantallas nuevas o cambiadas por la corrección de la alineación: quedan en borrador. */
  pantallasPorRevisar?: PantallaAfectada[];
}

/** HU-0903 · Salida de IA-09 v2: los cambios de tema y los marcadores propuestos (ids provisionales «ia-N»). */
export interface PausasPropuestas {
  bloqueId: string;
  duracionMs: number;
  cambiosTema: { tiempoMs: number; tema: string }[];
  marcadores: MarcadorVideo[];
  observaciones: string[];
}

/** HU-0504 · Propuesta de la IA sobre una pantalla. `cambios` es el JSON Patch; las variantes van en `vistaPrevia`. */
export interface Propuesta {
  id: string;
  tipo: 'mas-visual' | 'menos-texto' | 'actividad' | 'variantes' | 'libre' | 'alineacion' | 'patron' | 'pausas-video';
  pantallaId: string | null;
  titulo: string;
  descripcion: string;
  cambios: OperacionPatch[];
  vistaPrevia?: { nombre: string; disposicion: string; patch: OperacionPatch[] }[];
  /** HU-1002 · Los cambios de la corrección de la alineación (tipo `alineacion`, del curso entero). */
  correcciones?: CambioCorreccion[];
  /** HU-1104 · El patrón propuesto por IA-14 (tipo `patron`, del curso entero). */
  patron?: PatronPropuesto;
  /** HU-0903 · Las pausas propuestas desde la transcripción (tipo `pausas-video`, de una pantalla). */
  pausas?: PausasPropuestas;
  versionBase: number;
  estado: 'PENDIENTE' | 'APLICADA' | 'DESCARTADA' | 'VENCIDA';
  costoUsd: number;
  creadoEn: string;
}

/** HU-0802 · Un texto del curso con su inglés y su estado (PNT-11). */
export interface Traduccion {
  id: string;
  ruta: string;
  pantallaId: string | null;
  es: string;
  en: string | null;
  estado: EstadoTraduccion;
  /** HU-0803 · Caracteres que caben en el componente; null si no ocupa espacio en pantalla. */
  limite: number | null;
  caracteres: number | null;
  /** HU-0803 · Versión corta de la IA para un texto en Desborde. */
  propuesta: string | null;
}
/** HU-0802 · Traducen y revisan todos los del equipo; el revisor del cliente solo ve. */
export const TRADUCEN: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR'];

/** Un trabajo de la cola (GET /trabajos/{id}). */
export interface TrabajoEstado {
  id: string;
  estado: EstadoTrabajo;
  error: string | null;
}

/** Error de la API con la forma { codigo, mensaje, detalles }. */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly detalles: Record<string, unknown>[];
  constructor(estado: number, codigo: string, mensaje: string, detalles: Record<string, unknown>[] = []) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${ruta}`, {
      credentials: 'same-origin',
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...opciones.headers },
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
  }
  if (res.status === 204) return undefined as T;
  // Un 202 puede traer cuerpo (la generación aceptada) o venir vacío (el correo de recuperación).
  const cuerpo = (await res.json().catch(() => (res.status === 202 ? undefined : {}))) as { codigo?: string; mensaje?: string; detalles?: Record<string, unknown>[] };
  if (!res.ok) throw new ErrorApi(res.status, cuerpo.codigo ?? 'ERROR', cuerpo.mensaje ?? 'Ocurrió un error inesperado', cuerpo.detalles);
  return cuerpo as T;
}

const json = (datos: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(datos) });

/** HU-1202 · Una exportación del curso (M12): queda ligada a la versión del curso que se exportó (RN-12-4). */
export interface Exportacion {
  id: string;
  cursoId: string;
  formato: string;
  perfilLms: PerfilExportacion;
  modoIdioma: string;
  versionCurso: number;
  estado: 'EN_COLA' | 'EN_CURSO' | 'COMPLETADO' | 'ERROR' | 'CANCELADO';
  bytes: number | null;
  informe: { errores: string[]; advertencias: string[]; recursosFaltantes?: string[]; idioma?: string; idiomas?: string[]; archivos?: number; lms?: string; insignias?: number } | null;
  motivo: string | null;
  nombreArchivo: string | null;
  /** Solo al pedir una exportación terminada: descarga firmada por 15 minutos. */
  descargaUrl: string | null;
  creadoEn: string;
}
export type PerfilExportacion = 'generico' | 'moodle' | 'blackboard' | 'chamilo' | 'canvas';
/** HU-1201 · Validar antes de exportar: solo `errores` impiden exportar; el peso nunca bloquea (RN-12-2). */
/** HU-1203 · Formatos que se exportan hoy: SCORM 1.2 y HTML autocontenido. */
export type FormatoExportacion = 'SCORM12' | 'HTML';
/** HU-1205 · El kit de gamificación se exporta pero no se valida antes. */
export type FormatoPedido = FormatoExportacion | 'KIT_GAMIFICACION';
/** HU-0804 · Un idioma (el primero del curso) o español e inglés en el mismo paquete. */
export type ModoIdiomaExportacion = 'unico' | 'mismo-paquete';
export interface Validacion {
  formato: FormatoExportacion;
  errores: string[];
  advertencias: string[];
  pesoEstimadoMb: number;
  pesoEstimadoBytes: number;
  /** null en HTML: no hay LMS. */
  limiteMb: number | null;
  origenLimite: 'ficha' | 'referencia' | null;
  superaLimite: boolean;
  alternativas: string[];
  recursosPesados: { id: string; nombre: string; bytes: number }[];
  suspendDataCaracteres: number | null;
  pantallasTotal: number;
  pantallasSinAprobar: number;
  recursosFaltantes: string[];
  /** HU-1406 · null si ningún recurso es de IA (el paquete no lleva créditos). */
  creditos?: Creditos | null;
  /** HU-0804 · Idiomas del paquete validado y, en el bilingüe, cuántos textos tienen su inglés. */
  modoIdioma?: ModoIdiomaExportacion;
  textosIngles?: { traducidos: number; total: number } | null;
  /** HU-1001 · Objetivos con alertas de alineación (advierten, no bloquean). */
  objetivosSinAlinear?: number;
}
/** HU-1204 · Ficha de compatibilidad del LMS de un cliente, con el informe del modo diagnóstico si se pegó. */
export interface FichaCompatibilidad {
  id: string;
  lmsNombre: string;
  lmsVersion: string | null;
  limiteSubidaMb: number | null;
  notas: string | null;
  resultadoDiagnostico: Record<string, unknown> | null;
  actualizadoEn: string;
}
export type FichaCompatibilidadEntrada = { lmsNombre: string; lmsVersion?: string; limiteSubidaMb?: number; notas?: string; resultadoDiagnostico?: Record<string, unknown> };
/** Exportan administración, diseño instruccional y producción (HU-1202). */
export const EXPORTAN: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR'];

/** HU-1001 · Informe de alineación pedagógica (PNT-18). */
export type InformeAlineacion = InformeAlineacionBase & { version: number };

/** HU-1103 · Patrón y reglas de navegación del curso (PNT-17), con el preferido del cliente de su kit de marca. */
export type PatronNavegacion = 'clasico' | 'historias' | 'vertical' | 'mapa' | 'hub' | 'ramificado' | 'inmersivo' | 'personalizado';
export type ModoNavegacion = 'libre' | 'condiciones' | 'secuencial';
export type Reanudar = 'preguntar' | 'automatica' | 'no';
/** HU-1104 · Patrón personalizado: un patrón base del catálogo con 5 opciones (las aplica el reproductor). */
export interface PatronPersonalizado {
  nombre: string;
  base: Exclude<PatronNavegacion, 'personalizado'>;
  progreso?: 'barra' | 'segmentos' | 'puntos' | 'porcentaje' | 'ninguno';
  avance?: 'botones' | 'deslizar-y-botones' | 'desplazar';
  menu?: 'temario' | 'mapa' | 'temas' | 'ninguno';
  marcador?: boolean;
  barra?: 'arriba' | 'abajo' | 'flotante' | 'ninguna';
  origen?: 'ia' | 'manual';
}
export type ModoPatron = 'recomendar' | 'crear';
/** HU-1104 · Lo que trae una propuesta `patron`: la navegación propuesta, el recomendado y la alternativa con su motivo. */
export interface PatronPropuesto {
  modo: ModoPatron;
  navegacion: { patron: PatronNavegacion; patronPersonalizado?: PatronPersonalizado };
  recomendado: { patron: PatronNavegacion; motivo: string };
  alternativa: { patron: PatronNavegacion; motivo: string };
  descripcion: string | null;
}
export interface Navegacion {
  version: number;
  patron: PatronNavegacion;
  patronPersonalizado?: PatronPersonalizado;
  modo?: ModoNavegacion;
  reanudar?: Reanudar;
  mostrar?: string[];
  patronPreferido: PatronNavegacion | null;
  patronPreferidoDelCliente: boolean;
  hayKit: boolean;
}
export interface NavegacionCambio {
  version: number;
  patron?: PatronNavegacion;
  modo?: ModoNavegacion;
  reanudar?: Reanudar;
  mostrar?: string[];
  patronPreferidoDelCliente?: boolean;
}
/** Editan la navegación administración y diseño instruccional; diseño gráfico y producción solo ven (M14). */
export const EDITAN_NAVEGACION: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL'];

/** HU-1302 · Ven los costos de IA administración y diseño instruccional (solo lectura); la API lo vuelve a verificar. */
export const VEN_COSTOS: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL'];
export interface FiltroCostos { desde?: string; hasta?: string; clienteId?: string; proyectoId?: string }
export interface ResumenCostos {
  totalUsd: number;
  scormContados: number;
  promedioPorScormUsd: number;
  criterioPromedio: 'exportados' | 'con-gasto';
  porProyecto: { proyectoId: string; nombre: string; clienteId: string; cliente: string; llamadas: number; usd: number; exportado: boolean }[];
  porCliente: { clienteId: string; nombre: string; proyectosUsd: number; sinProyectoUsd: number; usd: number }[];
  porProveedorTarea: { proveedor: string; tarea: string; llamadas: number; usd: number }[];
}

/** HU-1303 · Parámetros de rentabilidad: los edita administración; diseño instruccional los ve y registra mediciones. */
export const EDITAN_PARAMETROS: Rol[] = ['ADMINISTRADOR'];
/** HU-1304 · Empresa › Conexiones IA y el medidor del mes: solo administración (la API responde 403 al resto). */
export const VEN_CONEXIONES: Rol[] = ['ADMINISTRADOR'];
/** HU-1403 · Empresa › Operación (errores, colas, etapas y copias de seguridad): solo administración. */
export const VEN_OPERACION: Rol[] = ['ADMINISTRADOR'];
/** HU-1501 · El grupo «Sitio web» es solo del superadmin de plataforma (ADR-011, CP-109). */
export const VEN_SITIO: Rol[] = ['SUPERADMIN'];

/** HU-1502 · Página del sitio comercial con su estado (RN-16-6). */
export interface PaginaSitio {
  id: string;
  ruta: string;
  idioma: 'es' | 'en';
  titulo: string;
  estado: 'BORRADOR' | 'PROGRAMADA' | 'PUBLICADA';
  publicarEn: string | null;
  publicadaEn: string | null;
  /** HU-1514 · `sector` en una landing por sector, con su nombre, portada, meta título y categoría inicial del blog. */
  tipo: 'general' | 'sector';
  sector: string | null;
  portada: { titulo: string; texto: string } | null;
  metaTitulo: string | null;
  blogCategoriaInicial: string | null;
  creadoEn: string;
  actualizadoEn: string;
  /** HU-1505 · Solo al publicar en pruebas: cuántos datos ficticios visibles hay (CP-117). */
  avisoFicticios?: number;
  /** HU-1507 · Si el cambio publicó o retiró la página: la versión del sitio que creó. */
  version?: number;
}
/** HU-1507 · Versión publicada del sitio (RN-16-5). */
export interface VersionSitio {
  numero: number;
  creadoEn: string;
  entorno: 'produccion' | 'pruebas';
  origen: 'publicacion' | 'pagina' | 'programada' | 'restauracion';
  restauradaDe: number | null;
  publicadoPor: { id: string; nombre: string } | null;
  paginas: number;
  /** HU-1508 · El HTML pre-renderizado de la versión (DA-08). */
  prerender: { estado: 'en_curso' | 'listo' | 'error'; en: string | null; error: string | null };
  avisoFicticios?: number;
}
/** HU-1509 · Ajustes del sitio (REQ-073, PNT-38). */
export interface AjustesSitio {
  dominio: string | null;
  nombre: string;
  logo: { archivo: string; mime: string } | null;
  favicon: { archivo: string; mime: string } | null;
  analitica: { ga4: string | null; gtm: string | null; metaPixel: string | null };
  whatsapp: { visible: boolean; numero: string | null; mensaje: string | null };
  correoLeads: string | null;
  mantenimiento: { activo: boolean; mensaje: string | null; desde: string | null };
  /** HU-1510 · El sitio muestra el selector ES · EN; sale al sitio al publicar. */
  mostrarSelectorIdioma: boolean;
  actualizadoEn: string | null;
}
export interface CambiosAjustesSitio {
  dominio?: string | null;
  nombre?: string;
  analitica?: Partial<AjustesSitio['analitica']>;
  whatsapp?: Partial<AjustesSitio['whatsapp']>;
  correoLeads?: string | null;
  mantenimiento?: { activo?: boolean; mensaje?: string | null };
  mostrarSelectorIdioma?: boolean;
}
/** HU-1511 · Sitio web › Blog (REQ-070, PNT-28): la conexión con WordPress y la copia de lectura. */
export interface CategoriaBlog { id: number; nombre: string; slug: string; orden: number; visible: boolean; articulos: number }
export interface ArticuloBlog {
  id: number; titulo: string; extracto: string; categorias: number[]; autor: string | null; fecha: string; enlace: string;
  /** «Editar en WordPress». */ editar: string;
  /** La imagen copiada, servida por el sitio (/s/_blog/…). */ imagen: string | null;
  visible: boolean;
}
export interface BlogSitio {
  url: string | null; frecuenciaMin: number; porPagina: number; mostrarImagen: boolean; mostrarAutor: boolean;
  sincronizadoEn: string | null; intentoEn: string | null; error: string | null;
  categorias: CategoriaBlog[]; articulos: ArticuloBlog[];
}
export interface CambiosBlogSitio { url?: string | null; frecuenciaMin?: number; porPagina?: number; mostrarImagen?: boolean; mostrarAutor?: boolean }
export interface ComprobacionDominio { dominio: string; ok: boolean; venceEn: string | null; emisor: string | null; error: string | null }
export interface VersionesSitio { entorno: 'produccion' | 'pruebas'; actual: number | null; pendientes: boolean; total: number; versiones: VersionSitio[] }
export interface ElementoVistaPrevia { datos: Record<string, string | number>; ficticio?: boolean }
export interface VistaPreviaPagina {
  estado: 'BORRADOR' | 'PROGRAMADA' | 'PUBLICADA';
  entorno: 'produccion' | 'pruebas';
  pagina: { ruta: string; idioma: string; titulo: string; publicadaEn: string | null; bloques: { tipo: string; ajustes: Record<string, unknown> | null; elementos?: ElementoVistaPrevia[] }[] };
  navegacion: { menu: { texto: string; ruta: string; externo: boolean }[]; pie: { titulo: string; enlaces: { texto: string; ruta: string; externo: boolean }[] }[] };
}
export type AccionPagina = 'borrador' | 'programar' | 'publicar';
export type PaginaSitioEntrada = { ruta: string; idioma: 'es' | 'en'; titulo: string } | { tipo: 'sector'; sector: string; idioma: 'es' | 'en' };
export interface PaginaSitioCambio {
  ruta?: string; titulo?: string; accion?: AccionPagina; publicarEn?: string;
  /** HU-1514 · Solo en una landing por sector. */
  sector?: string; portada?: { titulo: string; texto: string } | null; metaTitulo?: string | null; blogCategoriaInicial?: string | null;
}
/** HU-1504 · Elemento de contenido del sitio (cifras, testimonios, logos…). Nace oculto (RN-16-2). */
export interface ElementoSitio {
  id: string;
  coleccion: string;
  /** HU-1510 · Idioma del elemento; cada idioma tiene su orden. */
  idioma: 'es' | 'en';
  orden: number;
  visible: boolean;
  /** HU-1505 · Dato inventado: si está visible, bloquea publicar en producción (RN-16-3). */
  ficticio: boolean;
  datos: Record<string, string | number>;
  creadoEn: string;
  actualizadoEn: string;
}
/** HU-1505 · Ficticios visibles del sitio y el entorno (RN-16-3). */
export interface FicticiosSitio { entorno: 'produccion' | 'pruebas'; ficticios: ElementoSitio[] }
/** HU-1506 · Enlace del menú, columna del pie (sin padre) o enlace de una columna del pie. Nace oculto (RN-16-2). */
export interface EnlaceSitio {
  id: string;
  zona: 'menu' | 'pie';
  padreId: string | null;
  /** HU-1510 · Idioma del enlace; cada idioma tiene su menú y su pie. */
  idioma: 'es' | 'en';
  texto: string;
  ruta: string | null;
  externo: boolean;
  orden: number;
  visible: boolean;
  creadoEn: string;
  actualizadoEn: string;
}
export type ColumnaPieSitio = EnlaceSitio & { enlaces: EnlaceSitio[] };
export interface NavegacionSitio { menu: EnlaceSitio[]; pie: ColumnaPieSitio[] }
export interface EnlaceSitioEntrada { zona: 'menu' | 'pie'; padreId?: string; idioma?: 'es' | 'en'; texto: string; ruta?: string }
/** HU-1503 · Bloque de una página del sitio (REQ-066). Nace oculto (RN-16-2). */
export interface BloqueSitio {
  id: string;
  paginaId: string;
  tipo: string;
  orden: number;
  visible: boolean;
  ajustes: Record<string, unknown> | null;
  creadoEn: string;
  actualizadoEn: string;
}
export type { Operacion };
export interface ConexionIA {
  tarea: 'TEXTO' | 'PANTALLAS' | 'TRADUCCION' | 'CALIDAD' | 'VOZ' | 'IMAGEN' | 'BOCA' | 'TRANSCRIPCION';
  nombre: string; proveedor: string; modelo: string;
  opciones: { proveedor: string; nombre: string; proximamente?: boolean }[];
  modelos: string[]; fijo: boolean; voces: { es?: string; en?: string } | null; claveConfigurada: boolean;
  costoEstimadoScormUsd: number; gastoMesUsd: number; limiteGastoMensualUsd: number | null; limiteAlcanzado: boolean;
  configurada: boolean; actualizadoEn: string | null;
}
export interface ConexionesIA { mes: string; modo: 'simulado' | 'real'; gastoMesUsd: number; limiteTotalUsd: number | null; conexiones: ConexionIA[] }
export interface ConexionEntrada { proveedor?: string; modelo?: string; voces?: { es?: string; en?: string }; limiteGastoMensualUsd?: number | null }
export interface PruebaConexion { ok: boolean; modo: 'simulado' | 'real'; proveedor: string; modelo: string; mensaje: string; latenciaMs: number }
export type ParametrosGuardados = ParametrosNegocio & { ejemplo: boolean; actualizadoEn: string | null };
export interface MedicionHoras {
  id: string; proyectoRef: string; proyectoId: string | null; escenario: 'hoy' | 'generador'; etapa: string; horas: number;
  notas: string | null; registradoPor: string | null; creadoEn: string;
}
export interface MedicionEntrada { proyectoRef?: string; proyectoId?: string; escenario: string; etapa: string; horas: number; notas?: string }

export const api = {
  yo: () => pedir<Usuario>('/yo'),
  ingresar: (email: string, clave: string) => pedir<{ usuario: Usuario; expira: string }>('/auth/ingresar', json({ email, clave })),
  salir: () => pedir<void>('/auth/salir', { method: 'POST' }),
  pedirClave: (email: string) => pedir<void>('/auth/clave/olvido', json({ email })),
  crearClave: (token: string, clave: string) => pedir<void>('/auth/clave/restablecer', json({ token, clave })),
  costos: (f: FiltroCostos = {}) => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
    return pedir<ResumenCostos>(`/costos${q ? `?${q}` : ''}`);
  },
  conexionesIA: () => pedir<ConexionesIA>('/conexiones-ia'),
  operacion: () => pedir<Operacion>('/operacion'),
  paginasSitio: () => pedir<PaginaSitio[]>('/sitio/paginas'),
  crearPaginaSitio: (datos: PaginaSitioEntrada) => pedir<PaginaSitio>('/sitio/paginas', json(datos)),
  cambiarPaginaSitio: (id: string, datos: PaginaSitioCambio) => pedir<PaginaSitio>(`/sitio/paginas/${id}`, json(datos, 'PATCH')),
  borrarPaginaSitio: (id: string) => pedir<void>(`/sitio/paginas/${id}`, { method: 'DELETE' }),
  elementosSitio: (coleccion: string, idioma: 'es' | 'en' = 'es') => pedir<ElementoSitio[]>(`/sitio/elementos?coleccion=${encodeURIComponent(coleccion)}&idioma=${idioma}`),
  agregarElemento: (coleccion: string, datos: Record<string, string | number>, idioma: 'es' | 'en' = 'es') => pedir<ElementoSitio>('/sitio/elementos', json({ coleccion, datos, idioma })),
  cambiarElemento: (id: string, cambio: { datos?: Record<string, string | number>; visible?: boolean; ficticio?: boolean }) => pedir<ElementoSitio>(`/sitio/elementos/${id}`, json(cambio, 'PATCH')),
  ordenarElementos: (coleccion: string, orden: string[], idioma: 'es' | 'en' = 'es') => pedir<ElementoSitio[]>('/sitio/elementos', json({ coleccion, idioma, orden }, 'PATCH')),
  borrarElemento: (id: string) => pedir<void>(`/sitio/elementos/${id}`, { method: 'DELETE' }),
  ficticiosSitio: () => pedir<FicticiosSitio>('/sitio/ficticios'),
  ocultarFicticios: () => pedir<FicticiosSitio & { ocultados: number }>('/sitio/ficticios/ocultar', { method: 'POST' }),
  publicarSitio: () => pedir<VersionSitio>('/sitio/publicar', { method: 'POST' }),
  versionesSitio: () => pedir<VersionesSitio>('/sitio/versiones'),
  ajustesSitio: () => pedir<AjustesSitio>('/sitio/ajustes'),
  guardarAjustesSitio: (cambios: CambiosAjustesSitio) => pedir<AjustesSitio>('/sitio/ajustes', json(cambios, 'PATCH')),
  subirMarcaSitio: (tipo: 'logo' | 'favicon', archivo: File) => pedir<AjustesSitio>(`/sitio/ajustes/marca/${tipo}`, { method: 'PUT', body: archivo, headers: { 'Content-Type': archivo.type } }),
  quitarMarcaSitio: (tipo: 'logo' | 'favicon') => pedir<AjustesSitio>(`/sitio/ajustes/marca/${tipo}`, { method: 'DELETE' }),
  correoPruebaSitio: () => pedir<{ para: string }>('/sitio/ajustes/correo-prueba', { method: 'POST' }),
  comprobarDominioSitio: () => pedir<ComprobacionDominio>('/sitio/ajustes/dominio/comprobar', { method: 'POST' }),
  blogSitio: () => pedir<BlogSitio>('/sitio/blog'),
  guardarBlogSitio: (cambios: CambiosBlogSitio) => pedir<BlogSitio>('/sitio/blog', json(cambios, 'PATCH')),
  sincronizarBlog: () => pedir<{ encolado: boolean }>('/sitio/blog/sincronizar', { method: 'POST' }),
  ordenarCategoriasBlog: (orden: number[]) => pedir<BlogSitio>('/sitio/blog/categorias', json({ orden }, 'PATCH')),
  mostrarCategoriaBlog: (id: number, visible: boolean) => pedir<BlogSitio>(`/sitio/blog/categorias/${id}`, json({ visible }, 'PATCH')),
  mostrarArticuloBlog: (id: number, visible: boolean) => pedir<BlogSitio>(`/sitio/blog/articulos/${id}`, json({ visible }, 'PATCH')),
  restaurarVersionSitio: (numero: number) => pedir<VersionSitio>(`/sitio/versiones/${numero}/restaurar`, { method: 'POST' }),
  vistaPreviaPagina: (paginaId: string) => pedir<VistaPreviaPagina>(`/sitio/paginas/${paginaId}/vista-previa`),
  navegacionSitio: (idioma: 'es' | 'en' = 'es') => pedir<NavegacionSitio>(`/sitio/navegacion?idioma=${idioma}`),
  agregarEnlace: (datos: EnlaceSitioEntrada) => pedir<EnlaceSitio>('/sitio/navegacion', json(datos)),
  cambiarEnlace: (id: string, cambio: { texto?: string; ruta?: string | null; visible?: boolean }) => pedir<EnlaceSitio>(`/sitio/navegacion/${id}`, json(cambio, 'PATCH')),
  ordenarEnlaces: (zona: 'menu' | 'pie', padreId: string | null, orden: string[], idioma: 'es' | 'en' = 'es') => pedir<EnlaceSitio[]>('/sitio/navegacion', json({ zona, ...(padreId ? { padreId } : {}), idioma, orden }, 'PATCH')),
  borrarEnlace: (id: string) => pedir<void>(`/sitio/navegacion/${id}`, { method: 'DELETE' }),
  bloquesPagina: (paginaId: string) => pedir<BloqueSitio[]>(`/sitio/paginas/${paginaId}/bloques`),
  agregarBloque: (paginaId: string, tipo: string) => pedir<BloqueSitio>(`/sitio/paginas/${paginaId}/bloques`, json({ tipo })),
  ordenarBloques: (paginaId: string, orden: string[]) => pedir<BloqueSitio[]>(`/sitio/paginas/${paginaId}/bloques`, json({ orden }, 'PATCH')),
  mostrarBloque: (paginaId: string, bloqueId: string, visible: boolean) => pedir<BloqueSitio>(`/sitio/paginas/${paginaId}/bloques/${bloqueId}`, json({ visible }, 'PATCH')),
  borrarBloque: (paginaId: string, bloqueId: string) => pedir<void>(`/sitio/paginas/${paginaId}/bloques/${bloqueId}`, { method: 'DELETE' }),
  respaldar: () => pedir<{ encolado: boolean }>('/operacion/respaldar', { method: 'POST' }),
  guardarConexionIA: (tarea: ConexionIA['tarea'], datos: ConexionEntrada) => pedir<ConexionIA>(`/conexiones-ia/${tarea.toLowerCase()}`, json(datos, 'PUT')),
  probarConexionIA: (tarea: ConexionIA['tarea']) => pedir<PruebaConexion>(`/conexiones-ia/${tarea.toLowerCase()}/probar`, { method: 'POST' }),
  parametrosNegocio: () => pedir<ParametrosGuardados>('/negocio/parametros'),
  guardarParametrosNegocio: (datos: ParametrosNegocio) => pedir<ParametrosGuardados>('/negocio/parametros', json(datos, 'PUT')),
  mediciones: () => pedir<MedicionHoras[]>('/negocio/mediciones'),
  registrarMedicion: (datos: MedicionEntrada) => pedir<MedicionHoras>('/negocio/mediciones', json(datos)),
  borrarMedicion: (id: string) => pedir<void>(`/negocio/mediciones/${id}`, { method: 'DELETE' }),
  clientes: (buscar = '') => pedir<Cliente[]>(`/clientes${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`),
  cliente: (id: string) => pedir<Cliente>(`/clientes/${id}`),
  crearCliente: (datos: ClienteEntrada) => pedir<Cliente>('/clientes', json(datos)),
  editarCliente: (id: string, datos: Partial<ClienteEntrada>) => pedir<Cliente>(`/clientes/${id}`, json(datos, 'PATCH')),
  narraciones: (cursoId: string, idioma: 'es' | 'en' = 'es') => pedir<Narracion[]>(`/cursos/${cursoId}/narraciones?idioma=${idioma}`),
  /** HU-0704 · Audio del cliente: listar, usar como narración (RN-07-4), limpiar ruido y re-locutar con la voz del kit. */
  audiosCliente: (cursoId: string) => pedir<AudioCliente[]>(`/cursos/${cursoId}/audios-cliente`),
  usarGrabacion: (cursoId: string, pantallaId: string, datos: { materialId: string; autorizado: boolean; usarLimpio?: boolean; version: number }) =>
    pedir<ResultadoGrabacion>(`/cursos/${cursoId}/narraciones/${pantallaId}/grabacion`, json(datos)),
  relocutar: (cursoId: string, pantallaId: string, datos: { materialId: string; version: number }) => pedir<ResultadoGrabacion>(`/cursos/${cursoId}/narraciones/${pantallaId}/relocutar`, json(datos)),
  limpiarAudio: (materialId: string) => pedir<{ estado: 'procesando' | 'listo' }>(`/materiales/${materialId}/limpiar`, { method: 'POST' }),
  regenerarNarraciones: (cursoId: string, datos: { pantallaIds?: string[]; soloDesactualizadas?: boolean; idiomas?: ('es' | 'en')[] } = {}) =>
    pedir<Regeneracion>(`/cursos/${cursoId}/narraciones/regenerar`, json(datos)),
  comentarios: (cursoId: string) => pedir<Comentario[]>(`/cursos/${cursoId}/comentarios`),
  comentar: (cursoId: string, pantallaId: string, texto: string) => pedir<Comentario>(`/cursos/${cursoId}/comentarios`, json({ pantallaId, texto })),
  resolverComentario: (id: string, resuelto: boolean) => pedir<Comentario>(`/comentarios/${id}`, json({ resuelto }, 'PATCH')),
  observaciones: (cursoId: string) => pedir<Observacion[]>(`/cursos/${cursoId}/observaciones?resuelta=false`),
  /** HU-0505 · «✦ Revisar con IA» (IA-12) y descartar una observación de la IA. */
  controlCalidad: (cursoId: string) => pedir<{ id: string; estado: EstadoTrabajo }>(`/cursos/${cursoId}/control-calidad`, { method: 'POST' }),
  descartarObservacion: (id: string) => pedir<Observacion>(`/observaciones/${id}`, json({ resuelta: true }, 'PATCH')),
  /** HU-1001 · Matriz de alineación (sin IA) y cambio del nivel de Bloom de un objetivo, una pantalla o una pregunta. */
  alineacion: (cursoId: string) => pedir<InformeAlineacion>(`/cursos/${cursoId}/alineacion`),
  cambiarAlineacion: (cursoId: string, datos: { version: number; objetivos?: { id: string; nivelBloom: NivelBloom }[]; elementos?: { pantallaId: string; preguntaId?: string; nivelBloom: NivelBloom }[] }) =>
    pedir<InformeAlineacion>(`/cursos/${cursoId}/alineacion`, json(datos, 'PATCH')),
  /** HU-1103 · Patrón y reglas de navegación; guardar crea una versión del curso (409 si otra persona guardó antes). */
  navegacion: (cursoId: string) => pedir<Navegacion>(`/cursos/${cursoId}/navegacion`),
  guardarNavegacion: (cursoId: string, datos: NavegacionCambio) => pedir<Navegacion>(`/cursos/${cursoId}/navegacion`, json(datos, 'PUT')),
  editarPantalla: (cursoId: string, pantallaId: string, datos: { version: number; titulo?: TextoI18n; textos?: Record<string, TextoI18n>; narracion?: TextoI18n; ajustes?: Record<string, AjusteElemento | null>; disposicion?: string; extras?: ElementoExtra[]; disparadores?: Disparador[]; marcadores?: Record<string, unknown[]>; reglasVideo?: Record<string, { impedirAdelantar: boolean; porcentajeMinimo?: number }>; motivo?: 'deshacer' | 'rehacer' }) =>
    pedir<CambioResultado>(`/cursos/${cursoId}/pantallas/${pantallaId}`, json(datos, 'PATCH')),
  aprobarPantalla: (cursoId: string, pantallaId: string) => pedir<CambioResultado>(`/cursos/${cursoId}/pantallas/${pantallaId}/aprobar`, { method: 'POST' }),
  // HU-0504 · Propuestas de la IA y Deshacer.
  pedirPropuesta: (cursoId: string, datos: { tipo: Propuesta['tipo']; pantallaId: string; pedido?: string }) =>
    pedir<{ id: string; estado: EstadoTrabajo }>(`/cursos/${cursoId}/propuestas`, json(datos)),
  propuestas: (cursoId: string) => pedir<Propuesta[]>(`/cursos/${cursoId}/propuestas`),
  // HU-1002 · «✦ Proponer correcciones» de la alineación (IA-17, curso entero).
  /** HU-1104 · «✦ Recomendar» (modo recomendar) o «✦ Crear con IA» (modo crear, con la descripción). */
  pedirPatron: (cursoId: string, datos: { modo: ModoPatron; descripcion?: string }) =>
    pedir<{ id: string; estado: EstadoTrabajo }>(`/cursos/${cursoId}/propuestas`, json({ tipo: 'patron', ...datos })),
  pedirCorreccion: (cursoId: string) => pedir<{ id: string; estado: EstadoTrabajo }>(`/cursos/${cursoId}/propuestas`, json({ tipo: 'alineacion' })),
  aplicarPropuesta: (id: string, varianteIndice?: number) => pedir<CambioResultado>(`/propuestas/${id}/aplicar`, json(varianteIndice === undefined ? {} : { varianteIndice })),
  /** HU-0903 · «✦ Proponer pausas desde la transcripción» (IA-09, de la pantalla con video) y aplicar las elegidas. */
  pedirPausas: (cursoId: string, pantallaId: string) => pedir<{ id: string; estado: EstadoTrabajo }>(`/cursos/${cursoId}/propuestas`, json({ tipo: 'pausas-video', pantallaId })),
  aplicarPausas: (id: string, marcadorIds: string[]) => pedir<CambioResultado>(`/propuestas/${id}/aplicar`, json({ marcadorIds })),
  descartarPropuesta: (id: string) => pedir<void>(`/propuestas/${id}/descartar`, { method: 'POST' }),
  restaurarVersion: (cursoId: string, version: number) => pedir<{ version: number }>(`/cursos/${cursoId}/versiones/${version}/restaurar`, { method: 'POST' }),
  trabajo: (id: string) => pedir<TrabajoEstado>(`/trabajos/${id}`),
  aprobarSinObservaciones: (cursoId: string) => pedir<CambioResultado>(`/cursos/${cursoId}/pantallas/aprobar`, json({ soloSinObservaciones: true })),
  curso: (proyectoId: string) => pedir<Curso>(`/proyectos/${proyectoId}/curso`),
  // HU-0802 · Idiomas (PNT-11).
  traducciones: (cursoId: string, estado?: EstadoTraduccion) => pedir<Traduccion[]>(`/cursos/${cursoId}/traducciones${estado ? `?estado=${estado}` : ''}`),
  traducir: (cursoId: string) => pedir<{ id: string; estado: EstadoTrabajo }>(`/cursos/${cursoId}/traducciones/traducir`, { method: 'POST' }),
  cambiarTraduccion: (id: string, datos: { en?: string; estado?: 'REVISADA' }) => pedir<Traduccion>(`/traducciones/${id}`, json(datos, 'PATCH')),
  exportar: (cursoId: string, datos: { formato: FormatoPedido; perfilLms: PerfilExportacion; modoIdioma?: ModoIdiomaExportacion }) => pedir<Exportacion>(`/cursos/${cursoId}/exportaciones`, json(datos)),
  validar: (cursoId: string, datos: { formato: FormatoExportacion; perfilLms: PerfilExportacion; modoIdioma?: ModoIdiomaExportacion }) => pedir<Validacion>(`/cursos/${cursoId}/validar`, json(datos)),
  exportaciones: (cursoId: string) => pedir<Exportacion[]>(`/cursos/${cursoId}/exportaciones`),
  exportacion: (id: string) => pedir<Exportacion>(`/exportaciones/${id}`),
  kit: (clienteId: string) => pedir<Kit>(`/clientes/${clienteId}/kit`),
  guardarKit: (clienteId: string, datos: KitEntrada) => pedir<Kit>(`/clientes/${clienteId}/kit`, json(datos, 'PUT')),
  // HU-0206 · Kit propuesto desde un curso anterior (ZIP) o un manual de marca (PDF).
  extraerKit: (clienteId: string, recursoId: string) => pedir<{ id: string; estado: EstadoTrabajo }>(`/clientes/${clienteId}/kit/extraer`, json({ recursoId })),
  propuestaKit: (clienteId: string) => pedir<PropuestaKit>(`/clientes/${clienteId}/kit/propuesta`),
  descartarPropuestaKit: (clienteId: string) => pedir<void>(`/clientes/${clienteId}/kit/propuesta`, { method: 'DELETE' }),
  pantallasModelo: (clienteId: string) => pedir<PantallaModelo[]>(`/clientes/${clienteId}/kit/pantallas-modelo`),
  guardarPantallaModelo: (clienteId: string, datos: PantallaModeloEntrada, id?: string) =>
    id
      ? pedir<PantallaModelo>(`/clientes/${clienteId}/kit/pantallas-modelo/${id}`, json(datos, 'PUT'))
      : pedir<PantallaModelo>(`/clientes/${clienteId}/kit/pantallas-modelo`, json(datos)),
  desactivarPantallaModelo: (clienteId: string, id: string) =>
    pedir<void>(`/clientes/${clienteId}/kit/pantallas-modelo/${id}`, { method: 'DELETE' }),
  proyectos: (filtro: { clienteId?: string; estado?: string; buscar?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v) as [string, string][]).toString();
    return pedir<Proyecto[]>(`/proyectos${q ? `?${q}` : ''}`);
  },
  proyecto: (id: string) => pedir<Proyecto>(`/proyectos/${id}`),
  crearProyecto: (datos: ProyectoEntrada) => pedir<Proyecto>('/proyectos', json(datos)),
  editarProyecto: (id: string, datos: Partial<ProyectoEntrada>) => pedir<Proyecto>(`/proyectos/${id}`, json(datos, 'PATCH')),
  archivarProyecto: (id: string) => pedir<void>(`/proyectos/${id}`, { method: 'DELETE' }),
  materiales: (proyectoId: string) => pedir<Material[]>(`/proyectos/${proyectoId}/materiales`),
  agregarMaterial: (proyectoId: string, datos: { recursoId: string } | { tema: string }) =>
    pedir<Material>(`/proyectos/${proyectoId}/materiales`, json(datos)),
  generaciones: (proyectoId: string) => pedir<Generacion[]>(`/proyectos/${proyectoId}/generaciones`),
  generacion: (id: string) => pedir<Generacion>(`/generaciones/${id}`),
  generar: (proyectoId: string) => pedir<Generacion>(`/proyectos/${proyectoId}/generaciones`, json({})),
  etapaGeneracion: <T = unknown>(id: string, etapa: Etapa) => pedir<EtapaGeneracion & { datos: T | null }>(`/generaciones/${id}/etapas/${etapa}`),
  cancelarGeneracion: (id: string) => pedir<Generacion>(`/generaciones/${id}/cancelar`, { method: 'POST' }),
  continuarGeneracion: (id: string) => pedir<Generacion>(`/generaciones/${id}/continuar`, { method: 'POST' }),
  fichasLms: (clienteId: string) => pedir<FichaCompatibilidad[]>(`/clientes/${clienteId}/fichas-lms`),
  crearFichaLms: (clienteId: string, datos: FichaCompatibilidadEntrada) => pedir<FichaCompatibilidad>(`/clientes/${clienteId}/fichas-lms`, json(datos)),
  glosario: (clienteId: string) => pedir<TerminoGlosario[]>(`/clientes/${clienteId}/glosario`),
  guardarGlosario: (clienteId: string, terminos: TerminoGlosario[]) => pedir<TerminoGlosario[]>(`/clientes/${clienteId}/glosario`, json(terminos, 'PUT')),
  pronunciacion: (clienteId: string) => pedir<TerminoPronunciacion[]>(`/clientes/${clienteId}/pronunciacion`),
  guardarPronunciacion: (clienteId: string, terminos: TerminoPronunciacion[]) =>
    pedir<TerminoPronunciacion[]>(`/clientes/${clienteId}/pronunciacion`, json(terminos, 'PUT')),
  muestraVoz: (datos: { texto: string; idioma: 'es' | 'en'; clienteId?: string }) => pedir<MuestraVoz>('/voz/muestra', json(datos)),
  guardarPersonaje: (clienteId: string, datos: { recursoId: string; nombre: string; version: number }) =>
    pedir<Kit>(`/clientes/${clienteId}/kit/personaje`, json(datos, 'PUT')),
  /** HU-1406 · Recursos generados de un proyecto, con su procedencia. */
  recursosGenerados: (proyectoId: string) => pedir<Recurso[]>(`/recursos?${new URLSearchParams({ proyectoId, origen: 'GENERADO' })}`),
  recurso: (id: string) => pedir<Recurso>(`/recursos/${id}`),
  /** HU-0609 · La biblioteca del proyecto: sus imágenes y SVG subidos o generados, con URL firmada (sin el material del cliente). */
  bibliotecaProyecto: (proyectoId: string) => pedir<Recurso[]>(`/recursos?${new URLSearchParams({ proyectoId, biblioteca: 'true' })}`),
  /** Sube un archivo directo al almacenamiento cifrado (HU-1404): pide la URL firmada, envía el PUT y confirma. */
  async subir(archivo: File, destino: { clienteId?: string; proyectoId?: string; origen?: 'SUBIDO' | 'CLIENTE' }): Promise<Recurso> {
    const subida = await pedir<{ subidaId: string; url: string; cabeceras: Record<string, string> }>(
      '/recursos/subidas',
      json({ nombre: archivo.name, mime: archivo.type, bytes: archivo.size, ...destino }),
    );
    let res: Response;
    try {
      res = await fetch(subida.url, { method: 'PUT', headers: subida.cabeceras, body: archivo });
    } catch {
      throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.');
    }
    if (!res.ok) throw new ErrorApi(res.status, 'SUBIDA_FALLIDA', 'El almacenamiento rechazó el archivo');
    return pedir<Recurso>(`/recursos/subidas/${subida.subidaId}/confirmar`, { method: 'POST' });
  },
};
