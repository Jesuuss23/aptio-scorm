// Cliente de la API (docs/api/openapi.yaml). Mismo origen: la cookie httpOnly `sesion` viaja sola.
import type { DefinicionModelo, Paleta } from '@aptio/schema/marca';
import type { Etapa, EstadoTrabajo } from '@aptio/schema/generacion';
import type { OperacionPatch } from '@aptio/schema/patch';
import type { DatosTecnicos, EstadoProyecto, PerfilLms } from '@aptio/schema/proyecto';

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
export interface Recurso {
  id: string;
  tipo: string;
  nombre: string;
  mime: string;
  bytes: number;
  eliminadosAlSanear?: string[];
  url?: string;
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
export interface Observacion {
  id: string;
  pantallaId: string | null;
  tipo: string;
  severidad: 'info' | 'aviso' | 'bloquea-entrega';
  mensaje: string;
  origen: string;
  resuelta: boolean;
  creadoEn: string;
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
}

/** HU-0502 · Resultado de editar o aprobar. */
export interface CambioResultado {
  version: number;
  /** HU-0503 · Lo que se regenera en cascada: `voz-es`, `boca` y `subtitulos-es`. */
  regenerando: string[];
  aprobadas?: string[];
  pendientes?: string[];
  estado?: string;
}

/** HU-0504 · Propuesta de la IA sobre una pantalla. `cambios` es el JSON Patch; las variantes van en `vistaPrevia`. */
export interface Propuesta {
  id: string;
  tipo: 'mas-visual' | 'menos-texto' | 'actividad' | 'variantes' | 'libre';
  pantallaId: string | null;
  titulo: string;
  descripcion: string;
  cambios: OperacionPatch[];
  vistaPrevia?: { nombre: string; disposicion: string; patch: OperacionPatch[] }[];
  versionBase: number;
  estado: 'PENDIENTE' | 'APLICADA' | 'DESCARTADA' | 'VENCIDA';
  costoUsd: number;
  creadoEn: string;
}

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

export const api = {
  yo: () => pedir<Usuario>('/yo'),
  ingresar: (email: string, clave: string) => pedir<{ usuario: Usuario; expira: string }>('/auth/ingresar', json({ email, clave })),
  salir: () => pedir<void>('/auth/salir', { method: 'POST' }),
  pedirClave: (email: string) => pedir<void>('/auth/clave/olvido', json({ email })),
  crearClave: (token: string, clave: string) => pedir<void>('/auth/clave/restablecer', json({ token, clave })),
  clientes: (buscar = '') => pedir<Cliente[]>(`/clientes${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`),
  cliente: (id: string) => pedir<Cliente>(`/clientes/${id}`),
  crearCliente: (datos: ClienteEntrada) => pedir<Cliente>('/clientes', json(datos)),
  editarCliente: (id: string, datos: Partial<ClienteEntrada>) => pedir<Cliente>(`/clientes/${id}`, json(datos, 'PATCH')),
  narraciones: (cursoId: string, idioma: 'es' | 'en' = 'es') => pedir<Narracion[]>(`/cursos/${cursoId}/narraciones?idioma=${idioma}`),
  regenerarNarraciones: (cursoId: string, datos: { pantallaIds?: string[]; soloDesactualizadas?: boolean } = {}) =>
    pedir<Regeneracion>(`/cursos/${cursoId}/narraciones/regenerar`, json(datos)),
  observaciones: (cursoId: string) => pedir<Observacion[]>(`/cursos/${cursoId}/observaciones?resuelta=false`),
  editarPantalla: (cursoId: string, pantallaId: string, datos: { version: number; titulo?: TextoI18n; textos?: Record<string, TextoI18n>; narracion?: TextoI18n }) =>
    pedir<CambioResultado>(`/cursos/${cursoId}/pantallas/${pantallaId}`, json(datos, 'PATCH')),
  aprobarPantalla: (cursoId: string, pantallaId: string) => pedir<CambioResultado>(`/cursos/${cursoId}/pantallas/${pantallaId}/aprobar`, { method: 'POST' }),
  // HU-0504 · Propuestas de la IA y Deshacer.
  pedirPropuesta: (cursoId: string, datos: { tipo: Propuesta['tipo']; pantallaId: string; pedido?: string }) =>
    pedir<{ id: string; estado: EstadoTrabajo }>(`/cursos/${cursoId}/propuestas`, json(datos)),
  propuestas: (cursoId: string) => pedir<Propuesta[]>(`/cursos/${cursoId}/propuestas`),
  aplicarPropuesta: (id: string, varianteIndice?: number) => pedir<CambioResultado>(`/propuestas/${id}/aplicar`, json(varianteIndice === undefined ? {} : { varianteIndice })),
  descartarPropuesta: (id: string) => pedir<void>(`/propuestas/${id}/descartar`, { method: 'POST' }),
  restaurarVersion: (cursoId: string, version: number) => pedir<{ version: number }>(`/cursos/${cursoId}/versiones/${version}/restaurar`, { method: 'POST' }),
  trabajo: (id: string) => pedir<TrabajoEstado>(`/trabajos/${id}`),
  aprobarSinObservaciones: (cursoId: string) => pedir<CambioResultado>(`/cursos/${cursoId}/pantallas/aprobar`, json({ soloSinObservaciones: true })),
  curso: (proyectoId: string) => pedir<Curso>(`/proyectos/${proyectoId}/curso`),
  kit: (clienteId: string) => pedir<Kit>(`/clientes/${clienteId}/kit`),
  guardarKit: (clienteId: string, datos: KitEntrada) => pedir<Kit>(`/clientes/${clienteId}/kit`, json(datos, 'PUT')),
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
  glosario: (clienteId: string) => pedir<TerminoGlosario[]>(`/clientes/${clienteId}/glosario`),
  guardarGlosario: (clienteId: string, terminos: TerminoGlosario[]) => pedir<TerminoGlosario[]>(`/clientes/${clienteId}/glosario`, json(terminos, 'PUT')),
  pronunciacion: (clienteId: string) => pedir<TerminoPronunciacion[]>(`/clientes/${clienteId}/pronunciacion`),
  guardarPronunciacion: (clienteId: string, terminos: TerminoPronunciacion[]) =>
    pedir<TerminoPronunciacion[]>(`/clientes/${clienteId}/pronunciacion`, json(terminos, 'PUT')),
  muestraVoz: (datos: { texto: string; idioma: 'es' | 'en'; clienteId?: string }) => pedir<MuestraVoz>('/voz/muestra', json(datos)),
  guardarPersonaje: (clienteId: string, datos: { recursoId: string; nombre: string; version: number }) =>
    pedir<Kit>(`/clientes/${clienteId}/kit/personaje`, json(datos, 'PUT')),
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
