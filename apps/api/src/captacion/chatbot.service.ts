import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ejecutarTarea, fuentesChatParaPrompt, neutralizar, proveedorDesdeEntorno, proveedorSimulado, type ProveedorTexto, type ResultadoTarea, SalidaNoValida, TARIFAS } from '@aptio/ai';
import { leerAjustesSitio, Prisma, type SitioChatFuente, type SitioChatRapida, type SitioConversacion, ultimaVersion } from '@aptio/db';
import {
  AJUSTES_CHATBOT_POR_DEFECTO, type AjustesChatbot, chatbotPublico, type ChatbotPublico, enHorario, erroresSalidaChatbot, ETIQUETA_OBJETIVO, ETIQUETA_TONO, expiraEn,
  fuentesDeInstantanea, fuentesManuales, ID_CHATBOT, type IdiomaChat, leerMensajes, LIMITES_CHAT, type MensajeChat, mensajesDelVisitante, prepararSalidaChatbot,
  respuestaControlada, respuestaDeSalida, type RespuestaChat, type ResultadoConversacion, type SalidaChatbot, seleccionarFuentes, subirResultado, TAREA_CHATBOT, textoHorario,
  validarAjustesChatbot, validarEntradaChat, validarFuente, validarRapida, esObjetivoChatbot, esTonoChatbot, idConversacion,
} from '@aptio/schema/chatbot';
import { CODIGO_LIMITE_GASTO, inicioMesLima, tipoDeTareaIA } from '@aptio/schema/conexiones';
import { ajustesPublicados, enlaceWhatsapp, NOMBRE_POR_DEFECTO } from '@aptio/schema/sitio-ajustes';
import type { UsuarioSesion } from '../comun/roles.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { entornoActual } from '../sitio/entorno-sitio.js';
import type {
  AjustesChatbotCambioDto, AjustesChatbotDto, ChatbotDto, ChatRespuestaDto, ConsultaConversacionesDto, ConversacionDto, ConversacionesDto, FuenteChatDto, FuenteChatEntradaDto,
  RapidaChatDto, RapidaChatEntradaDto,
} from './chatbot.dto.js';

/** Mensajes a `POST /publico/chat` por IP y por minuto (en memoria: la IP no se guarda). */
export const LIMITE_CHAT = { envios: LIMITES_CHAT.porMinuto, ventanaMs: 60_000 } as const;
/** Los últimos mensajes que van a IA-20 como historial. */
const HISTORIAL = 6;

const noValido = (errores: { campo: string; mensaje: string }[]) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });
const presentes = <T extends object>(dto: T): Partial<T> => Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as Partial<T>;

const aRapidaDto = (r: SitioChatRapida): RapidaChatDto => ({ id: r.id, textoEs: r.textoEs, textoEn: r.textoEn, accion: r.accion, visible: r.visible, orden: r.orden, ficticio: r.ficticio });
const aFuenteDto = (f: SitioChatFuente): FuenteChatDto => ({ id: f.id, titulo: f.titulo, contenido: f.contenido, idioma: f.idioma, visible: f.visible, actualizadoEn: f.actualizadoEn.toISOString() });
const aConversacionDto = (c: SitioConversacion): ConversacionDto => ({
  id: c.id, idioma: c.idioma, resultado: c.resultado, mensajes: leerMensajes(c.mensajes), creadoEn: c.creadoEn.toISOString(), actualizadoEn: c.actualizadoEn.toISOString(), expiraEn: c.expiraEn.toISOString(),
});

/** Lo que ya se sabe de una llamada a IA-20 cuando no llega una respuesta válida: la respuesta controlada y el motivo. */
type Fallo = 'sin_fuentes' | 'limite_gasto' | 'espera' | 'no_valida' | 'no_disponible' | 'sin_cita';

/**
 * HU-1604 · Chatbot del sitio (REQ-077, PNT-32, RN-17-4, CP-133, CP-134). El panel configura nombre, saludo, tono,
 * objetivo y horario de atención, las respuestas rápidas y las fuentes manuales, y lee las conversaciones (90 días, sin
 * IP ni datos personales). El sitio lee el chatbot en vivo y pregunta con `POST /publico/chat`: el selector léxico elige
 * hasta 6 fuentes del sitio publicado y de las fuentes manuales, IA-20 responde citándolas y, si no cita una fuente del
 * contexto, si vence la espera de 20 s o si el gasto llegó al límite, responde «no lo sé» con «Agendar demo» y «Hablar
 * con una persona». La reserva y el lead del chat pasan por sus propias entradas con vía «chatbot».
 */
