/**
 * HU-1605 · Agendamiento de demos (REQ-078, PNT-33, RN-17-5, CP-135, CP-136). Reglas puras que comparten la API, el
 * worker, el sitio y la web:
 * - la hora de Lima (UTC−5 todo el año: Perú no usa horario de verano) y las fechas `AAAA-MM-DD` de Lima;
 * - los feriados nacionales de Perú, con el Jueves y el Viernes Santo calculados desde la Pascua;
 * - las franjas libres: de lunes a viernes, sin feriados ni días bloqueados, con anticipación mínima y horizonte, y
 *   solo si algún asesor del tipo está libre durante toda la reunión (CP-135);
 * - la elección del asesor con menos citas;
 * - la validación de ajustes, tipos, asesores y de la reserva del visitante (datos no confiables);
 * - la invitación iCalendar (RFC 5545) y el enlace para Google Calendar (CP-136);
 * - los recordatorios a las 24 h y a 1 h.
 */
import { validarEnvioLead, type EnvioLead } from './leads.js';
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';

// ── Hora de Lima ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const ZONA_LIMA = 'America/Lima';
/** Lima está 5 horas detrás de UTC todo el año (SUP-251). */
export const DESFASE_LIMA_MS = 5 * 3_600_000;
export const HORA_MS = 3_600_000;
export const DIA_MS = 86_400_000;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

const dos = (n: number) => String(n).padStart(2, '0');

/** La fecha de Lima (`AAAA-MM-DD`) de un instante. */
export function fechaLima(d: Date): string {
  const l = new Date(d.getTime() - DESFASE_LIMA_MS);
  return `${l.getUTCFullYear()}-${dos(l.getUTCMonth() + 1)}-${dos(l.getUTCDate())}`;
}

/** La hora de Lima (`HH:MM`) de un instante. */
export function horaLima(d: Date): string {
  const l = new Date(d.getTime() - DESFASE_LIMA_MS);
  return `${dos(l.getUTCHours())}:${dos(l.getUTCMinutes())}`;
}

/** ¿Es una fecha `AAAA-MM-DD` que existe? */
export function esFecha(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = FECHA.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

export const esHora = (v: unknown): v is string => typeof v === 'string' && HORA.test(v);

/** El instante (UTC) de una fecha y hora de Lima. */
export function deLima(fecha: string, hora: string): Date {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const [h, mi] = hora.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1, d, h, mi) + DESFASE_LIMA_MS);
}

