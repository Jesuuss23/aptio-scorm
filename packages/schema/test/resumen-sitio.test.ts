// HU-1607 · Reglas del resumen del sitio (REQ-080, PNT-24, CP-138).
import { describe, expect, it } from 'vitest';
import {
  contarPorDia, conversionPaginas, diasDe, esBot, esPeriodoResumen, indicador, repartoOrigen, serieDiaria, validarVisita, variacion, ventanaResumen,
} from '../src/resumen-sitio.js';

describe('períodos en hora de Lima', () => {
  // 2026-11-17 03:30 UTC es el 16 de noviembre a las 22:30 en Lima.
  const ahora = new Date('2026-11-17T03:30:00Z');

  it('7 días terminan hoy en Lima y el anterior es la semana de antes', () => {
    const v = ventanaResumen('7d', ahora);
    expect(v.actual).toMatchObject({ desde: '2026-11-10', hasta: '2026-11-16' });
    expect(v.actual.inicio.toISOString()).toBe('2026-11-10T05:00:00.000Z');
    expect(v.actual.fin.toISOString()).toBe('2026-11-17T05:00:00.000Z');
    expect(v.anterior).toMatchObject({ desde: '2026-11-03', hasta: '2026-11-09' });
    expect(v.anterior.fin.getTime()).toBe(v.actual.inicio.getTime());
    expect(diasDe(v.actual)).toHaveLength(7);
  });

  it('30 y 90 días, con el período anterior del mismo largo', () => {
    const t = ventanaResumen('30d', ahora);
    expect(t.actual).toMatchObject({ desde: '2026-10-18', hasta: '2026-11-16' });
    expect(diasDe(t.anterior)).toHaveLength(30);
    const q = ventanaResumen('90d', ahora);
    expect(diasDe(q.actual)).toHaveLength(90);
    expect(q.actual.desde).toBe('2026-08-19');
    expect(q.anterior.hasta).toBe('2026-08-18');
    expect(diasDe(q.anterior)).toHaveLength(90);
  });

  it('a las 00:30 de Lima ya cuenta el día nuevo', () => {
    expect(ventanaResumen('7d', new Date('2026-11-17T05:30:00Z')).actual.hasta).toBe('2026-11-17');
    expect(ventanaResumen('7d', new Date('2026-11-17T04:59:59Z')).actual.hasta).toBe('2026-11-16');
  });

  it('solo 7d, 30d y 90d', () => {
    expect(['7d', '30d', '90d'].every(esPeriodoResumen)).toBe(true);
    expect(esPeriodoResumen('1y')).toBe(false);
  });
});

describe('variación', () => {
  it('porcentaje con un decimal; sin datos antes, null', () => {
    expect(variacion(12, 10)).toBe(20);
    expect(variacion(9, 12)).toBe(-25);
    expect(variacion(1, 3)).toBe(-66.7);
    expect(variacion(5, 0)).toBeNull();
    expect(variacion(0, 0)).toBe(0);
    expect(indicador(10, 8)).toEqual({ actual: 10, anterior: 8, variacion: 25 });
  });
});

describe('reparto por origen (mayor resto)', () => {
  const suma = (r: ReturnType<typeof repartoOrigen>) => r.reduce((s, o) => s + o.porcentaje, 0);

  it('CP-138 · 10 leads en varios orígenes suman 10 y 100 %', () => {
    const r = repartoOrigen({ formulario: 4, popup: 3, chatbot: 2, agendador: 1 });
    expect(r.reduce((s, o) => s + o.leads, 0)).toBe(10);
    expect(suma(r)).toBe(100);
    expect(r.slice(0, 4).map((o) => [o.etiqueta, o.porcentaje])).toEqual([['Formulario', 40], ['Popup', 30], ['Chatbot', 20], ['Agendador', 10]]);
    expect(r).toHaveLength(7);
  });

  it('tercios y repartos raros siguen sumando 100', () => {
    expect(repartoOrigen({ formulario: 1, popup: 1, chatbot: 1 }).slice(0, 3).map((o) => o.porcentaje)).toEqual([34, 33, 33]);
    expect(suma(repartoOrigen({ formulario: 1, popup: 1, chatbot: 1 }))).toBe(100);
    for (const c of [{ formulario: 7, popup: 5, boletin: 1 }, { suscripcion: 2, asistente_ia: 1, agendador: 4, chatbot: 6, popup: 9, formulario: 11, boletin: 3 }]) expect(suma(repartoOrigen(c))).toBe(100);
    expect(suma(repartoOrigen({ popup: 1 }))).toBe(100);
  });

  it('sin leads, todos en 0 %; un origen desconocido no cuenta', () => {
    expect(repartoOrigen({}).every((o) => o.porcentaje === 0 && o.leads === 0)).toBe(true);
    expect(suma(repartoOrigen({ otro: 5 }))).toBe(0);
  });
});

