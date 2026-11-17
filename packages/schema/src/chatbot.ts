/**
 * HU-1604 · Chatbot del sitio comercial (REQ-077, PNT-32, RN-17-4, CP-133, CP-134). Reglas puras que comparten la API,
 * el sitio y la web: los ajustes (nombre, saludo, tono, objetivo y horario de atención humana en hora de Lima), las
 * respuestas rápidas, las fuentes manuales, los límites de la conversación, el selector léxico de fuentes que arma el
 * contexto de IA-20 y la respuesta controlada «no lo sé» (CP-133). El mensaje del visitante es un dato no confiable:
 * solo viaja al prompt neutralizado y nunca cambia estas reglas.
 */
import { diaSemana, fechaLima, horaLima, esHora } from './agenda.js';
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';
import { rutaServida } from './sitio-seo.js';
import type { EntornoSitio } from './sitio-ficticios.js';
import type { Instantanea } from './sitio-versiones.js';

export const TAREA_CHATBOT = 'IA-20';

export const TONOS_CHATBOT = ['cercano', 'formal', 'directo'] as const;
export type TonoChatbot = (typeof TONOS_CHATBOT)[number];
export const ETIQUETA_TONO: Record<TonoChatbot, string> = { cercano: 'Cercano y profesional', formal: 'Formal', directo: 'Directo' };

export const OBJETIVOS_CHATBOT = ['agendar_demo', 'captar_lead', 'derivar_whatsapp'] as const;
export type ObjetivoChatbot = (typeof OBJETIVOS_CHATBOT)[number];
export const ETIQUETA_OBJETIVO: Record<ObjetivoChatbot, string> = { agendar_demo: 'Agendar demo', captar_lead: 'Captar lead', derivar_whatsapp: 'Derivar a WhatsApp' };

export const ACCIONES_RAPIDA = ['consulta_ia', 'agendar_demo', 'hablar_persona'] as const;
export type AccionRapida = (typeof ACCIONES_RAPIDA)[number];
export const ETIQUETA_ACCION_RAPIDA: Record<AccionRapida, string> = { consulta_ia: 'Pregunta a la IA', agendar_demo: 'Agendar demo', hablar_persona: 'Hablar con una persona' };
/** Las acciones que el navegador resuelve solo, sin gastar en la IA. */
export const ACCIONES_LOCALES: readonly AccionRapida[] = ['agendar_demo', 'hablar_persona'];

export const RESULTADOS_CONVERSACION = ['respuesta', 'lead', 'demo', 'persona', 'sin_conversion'] as const;
export type ResultadoConversacion = (typeof RESULTADOS_CONVERSACION)[number];
export const ETIQUETA_RESULTADO: Record<ResultadoConversacion, string> = { respuesta: 'Respondida', lead: 'Lead', demo: 'Demo agendada', persona: 'Pidió una persona', sin_conversion: 'Sin conversión' };
/** De menor a mayor: una conversación solo sube de resultado (una demo no vuelve a «respondida»). */
const RANGO_RESULTADO: Record<ResultadoConversacion, number> = { sin_conversion: 0, respuesta: 1, persona: 2, lead: 3, demo: 4 };

export const IDIOMAS_CHAT = ['es', 'en'] as const;
export type IdiomaChat = (typeof IDIOMAS_CHAT)[number];

export const LIMITES_CHAT = {
  /** Caracteres por mensaje del visitante. */
  mensaje: 500,
  /** Mensajes del visitante por conversación. */
  mensajesVisitante: 20,
  /** Mensajes por minuto por IP (en memoria, sin guardar la IP). */
  porMinuto: 10,
  retencionDias: 90,
  fuentes: 6,
  caracteresContexto: 12_000,
  /** Lo que espera la API a la IA antes de dar la respuesta controlada. */
  esperaIaMs: 20_000,
  nombre: 40,
  saludo: 280,
  textoRapida: 60,
  rapidas: 8,
  tituloFuente: 120,
  contenidoFuente: 4_000,
  fuentesManuales: 50,
  respuesta: 900,
} as const;

