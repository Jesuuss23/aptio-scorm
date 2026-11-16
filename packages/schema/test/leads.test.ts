import { describe, expect, it } from 'vitest';
import {
  asistenteDe, atribuir, celdaCsv, COLUMNAS_CSV, etiquetaEtapa, etiquetaOrigen, ETAPAS_LEAD, fusionarLead, leadNuevo, leadsACsv, leerUtm, LIMITES_LEAD,
  normalizarPagina, normalizarReferente, ORIGENES_LEAD, resumenUtm, validarEnvioLead, VIAS_LEAD, type EnvioLead,
} from '../src/leads.js';

const AHORA = new Date('2026-11-13T15:00:00.000Z');
const envio = (mas: Record<string, unknown> = {}) => {
  const r = validarEnvioLead({ nombre: 'Rocío Mendoza', correo: 'RMendoza@NuevoHorizonte.example', consentimiento: true, ...mas });
  if (!r.ok || r.trampa) throw new Error('el envío de prueba no validó');
  return r.envio;
};

describe('HU-1601 · catálogos', () => {
  it('orígenes de RN-17-1, vías y etapas con su etiqueta', () => {
    expect(ORIGENES_LEAD).toEqual(['formulario', 'popup', 'chatbot', 'agendador', 'suscripcion', 'boletin', 'asistente_ia']);
    expect(VIAS_LEAD).not.toContain('asistente_ia');
    expect(ETAPAS_LEAD).toEqual(['NUEVO', 'CONTACTADO', 'DEMO', 'PROPUESTA', 'GANADO', 'PERDIDO']);
    expect([etiquetaOrigen('popup'), etiquetaOrigen('asistente_ia'), etiquetaOrigen('suscripcion'), etiquetaEtapa('NUEVO'), etiquetaEtapa('PERDIDO')]).toEqual(['Popup', 'Asistente IA', 'Suscripción', 'Nuevo', 'Perdido']);
  });
});

describe('HU-1601 · UTM', () => {
  it('extrae los 5 parámetros de una cadena de consulta y normaliza fuente y medio', () => {
    expect(leerUtm('https://aptioscorm.com/precios?utm_source=LinkedIn&utm_medium=Social&utm_campaign=Lanzamiento%20Q4&utm_term=scorm+ia&utm_content=Banner-A&otro=1#x')).toEqual({
      utmSource: 'linkedin', utmMedium: 'social', utmCampaign: 'Lanzamiento Q4', utmTerm: 'scorm ia', utmContent: 'Banner-A',
    });
    expect(leerUtm('utm_source=google')).toMatchObject({ utmSource: 'google', utmMedium: null, utmCampaign: null });
  });

  it('lee de un objeto o de URLSearchParams y descarta lo que no es texto plano', () => {
    expect(leerUtm({ utm_source: '  linkedin ', utm_medium: '<b>x</b>', utm_campaign: 7, utm_term: '' })).toEqual({ utmSource: 'linkedin', utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null });
    expect(leerUtm(new URLSearchParams('utm_content=a')).utmContent).toBe('a');
    expect(leerUtm(null).utmSource).toBeNull();
    expect(leerUtm({ utm_source: 'x'.repeat(400) }).utmSource).toHaveLength(LIMITES_LEAD.utm);
  });

  it('resume fuente y medio', () => {
    expect([resumenUtm({ utmSource: 'linkedin', utmMedium: 'social' }), resumenUtm({ utmSource: 'linkedin', utmMedium: null }), resumenUtm({ utmSource: null, utmMedium: null })]).toEqual(['linkedin / social', 'linkedin', 'directo']);
  });
});