@Injectable()
export class ChatbotService {
  private readonly log = new Logger('Chatbot');
  private readonly ventanas = new Map<string, { inicio: number; cuenta: number }>();
  /** El proveedor de texto del entorno (simulado sin credenciales). Las pruebas lo reemplazan para forzar respuestas. */
  proveedor: ProveedorTexto = proveedorDesdeEntorno(process.env, () => proveedorSimulado());
  /** Lo que espera la respuesta de la IA (las pruebas lo acortan). */
  esperaIaMs: number = LIMITES_CHAT.esperaIaMs;

  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private auditar(u: UsuarioSesion, accion: string, entidad: string, entidadId: string | null, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({ data: { usuarioId: u.id, organizacionId: null, accion, entidad, entidadId, datos: datos as Prisma.InputJsonValue } });
  }

  /** Vacía el límite por IP (pruebas). */
  reiniciarLimite(): void {
    this.ventanas.clear();
  }

  private contar(ip: string, ahora: number): void {
    let v = this.ventanas.get(ip);
    if (!v || ahora - v.inicio >= LIMITE_CHAT.ventanaMs) {
      v = { inicio: ahora, cuenta: 0 };
      this.ventanas.set(ip, v);
      if (this.ventanas.size > 10_000) for (const [k, x] of this.ventanas) if (ahora - x.inicio >= LIMITE_CHAT.ventanaMs) this.ventanas.delete(k);
    }
    v.cuenta += 1;
    if (v.cuenta > LIMITE_CHAT.envios) {
      throw new HttpException({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Escribiste varios mensajes seguidos: espera un minuto e intenta de nuevo', reintentarEn: Math.ceil((v.inicio + LIMITE_CHAT.ventanaMs - ahora) / 1000) }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // ── Ajustes ────────────────────────────────────────────────────────────────────────────────────────────────────────

  async ajustes(): Promise<AjustesChatbot> {
    const f = await this.bd.sitioChatbot.findUnique({ where: { id: ID_CHATBOT } });
    if (!f) return { ...AJUSTES_CHATBOT_POR_DEFECTO, diasAtencion: [...AJUSTES_CHATBOT_POR_DEFECTO.diasAtencion] };
    return {
      nombre: f.nombre, saludoEs: f.saludoEs, saludoEn: f.saludoEn, tono: esTonoChatbot(f.tono) ? f.tono : 'cercano', objetivo: esObjetivoChatbot(f.objetivo) ? f.objetivo : 'agendar_demo',
      horarioInicio: f.horarioInicio, horarioFin: f.horarioFin, diasAtencion: f.diasAtencion, visible: f.visible,
    };
  }

  private rapidasOrdenadas() {
    return this.bd.sitioChatRapida.findMany({ orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }] });
  }

  async ver(ahora = new Date()): Promise<ChatbotDto> {
    const [ajustes, rapidas, fuentes, version] = await Promise.all([
      this.ajustes(), this.rapidasOrdenadas(), this.bd.sitioChatFuente.findMany({ orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }] }), ultimaVersion(this.bd),
    ]);
    const entorno = entornoActual();
    const base = (idioma: IdiomaChat) => {
      const f = version ? fuentesDeInstantanea(version.instantanea, idioma, entorno) : [];
      return { paginas: f.filter((x) => x.tipo === 'pagina').length, preguntas: f.filter((x) => x.tipo === 'pregunta').length };
    };
    const es = base('es');
    const en = base('en');
    return {
      ajustes, horario: textoHorario(ajustes), enHorario: enHorario(ajustes, ahora), rapidas: rapidas.map(aRapidaDto), fuentes: fuentes.map(aFuenteDto),
      base: { paginasEs: es.paginas, paginasEn: en.paginas, preguntasEs: es.preguntas, preguntasEn: en.preguntas },
    };
  }