export const DIA_MS = 86_400_000;
export const ID_CHATBOT = 'chatbot';

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
const unaLinea = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const enLista = <T extends string>(lista: readonly T[]) => (v: unknown): v is T => typeof v === 'string' && (lista as readonly string[]).includes(v);
export const esTonoChatbot = enLista(TONOS_CHATBOT);
export const esObjetivoChatbot = enLista(OBJETIVOS_CHATBOT);
export const esAccionRapida = enLista(ACCIONES_RAPIDA);
export const esResultadoConversacion = enLista(RESULTADOS_CONVERSACION);
export const esIdiomaChat = enLista(IDIOMAS_CHAT);

// ── Ajustes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AjustesChatbot {
  nombre: string;
  saludoEs: string;
  saludoEn: string;
  tono: TonoChatbot;
  objetivo: ObjetivoChatbot;
  horarioInicio: string;
  horarioFin: string;
  /** 1 (lunes) a 7 (domingo), en hora de Lima. */
  diasAtencion: number[];
  visible: boolean;
}

export const AJUSTES_CHATBOT_POR_DEFECTO: AjustesChatbot = {
  nombre: 'Ana',
  saludoEs: 'Hola, soy Ana. ¿Quieres ver cómo convertir un manual en una cápsula SCORM?',
  saludoEn: "Hi, I'm Ana. Want to see how to turn a manual into a SCORM capsule?",
  tono: 'cercano',
  objetivo: 'agendar_demo',
  horarioInicio: '09:00',
  horarioFin: '18:00',
  diasAtencion: [1, 2, 3, 4, 5],
  visible: false,
};

function textoCorto(errores: ErrorCampo[], campo: string, v: unknown, max: number, obligatorio: boolean): string | null {
  if (typeof v !== 'string') {
    errores.push({ campo, mensaje: 'Debe ser texto' });
    return null;
  }
  const t = unaLinea(v);
  if (obligatorio && !t) errores.push({ campo, mensaje: 'No puede quedar vacío' });
  else if (t.length > max) errores.push({ campo, mensaje: `Hasta ${max} caracteres` });
  else if (!esTextoPlano(t)) errores.push({ campo, mensaje: 'Solo texto, sin etiquetas HTML' });
  else return t;
  return null;
}

/** Cambios a los ajustes: solo los campos presentes. El horario va como HH:MM y el inicio antes del fin. */
export function validarAjustesChatbot(actual: AjustesChatbot, cambios: unknown): { ok: true; ajustes: AjustesChatbot } | { ok: false; errores: ErrorCampo[] } {
  const c = obj(cambios);
  const errores: ErrorCampo[] = [];
  const r: AjustesChatbot = { ...actual, diasAtencion: [...actual.diasAtencion] };
  if (c.nombre !== undefined) { const t = textoCorto(errores, 'nombre', c.nombre, LIMITES_CHAT.nombre, true); if (t !== null) r.nombre = t; }
  if (c.saludoEs !== undefined) { const t = textoCorto(errores, 'saludoEs', c.saludoEs, LIMITES_CHAT.saludo, true); if (t !== null) r.saludoEs = t; }
  if (c.saludoEn !== undefined) { const t = textoCorto(errores, 'saludoEn', c.saludoEn, LIMITES_CHAT.saludo, false); if (t !== null) r.saludoEn = t; }
  if (c.tono !== undefined) {
    if (!esTonoChatbot(c.tono)) errores.push({ campo: 'tono', mensaje: `El tono es uno de: ${TONOS_CHATBOT.join(', ')}` });
    else r.tono = c.tono;
  }
  if (c.objetivo !== undefined) {
    if (!esObjetivoChatbot(c.objetivo)) errores.push({ campo: 'objetivo', mensaje: `El objetivo es uno de: ${OBJETIVOS_CHATBOT.join(', ')}` });
    else r.objetivo = c.objetivo;
  }
  for (const campo of ['horarioInicio', 'horarioFin'] as const) {
    if (c[campo] === undefined) continue;
    if (!esHora(c[campo])) errores.push({ campo, mensaje: 'La hora va como HH:MM, por ejemplo 09:00' });
    else r[campo] = c[campo] as string;
  }
  if (r.horarioInicio >= r.horarioFin && !errores.some((e) => e.campo.startsWith('horario'))) errores.push({ campo: 'horarioFin', mensaje: 'El fin de la atención va después del inicio' });
  if (c.diasAtencion !== undefined) {
    if (!Array.isArray(c.diasAtencion) || !c.diasAtencion.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) errores.push({ campo: 'diasAtencion', mensaje: 'Los días de atención van de 1 (lunes) a 7 (domingo)' });
    else r.diasAtencion = [...new Set(c.diasAtencion as number[])].sort((a, b) => a - b);
  }
  if (c.visible !== undefined) {
    if (typeof c.visible !== 'boolean') errores.push({ campo: 'visible', mensaje: 'El chatbot se muestra o se oculta' });
    else r.visible = c.visible;
  }
  return errores.length ? { ok: false, errores } : { ok: true, ajustes: r };
}

