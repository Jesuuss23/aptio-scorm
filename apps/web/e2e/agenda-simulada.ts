// HU-1605 · El agendador simulado, con las mismas reglas que la API (las funciones de @aptio/schema/agenda): el panel
// Captación › Agendamiento (PNT-33), `GET /s/_agenda.json` y `POST /api/v1/publico/citas` con el 409 FRANJA_OCUPADA.
import {
  AJUSTES_AGENDA_POR_DEFECTO, type AjustesAgenda, asesoresLibres, deLima, elegirAsesor, enlaceGoogleCalendar, ESTADOS_PANEL, etapaTrasAgendar, fechaLima, feriadosPeru,
  franjasLibres, horaLima, invitacionIcs, sumarDias, textoFechaCita, validarAjustesAgenda, validarAsesor, validarReserva, validarTipo, ZONA_LIMA,
} from '@aptio/schema/agenda';

export interface TipoSim { id: string; nombreEs: string; nombreEn: string; minutos: number; asesorIds: string[]; visible: boolean; ficticio: boolean }
export interface AsesorSim { id: string; nombre: string; correo: string; enlaceVideollamada: string; visible: boolean; ficticio: boolean }
export interface CitaSim {
  id: string; tipoId: string; asesorId: string; inicio: string; fin: string; nombre: string; correo: string; empresa: string | null; lms: string | null; idioma: 'es' | 'en';
  estado: 'confirmada' | 'cancelada' | 'realizada' | 'no_asistio'; leadId: string | null; canceladaPor: 'visitante' | 'superadmin' | null; creadoEn: string;
}
export interface AgendaSitioSim { tipos?: TipoSim[]; asesores?: AsesorSim[]; citas?: CitaSim[]; ajustes?: Partial<AjustesAgenda> }

/** Lo que las pruebas leen después: las reservas que llegaron al servidor. */
export const reservasSim: { status: number; cuerpo: Record<string, unknown> }[] = [];

type Respuesta = { status: number; body?: unknown };
type Error422 = { campo: string; mensaje: string };
const noValido = (errores: Error422[]): Respuesta => ({ status: 422, body: { codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores } });
const noExiste = (mensaje: string): Respuesta => ({ status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje } });

