// HU-1605 · El agendador del sitio (REQ-078, RN-17-5): el bloque reserva su alto (CLS 0), carga `_agenda.js` solo en
// su página, ofrece el formulario y el WhatsApp sin JavaScript, y la página del enlace de cancelación pide confirmar con
// un botón. El recorrido completo (CP-135 y la reserva) lo hace Playwright.
import { describe, expect, it } from 'vitest';
import { ARCHIVO_AGENDA, CSS_AGENDA, RUTA_CITAS_API, SCRIPT_AGENDA } from '../src/agenda.js';
import { agendaDeEjemplo, instantaneaDeEjemplo } from '../src/ejemplo.js';
import { renderizarCita, renderizarPagina, renderizarSitio, tieneAgendador } from '../src/render.js';
import { resolverPedido } from '../src/servir.js';
import { deLima } from '@aptio/schema/agenda';

const op = { base: '/s', sitioUrl: 'https://aptioscorm.com', entorno: 'produccion' as const };

describe('bloque agendador', () => {
  it('solo la versión con el agendador trae _agenda.js, y solo su página lo carga', () => {
    const sin = instantaneaDeEjemplo();
    expect(tieneAgendador(sin)).toBe(false);
    expect(renderizarSitio(sin, op).some((a) => a.archivo === ARCHIVO_AGENDA)).toBe(false);
    const con = instantaneaDeEjemplo('produccion', { agenda: true });
    const archivos = renderizarSitio(con, op);
    expect(archivos.find((a) => a.archivo === ARCHIVO_AGENDA)).toEqual({ archivo: '_agenda.js', contenido: SCRIPT_AGENDA, mime: 'text/javascript; charset=utf-8' });
    expect(archivos.some((a) => a.archivo === '_captacion.js')).toBe(true);
    const html = renderizarPagina(con, '/agendar-demo', 'es', op)!;
    expect(html).toContain('<script src="/s/_agenda.js" defer=""></script>');
    expect(renderizarPagina(con, '/', 'es', op)).not.toContain('_agenda.js');
    expect(resolverPedido('/_agenda.js')).toEqual({ tipo: 'script', archivo: '_agenda.js' });
  });

  it('reserva el alto del contenedor y, sin JavaScript, ofrece el formulario de contacto y el WhatsApp', () => {
    const inst = instantaneaDeEjemplo('produccion', { agenda: true });
    const conWhatsapp = { ...inst, sitio: { ...inst.sitio!, whatsapp: { numero: '+51900000000', mensaje: null } } };
    const html = renderizarPagina(conWhatsapp, '/agendar-demo', 'es', op)!;
    expect(html).toContain('<div class="booker" data-agenda="" data-base="/s" aria-live="polite" aria-busy="true">');
    expect(CSS_AGENDA).toMatch(/\.booker\{[^}]*min-height:520px/);
    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? '';
    expect(noscript).toContain('Para elegir día y hora necesitas JavaScript');
    expect(noscript).toContain('action="/s/_lead"');
    expect(noscript).toContain('name="consentimiento"');
    expect(noscript).toContain('https://wa.me/51900000000');
    expect(html).toContain('<h1>Agendar demo</h1>');
  });

  it('el script es del mismo origen, sin cookies ni HTML, y vuelve a pedir los horarios ante un 409', () => {
    expect(() => new Function(SCRIPT_AGENDA)).not.toThrow();
    expect(SCRIPT_AGENDA).not.toMatch(/document\.cookie|innerHTML|outerHTML|insertAdjacentHTML|eval\(|https?:\/\//);
    expect(SCRIPT_AGENDA).toContain(JSON.stringify(RUTA_CITAS_API));
    expect(SCRIPT_AGENDA).toContain("'aria-pressed'");
    expect(SCRIPT_AGENDA).toContain('ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7');
    expect(SCRIPT_AGENDA).toContain('r.s===409');
    expect(SCRIPT_AGENDA).toContain("role:'status'");
  });

  it('la agenda de ejemplo omite la franja ocupada del asesor (CP-135)', () => {
    const a = agendaDeEjemplo(deLima('2026-11-16', '08:00'));
    expect(a.franjas.some((f) => f.fecha === '2026-11-17' && f.hora === '10:00')).toBe(false);
    expect(a.franjas.some((f) => f.fecha === '2026-11-17' && f.hora === '09:00')).toBe(true);
    expect(a).toMatchObject({ zona: 'America/Lima', hoy: '2026-11-16', horizonte: '2026-12-16', tipoId: a.tipos[0]!.id });
  });
});

describe('página del enlace de cancelación', () => {
  it('muestra la cita y pide confirmar con un botón; el token va en un campo oculto', () => {
    const html = renderizarCita(null, op, { estado: 'activa', token: 'tok<x>', tipo: 'Demo del generador', texto: 'martes 17 de noviembre de 2026, 10:00 (hora de Lima)' });
    expect(html).toContain('<h1>Cancelar tu demo</h1>');
    expect(html).toContain('<form class="cita-form" action="/s/_cita" method="post"><input type="hidden" name="t" value="tok&lt;x&gt;"/>');
    expect(html).toContain('<button class="btn primary" type="submit">Cancelar mi demo</button>');
    expect(html).toContain('noindex, nofollow');
    expect(html).not.toContain('<script');
  });

  it('dice el resultado en el idioma de la cita, siempre con la hora de Lima', () => {
    expect(renderizarCita(null, op, { estado: 'cancelada', tipo: 'Generator demo', texto: 'Tuesday, November 17, 2026, 15:00 (Lima time)' }, 'en'))
      .toMatch(/<h1>Your demo was cancelled<\/h1><p role="status"><strong>Generator demo<\/strong><br\/>Tuesday, November 17, 2026, 15:00 \(Lima time\)/);
    expect(renderizarCita(null, op, { estado: 'no_encontrada' })).toContain('<p role="alert">El enlace no corresponde a ninguna cita');
    expect(renderizarCita(null, op, { estado: 'empezada' })).toContain('Esta cita ya empezó');
  });
});
