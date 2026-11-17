// HU-1605 · Agendamiento (REQ-078, RN-17-5, CP-135, CP-136): hora de Lima, feriados de Perú, franjas libres, asesor,
// validaciones, reserva, invitación iCalendar y Google Calendar, y recordatorios.
import { describe, expect, it } from 'vitest';
import {
  AJUSTES_AGENDA_POR_DEFECTO, asesoresLibres, deLima, diaHabil, diaSemana, elegirAsesor, enlaceGoogleCalendar, escaparIcs, esFeriado, esFecha, etapaTrasAgendar,
  fechaLima, feriadosPeru, franjasLibres, horaLima, invitacionIcs, pascua, plegarIcs, recordatoriosPorProgramar, textoFechaCita, validarAjustesAgenda, validarAsesor,
  validarReserva, validarTipo, type CitaCalendario,
} from '../src/agenda.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TIPO = '33333333-3333-4333-8333-333333333333';

describe('hora de Lima (UTC−5 todo el año)', () => {
  it('convierte en los dos sentidos, también cerca de la medianoche', () => {
    expect(deLima('2026-11-17', '10:00').toISOString()).toBe('2026-11-17T15:00:00.000Z');
    expect(fechaLima(new Date('2026-11-17T04:59:00Z'))).toBe('2026-11-16');
    expect(fechaLima(new Date('2026-11-17T05:00:00Z'))).toBe('2026-11-17');
    expect(horaLima(new Date('2026-07-01T14:30:00Z'))).toBe('09:30');
    expect(diaSemana('2026-11-16')).toBe(1);
    expect(diaSemana('2026-11-22')).toBe(7);
    expect(esFecha('2026-02-30')).toBe(false);
    expect(esFecha('2026-02-28')).toBe(true);
  });
});

describe('feriados de Perú', () => {
  it('la Pascua de 2026 y 2027 da el Jueves y el Viernes Santo', () => {
    expect(pascua(2026)).toBe('2026-04-05');
    expect(pascua(2027)).toBe('2027-03-28');
    const f26 = feriadosPeru(2026);
    expect(f26.filter((f) => /^(Jueves|Viernes) Santo$/.test(f.nombre)).map((f) => f.fecha)).toEqual(['2026-04-02', '2026-04-03']);
    expect(feriadosPeru(2027).filter((f) => /^(Jueves|Viernes) Santo$/.test(f.nombre)).map((f) => f.fecha)).toEqual(['2027-03-25', '2027-03-26']);
  });

  it('trae los 16 feriados nacionales ordenados y esFeriado los reconoce', () => {
    const f = feriadosPeru(2026);
    expect(f).toHaveLength(16);
    expect(f.map((x) => x.fecha)).toEqual([...f.map((x) => x.fecha)].sort());
    for (const d of ['2026-01-01', '2026-05-01', '2026-06-07', '2026-06-29', '2026-07-23', '2026-07-28', '2026-07-29', '2026-08-06', '2026-08-30', '2026-10-08', '2026-11-01', '2026-12-08', '2026-12-09', '2026-12-25']) expect(esFeriado(d)).toBe(true);
    expect(esFeriado('2026-11-17')).toBe(false);
    expect(esFeriado('2027-03-26')).toBe(true);
  });

  it('un día hábil es de lunes a viernes, sin feriado ni bloqueo', () => {
    expect(diaHabil('2026-11-17', [])).toBe(true);
    expect(diaHabil('2026-11-21', [])).toBe(false);
    expect(diaHabil('2026-12-08', [])).toBe(false);
    expect(diaHabil('2026-11-17', ['2026-11-17'])).toBe(false);
  });
});

