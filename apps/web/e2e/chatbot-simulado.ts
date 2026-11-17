// HU-1604 · El chatbot simulado, con las mismas reglas que la API (las funciones de @aptio/schema/chatbot): el panel
// Captación › Chatbot (PNT-32), `GET /s/_chatbot.json` y `POST /api/v1/publico/chat`. IA-20 responde como el modo
// simulado de @aptio/ai: cita la primera fuente del contexto con su texto; sin fuentes, «no lo sé» (CP-133).
import {
  AJUSTES_CHATBOT_POR_DEFECTO, type AjustesChatbot, chatbotPublico, enHorario, expiraEn, fuentesDeInstantanea, fuentesManuales, leerMensajes, LIMITES_CHAT, type MensajeChat,
  mensajesDelVisitante, respuestaControlada, respuestaDeSalida, RESULTADOS_CONVERSACION, type ResultadoConversacion, seleccionarFuentes, subirResultado, textoHorario,
  validarAjustesChatbot, validarEntradaChat, validarFuente, validarRapida, idConversacion,
} from '@aptio/schema/chatbot';
import type { Instantanea } from '@aptio/schema/sitio-versiones';

export interface RapidaSim { id: string; textoEs: string; textoEn: string; accion: 'consulta_ia' | 'agendar_demo' | 'hablar_persona'; visible: boolean; orden: number; ficticio: boolean }
export interface FuenteSim { id: string; titulo: string; contenido: string; idioma: 'es' | 'en'; visible: boolean; actualizadoEn: string }
export interface ConversacionSim { id: string; idioma: 'es' | 'en'; resultado: ResultadoConversacion; mensajes: MensajeChat[]; creadoEn: string; actualizadoEn: string; expiraEn: string }
export interface ChatbotSitioSim { ajustes?: Partial<AjustesChatbot>; rapidas?: RapidaSim[]; fuentes?: FuenteSim[]; conversaciones?: ConversacionSim[] }

/** Lo que las pruebas leen después: cada mensaje que llegó a `POST /publico/chat` y si «llamó» a la IA. */
export const chatsSim: { cuerpo: Record<string, unknown>; ia: boolean }[] = [];

type Respuesta = { status: number; body?: unknown };
type Error422 = { campo: string; mensaje: string };
const noValido = (errores: Error422[]): Respuesta => ({ status: 422, body: { codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores } });
const noExiste = (mensaje: string): Respuesta => ({ status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje } });

