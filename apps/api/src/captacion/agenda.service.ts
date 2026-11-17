import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, type OnModuleDestroy, UnprocessableEntityException } from '@nestjs/common';
import { type AvisoAgenda, COLA_AGENDA, type DatosAgenda, idTareaAgenda, opcionesRedis, opcionesTareaAgenda, prefijoColas, TAREA_AGENDA } from '@aptio/colas';
import { Prisma } from '@aptio/db';
import {
  AJUSTES_AGENDA_POR_DEFECTO, type AgendaPublica, type AjustesAgenda, asesoresLibres, type CitaConfirmada, DIA_MS, elegirAsesor, enlaceGoogleCalendar, esEstadoCita, fechaLima,
  feriadosPeru, franjasLibres, horaLima, invitacionIcs, recordatoriosPorProgramar, textoFechaCita, validarAjustesAgenda, validarAsesor, validarReserva, validarTipo, ZONA_LIMA,
  deLima, sumarDias, type Ocupacion,
} from '@aptio/schema/agenda';
import { NOMBRE_POR_DEFECTO } from '@aptio/schema/sitio-ajustes';
import { leerAjustesSitio } from '@aptio/db';
import { Queue } from 'bullmq';
import type { UsuarioSesion } from '../comun/roles.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { entornoActual } from '../sitio/entorno-sitio.js';
import { ChatbotService } from './chatbot.service.js';
import { LeadsService } from './leads.service.js';
import type {
  AgendaDto, AjustesAgendaCambioDto, AjustesAgendaDto, AsesorDto, AsesorEntradaDto, CitaDto, CitasDto, ConsultaCitasDto, ReservaRecibidaDto, TipoReunionDto, TipoReunionEntradaDto,
} from './agenda.dto.js';

export const ID_AGENDA = 'agenda';
/** Reservas por IP en cada ventana (como los leads, SUP-239); más, 429. */
export const LIMITE_RESERVAS = { envios: 5, ventanaMs: 10 * 60_000 } as const;
/** Lecturas de `GET /s/_agenda.json` por IP y por minuto: el agendador pide una por tipo y al recibir un 409. */
export const LIMITE_LECTURAS_AGENDA = { envios: 60, ventanaMs: 60_000 } as const;
const PLAZO_REDIS_MS = 3_000;
const MAX_CITAS_PANEL = 500;

type FilaCita = Prisma.AgendaCitaGetPayload<{ include: { tipo: true; asesor: true } }>;
type FilaTipo = Prisma.AgendaTipoGetPayload<{ include: { asesores: true } }>;
type Bd = Prisma.TransactionClient | BaseDatosService['cliente'];

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const nombreTipo = (t: { nombreEs: string; nombreEn: string }, idioma: string) => (idioma === 'en' && t.nombreEn ? t.nombreEn : t.nombreEs);

const aCitaDto = (c: FilaCita): CitaDto => ({
  id: c.id, inicio: c.inicio.toISOString(), fin: c.fin.toISOString(), fecha: fechaLima(c.inicio), hora: horaLima(c.inicio), estado: c.estado, tipoId: c.tipoId,
  tipo: c.tipo.nombreEs, asesorId: c.asesorId, asesor: c.asesor.nombre, nombre: c.nombre, correo: c.correo, empresa: c.empresa, lms: c.lms, idioma: c.idioma, leadId: c.leadId,
  canceladaPor: c.canceladaPor, invitacionEnviadaEn: c.invitacionEnviadaEn?.toISOString() ?? null, recordatorio24hEnviadoEn: c.recordatorio24hEnviadoEn?.toISOString() ?? null,
  recordatorio1hEnviadoEn: c.recordatorio1hEnviadoEn?.toISOString() ?? null, creadoEn: c.creadoEn.toISOString(),
});

