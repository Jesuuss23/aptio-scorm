// HU-1606 · Reglas del consentimiento de cookies (REQ-079, RN-17-6, CP-137).
import { describe, expect, it } from 'vitest';
import {
  categoriasOfrecidas, cookiesPublicadas, debePreguntar, dominiosCsp, etiquetasACargar, leerDecision, motivoParaPreguntar, nuevaDecision, venceEn,
} from '../src/cookies.js';
import { AJUSTES_POR_DEFECTO, ajustesPublicados, aplicarCambiosAjustes, leerAjustes } from '../src/sitio-ajustes.js';

const TODAS = { ga4: 'G-AB12CD34EF', gtm: 'GTM-AB12CD3', metaPixel: '123456789012345' };
const AHORA = new Date('2026-11-17T15:00:00.000Z');

describe('cookies publicadas', () => {
  it('sin IDs o con el banner apagado no se publica nada (ni banner ni etiquetas)', () => {
    expect(cookiesPublicadas({ visible: true, version: 1 }, { ga4: null, gtm: null, metaPixel: null })).toBeNull();
    expect(cookiesPublicadas({ visible: false, version: 1 }, TODAS)).toBeNull();
    expect(cookiesPublicadas({ visible: true, version: 3 }, { ga4: 'G-AB12CD34EF', gtm: null, metaPixel: '' })).toEqual({ version: 3, etiquetas: { ga4: 'G-AB12CD34EF' } });
  });

  it('las categorías ofrecidas salen de las etiquetas: GA4 y Tag Manager son analítica, Meta Pixel es publicidad', () => {
    expect(categoriasOfrecidas(null)).toEqual([]);
    expect(categoriasOfrecidas({ version: 1, etiquetas: { gtm: 'GTM-AB12CD3' } })).toEqual(['analitica']);
    expect(categoriasOfrecidas({ version: 1, etiquetas: { metaPixel: '123456789012345' } })).toEqual(['publicidad']);
    expect(categoriasOfrecidas({ version: 1, etiquetas: TODAS })).toEqual(['analitica', 'publicidad']);
  });
});

describe('decisión guardada', () => {
  const c = { version: 1, etiquetas: TODAS };

  it('lee solo decisiones con la forma esperada', () => {
    const d = nuevaDecision(c, { analitica: true }, AHORA);
    expect(leerDecision(JSON.stringify(d))).toEqual(d);
    expect(leerDecision('no es json')).toBeNull();
    expect(leerDecision({ ...d, necesarias: false })).toBeNull();
    expect(leerDecision({ ...d, fecha: 'ayer' })).toBeNull();
    expect(leerDecision({ ...d, versionPolitica: 0 })).toBeNull();
    expect(leerDecision({ ...d, ofrecidas: ['analitica', 'otra'] })?.ofrecidas).toEqual(['analitica']);
  });

  it('las necesarias siempre van y solo se aceptan categorías ofrecidas', () => {
    const soloGa = { version: 2, etiquetas: { ga4: 'G-AB12CD34EF' } };
    expect(nuevaDecision(soloGa, { analitica: true, publicidad: true }, AHORA)).toEqual({
      necesarias: true, analitica: true, publicidad: false, fecha: AHORA.toISOString(), versionPolitica: 2, ofrecidas: ['analitica'],
    });
  });

  it('vence a los 12 meses (el 29 de febrero pasa al 28)', () => {
    expect(venceEn(new Date('2026-11-17T15:00:00.000Z')).toISOString()).toBe('2027-11-17T15:00:00.000Z');
    expect(venceEn(new Date('2028-02-29T10:00:00.000Z')).toISOString()).toBe('2029-02-28T10:00:00.000Z');
  });

  it('vuelve a preguntar sin decisión, al vencer, con otra versión de la política o con una categoría nueva', () => {
    const d = nuevaDecision({ version: 1, etiquetas: { ga4: 'G-AB12CD34EF' } }, { analitica: false }, AHORA);
    const soloGa = { version: 1, etiquetas: { ga4: 'G-AB12CD34EF' } };
    expect(motivoParaPreguntar(null, soloGa, AHORA)).toBe('sin_decision');
    expect(motivoParaPreguntar(d, soloGa, new Date('2027-11-16T15:00:00.000Z'))).toBeNull();
    expect(motivoParaPreguntar(d, soloGa, new Date('2027-11-17T15:00:00.000Z'))).toBe('vencida');
    expect(motivoParaPreguntar(d, { ...soloGa, version: 2 }, AHORA)).toBe('version');
    expect(motivoParaPreguntar(d, { version: 1, etiquetas: { ...soloGa.etiquetas, metaPixel: '123456789012345' } }, AHORA)).toBe('categoria_nueva');
    // Otra etiqueta de una categoría ya ofrecida no vuelve a preguntar.
    expect(motivoParaPreguntar(d, { version: 1, etiquetas: { ...soloGa.etiquetas, gtm: 'GTM-AB12CD3' } }, AHORA)).toBeNull();
  });

  it('sin nada publicado no hay banner', () => {
    expect(debePreguntar(null, null, AHORA)).toBe(false);
    expect(debePreguntar(null, c, AHORA)).toBe(true);
    expect(debePreguntar(nuevaDecision(c, {}, AHORA), c, AHORA)).toBe(false);
  });
});