describe('franjas libres (CP-135)', () => {
  // Lunes 16 de noviembre de 2026, 10:00 de Lima.
  const AHORA = deLima('2026-11-16', '10:00');
  const AJ = { ...AJUSTES_AGENDA_POR_DEFECTO, horizonteDias: 7 };

  it('respeta la anticipación de 4 h, los fines de semana y el horizonte', () => {
    const f = franjasLibres(AJ, { minutos: 30, asesorIds: [A] }, [], AHORA);
    // Hoy solo 15:00 y 16:30 (11:30 cae dentro de las 4 h); después de lunes a viernes, sin sábado ni domingo.
    expect(f.filter((x) => x.fecha === '2026-11-16').map((x) => x.hora)).toEqual(['15:00', '16:30']);
    expect(f.some((x) => x.fecha === '2026-11-21' || x.fecha === '2026-11-22')).toBe(false);
    expect(f.at(-1)!.fecha).toBe('2026-11-23');
    expect(f[0]).toEqual({ fecha: '2026-11-16', hora: '15:00', inicio: '2026-11-16T20:00:00.000Z' });
  });

  it('CP-135 · una franja tomada en el calendario del único asesor no aparece; con otro asesor libre, sí', () => {
    const ocupada = { asesorId: A, inicio: deLima('2026-11-17', '10:00'), fin: deLima('2026-11-17', '10:30') };
    const solo = franjasLibres(AJ, { minutos: 30, asesorIds: [A] }, [ocupada], AHORA);
    expect(solo.some((x) => x.fecha === '2026-11-17' && x.hora === '10:00')).toBe(false);
    expect(solo.some((x) => x.fecha === '2026-11-17' && x.hora === '09:00')).toBe(true);
    const dos = franjasLibres(AJ, { minutos: 30, asesorIds: [A, B] }, [ocupada], AHORA);
    expect(dos.some((x) => x.fecha === '2026-11-17' && x.hora === '10:00')).toBe(true);
  });

  it('una reunión larga choca con la cita siguiente; una que termina justo al empezar, no', () => {
    const ocupada = { asesorId: A, inicio: deLima('2026-11-17', '10:00'), fin: deLima('2026-11-17', '10:30') };
    const largo = franjasLibres(AJ, { minutos: 90, asesorIds: [A] }, [ocupada], AHORA);
    expect(largo.some((x) => x.fecha === '2026-11-17' && x.hora === '09:00')).toBe(false);
    expect(asesoresLibres([A], deLima('2026-11-17', '09:30'), 30, [ocupada])).toEqual([A]);
    expect(asesoresLibres([A], deLima('2026-11-17', '10:29'), 30, [ocupada])).toEqual([]);
  });

  it('sin asesores, feriados y días bloqueados no ofrecen nada', () => {
    expect(franjasLibres(AJ, { minutos: 30, asesorIds: [] }, [], AHORA)).toEqual([]);
    const dic = franjasLibres({ ...AJ, horizonteDias: 3 }, { minutos: 30, asesorIds: [A] }, [], deLima('2026-12-07', '06:00'));
    expect(dic.some((x) => x.fecha === '2026-12-08' || x.fecha === '2026-12-09')).toBe(false);
    const bloq = franjasLibres({ ...AJ, diasBloqueados: ['2026-11-17'] }, { minutos: 30, asesorIds: [A] }, [], AHORA);
    expect(bloq.some((x) => x.fecha === '2026-11-17')).toBe(false);
  });
});

describe('asesor, etapa y recordatorios', () => {
  it('elige al asesor libre con menos citas y, si empatan, al primero', () => {
    expect(elegirAsesor([A, B], [{ asesorId: A }, { asesorId: A }, { asesorId: B }])).toBe(B);
    expect(elegirAsesor([A, B], [])).toBe(A);
    expect(elegirAsesor([], [])).toBeNull();
  });

  it('agendar pasa Nuevo y Contactado a Demo y no baja las etapas posteriores (SUP-254)', () => {
    expect(etapaTrasAgendar('NUEVO')).toBe('DEMO');
    expect(etapaTrasAgendar('CONTACTADO')).toBe('DEMO');
    expect(etapaTrasAgendar('PROPUESTA')).toBe('PROPUESTA');
    expect(etapaTrasAgendar('GANADO')).toBe('GANADO');
  });

  it('CP-136 · programa los recordatorios a las 24 h y a 1 h solo si todavía no pasaron', () => {
    const inicio = deLima('2026-11-18', '10:00');
    expect(recordatoriosPorProgramar(inicio, deLima('2026-11-16', '10:00')).map((r) => [r.clave, r.en.toISOString()])).toEqual([
      ['24h', '2026-11-17T15:00:00.000Z'], ['1h', '2026-11-18T14:00:00.000Z'],
    ]);
    expect(recordatoriosPorProgramar(inicio, deLima('2026-11-17', '15:00')).map((r) => r.clave)).toEqual(['1h']);
    expect(recordatoriosPorProgramar(inicio, deLima('2026-11-18', '09:30'))).toEqual([]);
  });

  it('dice la fecha en el idioma del visitante y siempre con la hora de Lima', () => {
    expect(textoFechaCita(deLima('2026-11-17', '10:00'))).toBe('martes 17 de noviembre de 2026, 10:00 (hora de Lima)');
    expect(textoFechaCita(deLima('2026-11-17', '15:00'), 'en')).toBe('Tuesday, November 17, 2026, 15:00 (Lima time)');
  });
});