describe('HU-1601 · atribución (RN-17-1)', () => {
  it('reconoce los asistentes de IA por el dominio del referente o de utm_source', () => {
    expect(asistenteDe('https://chatgpt.com/')).toBe('ChatGPT');
    expect(asistenteDe('https://www.perplexity.ai/search?q=scorm')).toBe('Perplexity');
    expect(asistenteDe('https://claude.ai/chat/1')).toBe('Claude');
    expect(asistenteDe('https://gemini.google.com/app')).toBe('Gemini');
    expect(asistenteDe('https://copilot.microsoft.com/')).toBe('Copilot');
    expect(asistenteDe(null, 'chatgpt.com')).toBe('ChatGPT');
    expect(asistenteDe('https://www.google.com/')).toBeNull();
    expect(asistenteDe('https://noperplexity.ai.example/')).toBeNull();
    expect(asistenteDe('no es una url', 'linkedin')).toBeNull();
  });

  it('con referente de asistente el origen es asistente_ia y la vía conserva el canal', () => {
    expect(atribuir({ via: 'popup', referente: 'https://www.perplexity.ai/' })).toEqual({ origen: 'asistente_ia', via: 'popup' });
    expect(atribuir({ via: 'formulario', referente: 'https://www.linkedin.com/feed', utmSource: 'linkedin' })).toEqual({ origen: 'formulario', via: 'formulario' });
    expect(atribuir({ via: 'popup' })).toEqual({ origen: 'popup', via: 'popup' });
  });

  it('normaliza la página (sin base, consulta ni ancla) y el referente (sin consulta)', () => {
    expect(normalizarPagina('/s/precios/?utm_source=x#planes', '/s')).toBe('/precios');
    expect(normalizarPagina('/s', '/s')).toBe('/');
    expect(normalizarPagina('https://aptioscorm.com/sectores/mineria?x=1')).toBe('/sectores/mineria');
    expect([normalizarPagina('precios'), normalizarPagina('//otro.example/x'), normalizarPagina('/a<b>'), normalizarPagina(''), normalizarPagina(3)]).toEqual([null, null, null, null, null]);
    expect(normalizarReferente('https://www.linkedin.com/feed/?trk=abc#x')).toBe('https://www.linkedin.com/feed/');
    expect([normalizarReferente('javascript:alert(1)'), normalizarReferente('nada'), normalizarReferente('')]).toEqual([null, null, null]);
  });
});