  async cambiarAjustes(u: UsuarioSesion, dto: AjustesChatbotCambioDto): Promise<AjustesChatbotDto> {
    const actual = await this.ajustes();
    const r = validarAjustesChatbot(actual, presentes(dto));
    if (!r.ok) throw noValido(r.errores);
    const a = r.ajustes;
    await this.bd.sitioChatbot.upsert({ where: { id: ID_CHATBOT }, create: { id: ID_CHATBOT, ...a }, update: a });
    const cambios = Object.keys(presentes(dto));
    await this.auditar(u, a.visible !== actual.visible ? (a.visible ? 'CHATBOT_MOSTRADO' : 'CHATBOT_OCULTADO') : 'CHATBOT_AJUSTES_CAMBIADOS', 'SitioChatbot', ID_CHATBOT, { campos: cambios });
    return a;
  }

  // ── Respuestas rápidas ─────────────────────────────────────────────────────────────────────────────────────────────

  private async buscarRapida(id: string): Promise<SitioChatRapida> {
    const r = await this.bd.sitioChatRapida.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La respuesta rápida no existe' });
    return r;
  }

  async crearRapida(u: UsuarioSesion, dto: RapidaChatEntradaDto): Promise<RapidaChatDto> {
    const r = validarRapida(dto);
    if (!r.ok) throw noValido(r.errores);
    const total = await this.bd.sitioChatRapida.count();
    if (total >= 50) throw new UnprocessableEntityException({ codigo: 'DEMASIADAS_RAPIDAS', mensaje: 'Puedes tener hasta 50 respuestas rápidas' });
    const fila = await this.bd.sitioChatRapida.create({ data: { ...r.datos, visible: dto.visible ?? true, ficticio: dto.ficticio ?? false, orden: total } });
    await this.auditar(u, 'CHATBOT_RAPIDA_CREADA', 'SitioChatRapida', fila.id, { texto: fila.textoEs, accion: fila.accion });
    return aRapidaDto(fila);
  }

  async cambiarRapida(u: UsuarioSesion, id: string, dto: RapidaChatEntradaDto): Promise<RapidaChatDto> {
    const actual = await this.buscarRapida(id);
    const r = validarRapida(presentes(dto), { textoEs: actual.textoEs, textoEn: actual.textoEn, accion: actual.accion as 'consulta_ia' });
    if (!r.ok) throw noValido(r.errores);
    const fila = await this.bd.sitioChatRapida.update({ where: { id }, data: { ...r.datos, ...(dto.visible !== undefined ? { visible: dto.visible } : {}), ...(dto.ficticio !== undefined ? { ficticio: dto.ficticio } : {}) } });
    await this.auditar(u, 'CHATBOT_RAPIDA_CAMBIADA', 'SitioChatRapida', id, { campos: Object.keys(presentes(dto)) });
    return aRapidaDto(fila);
  }

  async borrarRapida(u: UsuarioSesion, id: string): Promise<void> {
    const r = await this.buscarRapida(id);
    await this.bd.sitioChatRapida.delete({ where: { id } });
    const resto = await this.rapidasOrdenadas();
    await this.bd.$transaction(resto.map((x, orden) => this.bd.sitioChatRapida.update({ where: { id: x.id }, data: { orden } })));
    await this.auditar(u, 'CHATBOT_RAPIDA_BORRADA', 'SitioChatRapida', id, { texto: r.textoEs });
  }

  async ordenarRapidas(u: UsuarioSesion, ids: string[]): Promise<RapidaChatDto[]> {
    const todas = await this.bd.sitioChatRapida.findMany({ select: { id: true } });
    if (new Set(ids).size !== ids.length || ids.length !== todas.length || !todas.every((t) => ids.includes(t.id))) {
      throw new UnprocessableEntityException({ codigo: 'ORDEN_INCOMPLETO', mensaje: 'El orden debe incluir cada respuesta rápida una sola vez' });
    }
    await this.bd.$transaction(ids.map((id, orden) => this.bd.sitioChatRapida.update({ where: { id }, data: { orden } })));
    await this.auditar(u, 'CHATBOT_RAPIDAS_ORDENADAS', 'SitioChatRapida', null, { ids });
    return (await this.rapidasOrdenadas()).map(aRapidaDto);
  }

