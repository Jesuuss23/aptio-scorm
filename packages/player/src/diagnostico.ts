// HU-1204 · Modo diagnóstico del paquete (CP-094, docs/08-entregas-y-lms.md): registra cómo se buscó la API SCORM 1.2
// (cada nivel de ventana padre, las de otro origen y la ventana que abrió el curso) y cada llamada al LMS con su
// respuesta y su código de error. El informe es un JSON para pegar en la ficha de compatibilidad del cliente.
// Privacidad: el paquete nunca lee `cmi.core.student_id` ni `cmi.core.student_name`; si alguna llamada los tocara, su
// valor y su respuesta se reemplazan por «[omitido]». Cada valor se recorta a 200 caracteres. Sin DOM.

/** Versión del reproductor empaquetado (la misma de `window.AptioReproductor.version`). */
export const VERSION_REPRODUCTOR = '0.1.0';
/** Llamadas que se guardan: las últimas 200. */
export const MAXIMO_LLAMADAS = 200;
/** Largo máximo de cada valor en el registro. */
export const MAXIMO_VALOR = 200;
/** Elementos con datos del participante que nunca salen en el informe. */
export const ELEMENTOS_PRIVADOS = ['cmi.core.student_id', 'cmi.core.student_name'] as const;
const OMITIDO = '[omitido]';

export type OrigenVentana = 'propia' | 'padre' | 'opener';
export type ResultadoBusqueda = 'api' | 'sin-api' | 'otro-origen';

/** Un paso de la búsqueda de ADL: qué ventana se revisó y qué se encontró. */
export interface PasoBusqueda {
  /** 0 es la ventana del paquete (o la que lo abrió, si `origen` es opener); cada padre suma uno. */
  nivel: number;
  origen: OrigenVentana;
  resultado: ResultadoBusqueda;
}

export type MetodoLms = 'LMSInitialize' | 'LMSGetValue' | 'LMSSetValue' | 'LMSCommit' | 'LMSFinish';

export interface LlamadaLms {
  /** Milisegundos desde que se abrió el paquete. */
  ms: number;
  metodo: MetodoLms;
  elemento?: string;
  valor?: string;
  /** Lo que respondió el LMS; «(excepción) …» si lanzó. */
  respuesta: string;
  /** Lo que devolvió LMSGetLastError después de la llamada («0» sin error). */
  error: string;
}

export interface InicialDiagnostico {
  entrada: string;
  ubicacion: string;
  estado: string;
  nota: string;
  suspendDataCaracteres: number;
}

export interface InformeDiagnostico {
  aptio: 'diagnostico-scorm12';
  version: 1;
  generado: string;
  reproductor: string;
  curso: { id: string; titulo: string; pantallas: number; huella: string };
  navegador: string;
  enIframe: boolean;
  api: { encontrada: boolean; origen: OrigenVentana | null; nivel: number | null; conectado: boolean };
  busqueda: PasoBusqueda[];
  inicial: InicialDiagnostico;
  llamadas: { total: number; guardadas: number; lista: LlamadaLms[] };
}

const recortar = (x: string): string => (x.length > MAXIMO_VALOR ? `${x.slice(0, MAXIMO_VALOR - 1)}…` : x);
const privado = (elemento?: string) => elemento !== undefined && (ELEMENTOS_PRIVADOS as readonly string[]).includes(elemento);

/** User-Agent resumido: navegador y sistema, sin el resto de la cadena. */
export function navegadorResumido(ua: string): string {
  // El orden importa: Edge y Opera también dicen «Chrome», y Chrome también dice «Safari».
  const marcas: [RegExp, string][] = [[/Edg\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/CriOS\/(\d+)/, 'Chrome iOS'], [/FxiOS\/(\d+)/, 'Firefox iOS'], [/Firefox\/(\d+)/, 'Firefox'], [/Chrome\/(\d+)/, 'Chrome'], [/Version\/(\d+).*Safari/, 'Safari']];
  const marca = marcas.map(([re, nombre]) => [re.exec(ua), nombre] as const).find(([m]) => m);
  const so = /Windows NT [\d.]+|Android [\d.]+|iPhone OS [\d_]+|iPad|Mac OS X [\d_]+|CrOS|Linux/.exec(ua)?.[0].replace(/_/g, '.') ?? 'sistema desconocido';
  return `${marca ? `${marca[1]} ${marca[0]![1]}` : 'Desconocido'} · ${so}`;
}