describe('validaciones del panel', () => {
  it('ajustes: franjas HH:MM ordenadas y sin repetir, límites y días bloqueados', () => {
    const r = validarAjustesAgenda(AJUSTES_AGENDA_POR_DEFECTO, { franjas: ['15:00', '09:00', '09:00'], anticipacionHoras: 2, diasBloqueados: ['2026-12-31', '2026-12-24'] });
    expect(r).toEqual({ ok: true, ajustes: { ...AJUSTES_AGENDA_POR_DEFECTO, franjas: ['09:00', '15:00'], anticipacionHoras: 2, diasBloqueados: ['2026-12-24', '2026-12-31'] } });
    const mal = validarAjustesAgenda(AJUSTES_AGENDA_POR_DEFECTO, { franjas: ['9:00'], horizonteDias: 0, diasBloqueados: ['31/12/2026'], recordatoriosCorreo: 'si' });
    expect(mal.ok ? [] : mal.errores.map((e) => e.campo)).toEqual(['franjas', 'horizonteDias', 'diasBloqueados', 'recordatoriosCorreo']);
    expect(validarAjustesAgenda(AJUSTES_AGENDA_POR_DEFECTO, { franjas: [] }).ok).toBe(false);
  });

  it('tipo: nombre obligatorio, duración de 15 a 120 y sin HTML', () => {
    expect(validarTipo({ nombreEs: ' Demo  del generador ', minutos: 30 })).toEqual({ ok: true, datos: { nombreEs: 'Demo del generador', nombreEn: '', minutos: 30 } });
    const mal = validarTipo({ nombreEs: '<b>x</b>', minutos: 10 });
    expect(mal.ok ? [] : mal.errores.map((e) => e.campo)).toEqual(['nombreEs', 'minutos']);
    expect(validarTipo({ minutos: 121 }).ok).toBe(false);
    expect(validarTipo({ minutos: 120 }, { nombreEs: 'Demo', nombreEn: 'Demo', minutos: 30 })).toEqual({ ok: true, datos: { nombreEs: 'Demo', nombreEn: 'Demo', minutos: 120 } });
  });

  it('asesor: correo válido y enlace https sin usuario ni clave', () => {
    expect(validarAsesor({ nombre: 'Carla Montoya', correo: 'CARLA@aptio.example', enlaceVideollamada: 'https://meet.google.com/abc-defg-hij' }))
      .toEqual({ ok: true, datos: { nombre: 'Carla Montoya', correo: 'carla@aptio.example', enlaceVideollamada: 'https://meet.google.com/abc-defg-hij' } });
    for (const enlace of ['http://meet.google.com/x', 'javascript:alert(1)', 'https://u:p@zoom.us/j/1', 'https://localhost/x']) {
      const r = validarAsesor({ nombre: 'X', correo: 'x@y.com', enlaceVideollamada: enlace });
      expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['enlaceVideollamada']);
    }
  });
});