describe('etiquetas a cargar', () => {
  const c = { version: 1, etiquetas: TODAS };

  it('CP-137 · tras rechazar no se carga GA4, Tag Manager ni Meta Pixel', () => {
    expect(etiquetasACargar(c, nuevaDecision(c, { analitica: false, publicidad: false }, AHORA), AHORA)).toEqual([]);
  });

  it('carga solo las de las categorías aceptadas', () => {
    expect(etiquetasACargar(c, nuevaDecision(c, { analitica: true, publicidad: true }, AHORA), AHORA)).toEqual(['ga4', 'gtm', 'metaPixel']);
    expect(etiquetasACargar(c, nuevaDecision(c, { analitica: true }, AHORA), AHORA)).toEqual(['ga4', 'gtm']);
    expect(etiquetasACargar(c, nuevaDecision(c, { publicidad: true }, AHORA), AHORA)).toEqual(['metaPixel']);
  });

  it('nada sin decisión, con la decisión vencida o sin nada publicado', () => {
    const d = nuevaDecision(c, { analitica: true, publicidad: true }, AHORA);
    expect(etiquetasACargar(c, null, AHORA)).toEqual([]);
    expect(etiquetasACargar(c, d, new Date('2028-01-01T00:00:00.000Z'))).toEqual([]);
    expect(etiquetasACargar({ ...c, version: 2 }, d, AHORA)).toEqual([]);
    expect(etiquetasACargar(null, d, AHORA)).toEqual([]);
  });
});

describe('CSP de las etiquetas', () => {
  it('sin etiquetas no agrega orígenes; con cada una, solo los suyos', () => {
    expect(dominiosCsp(null)).toEqual({ script: [], connect: [], img: [] });
    const meta = dominiosCsp({ version: 1, etiquetas: { metaPixel: '123456789012345' } });
    expect(meta.script).toEqual(['https://connect.facebook.net']);
    expect(meta.connect.some((d) => d.includes('google'))).toBe(false);
    const ga = dominiosCsp({ version: 1, etiquetas: { ga4: 'G-AB12CD34EF', gtm: 'GTM-AB12CD3' } });
    expect(ga.script).toEqual(['https://www.googletagmanager.com']);
    expect(ga.connect).toContain('https://www.google-analytics.com');
    expect(ga.img.some((d) => d.includes('facebook'))).toBe(false);
  });
});

describe('ajustes de privacidad', () => {
  it('el banner viene encendido con la versión 1 y las filas viejas lo toman por defecto', () => {
    expect(AJUSTES_POR_DEFECTO.cookies).toEqual({ visible: true, version: 1 });
    expect(leerAjustes({ nombre: 'Aptio' }).cookies).toEqual({ visible: true, version: 1 });
    expect(leerAjustes({ cookies: { visible: false, version: 4 } }).cookies).toEqual({ visible: false, version: 4 });
    expect(leerAjustes({ cookies: { visible: 'sí', version: 0 } }).cookies).toEqual({ visible: true, version: 1 });
  });

  it('apaga el banner y sube la versión de la política de a uno', () => {
    const r = aplicarCambiosAjustes(AJUSTES_POR_DEFECTO, { cookies: { visible: false, subirVersion: true } });
    expect(r.ok && r.ajustes.cookies).toEqual({ visible: false, version: 2 });
  });

  it('los IDs y la versión entran en la versión publicada solo con el banner encendido (cierra SUP-200)', () => {
    expect(ajustesPublicados(AJUSTES_POR_DEFECTO).cookies).toBeUndefined();
    const con = { ...AJUSTES_POR_DEFECTO, analitica: { ga4: 'G-AB12CD34EF', gtm: null, metaPixel: null } };
    expect(ajustesPublicados(con).cookies).toEqual({ version: 1, etiquetas: { ga4: 'G-AB12CD34EF' } });
    expect(ajustesPublicados({ ...con, cookies: { visible: false, version: 1 } }).cookies).toBeUndefined();
  });
});