  // ── Fuentes manuales ───────────────────────────────────────────────────────────────────────────────────────────────

  private async buscarFuente(id: string): Promise<SitioChatFuente> {
    const f = await this.bd.sitioChatFuente.findUnique({ where: { id } });
    if (!f) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La fuente no existe' });
    return f;
  }

  async crearFuente(u: UsuarioSesion, dto: FuenteChatEntradaDto): Promise<FuenteChatDto> {
    const r = validarFuente(dto);
    if (!r.ok) throw noValido(r.errores);
    if ((await this.bd.sitioChatFuente.count()) >= LIMITES_CHAT.fuentesManuales) {
      throw new UnprocessableEntityException({ codigo: 'DEMASIADAS_FUENTES', mensaje: `Puedes tener hasta ${LIMITES_CHAT.fuentesManuales} fuentes manuales` });
    }
    const f = await this.bd.sitioChatFuente.create({ data: { ...r.datos, visible: dto.visible ?? true } });
    await this.auditar(u, 'CHATBOT_FUENTE_CREADA', 'SitioChatFuente', f.id, { titulo: f.titulo, idioma: f.idioma });
    return aFuenteDto(f);
  }

  async cambiarFuente(u: UsuarioSesion, id: string, dto: FuenteChatEntradaDto): Promise<FuenteChatDto> {
    const actual = await this.buscarFuente(id);
    const r = validarFuente(presentes(dto), { titulo: actual.titulo, contenido: actual.contenido, idioma: actual.idioma === 'en' ? 'en' : 'es' });
    if (!r.ok) throw noValido(r.errores);
    const f = await this.bd.sitioChatFuente.update({ where: { id }, data: { ...r.datos, ...(dto.visible !== undefined ? { visible: dto.visible } : {}) } });
    await this.auditar(u, 'CHATBOT_FUENTE_CAMBIADA', 'SitioChatFuente', id, { campos: Object.keys(presentes(dto)) });
    return aFuenteDto(f);
  }

  async borrarFuente(u: UsuarioSesion, id: string): Promise<void> {
    const f = await this.buscarFuente(id);
    await this.bd.sitioChatFuente.delete({ where: { id } });
    await this.auditar(u, 'CHATBOT_FUENTE_BORRADA', 'SitioChatFuente', id, { titulo: f.titulo });
  }

  // ── Conversaciones ─────────────────────────────────────────────────────────────────────────────────────────────────

  /** Borra las conversaciones vencidas (más de 90 días). Lo llaman el panel y cada conversación nueva. */
  async borrarVencidas(ahora = new Date()): Promise<number> {
    const r = await this.bd.sitioConversacion.deleteMany({ where: { expiraEn: { lte: ahora } } });
    return r.count;
  }

  async conversaciones(q: ConsultaConversacionesDto, ahora = new Date()): Promise<ConversacionesDto> {
    await this.borrarVencidas(ahora);
    const vigentes = { expiraEn: { gt: ahora } };
    const [filas, grupos] = await Promise.all([
      this.bd.sitioConversacion.findMany({ where: { ...vigentes, ...(q.resultado ? { resultado: q.resultado } : {}) }, orderBy: [{ actualizadoEn: 'desc' }, { id: 'asc' }], take: q.limite ?? 50 }),
      this.bd.sitioConversacion.groupBy({ by: ['resultado'], where: vigentes, _count: { _all: true } }),
    ]);
    const porResultado = Object.fromEntries(grupos.map((g) => [g.resultado, g._count._all]));
    return { conversaciones: filas.map(aConversacionDto), total: grupos.reduce((n, g) => n + g._count._all, 0), porResultado };
  }