describe('reserva del visitante', () => {
  const OK = { tipoId: TIPO, inicio: '2026-11-17T15:00:00.000Z', nombre: 'Mariana Paredes', correo: 'MParedes@minera.example', empresa: 'Minera', lms: 'Moodle', consentimiento: true, paginaFormulario: '/s/agendar-demo', utm_source: 'linkedin' };

  it('valida como un lead con vía agendador y guarda el UTM', () => {
    const r = validarReserva(OK, '/s');
    expect(r.ok && !r.trampa && r.reserva).toMatchObject({ tipoId: TIPO, lms: 'Moodle', envio: { via: 'agendador', correo: 'mparedes@minera.example', paginaFormulario: '/agendar-demo', utmSource: 'linkedin' } });
    expect(r.ok && !r.trampa && r.reserva.inicio.toISOString()).toBe('2026-11-17T15:00:00.000Z');
  });

  it('pide tipo, franja, nombre y consentimiento; el LMS es del catálogo', () => {
    const r = validarReserva({ inicio: 'mañana', correo: 'x@y.com', lms: 'Moodl' });
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['inicio', 'tipoId', 'nombre', 'consentimiento', 'lms']);
  });

  it('el campo trampa lleno se descarta en silencio', () => {
    expect(validarReserva({ ...OK, website: 'spam' })).toEqual({ ok: true, trampa: true });
  });

  it('CP-134 · desde el chatbot la reserva lleva vía «chatbot» y también pide el nombre; otra vía no vale', () => {
    const r = validarReserva({ ...OK, via: 'chatbot' }, '/s');
    expect(r.ok && !r.trampa && r.reserva.envio.via).toBe('chatbot');
    const sinNombre = validarReserva({ ...OK, via: 'chatbot', nombre: '' });
    expect(sinNombre.ok ? [] : sinNombre.errores.map((e) => e.campo)).toContain('nombre');
    const otra = validarReserva({ ...OK, via: 'popup' });
    expect(otra.ok ? [] : otra.errores.map((e) => e.campo)).toEqual(['via']);
  });
});

describe('invitación iCalendar y Google Calendar (CP-136)', () => {
  const C: CitaCalendario = {
    uid: 'cita-1@aptio', inicio: deLima('2026-11-17', '10:00'), fin: deLima('2026-11-17', '10:30'), titulo: 'Demo del generador; Aptio, SCORM',
    descripcion: 'Enlace: https://meet.google.com/abc\nCancelar: https://aptio.example/s/_cita?t=x', enlace: 'https://meet.google.com/abc-defg-hij',
    organizador: { nombre: 'Carla "Montoya"', correo: 'carla@aptio.example' }, asistente: { nombre: 'Mariana', correo: 'mparedes@minera.example' },
    secuencia: 0, creada: new Date('2026-11-16T15:00:00Z'),
  };

  it('arma un VEVENT con CRLF, UTC, METHOD:REQUEST y el texto escapado', () => {
    const ics = invitacionIcs(C);
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    const plano = ics.replace(/\r\n /g, '');
    expect(plano).toContain('METHOD:REQUEST\r\n');
    expect(plano).toContain('DTSTART:20261117T150000Z\r\nDTEND:20261117T153000Z\r\n');
    expect(plano).toContain('SUMMARY:Demo del generador\\; Aptio\\, SCORM\r\n');
    expect(plano).toContain('DESCRIPTION:Enlace: https://meet.google.com/abc\\nCancelar: https://aptio.example/s/_cita?t=x\r\n');
    expect(plano).toContain('ORGANIZER;CN="Carla  Montoya":mailto:carla@aptio.example');
    expect(plano).toContain('STATUS:CONFIRMED');
  });

  it('la cancelación usa METHOD:CANCEL, el mismo UID y una secuencia mayor', () => {
    const ics = invitacionIcs({ ...C, secuencia: 1 }, 'CANCEL').replace(/\r\n /g, '');
    expect(ics).toContain('METHOD:CANCEL\r\n');
    expect(ics).toContain('UID:cita-1@aptio\r\nSEQUENCE:1\r\n');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('escapa y pliega sin partir caracteres de varios bytes', () => {
    expect(escaparIcs('a\\b;c,d\r\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    const larga = `DESCRIPTION:${'ñ'.repeat(60)}`;
    const p = plegarIcs(larga);
    expect(p.split('\r\n ').join('')).toBe(larga);
    expect(p.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it('el enlace de Google Calendar lleva título, fechas en UTC y la videollamada', () => {
    const u = new URL(enlaceGoogleCalendar(C));
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('dates')).toBe('20261117T150000Z/20261117T153000Z');
    expect(u.searchParams.get('location')).toBe('https://meet.google.com/abc-defg-hij');
    expect(u.searchParams.get('text')).toBe('Demo del generador; Aptio, SCORM');
  });
});