describe('HU-1601 · envío público', () => {
  it('normaliza el correo, exige consentimiento y completa la página de entrada', () => {
    const e = envio({ empresa: ' Colegio  Nuevo Horizonte ', mensaje: 'Hola,\r\n\r\n\r\n\r\nquiero   una demo.', paginaFormulario: '/s/contacto', utm_source: 'LinkedIn', referente: 'https://www.linkedin.com/feed/?a=1', idioma: 'en' }) ;
    expect(e).toMatchObject({
      correo: 'rmendoza@nuevohorizonte.example', nombre: 'Rocío Mendoza', empresa: 'Colegio Nuevo Horizonte', mensaje: 'Hola,\n\nquiero una demo.', via: 'formulario',
      paginaFormulario: '/s/contacto', paginaEntrada: '/s/contacto', utmSource: 'linkedin', referente: 'https://www.linkedin.com/feed/', idioma: 'en',
    });
    expect(validarEnvioLead({ nombre: 'A', correo: 'a@b.example', consentimiento: 'on', paginaFormulario: '/s/contacto', paginaEntrada: '/s/?utm_source=x' }, '/s')).toMatchObject({ ok: true, envio: { paginaEntrada: '/', paginaFormulario: '/contacto' } });
    expect(envio({ paginaEntrada: 'javascript:1' }).paginaEntrada).toBe('/');
  });

  it('rechaza con el campo de cada error', () => {
    const r = validarEnvioLead({ nombre: '<script>x</script>', correo: 'no-es-correo', empresa: 'e'.repeat(161), mensaje: '<img src=x>', via: 'fax' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errores.map((x) => x.campo)).toEqual(['via', 'correo', 'nombre', 'empresa', 'mensaje', 'consentimiento']);
    expect(validarEnvioLead({ nombre: 'A', correo: 'a@b.example', consentimiento: false })).toMatchObject({ ok: false, errores: [{ campo: 'consentimiento' }] });
    expect(validarEnvioLead(null)).toMatchObject({ ok: false });
  });

  it('el nombre es obligatorio en el formulario y opcional en el popup (CP-128)', () => {
    expect(validarEnvioLead({ correo: 'a@b.example', consentimiento: true })).toMatchObject({ ok: false, errores: [{ campo: 'nombre' }] });
    expect(validarEnvioLead({ correo: 'a@b.example', consentimiento: true, via: 'popup' })).toMatchObject({ ok: true, trampa: false, envio: { nombre: '', via: 'popup' } });
  });

  it('con el campo trampa lleno no valida ni guarda nada', () => {
    expect(validarEnvioLead({ website: 'https://spam.example', correo: 'x' })).toEqual({ ok: true, trampa: true });
  });
});

describe('HU-1601 · un lead por correo', () => {
  it('el primer contacto fija origen, vía, entrada y UTM', () => {
    const l = leadNuevo(envio({ via: 'popup', paginaEntrada: '/', paginaFormulario: '/precios', utm_source: 'linkedin', utm_medium: 'social' }), AHORA);
    expect(l).toMatchObject({ origen: 'popup', via: 'popup', paginaEntrada: '/', utmSource: 'linkedin', utmMedium: 'social', consentimiento: true, consentimientoEn: AHORA, totalContactos: 1 });
    expect(l.historialContactos).toEqual([{ en: AHORA.toISOString(), via: 'popup', pagina: '/precios' }]);
  });

  it('otro envío del mismo correo suma al historial sin tocar la atribución', () => {
    const primero = leadNuevo(envio({ via: 'popup', nombre: '', utm_source: 'linkedin' }), AHORA);
    const despues = new Date('2026-11-14T10:00:00.000Z');
    const c = fusionarLead({ ...primero, consentimientoEn: AHORA }, envio({ via: 'formulario', empresa: 'Colegio', mensaje: 'Quiero una demo', paginaFormulario: '/contacto', utm_source: 'google' }), despues);
    expect(c).toEqual({
      nombre: 'Rocío Mendoza', empresa: 'Colegio', mensaje: 'Quiero una demo', consentimiento: true, totalContactos: 2,
      historialContactos: [{ en: AHORA.toISOString(), via: 'popup', pagina: '/' }, { en: despues.toISOString(), via: 'formulario', pagina: '/contacto', mensaje: 'Quiero una demo' }],
    });
    expect(c).not.toHaveProperty('origen');
    expect(c).not.toHaveProperty('utmSource');
    // Lo que ya estaba no se pisa.
    expect(fusionarLead({ nombre: 'Ana', empresa: 'X', mensaje: 'm', totalContactos: 2, historialContactos: 'roto', consentimientoEn: null }, envio({ empresa: 'Y' }), despues)).toMatchObject({ totalContactos: 3, consentimientoEn: despues, historialContactos: [{ via: 'formulario' }] });
  });

  it('el historial guarda los 50 más recientes', () => {
    let actual: Parameters<typeof fusionarLead>[0] = { ...leadNuevo(envio(), AHORA) };
    for (let i = 0; i < 60; i += 1) actual = { ...actual, ...fusionarLead(actual, envio({ mensaje: `m${i}` }) as EnvioLead, AHORA) };
    expect(actual.totalContactos).toBe(61);
    expect(actual.historialContactos).toHaveLength(LIMITES_LEAD.historial);
    expect((actual.historialContactos as { mensaje?: string }[]).at(-1)?.mensaje).toBe('m59');
  });
});

describe('HU-1601 · CSV', () => {
  it('neutraliza las celdas que una hoja de cálculo tomaría como fórmula y dobla las comillas', () => {
    expect(['=1+1', '+51 999', '-2', '@SUM(A1)', '\tx', 'normal', 'dice "hola"', null, 3].map(celdaCsv)).toEqual(['"\'=1+1"', '"\'+51 999"', '"\'-2"', '"\'@SUM(A1)"', '"\'\tx"', '"normal"', '"dice ""hola"""', '""', '"3"']);
  });

  it('arma el archivo con BOM, cabecera y CRLF', () => {
    const csv = leadsACsv([{ ...leadNuevo(envio({ via: 'popup', nombre: '=HYPERLINK("http://x")', utm_source: 'linkedin', mensaje: 'línea 1\nlínea 2' }), AHORA), etapa: 'NUEVO', creadoEn: AHORA }]);
    expect(csv.startsWith('﻿"Fecha","Nombre","Correo"')).toBe(true);
    const filas = csv.slice(1).split('\r\n');
    expect(filas[0]!.split(',')).toHaveLength(COLUMNAS_CSV.length);
    expect(filas[1]).toContain('"2026-11-13T15:00:00.000Z","\'=HYPERLINK(""http://x"")","rmendoza@nuevohorizonte.example","","Popup","Popup","/"');
    expect(filas[1]).toContain('"linkedin"');
    expect(csv).toContain('"Nuevo","1","línea 1\nlínea 2"\r\n');
  });
});