const aTipoDto = (t: FilaTipo): TipoReunionDto => ({
  id: t.id, nombreEs: t.nombreEs, nombreEn: t.nombreEn, minutos: t.minutos, asesorIds: t.asesores.map((a) => a.id).sort(), visible: t.visible, orden: t.orden, ficticio: t.ficticio,
});

const presentes = <T extends object>(dto: T): Partial<T> => Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as Partial<T>;
const noValido = (errores: { campo: string; mensaje: string }[]) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });

/**
 * HU-1605 · Agendamiento de demos (REQ-078, PNT-33, RN-17-5, CP-135, CP-136). El panel configura tipos de reunión,
 * asesores, horarios y días bloqueados, y ve las citas. El sitio lee las franjas libres en vivo y reserva: la franja
 * se vuelve a comprobar dentro de una transacción con un candado por asesor, y un índice único parcial en la base
 * impide dos citas confirmadas del mismo asesor a la misma hora (409 FRANJA_OCUPADA). La invitación, los recordatorios
 * y las cancelaciones salen por la cola `agenda` del worker; si Redis no responde, la cita queda igual y se registra.
 */
@Injectable()
export class AgendaService implements OnModuleDestroy {
  private readonly log = new Logger('Agenda');
  private readonly ventanas = new Map<string, { inicio: number; cuenta: number }>();
  private readonly lecturas = new Map<string, { inicio: number; cuenta: number }>();
  private cola?: Queue<DatosAgenda>;
  /** El último encolado en curso (las pruebas lo esperan; la respuesta al visitante no). */
  ultimoEncolado: Promise<unknown> = Promise.resolve();

