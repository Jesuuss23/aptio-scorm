// HU-1513 · SEO para IA: rastreadores de robots.txt (CP-126), llms.txt y su armado desde las páginas, preguntas
// objetivo con la marca manual de cada asistente y las reglas de las propuestas de IA-19 (CP-127).
import { describe, expect, it } from 'vitest';
import {
  aplicarMenciones, aplicarRastreadores, armarLlmsTxt, erroresPropuestasIa, estadoRastreadores, leerBloqueados, leerMenciones, LIMITES_SEO_IA, miles,
  prepararPropuestasIa, propuestasNuevas, RASTREADORES_IA, robotsDeRastreadores, type SalidaPropuestasIa, validarLlmsTxt, validarPreguntaObjetivo,
} from '../src/sitio-seo-ia.js';
import { armarInstantanea, hayPendientes } from '../src/sitio-versiones.js';

describe('rastreadores de IA', () => {
  it('el catálogo son 5 y todos están permitidos por defecto', () => {
    expect(RASTREADORES_IA).toEqual(['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot', 'CCBot']);
    expect(estadoRastreadores(null).every((r) => r.permitido)).toBe(true);
    expect(robotsDeRastreadores([])).toBe('');
  });

  it('bloquear y permitir: solo los del catálogo, sin repetir y en su orden', () => {
    const r = aplicarRastreadores(['CCBot'], { GPTBot: false, CCBot: true, ClaudeBot: false });
    expect(r).toEqual({ ok: true, bloqueados: ['GPTBot', 'ClaudeBot'] });
    expect(aplicarRastreadores([], { Bingbot: false, GPTBot: 'no' })).toMatchObject({ ok: false, errores: [{ campo: 'rastreadores.Bingbot' }, { campo: 'rastreadores.GPTBot' }] });
    expect(aplicarRastreadores([], ['GPTBot']).ok).toBe(false);
    expect(leerBloqueados(['CCBot', 'Otro', 'GPTBot', 'GPTBot'])).toEqual(['GPTBot', 'CCBot']);
  });

  it('CP-126 · cada bloqueado lleva su grupo con Disallow: /', () => {
    expect(robotsDeRastreadores(['GPTBot', 'CCBot'])).toBe('User-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n');
  });

  it('la instantánea solo los lleva si hay bloqueados o contenido: una versión de antes no marca cambios', () => {
    const base = { paginas: [], elementos: [], enlaces: [] };
    const antes = armarInstantanea(base, 'produccion');
    expect(hayPendientes(armarInstantanea({ ...base, llmsTxt: '', rastreadoresBloqueados: [] }, 'produccion'), antes)).toBe(false);
    const con = armarInstantanea({ ...base, llmsTxt: '# Aptio\n', rastreadoresBloqueados: ['CCBot', 'Otro'] }, 'produccion');
    expect(con).toMatchObject({ llmsTxt: '# Aptio', rastreadoresBloqueados: ['CCBot'] });
    expect(hayPendientes(con, antes)).toBe(true);
  });
});