/** Registro en memoria de la búsqueda y de las llamadas. Anotar cuesta un push; el informe se arma solo al pedirlo. */
export class RegistroDiagnostico {
  readonly busqueda: PasoBusqueda[] = [];
  private readonly llamadas: LlamadaLms[] = [];
  private inicio: number;
  private totalLlamadas = 0;
  private oyentes = new Set<() => void>();
  private readonly ahora: () => number;

  constructor(ahora: () => number = () => Date.now()) {
    this.ahora = ahora;
    this.inicio = ahora();
  }

  anotarBusqueda(paso: PasoBusqueda): void {
    this.busqueda.push(paso);
  }

  anotarLlamada(metodo: MetodoLms, respuesta: string, error: string, elemento?: string, valor?: string): void {
    const oculto = privado(elemento);
    const llamada: LlamadaLms = { ms: Math.max(0, this.ahora() - this.inicio), metodo, respuesta: oculto ? OMITIDO : recortar(String(respuesta)), error: recortar(String(error)) };
    if (elemento !== undefined) llamada.elemento = recortar(elemento);
    if (valor !== undefined) llamada.valor = oculto ? OMITIDO : recortar(String(valor));
    this.llamadas.push(llamada);
    if (this.llamadas.length > MAXIMO_LLAMADAS) this.llamadas.shift();
    this.totalLlamadas++;
    for (const f of this.oyentes) f();
  }

  /** Las llamadas guardadas (las últimas 200), de la más vieja a la más nueva. */
  lista(): readonly LlamadaLms[] {
    return this.llamadas;
  }

  total(): number {
    return this.totalLlamadas;
  }

  /** Avisa cada llamada nueva (el panel abierto se actualiza en vivo). Devuelve cómo dejar de escuchar. */
  escuchar(f: () => void): () => void {
    this.oyentes.add(f);
    return () => this.oyentes.delete(f);
  }

  /** Dónde quedó la API, según la búsqueda. */
  hallazgo(): { origen: OrigenVentana; nivel: number } | null {
    const paso = this.busqueda.find((p) => p.resultado === 'api');
    return paso ? { origen: paso.origen, nivel: paso.nivel } : null;
  }
}

export interface ContextoInforme {
  curso: { id: string; titulo: string; pantallas: number; huella: string };
  conectado: boolean;
  inicial: { entrada: string; ubicacion: string; estado: string; nota: string; suspendData: string };
  userAgent: string;
  enIframe: boolean;
  ahora?: Date;
}

/** El informe para la ficha de compatibilidad del cliente. Nunca incluye datos del participante. */
export function informeDiagnostico(registro: RegistroDiagnostico, c: ContextoInforme): InformeDiagnostico {
  const hallazgo = registro.hallazgo();
  const lista = registro.lista().map((l) => ({ ...l }));
  return {
    aptio: 'diagnostico-scorm12',
    version: 1,
    generado: (c.ahora ?? new Date()).toISOString(),
    reproductor: VERSION_REPRODUCTOR,
    curso: c.curso,
    navegador: navegadorResumido(c.userAgent),
    enIframe: c.enIframe,
    api: { encontrada: hallazgo !== null, origen: hallazgo?.origen ?? null, nivel: hallazgo?.nivel ?? null, conectado: c.conectado },
    busqueda: registro.busqueda.map((p) => ({ ...p })),
    inicial: {
      entrada: recortar(c.inicial.entrada), ubicacion: recortar(c.inicial.ubicacion), estado: recortar(c.inicial.estado), nota: recortar(c.inicial.nota),
      suspendDataCaracteres: c.inicial.suspendData.length,
    },
    llamadas: { total: registro.total(), guardadas: lista.length, lista },
  };
}