  /**
   * La conversión que llega por otra entrada (la reserva o el lead del chat, con su `conversacionId`): sube el
   * resultado de la conversación. Una conversación que no existe se ignora; un error no corta la reserva ni el lead.
   */
  async marcar(conversacionId: unknown, resultado: ResultadoConversacion): Promise<void> {
    const id = idConversacion(conversacionId);
    if (!id) return;
    try {
      const c = await this.bd.sitioConversacion.findUnique({ where: { id }, select: { resultado: true } });
      if (!c) return;
      const nuevo = subirResultado(c.resultado, resultado);
      if (nuevo !== c.resultado) await this.bd.sitioConversacion.update({ where: { id }, data: { resultado: nuevo } });
    } catch (e) {
      this.log.warn(`No se pudo marcar la conversación: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Público ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** `GET /s/_chatbot.json`: en vivo; si el chatbot está oculto, solo `{ visible: false }`. */
  async publico(idioma: IdiomaChat, ahora = new Date()): Promise<({ visible: true } & ChatbotPublico) | { visible: false }> {
    const a = await this.ajustes();
    if (!a.visible) return { visible: false };
    const [rapidas, sitio] = await Promise.all([this.rapidasOrdenadas(), leerAjustesSitio(this.bd)]);
    const w = sitio ? ajustesPublicados(sitio).whatsapp : null;
    return { visible: true, ...chatbotPublico(a, rapidas, { idioma, entorno: entornoActual(), ahora, whatsapp: w ? enlaceWhatsapp(w) : null }) };
  }

  /**
   * `POST /publico/chat`. 429 con más de 10 mensajes por minuto desde la misma IP; 422 NO_VALIDO; 404 CHATBOT_OCULTO si
   * está apagado. Una respuesta rápida local (agendar o persona) solo se registra. Desde el mensaje 21 del visitante,
   * la respuesta controlada de límite sin IA.
   */
  async conversar(entrada: unknown, ip: string, ahora = new Date()): Promise<ChatRespuestaDto> {
    this.contar(ip, ahora.getTime());
    const v = validarEntradaChat(entrada);
    if (!v.ok) throw noValido(v.errores);
    const e = v.entrada;
    const ajustes = await this.ajustes();
    if (!ajustes.visible) throw new NotFoundException({ codigo: 'CHATBOT_OCULTO', mensaje: 'El chat no está disponible' });
    const atiende = enHorario(ajustes, ahora);

    let conv = e.conversacionId ? await this.bd.sitioConversacion.findFirst({ where: { id: e.conversacionId, expiraEn: { gt: ahora } } }) : null;
    if (!conv) {
      await this.borrarVencidas(ahora).catch(() => 0);
      conv = await this.bd.sitioConversacion.create({ data: { idioma: e.idioma, mensajes: [], expiraEn: expiraEn(ahora) } });
    }
    const mensajes = leerMensajes(conv.mensajes);
    const en = ahora.toISOString();

    if (e.accion) {
      const rapida = (await this.rapidasOrdenadas()).find((r) => r.accion === e.accion);
      const texto = rapida ? (e.idioma === 'en' && rapida.textoEn ? rapida.textoEn : rapida.textoEs) : e.accion === 'agendar_demo' ? 'Agendar demo' : 'Hablar con una persona';
      mensajes.push({ de: 'visitante', texto, en });
      await this.bd.sitioConversacion.update({
        where: { id: conv.id },
        data: { mensajes: mensajes as unknown as Prisma.InputJsonValue, ...(e.accion === 'hablar_persona' ? { resultado: subirResultado(conv.resultado, 'persona') } : {}) },
      });
      return { conversacionId: conv.id, respuesta: null, quedan: Math.max(0, LIMITES_CHAT.mensajesVisitante - mensajesDelVisitante(mensajes)), enHorario: atiende };
    }

    let respuesta: RespuestaChat;
    let resultado: ResultadoConversacion | null = null;
    if (mensajesDelVisitante(mensajes) >= LIMITES_CHAT.mensajesVisitante) {
      respuesta = respuestaControlada(e.idioma, 'limite');
    } else {
      mensajes.push({ de: 'visitante', texto: e.mensaje, en });
      respuesta = await this.responder(e.mensaje, e.idioma, ajustes, mensajes.slice(-HISTORIAL - 1, -1), ahora);
      if (!respuesta.controlada) resultado = 'respuesta';
    }
    const bot: MensajeChat = { de: 'bot', texto: respuesta.texto, en, ...(respuesta.fuentes.length ? { fuentes: respuesta.fuentes.map((f) => f.id) } : {}), ...(respuesta.acciones.length ? { acciones: respuesta.acciones } : {}) };
    mensajes.push(bot);
    await this.bd.sitioConversacion.update({
      where: { id: conv.id },
      data: { mensajes: mensajes as unknown as Prisma.InputJsonValue, ...(resultado ? { resultado: subirResultado(conv.resultado, resultado) } : {}) },
    });
    return { conversacionId: conv.id, respuesta, quedan: Math.max(0, LIMITES_CHAT.mensajesVisitante - mensajesDelVisitante(mensajes)), enHorario: atiende };
  }

  /** Las fuentes del contexto: el sitio publicado en el idioma (sin ficticios en producción) y las fuentes manuales visibles. */
  async fuentesDe(idioma: IdiomaChat) {
    const [version, manuales] = await Promise.all([ultimaVersion(this.bd), this.bd.sitioChatFuente.findMany({ where: { visible: true, idioma }, orderBy: { creadoEn: 'asc' } })]);
    return [...(version ? fuentesDeInstantanea(version.instantanea, idioma, entornoActual()) : []), ...fuentesManuales(manuales, idioma)];
  }

  /** IA-20 con su contexto, o la respuesta controlada (CP-133). Nunca lanza: el visitante siempre recibe una respuesta. */
  private async responder(mensaje: string, idioma: IdiomaChat, ajustes: AjustesChatbot, historial: MensajeChat[], ahora: Date): Promise<RespuestaChat> {
    const fallo = (motivo: Fallo, detalle?: string) => {
      this.log.log(`IA-20 respondió «no lo sé» (${motivo}${detalle ? `: ${detalle}` : ''})`);
      return respuestaControlada(idioma);
    };
    try {
      const contexto = seleccionarFuentes(mensaje, await this.fuentesDe(idioma));
      if (!contexto.length) return fallo('sin_fuentes');
      const tipo = tipoDeTareaIA(TAREA_CHATBOT);
      const conexion = await this.bd.configProveedor.findFirst({ where: { organizacionId: null, tarea: tipo, activo: true } });
      if (await this.limiteAlcanzado(conexion, tipo, ahora)) return fallo('limite_gasto');
      const proveedor = this.conModelo(conexion?.proveedor === this.proveedor.nombre ? conexion.modelo : null);
      const sitio = await leerAjustesSitio(this.bd);
      const trabajo = await this.bd.trabajoIA.create({ data: { organizacionId: null, tarea: TAREA_CHATBOT, tipo, proveedor: proveedor.nombre, modelo: '-', estado: 'EN_CURSO' } });
      const guardar = (r: Omit<ResultadoTarea, 'datos'>, estado: 'COMPLETADO' | 'ERROR', error: string | null) => this.bd.trabajoIA.update({
        where: { id: trabajo.id },
        data: {
          estado, error, proveedor: r.proveedor, modelo: r.modelo, versionPrompt: r.versionPrompt, intentos: r.intentos,
          tokensEntrada: r.consumo.tokensEntrada + r.consumo.tokensCacheLeidos + r.consumo.tokensCacheEscritos, tokensSalida: r.consumo.tokensSalida, costoUsd: r.costoUsd, duracionMs: r.duracionMs,
        },
      });
      const variables = {
        bot: { nombre: neutralizar(ajustes.nombre), tono: ETIQUETA_TONO[ajustes.tono].toLowerCase(), objetivo: ETIQUETA_OBJETIVO[ajustes.objetivo].toLowerCase() },
        sitio: { nombre: neutralizar(sitio?.nombre || NOMBRE_POR_DEFECTO) },
        idioma,
        fuentes: fuentesChatParaPrompt(contexto),
        // El historial y el mensaje del visitante son datos no confiables (RN-17-4): neutralizados y dentro de <datos_sitio>.
        historial: historial.length ? neutralizar(historial.map((m) => `${m.de === 'bot' ? 'Asistente' : 'Visitante'}: ${m.texto}`).join('\n')) : '(es el primer mensaje)',
        mensaje: neutralizar(mensaje),
      };
      let vencio = false;
      const llamada = ejecutarTarea<SalidaChatbot>(proveedor, TAREA_CHATBOT, variables, { preparar: prepararSalidaChatbot, validarExtra: (d) => erroresSalidaChatbot(d as SalidaChatbot) });
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const espera = new Promise<'espera'>((resolver) => { temporizador = setTimeout(() => resolver('espera'), this.esperaIaMs); });
      // Lo que llega después de la espera igual se registra (el gasto ocurrió), pero el visitante ya recibió «no lo sé».
      const resultado = await Promise.race([llamada.then((r) => ({ r }), (error: unknown) => ({ error })), espera]).finally(() => clearTimeout(temporizador));
      if (resultado === 'espera') {
        vencio = true;
        void llamada.then((r) => guardar(r, 'ERROR', `Respuesta después de la espera de ${this.esperaIaMs} ms`), async (err: unknown) => {
          if (err instanceof SalidaNoValida) await guardar(err.registro, 'ERROR', err.message);
          else await this.bd.trabajoIA.update({ where: { id: trabajo.id }, data: { estado: 'ERROR', error: `Se venció la espera: ${err instanceof Error ? err.message : String(err)}` } });
        }).catch(() => undefined);
        await this.bd.trabajoIA.update({ where: { id: trabajo.id }, data: { estado: 'ERROR', error: `Se venció la espera de ${this.esperaIaMs} ms` } }).catch(() => undefined);
        return fallo('espera');
      }
      if ('error' in resultado) {
        const err = resultado.error;
        if (err instanceof SalidaNoValida) {
          await guardar(err.registro, 'ERROR', err.message);
          return fallo('no_valida');
        }
        await this.bd.trabajoIA.update({ where: { id: trabajo.id }, data: { estado: 'ERROR', error: err instanceof Error ? err.message : String(err) } });
        return fallo('no_disponible', err instanceof Error ? err.message : String(err));
      }
      if (!vencio) await guardar(resultado.r, 'COMPLETADO', null);
      const r = respuestaDeSalida(resultado.r.datos, contexto, idioma);
      return r.controlada ? fallo('sin_cita') : r;
    } catch (e) {
      return fallo('no_disponible', e instanceof Error ? e.message : String(e));
    }
  }

  /** El proveedor con el modelo de la conexión de la plataforma; el simulado no cambia. */
  private conModelo(modelo: string | null | undefined): ProveedorTexto {
    if (!modelo || this.proveedor.nombre === 'simulado' || !TARIFAS[modelo]) return this.proveedor;
    return { ...this.proveedor, modeloPara: () => modelo };
  }

  /**
   * El límite de gasto de la plataforma (la conexión de texto sin organización). Al llegar, no se llama a la IA, el
   * visitante recibe «no lo sé» con los botones y queda en la auditoría (una vez por día, para no llenarla).
   */
  private async limiteAlcanzado(conexion: { id: string; limiteGastoMensualUsd: Prisma.Decimal | null } | null, tipo: ReturnType<typeof tipoDeTareaIA>, ahora: Date): Promise<boolean> {
    if (conexion?.limiteGastoMensualUsd == null) return false;
    const limite = Number(conexion.limiteGastoMensualUsd);
    const suma = await this.bd.trabajoIA.aggregate({ where: { organizacionId: null, tipo, creadoEn: { gte: inicioMesLima(ahora) } }, _sum: { costoUsd: true } });
    const gasto = Number(suma._sum.costoUsd ?? 0);
    if (gasto < limite) return false;
    const hoy = new Date(ahora.getTime() - 86_400_000);
    const ya = await this.bd.auditoria.findFirst({ where: { accion: 'LIMITE_GASTO_ALCANZADO', entidadId: conexion.id, creadoEn: { gte: hoy }, datos: { path: ['tareaIa'], equals: TAREA_CHATBOT } } });
    if (!ya) {
      await this.bd.auditoria.create({
        data: { usuarioId: null, organizacionId: null, accion: 'LIMITE_GASTO_ALCANZADO', entidad: 'ConfigProveedor', entidadId: conexion.id, datos: { tarea: tipo, gastoUsd: gasto, limiteUsd: limite, tareaIa: TAREA_CHATBOT, codigo: CODIGO_LIMITE_GASTO } },
      });
    }
    return true;
  }
}