/** Si una persona atiende ahora: día de atención y hora de Lima dentro de [inicio, fin). */
export function enHorario(a: Pick<AjustesChatbot, 'horarioInicio' | 'horarioFin' | 'diasAtencion'>, ahora: Date): boolean {
  const hora = horaLima(ahora);
  return a.diasAtencion.includes(diaSemana(fechaLima(ahora))) && hora >= a.horarioInicio && hora < a.horarioFin;
}

const NOMBRES_DIA = { es: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } as const;

/** «Lun a vie, 9:00 a 18:00» o «Mon to Fri, 9:00 to 18:00». Días seguidos se escriben como rango. */
export function textoHorario(a: Pick<AjustesChatbot, 'horarioInicio' | 'horarioFin' | 'diasAtencion'>, idioma: IdiomaChat = 'es'): string {
  const n = NOMBRES_DIA[idioma];
  const d = [...a.diasAtencion].sort((x, y) => x - y);
  const seguidos = d.length > 2 && d.every((v, i) => i === 0 || v === d[i - 1]! + 1);
  const a_ = idioma === 'en' ? 'to' : 'a';
  const dias = !d.length ? '' : seguidos ? `${n[d[0]! - 1]} ${a_} ${n[d[d.length - 1]! - 1]}` : d.map((v) => n[v - 1]).join(', ');
  const h = (s: string) => s.replace(/^0(\d)/, '$1');
  const texto = `${dias}, ${h(a.horarioInicio)} ${a_} ${h(a.horarioFin)}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ── Respuestas rápidas y fuentes manuales ────────────────────────────────────────────────────────────────────────────

export interface DatosRapida { textoEs: string; textoEn: string; accion: AccionRapida }

export function validarRapida(entrada: unknown, actual?: DatosRapida): { ok: true; datos: DatosRapida } | { ok: false; errores: ErrorCampo[] } {
  const e = obj(entrada);
  const errores: ErrorCampo[] = [];
  const r: DatosRapida = actual ? { ...actual } : { textoEs: '', textoEn: '', accion: 'consulta_ia' };
  if (e.textoEs !== undefined || !actual) { const t = textoCorto(errores, 'textoEs', e.textoEs ?? '', LIMITES_CHAT.textoRapida, true); if (t !== null) r.textoEs = t; }
  if (e.textoEn !== undefined) { const t = textoCorto(errores, 'textoEn', e.textoEn, LIMITES_CHAT.textoRapida, false); if (t !== null) r.textoEn = t; }
  if (e.accion !== undefined || !actual) {
    if (!esAccionRapida(e.accion)) errores.push({ campo: 'accion', mensaje: `La acción es una de: ${ACCIONES_RAPIDA.join(', ')}` });
    else r.accion = e.accion;
  }
  return errores.length ? { ok: false, errores } : { ok: true, datos: r };
}

export interface DatosFuente { titulo: string; contenido: string; idioma: IdiomaChat }

export function validarFuente(entrada: unknown, actual?: DatosFuente): { ok: true; datos: DatosFuente } | { ok: false; errores: ErrorCampo[] } {
  const e = obj(entrada);
  const errores: ErrorCampo[] = [];
  const r: DatosFuente = actual ? { ...actual } : { titulo: '', contenido: '', idioma: 'es' };
  if (e.titulo !== undefined || !actual) { const t = textoCorto(errores, 'titulo', e.titulo ?? '', LIMITES_CHAT.tituloFuente, true); if (t !== null) r.titulo = t; }
  if (e.contenido !== undefined || !actual) {
    const v = e.contenido ?? '';
    if (typeof v !== 'string') errores.push({ campo: 'contenido', mensaje: 'Debe ser texto' });
    else {
      const t = v.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (!t) errores.push({ campo: 'contenido', mensaje: 'No puede quedar vacío' });
      else if (t.length > LIMITES_CHAT.contenidoFuente) errores.push({ campo: 'contenido', mensaje: `Hasta ${LIMITES_CHAT.contenidoFuente} caracteres` });
      else if (!esTextoPlano(t)) errores.push({ campo: 'contenido', mensaje: 'Solo texto, sin etiquetas HTML' });
      else r.contenido = t;
    }
  }
  if (e.idioma !== undefined) {
    if (!esIdiomaChat(e.idioma)) errores.push({ campo: 'idioma', mensaje: 'El idioma es es o en' });
    else r.idioma = e.idioma;
  }
  return errores.length ? { ok: false, errores } : { ok: true, datos: r };
}

// ── Base de conocimiento y selector léxico ───────────────────────────────────────────────────────────────────────────

export type TipoFuente = 'pagina' | 'pregunta' | 'manual';
/** `ruta` es la ruta servida (con `/en` en inglés), para el enlace «Fuente» del chat. */
export interface FuenteChat { id: string; tipo: TipoFuente; titulo: string; texto: string; ruta?: string }

const texto = (d: Record<string, string | number>, k: string) => (typeof d[k] === 'string' ? (d[k] as string).trim() : '');

/**
 * Las fuentes de la versión publicada en un idioma: cada página (su título y los textos de sus elementos visibles) y
 * cada pregunta frecuente por separado. En producción, sin elementos ficticios.
 */
export function fuentesDeInstantanea(inst: Pick<Instantanea, 'paginas'>, idioma: IdiomaChat, entorno: EntornoSitio): FuenteChat[] {
  const r: FuenteChat[] = [];
  for (const p of inst.paginas) {
    if (p.idioma !== idioma) continue;
    const partes: string[] = [];
    const preguntas: FuenteChat[] = [];
    for (const b of p.bloques) {
      for (const e of b.elementos ?? []) {
        if (entorno === 'produccion' && e.ficticio) continue;
        if (b.tipo === 'faq') {
          const pregunta = texto(e.datos, 'pregunta');
          const respuesta = texto(e.datos, 'respuesta');
          if (pregunta && respuesta) preguntas.push({ id: `pregunta:${e.id}`, tipo: 'pregunta', titulo: pregunta, texto: respuesta, ruta: rutaServida(p.ruta, p.idioma) });
          continue;
        }
        const t = Object.values(e.datos).filter((v): v is string => typeof v === 'string' && !/^(https?:|\/)/.test(v)).map((v) => v.trim()).filter(Boolean).join('. ');
        if (t) partes.push(t);
      }
    }
    if (partes.length) r.push({ id: `pagina:${p.ruta}`, tipo: 'pagina', titulo: p.titulo, texto: partes.join('\n'), ruta: rutaServida(p.ruta, p.idioma) });
    r.push(...preguntas);
  }
  // Una pregunta repetida en varias páginas cuenta una vez.
  const vistas = new Set<string>();
  return r.filter((f) => (vistas.has(f.id) ? false : (vistas.add(f.id), true)));
}

export function fuentesManuales(filas: readonly { id: string; titulo: string; contenido: string; idioma: string; visible: boolean }[], idioma: IdiomaChat): FuenteChat[] {
  return filas.filter((f) => f.visible && f.idioma === idioma).map((f) => ({ id: `manual:${f.id}`, tipo: 'manual', titulo: f.titulo, texto: f.contenido }));
}

const VACIAS = new Set([
  'que', 'qué', 'los', 'las', 'del', 'por', 'para', 'con', 'una', 'uno', 'unos', 'unas', 'como', 'cómo', 'cual', 'cuál', 'mas', 'más', 'sus', 'sin', 'sobre', 'este', 'esta', 'esto', 'eso', 'ese', 'esa',
  'hay', 'son', 'ser', 'est', 'esta', 'tiene', 'tienen', 'puedo', 'puede', 'pueden', 'quiero', 'hola', 'gracias', 'favor', 'ustedes', 'usted', 'nos', 'les', 'mis', 'tus', 'muy', 'pero', 'porque', 'cuando', 'donde',
  'the', 'and', 'for', 'with', 'what', 'how', 'can', 'you', 'your', 'are', 'does', 'that', 'this', 'from', 'have', 'has', 'about', 'which', 'want', 'hello', 'thanks', 'please',
]);

/** Palabras de 3 letras o más, en minúsculas y sin tildes, sin las vacías. */
export function palabras(t: string): string[] {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3 && !VACIAS.has(w));
}

/**
 * El contexto de IA-20: las fuentes que comparten más palabras con la pregunta (el título cuenta doble), hasta 6 y
 * hasta 12 000 caracteres en total; una fuente que no cabe entera se recorta. Una fuente sin ninguna palabra en común
 * no entra: sin fuentes, la API responde «no lo sé» sin llamar a la IA (CP-133).
 */
export function seleccionarFuentes(pregunta: string, fuentes: readonly FuenteChat[], max: number = LIMITES_CHAT.fuentes, caracteres: number = LIMITES_CHAT.caracteresContexto): FuenteChat[] {
  const q = new Set(palabras(pregunta));
  if (!q.size) return [];
  const puntuadas = fuentes.map((f, i) => {
    const titulo = new Set(palabras(f.titulo));
    const cuerpo = new Set(palabras(f.texto));
    let p = 0;
    for (const w of q) p += (titulo.has(w) ? 2 : 0) + (cuerpo.has(w) ? 1 : 0);
    return { f, p, i };
  }).filter((x) => x.p > 0).sort((a, b) => b.p - a.p || a.i - b.i);
  const r: FuenteChat[] = [];
  let quedan = caracteres;
  for (const { f } of puntuadas) {
    if (r.length >= max || quedan <= 0) break;
    const largo = f.titulo.length + f.texto.length;
    if (largo <= quedan) { r.push(f); quedan -= largo; continue; }
    const cabe = quedan - f.titulo.length;
    if (cabe >= 200) { r.push({ ...f, texto: f.texto.slice(0, cabe) }); quedan = 0; }
  }
  return r;
}

// ── Conversación ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface MensajeChat {
  de: 'visitante' | 'bot';
  texto: string;
  en: string;
  /** Solo en el bot: los ids de las fuentes citadas. */
  fuentes?: string[];
  /** Solo en el bot: los botones que ofreció. */
  acciones?: AccionRapida[];
}

export interface EntradaChat { idioma: IdiomaChat; mensaje: string; accion: 'agendar_demo' | 'hablar_persona' | null; conversacionId: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lo que envía el visitante: el mensaje (1 a 500 caracteres) o, en vez del mensaje, la respuesta rápida «agendar_demo»
 * o «hablar_persona» que el navegador ya resolvió (se registra sin llamar a la IA); el idioma y, si sigue una
 * conversación, su id.
 */
export function validarEntradaChat(entrada: unknown): { ok: true; entrada: EntradaChat } | { ok: false; errores: ErrorCampo[] } {
  const e = obj(entrada);
  const errores: ErrorCampo[] = [];
  const accion = e.accion === undefined || e.accion === null || e.accion === '' ? null : e.accion;
  if (accion !== null && !(ACCIONES_LOCALES as readonly unknown[]).includes(accion)) errores.push({ campo: 'accion', mensaje: 'La acción es agendar_demo o hablar_persona' });
  const mensaje = typeof e.mensaje === 'string' ? e.mensaje.replace(/\s+/g, ' ').trim() : '';
  if (accion === null && !mensaje) errores.push({ campo: 'mensaje', mensaje: 'Escribe tu pregunta' });
  else if (mensaje.length > LIMITES_CHAT.mensaje) errores.push({ campo: 'mensaje', mensaje: `Hasta ${LIMITES_CHAT.mensaje} caracteres` });
  const idioma = e.idioma === undefined ? 'es' : e.idioma;
  if (!esIdiomaChat(idioma)) errores.push({ campo: 'idioma', mensaje: 'El idioma es es o en' });
  let conversacionId: string | null = null;
  if (e.conversacionId !== undefined && e.conversacionId !== null && e.conversacionId !== '') {
    if (typeof e.conversacionId !== 'string' || !UUID.test(e.conversacionId)) errores.push({ campo: 'conversacionId', mensaje: 'La conversación no es válida' });
    else conversacionId = e.conversacionId.toLowerCase();
  }
  return errores.length ? { ok: false, errores } : { ok: true, entrada: { idioma: idioma as IdiomaChat, mensaje: accion ? '' : mensaje, accion: accion as EntradaChat['accion'], conversacionId } };
}

/** Un id de conversación que llega del navegador (en la reserva o el lead del chat): solo si tiene la forma de un uuid. */
export const idConversacion = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null);

/** Lo que el visitante ya escribió en la conversación: al llegar a 20, el chat solo ofrece agendar o una persona. */
export const mensajesDelVisitante = (m: readonly MensajeChat[]) => m.filter((x) => x.de === 'visitante').length;

export function leerMensajes(v: unknown): MensajeChat[] {
  if (!Array.isArray(v)) return [];
  return v.filter((m): m is MensajeChat => !!m && typeof m === 'object' && ((m as MensajeChat).de === 'visitante' || (m as MensajeChat).de === 'bot') && typeof (m as MensajeChat).texto === 'string');
}

/** El resultado sube y nunca baja (una demo agendada sigue siendo demo si después pregunta otra cosa). */
export function subirResultado(actual: string, nuevo: ResultadoConversacion): ResultadoConversacion {
  const a = esResultadoConversacion(actual) ? actual : 'sin_conversion';
  return RANGO_RESULTADO[nuevo] > RANGO_RESULTADO[a] ? nuevo : a;
}

export const expiraEn = (ahora: Date) => new Date(ahora.getTime() + LIMITES_CHAT.retencionDias * DIA_MS);

// ── IA-20 y la respuesta controlada (CP-133) ─────────────────────────────────────────────────────────────────────────

export interface SalidaChatbot { respuesta: string; fuentesCitadas: string[] }

export const TEXTOS_CHAT = {
  es: {
    noSe: 'No tengo ese dato en la información de Aptio. Puedo agendarte una demo o pasarte con una persona del equipo.',
    limite: 'Llegamos al límite de esta conversación. Si quieres seguir, agenda una demo o habla con una persona del equipo.',
    fueraDeHorario: 'Ahora no hay nadie del equipo en línea. Déjanos tu correo y tu pregunta: te respondemos el siguiente día hábil.',
    enHorario: 'Puedes escribirnos por WhatsApp o dejarnos tu correo y tu pregunta.',
    sinWhatsapp: 'Déjanos tu correo y tu pregunta: te respondemos en el horario de atención.',
  },
  en: {
    noSe: "I don't have that information about Aptio. I can book you a demo or connect you with someone from the team.",
    limite: "We've reached the limit of this conversation. To continue, book a demo or talk to someone from the team.",
    fueraDeHorario: "No one from the team is online right now. Leave us your email and question: we'll reply on the next business day.",
    enHorario: 'You can message us on WhatsApp or leave us your email and question.',
    sinWhatsapp: "Leave us your email and question: we'll reply during business hours.",
  },
} as const;

export interface RespuestaChat { texto: string; fuentes: FuenteCitada[]; acciones: AccionRapida[]; controlada: boolean }
export interface FuenteCitada { id: string; titulo: string; ruta?: string }

export function respuestaControlada(idioma: IdiomaChat, motivo: 'noSe' | 'limite' = 'noSe'): RespuestaChat {
  return { texto: TEXTOS_CHAT[idioma][motivo], fuentes: [], acciones: ['agendar_demo', 'hablar_persona'], controlada: true };
}

/** La salida antes de validarla: espacios recortados y fuentes sin repetir. */
export function prepararSalidaChatbot(salida: unknown): unknown {
  const o = salida as { respuesta?: unknown; fuentesCitadas?: unknown } | null;
  if (!o || typeof o !== 'object') return salida;
  return {
    ...o,
    ...(typeof o.respuesta === 'string' ? { respuesta: o.respuesta.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() } : {}),
    ...(Array.isArray(o.fuentesCitadas) ? { fuentesCitadas: [...new Set(o.fuentesCitadas)] } : {}),
  };
}

/** Lo que el esquema JSON no cubre: la respuesta es texto plano, sin etiquetas HTML. */
export function erroresSalidaChatbot(salida: SalidaChatbot): string[] {
  return esTextoPlano(salida.respuesta) ? [] : ['/respuesta solo admite texto, sin etiquetas HTML'];
}

/**
 * CP-133 · La respuesta que ve el visitante. Solo vale si cita al menos una fuente del contexto que se le dio; si no
 * cita ninguna, o cita una que no estaba (inventada), se reemplaza por la respuesta controlada con «Agendar demo» y
 * «Hablar con una persona».
 */
export function respuestaDeSalida(salida: SalidaChatbot, contexto: readonly FuenteChat[], idioma: IdiomaChat): RespuestaChat {
  const porId = new Map(contexto.map((f) => [f.id, f]));
  const citadas = salida.fuentesCitadas;
  if (!citadas.length || !citadas.every((id) => porId.has(id)) || !salida.respuesta.trim()) return respuestaControlada(idioma);
  return {
    texto: salida.respuesta,
    fuentes: citadas.map((id) => { const f = porId.get(id)!; return { id, titulo: f.titulo, ...(f.ruta ? { ruta: f.ruta } : {}) }; }),
    acciones: [],
    controlada: false,
  };
}

// ── Lo que se sirve al sitio ─────────────────────────────────────────────────────────────────────────────────────────

export interface RapidaPublica { id: string; texto: string; accion: AccionRapida }
export interface ChatbotPublico {
  nombre: string;
  idioma: IdiomaChat;
  saludo: string;
  rapidas: RapidaPublica[];
  /** Si una persona atiende ahora (hora de Lima). */
  enHorario: boolean;
  horario: string;
  whatsapp: string | null;
  objetivo: ObjetivoChatbot;
}

/** El chatbot de un idioma para `_chatbot.json`: en producción sin respuestas rápidas ficticias; en inglés, solo las traducidas. */
export function chatbotPublico(
  a: AjustesChatbot,
  rapidas: readonly { id: string; textoEs: string; textoEn: string; accion: string; visible: boolean; orden: number; ficticio: boolean }[],
  d: { idioma: IdiomaChat; entorno: EntornoSitio; ahora: Date; whatsapp: string | null },
): ChatbotPublico {
  const visibles = rapidas.filter((r) => r.visible && esAccionRapida(r.accion) && !(d.entorno === 'produccion' && r.ficticio))
    .sort((x, y) => x.orden - y.orden)
    .map((r) => ({ id: r.id, texto: d.idioma === 'en' ? r.textoEn : r.textoEs, accion: r.accion as AccionRapida }))
    .filter((r) => r.texto)
    .slice(0, LIMITES_CHAT.rapidas);
  return {
    nombre: a.nombre,
    idioma: d.idioma,
    saludo: (d.idioma === 'en' ? a.saludoEn : a.saludoEs) || (d.idioma === 'en' ? `Hi, I'm ${a.nombre}. How can I help?` : `Hola, soy ${a.nombre}. ¿En qué te ayudo?`),
    rapidas: visibles,
    enHorario: enHorario(a, d.ahora),
    horario: textoHorario(a, d.idioma),
    whatsapp: d.whatsapp,
    objetivo: a.objetivo,
  };
}