describe('llms.txt', () => {
  it('texto plano de hasta 20 000 caracteres; normaliza saltos y espacios finales', () => {
    expect(validarLlmsTxt('# Aptio  \r\n\r\n> Cápsulas   \n\n')).toEqual({ ok: true, llmsTxt: '# Aptio\n\n> Cápsulas' });
    expect(validarLlmsTxt('')).toEqual({ ok: true, llmsTxt: '' });
    expect(validarLlmsTxt('x'.repeat(LIMITES_SEO_IA.llmsTxt)).ok).toBe(true);
    expect(validarLlmsTxt('x'.repeat(LIMITES_SEO_IA.llmsTxt + 1))).toEqual({ ok: false, errores: [{ campo: 'llmsTxt', mensaje: 'llms.txt admite hasta 20 000 caracteres (tiene 20 001)' }] });
    expect(validarLlmsTxt('# Aptio\n<script>alert(1)</script>')).toMatchObject({ ok: false, errores: [{ mensaje: 'llms.txt solo admite texto, sin etiquetas HTML' }] });
    expect(miles(1234567)).toBe('1 234 567');
  });

  it('se arma con el título y la dirección de las páginas publicadas e indexables', () => {
    const texto = armarLlmsTxt({
      nombre: 'Aptio SCORM', sitioUrl: 'https://aptioscorm.com/',
      paginas: [
        { ruta: '/precios', idioma: 'es', titulo: 'Precios', estado: 'PUBLICADA', metaDescripcion: 'Planes en soles.' },
        { ruta: '/', idioma: 'es', titulo: 'Inicio', estado: 'PUBLICADA', metaTitulo: 'Aptio SCORM [inicio]', metaDescripcion: 'Cápsulas SCORM   con IA.' },
        { ruta: '/', idioma: 'en', titulo: 'Home', estado: 'PUBLICADA' },
        { ruta: '/borrador', idioma: 'es', titulo: 'Borrador', estado: 'BORRADOR' },
        { ruta: '/interna', idioma: 'es', titulo: 'Interna', estado: 'PUBLICADA', indexar: false },
      ],
    });
    expect(texto).toBe([
      '# Aptio SCORM', '', '> Cápsulas SCORM con IA.', '',
      '## Páginas', '- [Aptio SCORM inicio](https://aptioscorm.com/): Cápsulas SCORM con IA.', '- [Precios](https://aptioscorm.com/precios): Planes en soles.', '',
      '## Pages in English', '- [Home](https://aptioscorm.com/en)',
    ].join('\n'));
    expect(validarLlmsTxt(texto)).toEqual({ ok: true, llmsTxt: texto });
    expect(armarLlmsTxt({ nombre: 'Aptio', sitioUrl: 'https://a.pe', paginas: [] })).toBe('# Aptio');
  });

  it('con muchas páginas no pasa del límite', () => {
    const paginas = Array.from({ length: 600 }, (_, i) => ({ ruta: `/pagina-${String(i).padStart(3, '0')}`, idioma: 'es', titulo: `Página ${i}`, estado: 'PUBLICADA', metaDescripcion: 'd'.repeat(150) }));
    const texto = armarLlmsTxt({ nombre: 'Aptio', sitioUrl: 'https://a.pe', paginas });
    expect(texto.length).toBeLessThanOrEqual(LIMITES_SEO_IA.llmsTxt);
    expect(texto).toContain('/pagina-000)');
    expect(texto).not.toContain('/pagina-599)');
  });
});

describe('preguntas objetivo y menciones', () => {
  it('una línea de 5 a 200 caracteres, sin HTML, sin repetir y hasta 50', () => {
    expect(validarPreguntaObjetivo('  cómo convertir   un PDF en curso SCORM ', [])).toEqual({ ok: true, pregunta: 'cómo convertir un PDF en curso SCORM' });
    expect(validarPreguntaObjetivo('hola', [])).toMatchObject({ ok: false, codigo: 'NO_VALIDO' });
    expect(validarPreguntaObjetivo('x'.repeat(201), [])).toMatchObject({ ok: false, codigo: 'NO_VALIDO' });
    expect(validarPreguntaObjetivo('<b>mejor SCORM</b>', [])).toMatchObject({ ok: false, codigo: 'NO_VALIDO' });
    expect(validarPreguntaObjetivo('¿Cómo convertir un PDF en curso SCORM?', ['como convertir un pdf en curso scorm'])).toMatchObject({ ok: false, codigo: 'PREGUNTA_REPETIDA' });
    expect(validarPreguntaObjetivo('otra pregunta', Array.from({ length: 50 }, (_, i) => `pregunta ${i}`))).toMatchObject({ ok: false, codigo: 'LIMITE_PREGUNTAS' });
  });

  it('las menciones empiezan sin revisar; Sí y No guardan la fecha y «sin revisar» la borra', () => {
    const vacias = leerMenciones(null);
    expect(Object.keys(vacias)).toEqual(['chatgpt', 'claude', 'gemini', 'perplexity']);
    expect(vacias.claude).toEqual({ estado: 'sin_revisar', revisadoEn: null });
    const ahora = new Date('2026-11-13T15:00:00.000Z');
    const r = aplicarMenciones(vacias, { chatgpt: 'si', gemini: 'no' }, ahora);
    expect(r).toMatchObject({ ok: true, menciones: { chatgpt: { estado: 'si', revisadoEn: ahora.toISOString() }, gemini: { estado: 'no', revisadoEn: ahora.toISOString() }, claude: { estado: 'sin_revisar', revisadoEn: null } } });
    const vuelta = aplicarMenciones(r.ok ? r.menciones : null, { chatgpt: 'sin_revisar' }, new Date('2026-11-14T15:00:00.000Z'));
    expect(vuelta).toMatchObject({ ok: true, menciones: { chatgpt: { estado: 'sin_revisar', revisadoEn: null }, gemini: { estado: 'no', revisadoEn: ahora.toISOString() } } });
    expect(aplicarMenciones(vacias, { copilot: 'si', claude: 'tal vez' }, ahora)).toMatchObject({ ok: false, errores: [{ campo: 'menciones.copilot' }, { campo: 'menciones.claude' }] });
    expect(leerMenciones({ chatgpt: { estado: 'raro', revisadoEn: 'x' }, claude: { estado: 'si' } })).toMatchObject({ chatgpt: { estado: 'sin_revisar', revisadoEn: null }, claude: { estado: 'si', revisadoEn: null } });
  });
});