/** Suma días a una fecha `AAAA-MM-DD`. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const x = new Date(Date.UTC(a, m - 1, d + dias));
  return `${x.getUTCFullYear()}-${dos(x.getUTCMonth() + 1)}-${dos(x.getUTCDate())}`;
}

/** El día de la semana de una fecha: 1 lunes … 7 domingo. */
export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return ((new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

// ── Feriados de Perú ─────────────────────────────────────────────────────────────────────────────────────────────────

/** El domingo de Pascua (calendario gregoriano, algoritmo anónimo de Meeus/Jones/Butcher), como `AAAA-MM-DD`. */
export function pascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

/**
 * Los feriados nacionales de fecha fija (mes-día). La lista se revisa cada año con producto (SUP-252): una ley nueva
 * se agrega aquí y, mientras tanto, el superadmin puede bloquear el día a mano.
 */
export const FERIADOS_FIJOS: readonly { md: string; nombre: string }[] = [
  { md: '01-01', nombre: 'Año Nuevo' },
  { md: '05-01', nombre: 'Día del Trabajo' },
  { md: '06-07', nombre: 'Batalla de Arica y Día de la Bandera' },
  { md: '06-29', nombre: 'San Pedro y San Pablo' },
  { md: '07-23', nombre: 'Día de la Fuerza Aérea del Perú' },
  { md: '07-28', nombre: 'Fiestas Patrias' },
  { md: '07-29', nombre: 'Fiestas Patrias' },
  { md: '08-06', nombre: 'Batalla de Junín' },
  { md: '08-30', nombre: 'Santa Rosa de Lima' },
  { md: '10-08', nombre: 'Combate de Angamos' },
  { md: '11-01', nombre: 'Día de Todos los Santos' },
  { md: '12-08', nombre: 'Inmaculada Concepción' },
  { md: '12-09', nombre: 'Batalla de Ayacucho' },
  { md: '12-25', nombre: 'Navidad' },
];

export interface Feriado { fecha: string; nombre: string }

/** Los feriados nacionales de Perú de un año, ordenados por fecha. */
export function feriadosPeru(anio: number): Feriado[] {
  const p = pascua(anio);
  const lista: Feriado[] = [
    ...FERIADOS_FIJOS.map((f) => ({ fecha: `${anio}-${f.md}`, nombre: f.nombre })),
    { fecha: sumarDias(p, -3), nombre: 'Jueves Santo' },
    { fecha: sumarDias(p, -2), nombre: 'Viernes Santo' },
  ];
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

const cacheFeriados = new Map<number, Set<string>>();
export function esFeriado(fecha: string): boolean {
  const anio = +fecha.slice(0, 4);
  let s = cacheFeriados.get(anio);
  if (!s) {
    s = new Set(feriadosPeru(anio).map((f) => f.fecha));
    cacheFeriados.set(anio, s);
  }
  return s.has(fecha);
}

// ── Catálogos y límites ──────────────────────────────────────────────────────────────────────────────────────────────

export const ESTADOS_CITA = ['confirmada', 'cancelada', 'realizada', 'no_asistio'] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];
export const ETIQUETA_ESTADO_CITA: Record<EstadoCita, string> = { confirmada: 'Confirmada', cancelada: 'Cancelada', realizada: 'Realizada', no_asistio: 'No asistió' };
export const esEstadoCita = (v: unknown): v is EstadoCita => typeof v === 'string' && (ESTADOS_CITA as readonly string[]).includes(v);
/** Los estados que el superadmin puede poner desde el panel (una cita nace confirmada). */
export const ESTADOS_PANEL = ['cancelada', 'realizada', 'no_asistio'] as const;

export const LMS_AGENDA = ['Moodle', 'Blackboard', 'Chamilo', 'Canvas', 'Otro', 'No usamos LMS'] as const;
export const LMS_AGENDA_EN: Record<(typeof LMS_AGENDA)[number], string> = { Moodle: 'Moodle', Blackboard: 'Blackboard', Chamilo: 'Chamilo', Canvas: 'Canvas', Otro: 'Other', 'No usamos LMS': "We don't use an LMS" };

export const FRANJAS_POR_DEFECTO = ['09:00', '10:00', '11:30', '15:00', '16:30'] as const;
export const LIMITES_AGENDA = {
  nombreTipo: 80, minutosMin: 15, minutosMax: 120, franjas: 16, anticipacionMax: 72, horizonteMin: 1, horizonteMax: 90,
  diasBloqueados: 200, nombreAsesor: 120, correo: 254, enlace: 500, asesoresPorTipo: 20,
} as const;

export interface AjustesAgenda { franjas: string[]; anticipacionHoras: number; horizonteDias: number; diasBloqueados: string[]; recordatoriosCorreo: boolean }
export const AJUSTES_AGENDA_POR_DEFECTO: AjustesAgenda = { franjas: [...FRANJAS_POR_DEFECTO], anticipacionHoras: 4, horizonteDias: 30, diasBloqueados: [], recordatoriosCorreo: true };

const CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const unaLinea = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
const entero = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);

// ── Validación del panel ─────────────────────────────────────────────────────────────────────────────────────────────

/** Cambios a los ajustes: solo los campos presentes. Las franjas y los días bloqueados se ordenan y no se repiten. */
export function validarAjustesAgenda(actual: AjustesAgenda, cambios: unknown): { ok: true; ajustes: AjustesAgenda } | { ok: false; errores: ErrorCampo[] } {
  const c = obj(cambios);
  const errores: ErrorCampo[] = [];
  const r: AjustesAgenda = { ...actual, franjas: [...actual.franjas], diasBloqueados: [...actual.diasBloqueados] };
  if (c.franjas !== undefined) {
    if (!Array.isArray(c.franjas) || !c.franjas.length) errores.push({ campo: 'franjas', mensaje: 'Ofrece al menos un horario' });
    else if (c.franjas.length > LIMITES_AGENDA.franjas) errores.push({ campo: 'franjas', mensaje: `Ofrece hasta ${LIMITES_AGENDA.franjas} horarios` });
    else if (!c.franjas.every(esHora)) errores.push({ campo: 'franjas', mensaje: 'Cada horario va como HH:MM, por ejemplo 09:30' });
    else r.franjas = [...new Set(c.franjas as string[])].sort();
  }
  if (c.anticipacionHoras !== undefined) {
    const n = entero(c.anticipacionHoras);
    if (n === null || n < 0 || n > LIMITES_AGENDA.anticipacionMax) errores.push({ campo: 'anticipacionHoras', mensaje: `La anticipación va de 0 a ${LIMITES_AGENDA.anticipacionMax} horas` });
    else r.anticipacionHoras = n;
  }
  if (c.horizonteDias !== undefined) {
    const n = entero(c.horizonteDias);
    if (n === null || n < LIMITES_AGENDA.horizonteMin || n > LIMITES_AGENDA.horizonteMax) errores.push({ campo: 'horizonteDias', mensaje: `El horizonte va de ${LIMITES_AGENDA.horizonteMin} a ${LIMITES_AGENDA.horizonteMax} días` });
    else r.horizonteDias = n;
  }
  if (c.diasBloqueados !== undefined) {
    if (!Array.isArray(c.diasBloqueados)) errores.push({ campo: 'diasBloqueados', mensaje: 'Los días bloqueados son una lista de fechas' });
    else if (c.diasBloqueados.length > LIMITES_AGENDA.diasBloqueados) errores.push({ campo: 'diasBloqueados', mensaje: `Bloquea hasta ${LIMITES_AGENDA.diasBloqueados} días` });
    else if (!c.diasBloqueados.every(esFecha)) errores.push({ campo: 'diasBloqueados', mensaje: 'Cada día bloqueado va como AAAA-MM-DD' });
    else r.diasBloqueados = [...new Set(c.diasBloqueados as string[])].sort();
  }
  if (c.recordatoriosCorreo !== undefined) {
    if (typeof c.recordatoriosCorreo !== 'boolean') errores.push({ campo: 'recordatoriosCorreo', mensaje: 'Los recordatorios se encienden o se apagan' });
    else r.recordatoriosCorreo = c.recordatoriosCorreo;
  }
  return errores.length ? { ok: false, errores } : { ok: true, ajustes: r };
}

export interface DatosTipo { nombreEs: string; nombreEn: string; minutos: number }

/** Un tipo de reunión: nombre en español (obligatorio) e inglés (opcional) y duración de 15 a 120 minutos. */
export function validarTipo(entrada: unknown, actual?: DatosTipo): { ok: true; datos: DatosTipo } | { ok: false; errores: ErrorCampo[] } {
  const e = obj(entrada);
  const errores: ErrorCampo[] = [];
  const base: DatosTipo = actual ?? { nombreEs: '', nombreEn: '', minutos: 30 };
  const texto = (campo: 'nombreEs' | 'nombreEn', etiqueta: string, obligatorio: boolean): string => {
    if (e[campo] === undefined) return base[campo];
    const t = unaLinea(e[campo]);
    if (obligatorio && !t) errores.push({ campo, mensaje: `Escribe ${etiqueta}` });
    else if (t.length > LIMITES_AGENDA.nombreTipo) errores.push({ campo, mensaje: `${etiqueta[0]!.toUpperCase()}${etiqueta.slice(1)} admite hasta ${LIMITES_AGENDA.nombreTipo} caracteres` });
    else if (!esTextoPlano(t)) errores.push({ campo, mensaje: 'Solo texto, sin etiquetas HTML' });
    return t;
  };
  const nombreEs = texto('nombreEs', 'el nombre', true);
  if (!actual && e.nombreEs === undefined) errores.push({ campo: 'nombreEs', mensaje: 'Escribe el nombre' });
  const nombreEn = texto('nombreEn', 'el nombre en inglés', false);
  let minutos = base.minutos;
  if (e.minutos !== undefined) {
    const n = entero(e.minutos);
    if (n === null || n < LIMITES_AGENDA.minutosMin || n > LIMITES_AGENDA.minutosMax) errores.push({ campo: 'minutos', mensaje: `La duración va de ${LIMITES_AGENDA.minutosMin} a ${LIMITES_AGENDA.minutosMax} minutos` });
    else minutos = n;
  }
  return errores.length ? { ok: false, errores } : { ok: true, datos: { nombreEs, nombreEn, minutos } };
}

/** ¿Es un enlace https público, sin usuario ni clave? (La videollamada del asesor: Meet, Zoom, Teams…) */
export function esEnlaceHttps(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > LIMITES_AGENDA.enlace) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !!u.hostname && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export interface DatosAsesor { nombre: string; correo: string; enlaceVideollamada: string }

export function validarAsesor(entrada: unknown, actual?: DatosAsesor): { ok: true; datos: DatosAsesor } | { ok: false; errores: ErrorCampo[] } {
  const e = obj(entrada);
  const errores: ErrorCampo[] = [];
  const base: DatosAsesor = actual ?? { nombre: '', correo: '', enlaceVideollamada: '' };
  const nombre = e.nombre === undefined ? base.nombre : unaLinea(e.nombre);
  if (!nombre) errores.push({ campo: 'nombre', mensaje: 'Escribe el nombre del asesor' });
  else if (nombre.length > LIMITES_AGENDA.nombreAsesor) errores.push({ campo: 'nombre', mensaje: `El nombre admite hasta ${LIMITES_AGENDA.nombreAsesor} caracteres` });
  else if (!esTextoPlano(nombre)) errores.push({ campo: 'nombre', mensaje: 'Solo texto, sin etiquetas HTML' });
  const correo = e.correo === undefined ? base.correo : unaLinea(e.correo).toLowerCase();
  if (!correo || correo.length > LIMITES_AGENDA.correo || !CORREO.test(correo)) errores.push({ campo: 'correo', mensaje: 'Escribe un correo válido, por ejemplo asesor@empresa.com' });
  const enlace = e.enlaceVideollamada === undefined ? base.enlaceVideollamada : unaLinea(e.enlaceVideollamada);
  if (!esEnlaceHttps(enlace)) errores.push({ campo: 'enlaceVideollamada', mensaje: 'El enlace de videollamada empieza con https://, por ejemplo https://meet.google.com/abc-defg-hij' });
  return errores.length ? { ok: false, errores } : { ok: true, datos: { nombre, correo, enlaceVideollamada: enlace } };
}

// ── Franjas libres (CP-135) ──────────────────────────────────────────────────────────────────────────────────────────

export interface Ocupacion { asesorId: string; inicio: Date; fin: Date }
export interface Franja { fecha: string; hora: string; inicio: string }

/** ¿El intervalo [inicio, fin) se cruza con alguna cita del asesor? Una cita que termina justo al empezar no choca. */
export function asesorLibre(asesorId: string, inicio: Date, fin: Date, ocupadas: readonly Ocupacion[]): boolean {
  return !ocupadas.some((o) => o.asesorId === asesorId && o.inicio < fin && o.fin > inicio);
}

/** Los asesores del tipo libres durante toda la reunión que empieza en `inicio`. */
export function asesoresLibres(asesorIds: readonly string[], inicio: Date, minutos: number, ocupadas: readonly Ocupacion[]): string[] {
  const fin = new Date(inicio.getTime() + minutos * 60_000);
  return asesorIds.filter((id) => asesorLibre(id, inicio, fin, ocupadas));
}

/** ¿Se ofrece el día? De lunes a viernes, sin feriados de Perú ni días bloqueados (RN-17-5). */
export function diaHabil(fecha: string, diasBloqueados: readonly string[]): boolean {
  return diaSemana(fecha) <= 5 && !esFeriado(fecha) && !diasBloqueados.includes(fecha);
}

/**
 * Las franjas que se ofrecen para un tipo de reunión desde `ahora`: cada día hábil desde hoy (Lima) hasta
 * `horizonteDias` días después, cada hora de inicio que empieza al menos `anticipacionHoras` después de ahora, y solo si
 * algún asesor del tipo (`asesorIds`, ya filtrados por visibles) está libre durante toda la reunión.
 */
export function franjasLibres(ajustes: Pick<AjustesAgenda, 'franjas' | 'anticipacionHoras' | 'horizonteDias' | 'diasBloqueados'>, tipo: { minutos: number; asesorIds: readonly string[] }, ocupadas: readonly Ocupacion[], ahora: Date): Franja[] {
  if (!tipo.asesorIds.length) return [];
  const desde = ahora.getTime() + ajustes.anticipacionHoras * HORA_MS;
  const hoy = fechaLima(ahora);
  const r: Franja[] = [];
  for (let i = 0; i <= ajustes.horizonteDias; i++) {
    const fecha = sumarDias(hoy, i);
    if (!diaHabil(fecha, ajustes.diasBloqueados)) continue;
    for (const hora of [...ajustes.franjas].sort()) {
      const inicio = deLima(fecha, hora);
      if (inicio.getTime() < desde) continue;
      if (asesoresLibres(tipo.asesorIds, inicio, tipo.minutos, ocupadas).length) r.push({ fecha, hora, inicio: inicio.toISOString() });
    }
  }
  return r;
}

/** ¿`inicio` es una de las franjas ofrecidas hoy para el tipo? La reserva la vuelve a comprobar con las citas al día. */
export function esFranjaOfrecida(inicio: Date, ...args: Parameters<typeof franjasLibres>): boolean {
  const iso = inicio.toISOString();
  return franjasLibres(...args).some((f) => f.inicio === iso);
}

/**
 * El asesor que atiende: entre los libres, el que tiene menos citas confirmadas por delante; si empatan, el primero
 * de la lista (el orden en que se asignaron al tipo).
 */
export function elegirAsesor(libres: readonly string[], citas: readonly { asesorId: string }[]): string | null {
  let mejor: string | null = null;
  let menos = Infinity;
  for (const id of libres) {
    const n = citas.filter((c) => c.asesorId === id).length;
    if (n < menos) {
      menos = n;
      mejor = id;
    }
  }
  return mejor;
}

// ── Reserva del visitante ────────────────────────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Reserva { tipoId: string; inicio: Date; lms: string | null; envio: EnvioLead }
export type ResultadoReserva = { ok: true; trampa: true } | { ok: true; trampa: false; reserva: Reserva } | { ok: false; errores: ErrorCampo[] };

/**
 * Lo que envía el agendador: el tipo, la franja elegida (ISO en UTC), el LMS opcional del catálogo y los datos del lead
 * (nombre, correo, empresa, consentimiento y atribución), validados como cualquier lead con vía «agendador».
 */
export function validarReserva(entrada: unknown, base = ''): ResultadoReserva {
  const e = obj(entrada);
  const lead = validarEnvioLead({ ...e, via: 'agendador', mensaje: undefined }, base);
  const errores: ErrorCampo[] = lead.ok ? [] : [...lead.errores];
  if (lead.ok && lead.trampa) return { ok: true, trampa: true };
  if (typeof e.tipoId !== 'string' || !UUID.test(e.tipoId)) errores.unshift({ campo: 'tipoId', mensaje: 'Elige el tipo de reunión' });
  const inicio = typeof e.inicio === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z$/.test(e.inicio) ? new Date(e.inicio) : null;
  if (!inicio || Number.isNaN(inicio.getTime())) errores.unshift({ campo: 'inicio', mensaje: 'Elige el día y la hora' });
  let lms: string | null = null;
  if (e.lms !== undefined && e.lms !== null && e.lms !== '') {
    if (typeof e.lms !== 'string' || !(LMS_AGENDA as readonly string[]).includes(e.lms)) errores.push({ campo: 'lms', mensaje: `El LMS es uno de: ${LMS_AGENDA.join(', ')}` });
    else lms = e.lms;
  }
  if (errores.length || !lead.ok || lead.trampa) return { ok: false, errores };
  return { ok: true, trampa: false, reserva: { tipoId: e.tipoId as string, inicio: inicio!, lms, envio: lead.envio } };
}

/** Excepción a SUP-236 (SUP-254): agendar pasa un lead en «Nuevo» o «Contactado» a «Demo»; nunca baja una etapa posterior. */
export function etapaTrasAgendar(etapa: string): string {
  return etapa === 'NUEVO' || etapa === 'CONTACTADO' ? 'DEMO' : etapa;
}

// ── Recordatorios (CP-136) ───────────────────────────────────────────────────────────────────────────────────────────

export const RECORDATORIOS = [{ clave: '24h', antesMs: 24 * HORA_MS }, { clave: '1h', antesMs: HORA_MS }] as const;
export type ClaveRecordatorio = (typeof RECORDATORIOS)[number]['clave'];

/** Los recordatorios que todavía tienen sentido: los que caen después de ahora (con 3 h de margen, solo el de 1 h). */
export function recordatoriosPorProgramar(inicio: Date, ahora: Date): { clave: ClaveRecordatorio; en: Date }[] {
  return RECORDATORIOS.map((r) => ({ clave: r.clave, en: new Date(inicio.getTime() - r.antesMs) })).filter((r) => r.en.getTime() > ahora.getTime());
}

// ── Textos de fecha ──────────────────────────────────────────────────────────────────────────────────────────────────

const DIAS = { es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'], en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] } as const;
export const MESES = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
} as const;

/** «martes 17 de noviembre de 2026, 10:00 (hora de Lima)» o «Tuesday, November 17, 2026, 10:00 (Lima time)». */
export function textoFechaCita(inicio: Date, idioma: 'es' | 'en' = 'es'): string {
  const f = fechaLima(inicio);
  const [a, m, d] = f.split('-').map(Number) as [number, number, number];
  const dia = DIAS[idioma][diaSemana(f) - 1]!;
  const hora = horaLima(inicio);
  return idioma === 'en'
    ? `${dia}, ${MESES.en[m - 1]} ${d}, ${a}, ${hora} (Lima time)`
    : `${dia} ${d} de ${MESES.es[m - 1]} de ${a}, ${hora} (hora de Lima)`;
}

// ── Invitación (RFC 5545) y Google Calendar ─────────────────────────────────────────────────────────────────────────

export interface CitaCalendario {
  uid: string;
  inicio: Date;
  fin: Date;
  titulo: string;
  descripcion: string;
  enlace: string;
  organizador: { nombre: string; correo: string };
  asistente: { nombre: string; correo: string };
  /** Sube con cada cambio: la cancelación lleva 1 más que la invitación. */
  secuencia: number;
  creada: Date;
}

/** Un instante en formato UTC de iCalendar: `20261117T150000Z`. */
export const fechaIcs = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Escapa un TEXT de RFC 5545 (3.3.11): barra invertida, punto y coma, coma y saltos de línea. */
export function escaparIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Un parámetro (CN) sin comillas dobles ni saltos: RFC 5545 no los admite dentro de un valor entre comillas. */
const paramIcs = (s: string) => `"${s.replace(/["\r\n]/g, ' ').trim()}"`;

/** Pliega una línea a 75 octetos (RFC 5545, 3.1) sin partir un carácter UTF-8. */
export function plegarIcs(linea: string): string {
  const enc = new TextEncoder();
  if (enc.encode(linea).length <= 75) return linea;
  const partes: string[] = [];
  let actual = '';
  let bytes = 0;
  for (const ch of linea) {
    const n = enc.encode(ch).length;
    const max = partes.length ? 74 : 75;
    if (bytes + n > max) {
      partes.push(actual);
      actual = '';
      bytes = 0;
    }
    actual += ch;
    bytes += n;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

/** La invitación (`METHOD:REQUEST`) o su cancelación (`METHOD:CANCEL`, `STATUS:CANCELLED`), con fin de línea CRLF. */
export function invitacionIcs(c: CitaCalendario, metodo: 'REQUEST' | 'CANCEL' = 'REQUEST'): string {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aptio SCORM//Agendamiento//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${metodo}`,
    'BEGIN:VEVENT',
    `UID:${c.uid}`,
    `SEQUENCE:${c.secuencia}`,
    `DTSTAMP:${fechaIcs(c.creada)}`,
    `DTSTART:${fechaIcs(c.inicio)}`,
    `DTEND:${fechaIcs(c.fin)}`,
    `SUMMARY:${escaparIcs(c.titulo)}`,
    `DESCRIPTION:${escaparIcs(c.descripcion)}`,
    `LOCATION:${escaparIcs(c.enlace)}`,
    `URL:${c.enlace}`,
    `ORGANIZER;CN=${paramIcs(c.organizador.nombre)}:mailto:${c.organizador.correo}`,
    `ATTENDEE;CN=${paramIcs(c.asistente.nombre || c.asistente.correo)};ROLE=REQ-PARTICIPANT;PARTSTAT=${metodo === 'CANCEL' ? 'DECLINED' : 'ACCEPTED'};RSVP=FALSE:mailto:${c.asistente.correo}`,
    `STATUS:${metodo === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lineas.map(plegarIcs).join('\r\n')}\r\n`;
}

/** El enlace «Añadir a Google Calendar» (plantilla pública de Google Calendar, sin cuenta ni API). */
export function enlaceGoogleCalendar(c: Pick<CitaCalendario, 'inicio' | 'fin' | 'titulo' | 'descripcion' | 'enlace'>): string {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: c.titulo, dates: `${fechaIcs(c.inicio)}/${fechaIcs(c.fin)}`, details: c.descripcion, location: c.enlace, ctz: ZONA_LIMA });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// ── Lo que ve el sitio ───────────────────────────────────────────────────────────────────────────────────────────────

export interface TipoPublico { id: string; nombre: string; minutos: number }
/** `GET /s/_agenda.json`: los tipos visibles y las franjas libres del tipo pedido (o del primero). */
export interface AgendaPublica { zona: typeof ZONA_LIMA; tipos: TipoPublico[]; tipoId: string | null; franjas: Franja[]; hoy: string; horizonte: string }
/** `POST /publico/citas`: lo que vuelve al visitante, sin datos del asesor más allá del enlace de su reunión. */
export interface CitaConfirmada { id: string; inicio: string; fin: string; tipo: string; enlace: string; google: string; ics: string; texto: string }