describe('conversión por página', () => {
  it('leads entre visitas iniciadas, de mayor a menor, hasta 5', () => {
    const visitas = { '/': 200, '/precios': 50, '/demo': 10, '/blog/a': 40, '/contacto': 20, '/sin-leads': 99, '/x': 100 };
    const leads = { '/': 4, '/precios': 3, '/demo': 2, '/blog/a': 1, '/contacto': 1, '/x': 1, '/sin-visitas': 3 };
    const r = conversionPaginas(visitas, leads);
    expect(r.map((p) => [p.ruta, p.conversion])).toEqual([['/demo', 20], ['/precios', 6], ['/contacto', 5], ['/blog/a', 2.5], ['/', 2]]);
    expect(conversionPaginas(visitas, {})).toEqual([]);
  });
});

describe('serie diaria', () => {
  it('un punto por día con ceros, contado en hora de Lima', () => {
    const leads = contarPorDia(['2026-11-16T04:59:00Z', '2026-11-16T05:00:00Z', new Date('2026-11-16T20:00:00Z')]);
    expect(leads).toEqual({ '2026-11-15': 1, '2026-11-16': 2 });
    const s = serieDiaria({ desde: '2026-11-14', hasta: '2026-11-16' }, { leads, visitas: { '2026-11-16': 7 } });
    expect(s).toEqual([
      { dia: '2026-11-14', visitas: 0, leads: 0, demos: 0 },
      { dia: '2026-11-15', visitas: 0, leads: 1, demos: 0 },
      { dia: '2026-11-16', visitas: 7, leads: 2, demos: 0 },
    ]);
  });
});

describe('visita anónima', () => {
  it('normaliza la ruta como la página de entrada del lead', () => {
    expect(validarVisita({ ruta: '/s/precios/?utm_source=x#a', idioma: 'es', primeraPagina: true }, '/s')).toEqual({ ruta: '/precios', idioma: 'es', primeraPagina: true, origen: null });
    expect(validarVisita({ ruta: '/', idioma: 'en', primeraPagina: false, origen: 'linkedin' })).toEqual({ ruta: '/', idioma: 'en', primeraPagina: false, origen: 'linkedin' });
    expect(validarVisita({ ruta: '/', primeraPagina: false, origen: 'popup' })!.origen).toBe('popup');
    expect(validarVisita({ ruta: '/', primeraPagina: false, origen: '<script>' })!.origen).toBeNull();
  });

  it('rechaza lo que no es una página del sitio', () => {
    for (const v of [null, [], {}, { ruta: 'precios', primeraPagina: true }, { ruta: '//otro.com', primeraPagina: true }, { ruta: '/_lead', primeraPagina: true },
      { ruta: '/', primeraPagina: 'si' }, { ruta: '/', idioma: 'fr', primeraPagina: true }, { ruta: `/${'a'.repeat(400)}`, primeraPagina: true }]) {
      expect(validarVisita(v)).toBeNull();
    }
  });

  it('los bots y los medidores no cuentan', () => {
    const chrome = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
    expect(esBot(chrome)).toBe(false);
    for (const ua of [null, '', 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'facebookexternalhit/1.1',
      `${chrome} Chrome-Lighthouse`, 'Mozilla/5.0 HeadlessChrome/131.0', 'curl/8.5.0', 'python-requests/2.32']) expect(esBot(ua)).toBe(true);
  });
});