describe('propuestas de IA-19', () => {
  const salida: SalidaPropuestasIa = {
    propuestas: [
      { tipo: 'pagina', titulo: 'SCORM 1.2 vs. cmi5', ruta: '/scorm-vs-cmi5', metaTitulo: 'SCORM 1.2 vs. cmi5', metaDescripcion: 'Compara SCORM 1.2 y cmi5.', motivo: 'Nadie lo responde.' },
      { tipo: 'pagina', titulo: 'Precios', ruta: '/precios', metaTitulo: 'Precios', metaDescripcion: 'Planes.', motivo: 'Ya existe.' },
      { tipo: 'pregunta', pregunta: '¿Cuánto cuesta una cápsula?', respuesta: 'Depende del plan.', pagina: '/precios', motivo: 'Pregunta objetivo.' },
      { tipo: 'pregunta', pregunta: '¿Sirve para Moodle?', respuesta: 'Sí.', pagina: '/no-existe', motivo: 'Pregunta objetivo.' },
      { tipo: 'pregunta', pregunta: 'cuanto cuesta una capsula', respuesta: 'Repetida.', motivo: 'Repetida.' },
    ],
  };

  it('reglas extra: texto plano y forma de las rutas', () => {
    expect(erroresPropuestasIa(salida)).toEqual([]);
    const mala: SalidaPropuestasIa = { propuestas: [
      { tipo: 'pagina', titulo: '<b>Título</b>', ruta: '/', metaTitulo: 'a', metaDescripcion: 'b', motivo: 'c' },
      { tipo: 'pregunta', pregunta: '¿Sí?', respuesta: 'Sí', pagina: 'precios', motivo: 'c' },
    ] };
    expect(erroresPropuestasIa(mala)).toEqual([
      '/propuestas/0/titulo solo admite texto, sin etiquetas HTML',
      '/propuestas/0/ruta debe ser una ruta nueva en minúsculas, como /scorm-vs-cmi5',
      '/propuestas/1/pagina debe ser una ruta del sitio, como /precios, o no ir',
    ]);
  });

  it('solo entra lo nuevo: sin rutas que existen, sin preguntas repetidas y sin páginas que no existen', () => {
    const nuevas = propuestasNuevas(salida, { rutas: ['/', '/precios'], preguntas: ['¿Qué es SCORM?'] });
    expect(nuevas.map((p) => (p.tipo === 'pagina' ? p.ruta : p.pregunta))).toEqual(['/scorm-vs-cmi5', '¿Cuánto cuesta una cápsula?', '¿Sirve para Moodle?']);
    expect(nuevas[1]).toHaveProperty('pagina', '/precios');
    expect(nuevas[2]).not.toHaveProperty('pagina');
    // Pedir otra vez con lo ya propuesto no duplica nada.
    expect(propuestasNuevas(salida, { rutas: ['/', '/precios'], rutasPropuestas: ['/scorm-vs-cmi5'], preguntas: ['¿Cuánto cuesta una cápsula?', '¿Sirve para Moodle?'] })).toEqual([]);
  });

  it('prepara los textos antes de validar', () => {
    expect(prepararPropuestasIa({ propuestas: [{ tipo: 'pagina', titulo: '  SCORM   vs. cmi5 ', respuesta: ' a\n\nb ' }] })).toEqual({ propuestas: [{ tipo: 'pagina', titulo: 'SCORM vs. cmi5', respuesta: 'a\n\nb' }] });
    expect(prepararPropuestasIa('no es un objeto')).toBe('no es un objeto');
  });
});