  constructor(private readonly baseDatos: BaseDatosService, private readonly leads: LeadsService, private readonly chatbot: ChatbotService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  get colaAgenda(): Queue<DatosAgenda> {
    this.cola ??= new Queue<DatosAgenda>(COLA_AGENDA, { connection: opcionesRedis(), prefix: prefijoColas() });
    return this.cola;
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola?.close();
  }

  /** Vacía los límites por IP (pruebas). */
  reiniciarLimite(): void {
    this.ventanas.clear();
    this.lecturas.clear();
  }

  private contar(mapa: Map<string, { inicio: number; cuenta: number }>, limite: { envios: number; ventanaMs: number }, ip: string, ahora: number): void {
    let v = mapa.get(ip);
    if (!v || ahora - v.inicio >= limite.ventanaMs) {
      v = { inicio: ahora, cuenta: 0 };
      mapa.set(ip, v);
      if (mapa.size > 10_000) for (const [k, x] of mapa) if (ahora - x.inicio >= limite.ventanaMs) mapa.delete(k);
    }
    v.cuenta += 1;
    if (v.cuenta > limite.envios) {
      throw new HttpException({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Recibimos varias solicitudes seguidas: espera unos minutos e intenta de nuevo', reintentarEn: Math.ceil((v.inicio + limite.ventanaMs - ahora) / 1000) }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // ── Ajustes ────────────────────────────────────────────────────────────────────────────────────────────────────────

  private async ajustes(bd: Bd = this.bd): Promise<AjustesAgenda> {
    const f = await bd.agendaAjustes.findUnique({ where: { id: ID_AGENDA } });
    return f ? { franjas: f.franjas, anticipacionHoras: f.anticipacionHoras, horizonteDias: f.horizonteDias, diasBloqueados: f.diasBloqueados, recordatoriosCorreo: f.recordatoriosCorreo } : { ...AJUSTES_AGENDA_POR_DEFECTO, franjas: [...AJUSTES_AGENDA_POR_DEFECTO.franjas] };
  }

  async ver(ahora = new Date()): Promise<AgendaDto> {
    const anio = +fechaLima(ahora).slice(0, 4);
    const [ajustes, tipos, asesores, proximas] = await Promise.all([
      this.ajustes(),
      this.bd.agendaTipo.findMany({ include: { asesores: true }, orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }] }),
      this.bd.agendaAsesor.findMany({ orderBy: [{ nombre: 'asc' }, { creadoEn: 'asc' }] }),
      this.bd.agendaCita.groupBy({ by: ['asesorId'], where: { estado: 'confirmada', inicio: { gte: ahora } }, _count: { _all: true } }),
    ]);
    const cuenta = new Map(proximas.map((p) => [p.asesorId, p._count._all]));
    return {
      ajustes, feriados: [...feriadosPeru(anio), ...feriadosPeru(anio + 1)], tipos: tipos.map(aTipoDto),
      asesores: asesores.map((a): AsesorDto => ({ id: a.id, nombre: a.nombre, correo: a.correo, enlaceVideollamada: a.enlaceVideollamada, visible: a.visible, ficticio: a.ficticio, citasProximas: cuenta.get(a.id) ?? 0 })),
    };
  }

  async cambiarAjustes(u: UsuarioSesion, dto: AjustesAgendaCambioDto): Promise<AjustesAgendaDto> {
    const cambios = presentes(dto);
    const r = validarAjustesAgenda(await this.ajustes(), cambios);
    if (!r.ok) throw noValido(r.errores);
    const a = r.ajustes;
    await this.bd.agendaAjustes.upsert({ where: { id: ID_AGENDA }, create: { id: ID_AGENDA, ...a }, update: a });
    await this.auditar(u, 'AGENDA_AJUSTES_EDITADOS', 'AgendaAjustes', ID_AGENDA, { campos: Object.keys(cambios), ...a });
    return a;
  }

  // ── Tipos de reunión ───────────────────────────────────────────────────────────────────────────────────────────────

  private async asesoresExisten(ids: readonly string[] | undefined): Promise<void> {
    if (!ids?.length) return;
    const n = await this.bd.agendaAsesor.count({ where: { id: { in: [...new Set(ids)] } } });
    if (n !== new Set(ids).size) throw noValido([{ campo: 'asesorIds', mensaje: 'Algún asesor elegido ya no existe' }]);
  }

  async crearTipo(u: UsuarioSesion, dto: TipoReunionEntradaDto): Promise<TipoReunionDto> {
    const r = validarTipo(dto);
    if (!r.ok) throw noValido(r.errores);
    await this.asesoresExisten(dto.asesorIds);
    const ultimo = await this.bd.agendaTipo.aggregate({ _max: { orden: true } });
    const t = await this.bd.agendaTipo.create({
      data: { ...r.datos, visible: dto.visible ?? false, ficticio: dto.ficticio ?? false, orden: (ultimo._max.orden ?? -1) + 1, asesores: { connect: [...new Set(dto.asesorIds ?? [])].map((id) => ({ id })) } },
      include: { asesores: true },
    });
    await this.auditar(u, 'AGENDA_TIPO_CREADO', 'AgendaTipo', t.id, { nombre: t.nombreEs, minutos: t.minutos, visible: t.visible, asesores: t.asesores.length });
    return aTipoDto(t);
  }

  async cambiarTipo(u: UsuarioSesion, id: string, dto: TipoReunionEntradaDto): Promise<TipoReunionDto> {
    const actual = await this.bd.agendaTipo.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El tipo de reunión no existe' });
    const r = validarTipo(dto, actual);
    if (!r.ok) throw noValido(r.errores);
    await this.asesoresExisten(dto.asesorIds);
    const t = await this.bd.agendaTipo.update({
      where: { id },
      data: {
        ...r.datos, ...(dto.visible !== undefined ? { visible: dto.visible } : {}), ...(dto.ficticio !== undefined ? { ficticio: dto.ficticio } : {}),
        ...(dto.asesorIds ? { asesores: { set: [...new Set(dto.asesorIds)].map((x) => ({ id: x })) } } : {}),
      },
      include: { asesores: true },
    });
    await this.auditar(u, 'AGENDA_TIPO_EDITADO', 'AgendaTipo', id, { nombre: t.nombreEs, campos: Object.keys(presentes(dto)), ...(dto.visible !== undefined ? { visible: t.visible } : {}) });
    return aTipoDto(t);
  }

  async borrarTipo(u: UsuarioSesion, id: string): Promise<void> {
    const t = await this.bd.agendaTipo.findUnique({ where: { id }, include: { _count: { select: { citas: true } } } });
    if (!t) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El tipo de reunión no existe' });
    if (t._count.citas) throw new ConflictException({ codigo: 'TIPO_CON_CITAS', mensaje: 'Este tipo tiene citas: apágalo para dejar de ofrecerlo y conserva su historial' });
    await this.bd.$transaction(async (tx) => {
      await tx.agendaTipo.delete({ where: { id } });
      const resto = await tx.agendaTipo.findMany({ orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }], select: { id: true } });
      for (const [i, x] of resto.entries()) await tx.agendaTipo.update({ where: { id: x.id }, data: { orden: i } });
    });
    await this.auditar(u, 'AGENDA_TIPO_BORRADO', 'AgendaTipo', id, { nombre: t.nombreEs });
  }

  async ordenarTipos(u: UsuarioSesion, ids: string[]): Promise<TipoReunionDto[]> {
    const todos = await this.bd.agendaTipo.findMany({ select: { id: true } });
    if (new Set(ids).size !== ids.length || ids.length !== todos.length || !todos.every((t) => ids.includes(t.id))) {
      throw new UnprocessableEntityException({ codigo: 'ORDEN_INCOMPLETO', mensaje: 'El orden debe incluir cada tipo de reunión una sola vez' });
    }
    await this.bd.$transaction(ids.map((id, orden) => this.bd.agendaTipo.update({ where: { id }, data: { orden } })));
    await this.auditar(u, 'AGENDA_TIPOS_ORDENADOS', 'AgendaTipo', null, { ids });
    return (await this.bd.agendaTipo.findMany({ include: { asesores: true }, orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }] })).map(aTipoDto);
  }

  // ── Asesores ───────────────────────────────────────────────────────────────────────────────────────────────────────

  private async asesorDto(id: string): Promise<AsesorDto> {
    const a = await this.bd.agendaAsesor.findUniqueOrThrow({ where: { id } });
    const citasProximas = await this.bd.agendaCita.count({ where: { asesorId: id, estado: 'confirmada', inicio: { gte: new Date() } } });
    return { id: a.id, nombre: a.nombre, correo: a.correo, enlaceVideollamada: a.enlaceVideollamada, visible: a.visible, ficticio: a.ficticio, citasProximas };
  }

  async crearAsesor(u: UsuarioSesion, dto: AsesorEntradaDto): Promise<AsesorDto> {
    const r = validarAsesor(dto);
    if (!r.ok) throw noValido(r.errores);
    const a = await this.bd.agendaAsesor.create({ data: { ...r.datos, visible: dto.visible ?? true, ficticio: dto.ficticio ?? false } });
    await this.auditar(u, 'AGENDA_ASESOR_CREADO', 'AgendaAsesor', a.id, { nombre: a.nombre });
    return this.asesorDto(a.id);
  }

  async cambiarAsesor(u: UsuarioSesion, id: string, dto: AsesorEntradaDto): Promise<AsesorDto> {
    const actual = await this.bd.agendaAsesor.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El asesor no existe' });
    const r = validarAsesor(dto, actual);
    if (!r.ok) throw noValido(r.errores);
    await this.bd.agendaAsesor.update({ where: { id }, data: { ...r.datos, ...(dto.visible !== undefined ? { visible: dto.visible } : {}), ...(dto.ficticio !== undefined ? { ficticio: dto.ficticio } : {}) } });
    await this.auditar(u, 'AGENDA_ASESOR_EDITADO', 'AgendaAsesor', id, { nombre: r.datos.nombre, campos: Object.keys(presentes(dto)) });
    return this.asesorDto(id);
  }

  async borrarAsesor(u: UsuarioSesion, id: string): Promise<void> {
    const a = await this.bd.agendaAsesor.findUnique({ where: { id }, include: { _count: { select: { citas: true } } } });
    if (!a) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El asesor no existe' });
    if (a._count.citas) throw new ConflictException({ codigo: 'ASESOR_CON_CITAS', mensaje: 'Este asesor tiene citas: apágalo para que no reciba nuevas y conserva su historial' });
    await this.bd.agendaAsesor.delete({ where: { id } });
    await this.auditar(u, 'AGENDA_ASESOR_BORRADO', 'AgendaAsesor', id, { nombre: a.nombre });
  }

  // ── Citas en el panel ──────────────────────────────────────────────────────────────────────────────────────────────

  async citas(q: ConsultaCitasDto): Promise<CitasDto> {
    const where: Prisma.AgendaCitaWhereInput = {
      ...(q.estado ? { estado: q.estado } : {}),
      ...(q.desde || q.hasta ? { inicio: { ...(q.desde ? { gte: deLima(q.desde, '00:00') } : {}), ...(q.hasta ? { lt: deLima(sumarDias(q.hasta, 1), '00:00') } : {}) } } : {}),
    };
    const [filas, total] = await Promise.all([
      this.bd.agendaCita.findMany({ where, include: { tipo: true, asesor: true }, orderBy: [{ inicio: 'asc' }, { id: 'asc' }], take: MAX_CITAS_PANEL }),
      this.bd.agendaCita.count({ where }),
    ]);
    return { citas: filas.map(aCitaDto), total };
  }

  /** Cancelar avisa al visitante (METHOD:CANCEL) y quita los recordatorios; realizada y no asistió, solo de una cita que ya empezó. */
  async cambiarCita(u: UsuarioSesion, id: string, estado: string, ahora = new Date()): Promise<CitaDto> {
    const c = await this.bd.agendaCita.findUnique({ where: { id }, include: { tipo: true, asesor: true } });
    if (!c) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La cita no existe' });
    if (!esEstadoCita(estado) || estado === 'confirmada') throw noValido([{ campo: 'estado', mensaje: 'El estado es cancelada, realizada o no_asistio' }]);
    if (estado === 'cancelada') {
      if (c.estado !== 'confirmada') throw new ConflictException({ codigo: 'CITA_NO_ACTIVA', mensaje: 'Solo se cancela una cita confirmada' });
    } else {
      if (c.estado === 'cancelada') throw new ConflictException({ codigo: 'CITA_NO_ACTIVA', mensaje: 'Una cita cancelada no se marca como realizada ni como no asistió' });
      if (c.inicio.getTime() > ahora.getTime()) throw new UnprocessableEntityException({ codigo: 'CITA_FUTURA', mensaje: 'La cita todavía no empieza' });
    }
    const f = await this.bd.agendaCita.update({ where: { id }, data: { estado, ...(estado === 'cancelada' ? { canceladaPor: 'superadmin' } : {}) }, include: { tipo: true, asesor: true } });
    if (estado === 'cancelada') this.ultimoEncolado = this.trasCancelar(id);
    await this.auditar(u, estado === 'cancelada' ? 'AGENDA_CITA_CANCELADA' : 'AGENDA_CITA_MARCADA', 'AgendaCita', id, { estado, antes: c.estado, inicio: c.inicio.toISOString(), tipo: c.tipo.nombreEs });
    return aCitaDto(f);
  }

  // ── Sitio público ──────────────────────────────────────────────────────────────────────────────────────────────────

  private filtroPublico() {
    return entornoActual() === 'produccion' ? { ficticio: false } : {};
  }

  /** Los tipos que ofrece el sitio: visibles, con al menos un asesor visible (en producción, sin ficticios). */
  private async tiposPublicos(): Promise<FilaTipo[]> {
    const tipos = await this.bd.agendaTipo.findMany({
      where: { visible: true, ...this.filtroPublico() }, orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }],
      include: { asesores: { where: { visible: true, ...this.filtroPublico() } } },
    });
    return tipos.filter((t) => t.asesores.length);
  }

  private async ocupadas(bd: Bd, asesorIds: readonly string[], ahora: Date, horizonteDias: number): Promise<(Ocupacion & { id: string })[]> {
    return bd.agendaCita.findMany({
      where: { asesorId: { in: [...asesorIds] }, estado: 'confirmada', fin: { gt: ahora }, inicio: { lt: new Date(ahora.getTime() + (horizonteDias + 2) * DIA_MS) } },
      select: { id: true, asesorId: true, inicio: true, fin: true },
    });
  }

  /** `GET /s/_agenda.json` (CP-135): los tipos y las franjas libres del tipo pedido, sin datos de asesores ni de otras citas. */
  async publica(tipoId: unknown, idioma: string, ip: string, ahora = new Date()): Promise<AgendaPublica> {
    this.contar(this.lecturas, LIMITE_LECTURAS_AGENDA, ip, ahora.getTime());
    const [ajustes, tipos] = await Promise.all([this.ajustes(), this.tiposPublicos()]);
    const tipo = tipos.find((t) => t.id === tipoId) ?? tipos[0];
    const hoy = fechaLima(ahora);
    const base = { zona: ZONA_LIMA, tipos: tipos.map((t) => ({ id: t.id, nombre: nombreTipo(t, idioma), minutos: t.minutos })), hoy, horizonte: sumarDias(hoy, ajustes.horizonteDias) } as const;
    if (!tipo) return { ...base, tipoId: null, franjas: [] };
    const asesorIds = tipo.asesores.map((a) => a.id);
    const ocupadas = await this.ocupadas(this.bd, asesorIds, ahora, ajustes.horizonteDias);
    return { ...base, tipoId: tipo.id, franjas: franjasLibres(ajustes, { minutos: tipo.minutos, asesorIds }, ocupadas, ahora) };
  }

  /**
   * `POST /publico/citas`. 429 por IP; 422 NO_VALIDO si los datos no sirven, TIPO_NO_DISPONIBLE o FRANJA_NO_VALIDA;
   * 409 FRANJA_OCUPADA si otro visitante la tomó (CP-135). Con el campo trampa lleno responde 201 sin cita y no guarda.
   */
  async reservar(entrada: unknown, ip: string, base: string, ahora = new Date()): Promise<ReservaRecibidaDto> {
    this.contar(this.ventanas, LIMITE_RESERVAS, ip, ahora.getTime());
    const r = validarReserva(entrada, base);
    if (!r.ok) throw noValido(r.errores);
    if (r.trampa) return { recibido: true, cita: null };
    const { reserva } = r;
    const tipo = (await this.tiposPublicos()).find((t) => t.id === reserva.tipoId);
    if (!tipo) throw new UnprocessableEntityException({ codigo: 'TIPO_NO_DISPONIBLE', mensaje: 'Ese tipo de reunión ya no se ofrece: elige otro' });
    const asesorIds = tipo.asesores.map((a) => a.id).sort();
    const token = randomBytes(24).toString('base64url');
    const ofrecida = (ajustes: AjustesAgenda, ocupadas: readonly Ocupacion[]) => franjasLibres(ajustes, { minutos: tipo.minutos, asesorIds }, ocupadas, ahora).some((f) => f.inicio === reserva.inicio.toISOString());

    let cita: FilaCita;
    try {
      cita = await this.bd.$transaction(async (tx) => {
        // Un candado por asesor del tipo (en orden, para no trabarse): dos reservas a la vez se ven una a la otra.
        for (const id of asesorIds) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agenda:${id}`}))`;
        const ajustes = await this.ajustes(tx);
        if (!ofrecida(ajustes, [])) throw new UnprocessableEntityException({ codigo: 'FRANJA_NO_VALIDA', mensaje: 'Ese horario no se ofrece: elige otro de la lista' });
        const ocupadas = await this.ocupadas(tx, asesorIds, ahora, ajustes.horizonteDias);
        const libres = asesoresLibres(asesorIds.filter((id) => tipo.asesores.some((a) => a.id === id)), reserva.inicio, tipo.minutos, ocupadas);
        const asesorId = elegirAsesor(tipo.asesores.map((a) => a.id).filter((id) => libres.includes(id)), ocupadas.filter((o) => o.inicio >= ahora));
        if (!asesorId) throw this.ocupada();
        return tx.agendaCita.create({
          data: {
            tipoId: tipo.id, asesorId, inicio: reserva.inicio, fin: new Date(reserva.inicio.getTime() + tipo.minutos * 60_000), nombre: reserva.envio.nombre, correo: reserva.envio.correo,
            empresa: reserva.envio.empresa, lms: reserva.lms, idioma: reserva.envio.idioma, tokenCancelacionHash: hash(token),
          },
          include: { tipo: true, asesor: true },
        });
      });
    } catch (e) {
      // El índice único parcial: la otra reserva ganó por milisegundos.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw this.ocupada();
      throw e;
    }

    try {
      const { leadId } = await this.leads.registrarAgendado(reserva.envio, ahora);
      cita = await this.bd.agendaCita.update({ where: { id: cita.id }, data: { leadId }, include: { tipo: true, asesor: true } });
    } catch (e) {
      this.log.warn(`La cita ${cita.id} quedó sin lead: ${e instanceof Error ? e.message : String(e)}`);
    }
    // HU-1604 · CP-134 · Agendada desde el chat: la conversación pasa a «demo».
    if (reserva.envio.via === 'chatbot') await this.chatbot.marcar((entrada as { conversacionId?: unknown } | null)?.conversacionId, 'demo');
    this.ultimoEncolado = this.trasReservar(cita, token, ahora);
    const marca = (await leerAjustesSitio(this.bd).catch(() => null))?.nombre || NOMBRE_POR_DEFECTO;
    return { recibido: true, cita: this.confirmacion(cita, marca) };
  }

  private ocupada() {
    return new ConflictException({ codigo: 'FRANJA_OCUPADA', mensaje: 'Alguien acaba de tomar ese horario: elige otro' });
  }

  private confirmacion(c: FilaCita, marca: string): CitaConfirmada {
    const titulo = `${nombreTipo(c.tipo, c.idioma)} · ${marca}`;
    const evento = {
      uid: `cita-${c.id}@aptio`, inicio: c.inicio, fin: c.fin, titulo, descripcion: c.asesor.enlaceVideollamada, enlace: c.asesor.enlaceVideollamada,
      organizador: { nombre: c.asesor.nombre, correo: c.asesor.correo }, asistente: { nombre: c.nombre, correo: c.correo }, secuencia: 0, creada: c.creadoEn,
    };
    return {
      id: c.id, inicio: c.inicio.toISOString(), fin: c.fin.toISOString(), tipo: nombreTipo(c.tipo, c.idioma), enlace: c.asesor.enlaceVideollamada,
      google: enlaceGoogleCalendar(evento), ics: invitacionIcs(evento), texto: textoFechaCita(c.inicio, c.idioma === 'en' ? 'en' : 'es'),
    };
  }

  /** Busca la cita del enlace de cancelación. */
  async porToken(token: unknown): Promise<FilaCita | null> {
    if (typeof token !== 'string' || token.length < 16 || token.length > 100) return null;
    return this.bd.agendaCita.findUnique({ where: { tokenCancelacionHash: hash(token) }, include: { tipo: true, asesor: true } });
  }

  /**
   * `POST /publico/citas/cancelar` (y el botón de la página del enlace): 404 CITA_NO_ENCONTRADA, 409 CITA_NO_ACTIVA si
   * ya no está confirmada o CITA_YA_EMPEZO. Cancela, quita los recordatorios y avisa al visitante y al asesor.
   */
  async cancelarPorToken(token: unknown, ip: string, ahora = new Date()): Promise<{ cita: FilaCita; texto: string }> {
    this.contar(this.ventanas, LIMITE_RESERVAS, ip, ahora.getTime());
    const c = await this.porToken(token);
    if (!c) throw new NotFoundException({ codigo: 'CITA_NO_ENCONTRADA', mensaje: 'El enlace no corresponde a ninguna cita' });
    if (c.estado !== 'confirmada') throw new ConflictException({ codigo: 'CITA_NO_ACTIVA', mensaje: 'Esta cita ya no está activa' });
    if (c.inicio.getTime() <= ahora.getTime()) throw new ConflictException({ codigo: 'CITA_YA_EMPEZO', mensaje: 'La cita ya empezó: no se puede cancelar desde el enlace' });
    const n = await this.bd.agendaCita.updateMany({ where: { id: c.id, estado: 'confirmada' }, data: { estado: 'cancelada', canceladaPor: 'visitante' } });
    if (!n.count) throw new ConflictException({ codigo: 'CITA_NO_ACTIVA', mensaje: 'Esta cita ya no está activa' });
    this.ultimoEncolado = this.trasCancelar(c.id);
    const cita = await this.bd.agendaCita.findUniqueOrThrow({ where: { id: c.id }, include: { tipo: true, asesor: true } });
    return { cita, texto: textoFechaCita(c.inicio, c.idioma === 'en' ? 'en' : 'es') };
  }

  // ── Cola ───────────────────────────────────────────────────────────────────────────────────────────────────────────

  private async conPlazo<T>(p: Promise<T>): Promise<T> {
    let reloj: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([p, new Promise<never>((_, rechazar) => { reloj = setTimeout(() => rechazar(new Error('Redis no respondió a tiempo')), PLAZO_REDIS_MS); })]);
    } finally {
      clearTimeout(reloj);
    }
  }

  private encolar(citaId: string, aviso: AvisoAgenda, demoraMs: number, token?: string) {
    return this.conPlazo(this.colaAgenda.add(TAREA_AGENDA, { citaId, aviso, ...(token ? { token } : {}) }, opcionesTareaAgenda(citaId, aviso, demoraMs)));
  }

  /** CP-136 · La invitación al momento y los recordatorios a las 24 h y a 1 h que todavía no pasaron. */
  private async trasReservar(c: FilaCita, token: string, ahora: Date): Promise<void> {
    try {
      await this.encolar(c.id, 'invitacion', 0, token);
      for (const r of recordatoriosPorProgramar(c.inicio, ahora)) await this.encolar(c.id, r.clave === '24h' ? 'recordatorio24h' : 'recordatorio1h', r.en.getTime() - ahora.getTime(), token);
    } catch (e) {
      this.log.error(`No se pudieron encolar los avisos de la cita ${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async trasCancelar(citaId: string): Promise<void> {
    try {
      for (const aviso of ['recordatorio24h', 'recordatorio1h'] as const) await this.conPlazo(this.colaAgenda.remove(idTareaAgenda(citaId, aviso)));
      await this.encolar(citaId, 'cancelacion', 0);
    } catch (e) {
      this.log.error(`No se pudo encolar la cancelación de la cita ${citaId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private auditar(u: UsuarioSesion, accion: string, entidad: string, entidadId: string | null, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({ data: { usuarioId: u.id, organizacionId: null, accion, entidad, entidadId, datos: datos as Prisma.InputJsonValue } });
  }
}