export function crearChatbotSim(inicial: ChatbotSitioSim, entorno: 'pruebas' | 'produccion', instantanea: () => Instantanea | undefined, whatsapp: () => string | null) {
  let ajustes: AjustesChatbot = { ...AJUSTES_CHATBOT_POR_DEFECTO, ...inicial.ajustes };
  let rapidas: RapidaSim[] = (inicial.rapidas ?? []).map((r, orden) => ({ ...r, orden }));
  let fuentes: FuenteSim[] = (inicial.fuentes ?? []).map((f) => ({ ...f }));
  const conversaciones: ConversacionSim[] = (inicial.conversaciones ?? []).map((c) => ({ ...c, mensajes: [...c.mensajes] }));
  let secuencia = 900;
  const nuevoId = (bloque: string) => `00000000-0000-4000-${bloque}-${String(++secuencia).padStart(12, '0')}`;
  const ordenar = () => { rapidas = rapidas.map((r, orden) => ({ ...r, orden })); };
  const base = (idioma: 'es' | 'en') => {
    const f = instantanea() ? fuentesDeInstantanea(instantanea()!, idioma, entorno) : [];
    return { paginas: f.filter((x) => x.tipo === 'pagina').length, preguntas: f.filter((x) => x.tipo === 'pregunta').length };
  };
  const ver = () => {
    const es = base('es');
    const en = base('en');
    return { ajustes, horario: textoHorario(ajustes), enHorario: enHorario(ajustes, new Date()), rapidas, fuentes, base: { paginasEs: es.paginas, paginasEn: en.paginas, preguntasEs: es.preguntas, preguntasEn: en.preguntas } };
  };

  return {
    conversaciones,
    /** `GET /s/_chatbot.json`. */
    publico(q: URLSearchParams) {
      if (!ajustes.visible) return { visible: false };
      return { visible: true, ...chatbotPublico(ajustes, rapidas, { idioma: q.get('idioma') === 'en' ? 'en' : 'es', entorno, ahora: new Date(), whatsapp: whatsapp() }) };
    },
    /** La reserva o el lead del chat: sube el resultado de la conversación. */
    marcar(id: unknown, resultado: ResultadoConversacion) {
      const c = conversaciones.find((x) => x.id === idConversacion(id));
      if (c) c.resultado = subirResultado(c.resultado, resultado);
    },
    /** `POST /publico/chat`. */
    conversar(cuerpo: Record<string, unknown>): Respuesta {
      const v = validarEntradaChat(cuerpo);
      if (!v.ok) { chatsSim.push({ cuerpo, ia: false }); return noValido(v.errores); }
      if (!ajustes.visible) return { status: 404, body: { codigo: 'CHATBOT_OCULTO', mensaje: 'El chat no está disponible' } };
      const e = v.entrada;
      const ahora = new Date().toISOString();
      let c = conversaciones.find((x) => x.id === e.conversacionId);
      if (!c) {
        c = { id: nuevoId('9d00'), idioma: e.idioma, resultado: 'sin_conversion', mensajes: [], creadoEn: ahora, actualizadoEn: ahora, expiraEn: expiraEn(new Date()).toISOString() };
        conversaciones.unshift(c);
      }
      c.actualizadoEn = ahora;
      const atiende = enHorario(ajustes, new Date());
      if (e.accion) {
        const r = rapidas.find((x) => x.accion === e.accion);
        c.mensajes.push({ de: 'visitante', texto: r ? r.textoEs : e.accion, en: ahora });
        if (e.accion === 'hablar_persona') c.resultado = subirResultado(c.resultado, 'persona');
        chatsSim.push({ cuerpo, ia: false });
        return { status: 200, body: { conversacionId: c.id, respuesta: null, quedan: LIMITES_CHAT.mensajesVisitante - mensajesDelVisitante(c.mensajes), enHorario: atiende } };
      }
      let respuesta;
      let ia = false;
      if (mensajesDelVisitante(c.mensajes) >= LIMITES_CHAT.mensajesVisitante) respuesta = respuestaControlada(e.idioma, 'limite');
      else {
        c.mensajes.push({ de: 'visitante', texto: e.mensaje, en: ahora });
        const inst = instantanea();
        const contexto = seleccionarFuentes(e.mensaje, [...(inst ? fuentesDeInstantanea(inst, e.idioma, entorno) : []), ...fuentesManuales(fuentes, e.idioma)]);
        ia = contexto.length > 0;
        respuesta = contexto.length ? respuestaDeSalida({ respuesta: contexto[0]!.texto.split('\n')[0]!.slice(0, 300), fuentesCitadas: [contexto[0]!.id] }, contexto, e.idioma) : respuestaControlada(e.idioma);
        if (!respuesta.controlada) c.resultado = subirResultado(c.resultado, 'respuesta');
      }
      c.mensajes.push({ de: 'bot', texto: respuesta.texto, en: ahora, ...(respuesta.fuentes.length ? { fuentes: respuesta.fuentes.map((f) => f.id) } : {}), ...(respuesta.acciones.length ? { acciones: respuesta.acciones } : {}) });
      chatsSim.push({ cuerpo, ia });
      return { status: 200, body: { conversacionId: c.id, respuesta, quedan: Math.max(0, LIMITES_CHAT.mensajesVisitante - mensajesDelVisitante(c.mensajes)), enHorario: atiende } };
    },
    /** Captación › Chatbot. */
    panel(ruta: string, metodo: string, cuerpo: Record<string, unknown>, q: URLSearchParams): Respuesta {
      if (ruta === '/captacion/chatbot' && metodo === 'GET') return { status: 200, body: ver() };
      if (ruta === '/captacion/chatbot' && metodo === 'PATCH') {
        const r = validarAjustesChatbot(ajustes, cuerpo);
        if (!r.ok) return noValido(r.errores);
        ajustes = r.ajustes;
        return { status: 200, body: ajustes };
      }
      if (ruta === '/captacion/chatbot/conversaciones' && metodo === 'GET') {
        const vigentes = conversaciones.filter((c) => Date.parse(c.expiraEn) > Date.now());
        const filtro = q.get('resultado');
        const porResultado = Object.fromEntries(RESULTADOS_CONVERSACION.map((r) => [r, vigentes.filter((c) => c.resultado === r).length]).filter(([, n]) => n));
        return { status: 200, body: { conversaciones: vigentes.filter((c) => !filtro || c.resultado === filtro).map((c) => ({ ...c, mensajes: leerMensajes(c.mensajes) })), total: vigentes.length, porResultado } };
      }
      if (ruta === '/captacion/chatbot/rapidas' && metodo === 'POST') {
        const r = validarRapida(cuerpo);
        if (!r.ok) return noValido(r.errores);
        const x: RapidaSim = { ...r.datos, id: nuevoId('9e00'), visible: cuerpo.visible !== false, ficticio: cuerpo.ficticio === true, orden: rapidas.length };
        rapidas.push(x);
        return { status: 201, body: x };
      }
      if (ruta === '/captacion/chatbot/rapidas/orden' && metodo === 'PUT') {
        const ids = cuerpo.ids as string[];
        if (new Set(ids).size !== rapidas.length || !rapidas.every((r) => ids.includes(r.id))) return { status: 422, body: { codigo: 'ORDEN_INCOMPLETO', mensaje: 'El orden debe incluir cada respuesta rápida una sola vez' } };
        rapidas = ids.map((id, orden) => ({ ...rapidas.find((r) => r.id === id)!, orden }));
        return { status: 200, body: rapidas };
      }
      const mr = ruta.match(/^\/captacion\/chatbot\/rapidas\/([0-9a-f-]{36})$/);
      if (mr) {
        const x = rapidas.find((r) => r.id === mr[1]);
        if (!x) return noExiste('La respuesta rápida no existe');
        if (metodo === 'DELETE') { rapidas = rapidas.filter((r) => r !== x); ordenar(); return { status: 204 }; }
        const r = validarRapida(cuerpo, x);
        if (!r.ok) return noValido(r.errores);
        Object.assign(x, r.datos, typeof cuerpo.visible === 'boolean' ? { visible: cuerpo.visible } : {}, typeof cuerpo.ficticio === 'boolean' ? { ficticio: cuerpo.ficticio } : {});
        return { status: 200, body: x };
      }
      if (ruta === '/captacion/chatbot/fuentes' && metodo === 'POST') {
        const r = validarFuente(cuerpo);
        if (!r.ok) return noValido(r.errores);
        const x: FuenteSim = { ...r.datos, id: nuevoId('9f00'), visible: cuerpo.visible !== false, actualizadoEn: new Date().toISOString() };
        fuentes.push(x);
        return { status: 201, body: x };
      }
      const mf = ruta.match(/^\/captacion\/chatbot\/fuentes\/([0-9a-f-]{36})$/);
      if (mf) {
        const x = fuentes.find((f) => f.id === mf[1]);
        if (!x) return noExiste('La fuente no existe');
        if (metodo === 'DELETE') { fuentes = fuentes.filter((f) => f !== x); return { status: 204 }; }
        const r = validarFuente(cuerpo, x);
        if (!r.ok) return noValido(r.errores);
        Object.assign(x, r.datos, typeof cuerpo.visible === 'boolean' ? { visible: cuerpo.visible } : {}, { actualizadoEn: new Date().toISOString() });
        return { status: 200, body: x };
      }
      return noExiste('Ruta del chatbot desconocida');
    },
  };
}