export function crearAgendaSim(
  inicial: AgendaSitioSim,
  entorno: 'pruebas' | 'produccion',
  lead: (cuerpo: Record<string, unknown>) => { id: string; etapa: string } | null,
) {
  let ajustes: AjustesAgenda = { ...AJUSTES_AGENDA_POR_DEFECTO, ...inicial.ajustes };
  let tipos: TipoSim[] = (inicial.tipos ?? []).map((t) => ({ ...t, asesorIds: [...t.asesorIds] }));
  const asesores: AsesorSim[] = (inicial.asesores ?? []).map((a) => ({ ...a }));
  const citas: CitaSim[] = (inicial.citas ?? []).map((c) => ({ ...c }));
  let secuencia = 900;
  const nuevoId = (bloque: string) => `00000000-0000-4000-${bloque}-${String(++secuencia).padStart(12, '0')}`;
  const publico = <T extends { visible: boolean; ficticio: boolean }>(x: T) => x.visible && !(entorno === 'produccion' && x.ficticio);
  const ahora = () => new Date();

  const tipoDto = (t: TipoSim) => ({ ...t, orden: tipos.indexOf(t) });
  const asesorDto = (a: AsesorSim) => ({ ...a, citasProximas: citas.filter((c) => c.asesorId === a.id && c.estado === 'confirmada' && Date.parse(c.inicio) >= Date.now()).length });
  const citaDto = (c: CitaSim) => {
    const inicio = new Date(c.inicio);
    return {
      ...c, fecha: fechaLima(inicio), hora: horaLima(inicio), tipo: tipos.find((t) => t.id === c.tipoId)?.nombreEs ?? '', asesor: asesores.find((a) => a.id === c.asesorId)?.nombre ?? '',
      invitacionEnviadaEn: c.creadoEn, recordatorio24hEnviadoEn: null, recordatorio1hEnviadoEn: null,
    };
  };
  const ver = () => {
    const anio = +fechaLima(ahora()).slice(0, 4);
    return { ajustes, feriados: [...feriadosPeru(anio), ...feriadosPeru(anio + 1)], tipos: tipos.map(tipoDto), asesores: [...asesores].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(asesorDto) };
  };
  const tiposPublicos = () => tipos.filter(publico).map((t) => ({ ...t, asesorIds: t.asesorIds.filter((id) => asesores.some((a) => a.id === id && publico(a))) })).filter((t) => t.asesorIds.length);
  const ocupadas = (ids: readonly string[]) => citas.filter((c) => ids.includes(c.asesorId) && c.estado === 'confirmada').map((c) => ({ asesorId: c.asesorId, inicio: new Date(c.inicio), fin: new Date(c.fin) }));
  const nombreTipo = (t: TipoSim, idioma: string) => (idioma === 'en' && t.nombreEn ? t.nombreEn : t.nombreEs);

  return {
    citas,
    /** `GET /s/_agenda.json`. */
    publica(q: URLSearchParams) {
      const idioma = q.get('idioma') === 'en' ? 'en' : 'es';
      const lista = tiposPublicos();
      const tipo = lista.find((t) => t.id === q.get('tipo')) ?? lista[0];
      const hoy = fechaLima(ahora());
      const base = { zona: ZONA_LIMA, tipos: lista.map((t) => ({ id: t.id, nombre: nombreTipo(t, idioma), minutos: t.minutos })), hoy, horizonte: sumarDias(hoy, ajustes.horizonteDias) };
      if (!tipo) return { ...base, tipoId: null, franjas: [] };
      return { ...base, tipoId: tipo.id, franjas: franjasLibres(ajustes, { minutos: tipo.minutos, asesorIds: tipo.asesorIds }, ocupadas(tipo.asesorIds), ahora()) };
    },
    /** `POST /publico/citas`. */
    reservar(cuerpo: Record<string, unknown>): Respuesta {
      const r = validarReserva(cuerpo, '/s');
      const res = ((): Respuesta => {
        if (!r.ok) return noValido(r.errores);
        if (r.trampa) return { status: 201, body: { recibido: true, cita: null } };
        const { reserva } = r;
        const tipo = tiposPublicos().find((t) => t.id === reserva.tipoId);
        if (!tipo) return { status: 422, body: { codigo: 'TIPO_NO_DISPONIBLE', mensaje: 'Ese tipo de reunión ya no se ofrece: elige otro' } };
        const iso = reserva.inicio.toISOString();
        if (!franjasLibres(ajustes, { minutos: tipo.minutos, asesorIds: tipo.asesorIds }, [], ahora()).some((f) => f.inicio === iso)) {
          return { status: 422, body: { codigo: 'FRANJA_NO_VALIDA', mensaje: 'Ese horario no se ofrece: elige otro de la lista' } };
        }
        const oc = ocupadas(tipo.asesorIds);
        const libres = asesoresLibres(tipo.asesorIds, reserva.inicio, tipo.minutos, oc);
        const asesorId = elegirAsesor(libres, oc.filter((o) => o.inicio >= ahora()));
        if (!asesorId) return { status: 409, body: { codigo: 'FRANJA_OCUPADA', mensaje: 'Alguien acaba de tomar ese horario: elige otro' } };
        const l = lead({ ...cuerpo, via: cuerpo.via === 'chatbot' ? 'chatbot' : 'agendador' });
        if (l) l.etapa = etapaTrasAgendar(l.etapa);
        const fin = new Date(reserva.inicio.getTime() + tipo.minutos * 60_000);
        const c: CitaSim = {
          id: nuevoId('9a00'), tipoId: tipo.id, asesorId, inicio: iso, fin: fin.toISOString(), nombre: reserva.envio.nombre, correo: reserva.envio.correo, empresa: reserva.envio.empresa,
          lms: reserva.lms, idioma: reserva.envio.idioma === 'en' ? 'en' : 'es', estado: 'confirmada', leadId: l?.id ?? null, canceladaPor: null, creadoEn: ahora().toISOString(),
        };
        citas.push(c);
        const asesor = asesores.find((a) => a.id === asesorId)!;
        const evento = {
          uid: `cita-${c.id}@aptio`, inicio: reserva.inicio, fin, titulo: `${nombreTipo(tipo, c.idioma)} · Aptio SCORM`, descripcion: asesor.enlaceVideollamada, enlace: asesor.enlaceVideollamada,
          organizador: { nombre: asesor.nombre, correo: asesor.correo }, asistente: { nombre: c.nombre, correo: c.correo }, secuencia: 0, creada: new Date(c.creadoEn),
        };
        return {
          status: 201,
          body: { recibido: true, cita: { id: c.id, inicio: c.inicio, fin: c.fin, tipo: nombreTipo(tipo, c.idioma), enlace: asesor.enlaceVideollamada, google: enlaceGoogleCalendar(evento), ics: invitacionIcs(evento), texto: textoFechaCita(reserva.inicio, c.idioma) } },
        };
      })();
      reservasSim.push({ status: res.status, cuerpo });
      return res;
    },
    /** `/captacion/agenda*` (solo el superadmin; el permiso lo revisa quien llama). */
    panel(ruta: string, metodo: string, cuerpo: Record<string, unknown>, q: URLSearchParams): Respuesta {
      const sub = ruta.slice('/captacion/agenda'.length);
      const id = sub.split('/')[2] ?? '';
      if (sub === '' && metodo === 'GET') return { status: 200, body: ver() };
      if (sub === '' && metodo === 'PATCH') {
        const r = validarAjustesAgenda(ajustes, cuerpo);
        if (!r.ok) return noValido(r.errores);
        ajustes = r.ajustes;
        return { status: 200, body: ajustes };
      }
      if (sub === '/tipos' && metodo === 'POST') {
        const r = validarTipo(cuerpo);
        if (!r.ok) return noValido(r.errores);
        const t: TipoSim = { id: nuevoId('9b00'), ...r.datos, asesorIds: [...new Set((cuerpo.asesorIds as string[] | undefined) ?? [])], visible: cuerpo.visible === true, ficticio: cuerpo.ficticio === true };
        tipos.push(t);
        return { status: 201, body: tipoDto(t) };
      }
      if (sub === '/tipos/orden' && metodo === 'PUT') {
        const ids = cuerpo.ids as string[];
        if (new Set(ids).size !== tipos.length || !tipos.every((t) => ids.includes(t.id))) return { status: 422, body: { codigo: 'ORDEN_INCOMPLETO', mensaje: 'El orden debe incluir cada tipo de reunión una sola vez' } };
        tipos = ids.map((x) => tipos.find((t) => t.id === x)!);
        return { status: 200, body: tipos.map(tipoDto) };
      }
      if (sub.startsWith('/tipos/')) {
        const t = tipos.find((x) => x.id === id);
        if (!t) return noExiste('El tipo de reunión no existe');
        if (metodo === 'DELETE') {
          if (citas.some((c) => c.tipoId === id)) return { status: 409, body: { codigo: 'TIPO_CON_CITAS', mensaje: 'Este tipo tiene citas: apágalo para dejar de ofrecerlo y conserva su historial' } };
          tipos = tipos.filter((x) => x !== t);
          return { status: 204 };
        }
        const r = validarTipo(cuerpo, t);
        if (!r.ok) return noValido(r.errores);
        Object.assign(t, r.datos, typeof cuerpo.visible === 'boolean' ? { visible: cuerpo.visible } : {}, typeof cuerpo.ficticio === 'boolean' ? { ficticio: cuerpo.ficticio } : {});
        if (Array.isArray(cuerpo.asesorIds)) t.asesorIds = [...new Set(cuerpo.asesorIds as string[])];
        return { status: 200, body: tipoDto(t) };
      }
      if (sub === '/asesores' && metodo === 'POST') {
        const r = validarAsesor(cuerpo);
        if (!r.ok) return noValido(r.errores);
        const a: AsesorSim = { id: nuevoId('9c00'), ...r.datos, visible: cuerpo.visible !== false, ficticio: cuerpo.ficticio === true };
        asesores.push(a);
        return { status: 201, body: asesorDto(a) };
      }
      if (sub.startsWith('/asesores/')) {
        const a = asesores.find((x) => x.id === id);
        if (!a) return noExiste('El asesor no existe');
        if (metodo === 'DELETE') {
          if (citas.some((c) => c.asesorId === id)) return { status: 409, body: { codigo: 'ASESOR_CON_CITAS', mensaje: 'Este asesor tiene citas: apágalo para que no reciba nuevas y conserva su historial' } };
          asesores.splice(asesores.indexOf(a), 1);
          for (const t of tipos) t.asesorIds = t.asesorIds.filter((x) => x !== id);
          return { status: 204 };
        }
        const r = validarAsesor(cuerpo, a);
        if (!r.ok) return noValido(r.errores);
        Object.assign(a, r.datos, typeof cuerpo.visible === 'boolean' ? { visible: cuerpo.visible } : {}, typeof cuerpo.ficticio === 'boolean' ? { ficticio: cuerpo.ficticio } : {});
        return { status: 200, body: asesorDto(a) };
      }
      if (sub === '/citas' && metodo === 'GET') {
        const estado = q.get('estado');
        const desde = q.get('desde');
        const hasta = q.get('hasta');
        const lista = citas
          .filter((c) => (!estado || c.estado === estado) && (!desde || Date.parse(c.inicio) >= deLima(desde, '00:00').getTime()) && (!hasta || Date.parse(c.inicio) < deLima(sumarDias(hasta, 1), '00:00').getTime()))
          .sort((a, b) => a.inicio.localeCompare(b.inicio));
        return { status: 200, body: { citas: lista.map(citaDto), total: lista.length } };
      }
      if (sub.startsWith('/citas/') && metodo === 'PATCH') {
        const c = citas.find((x) => x.id === id);
        if (!c) return noExiste('La cita no existe');
        const estado = cuerpo.estado as CitaSim['estado'];
        if (!(ESTADOS_PANEL as readonly string[]).includes(estado)) return noValido([{ campo: 'estado', mensaje: 'El estado es cancelada, realizada o no_asistio' }]);
        if (estado === 'cancelada' && c.estado !== 'confirmada') return { status: 409, body: { codigo: 'CITA_NO_ACTIVA', mensaje: 'Solo se cancela una cita confirmada' } };
        if (estado !== 'cancelada' && c.estado === 'cancelada') return { status: 409, body: { codigo: 'CITA_NO_ACTIVA', mensaje: 'Una cita cancelada no se marca como realizada ni como no asistió' } };
        if (estado !== 'cancelada' && Date.parse(c.inicio) > Date.now()) return { status: 422, body: { codigo: 'CITA_FUTURA', mensaje: 'La cita todavía no empieza' } };
        Object.assign(c, { estado }, estado === 'cancelada' ? { canceladaPor: 'superadmin' } : {});
        return { status: 200, body: citaDto(c) };
      }
      return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'No existe' } };
    },
  };
}
