// HU-1604 · Chatbot del sitio (REQ-077, RN-17-4, CP-133): ajustes y horario de Lima, respuestas rápidas, fuentes,
// selector léxico de 6 fuentes y 12 000 caracteres, límites de la conversación y respuesta controlada.
import { describe, expect, it } from 'vitest';
import {
  AJUSTES_CHATBOT_POR_DEFECTO, chatbotPublico, enHorario, expiraEn, fuentesDeInstantanea, fuentesManuales, LIMITES_CHAT, mensajesDelVisitante, palabras,
  prepararSalidaChatbot, erroresSalidaChatbot, respuestaControlada, respuestaDeSalida, seleccionarFuentes, subirResultado, textoHorario, validarAjustesChatbot,
  validarEntradaChat, validarFuente, validarRapida, type FuenteChat,
} from '../src/chatbot.js';
import type { Instantanea } from '../src/sitio-versiones.js';

const A = AJUSTES_CHATBOT_POR_DEFECTO;

describe('ajustes del chatbot', () => {
  it('valida nombre, saludo, tono, objetivo, horario y días', () => {
    const r = validarAjustesChatbot(A, { nombre: '  Luz ', tono: 'formal', objetivo: 'captar_lead', horarioInicio: '08:30', diasAtencion: [5, 1, 1, 6] });
    expect(r.ok && r.ajustes).toMatchObject({ nombre: 'Luz', tono: 'formal', objetivo: 'captar_lead', horarioInicio: '08:30', diasAtencion: [1, 5, 6] });
    const mal = validarAjustesChatbot(A, { nombre: '', saludoEs: '<b>hola</b>', tono: 'gracioso', objetivo: 'x', horarioFin: '25:00', diasAtencion: [0, 8], visible: 'si' });
    expect(mal.ok ? [] : mal.errores.map((e) => e.campo)).toEqual(['nombre', 'saludoEs', 'tono', 'objetivo', 'horarioFin', 'diasAtencion', 'visible']);
  });

  it('el fin de la atención va después del inicio', () => {
    const r = validarAjustesChatbot(A, { horarioInicio: '18:00', horarioFin: '09:00' });
    expect(r.ok ? [] : r.errores).toEqual([{ campo: 'horarioFin', mensaje: 'El fin de la atención va después del inicio' }]);
  });

  it('el horario se mide en hora de Lima (UTC−5), con el fin excluido', () => {
    expect(enHorario(A, new Date('2026-11-17T14:00:00Z'))).toBe(true); // martes 09:00 Lima
    expect(enHorario(A, new Date('2026-11-17T13:59:00Z'))).toBe(false); // 08:59
    expect(enHorario(A, new Date('2026-11-17T23:00:00Z'))).toBe(false); // 18:00
    expect(enHorario(A, new Date('2026-11-21T16:00:00Z'))).toBe(false); // sábado
    expect(enHorario(A, new Date('2026-11-18T03:00:00Z'))).toBe(false); // martes 22:00 Lima, miércoles en UTC
  });

  it('describe el horario en los dos idiomas', () => {
    expect(textoHorario(A)).toBe('Lun a vie, 9:00 a 18:00');
    expect(textoHorario(A, 'en')).toBe('Mon to Fri, 9:00 to 18:00');
    expect(textoHorario({ ...A, diasAtencion: [1, 3, 6] })).toBe('Lun, mié, sáb, 9:00 a 18:00');
  });
});

describe('respuestas rápidas y fuentes manuales', () => {
  it('la respuesta rápida tiene texto y una acción del catálogo', () => {
    expect(validarRapida({ textoEs: ' Ver precios ', accion: 'consulta_ia' })).toEqual({ ok: true, datos: { textoEs: 'Ver precios', textoEn: '', accion: 'consulta_ia' } });
    const r = validarRapida({ textoEs: 'x'.repeat(LIMITES_CHAT.textoRapida + 1), accion: 'llamar' });
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['textoEs', 'accion']);
    expect(validarRapida({ textoEn: 'Pricing' }, { textoEs: 'Precios', textoEn: '', accion: 'consulta_ia' })).toMatchObject({ ok: true, datos: { textoEn: 'Pricing' } });
  });

  it('la fuente es texto plano con título, hasta 4 000 caracteres', () => {
    expect(validarFuente({ titulo: 'Tiempos', contenido: 'Una cápsula\r\n\n\n\ntoma  dos días.' })).toMatchObject({ ok: true });
    const r = validarFuente({ titulo: '', contenido: '<script>x</script>', idioma: 'fr' });
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['titulo', 'contenido', 'idioma']);
    expect(validarFuente({ titulo: 'x', contenido: 'y'.repeat(4001) }).ok).toBe(false);
  });
});

const INST: Pick<Instantanea, 'paginas'> = {
  paginas: [
    { ruta: '/', idioma: 'es', titulo: 'Inicio', publicadaEn: null, bloques: [
      { tipo: 'hero', ajustes: null, elementos: [{ id: 'h1', coleccion: 'x', datos: { titulo: 'Cápsulas SCORM con IA', enlace: '/precios' } }] },
      { tipo: 'faq', ajustes: null, elementos: [
        { id: 'q1', coleccion: 'preguntas', datos: { pregunta: '¿Funciona en Moodle?', respuesta: 'Sí, el paquete SCORM 1.2 sube a Moodle 4.5.' } },
        { id: 'q2', coleccion: 'preguntas', datos: { pregunta: '¿Precio inventado?', respuesta: 'Dato ficticio' }, ficticio: true },
      ] },
    ] },
    { ruta: '/precios', idioma: 'es', titulo: 'Precios', publicadaEn: null, bloques: [
      { tipo: 'faq', ajustes: null, elementos: [{ id: 'q1', coleccion: 'preguntas', datos: { pregunta: '¿Funciona en Moodle?', respuesta: 'Sí, el paquete SCORM 1.2 sube a Moodle 4.5.' } }] },
    ] },
    { ruta: '/en', idioma: 'en', titulo: 'Home', publicadaEn: null, bloques: [] },
  ],
};

describe('base de conocimiento y selector léxico', () => {
  it('toma páginas y preguntas del idioma; en producción sin ficticios y sin repetir', () => {
    const f = fuentesDeInstantanea(INST, 'es', 'produccion');
    expect(f.map((x) => x.id)).toEqual(['pagina:/', 'pregunta:q1']);
    expect(f[0]!.texto).toBe('Cápsulas SCORM con IA');
    expect(fuentesDeInstantanea(INST, 'es', 'pruebas').map((x) => x.id)).toContain('pregunta:q2');
    expect(fuentesDeInstantanea(INST, 'en', 'produccion')).toEqual([]);
  });

  it('las fuentes manuales visibles del idioma', () => {
    const filas = [{ id: 'm1', titulo: 'A', contenido: 'a', idioma: 'es', visible: true }, { id: 'm2', titulo: 'B', contenido: 'b', idioma: 'es', visible: false }, { id: 'm3', titulo: 'C', contenido: 'c', idioma: 'en', visible: true }];
    expect(fuentesManuales(filas, 'es').map((f) => f.id)).toEqual(['manual:m1']);
  });

  it('las palabras van sin tildes, en minúsculas y sin las vacías', () => {
    expect(palabras('¿Qué precio tiene la Cápsula para Moodle?')).toEqual(['precio', 'capsula', 'moodle']);
  });

  it('elige hasta 6 fuentes por palabras en común (el título cuenta doble)', () => {
    const fuentes: FuenteChat[] = Array.from({ length: 14 }, (_, i) => ({ id: `manual:${i}`, tipo: 'manual', titulo: i === 7 ? 'Moodle' : `F${i}`, texto: i % 2 ? 'moodle scorm' : 'otra cosa' }));
    const r = seleccionarFuentes('¿Sirve en Moodle?', fuentes);
    expect(r).toHaveLength(LIMITES_CHAT.fuentes);
    expect(r[0]!.id).toBe('manual:7');
    expect(r.every((f) => f.texto.includes('moodle'))).toBe(true);
  });

  it('no pasa de 12 000 caracteres y recorta la última fuente que no cabe', () => {
    const grande = (i: number): FuenteChat => ({ id: `manual:${i}`, tipo: 'manual', titulo: 'SCORM', texto: `scorm ${'x'.repeat(4990)}` });
    const r = seleccionarFuentes('scorm', [grande(1), grande(2), grande(3), grande(4)]);
    const total = r.reduce((n, f) => n + f.titulo.length + f.texto.length, 0);
    expect(total).toBeLessThanOrEqual(LIMITES_CHAT.caracteresContexto);
    expect(r).toHaveLength(3);
    expect(r[2]!.texto.length).toBeLessThan(4996);
  });

  it('sin palabras en común no hay contexto', () => {
    expect(seleccionarFuentes('hola', [{ id: 'manual:1', tipo: 'manual', titulo: 'SCORM', texto: 'scorm' }])).toEqual([]);
  });
});

describe('conversación', () => {
  it('el mensaje va de 1 a 500 caracteres; el idioma y la conversación se validan', () => {
    expect(validarEntradaChat({ mensaje: '  ¿Precio?  ' })).toEqual({ ok: true, entrada: { idioma: 'es', mensaje: '¿Precio?', accion: null, conversacionId: null } });
    const r = validarEntradaChat({ mensaje: 'x'.repeat(501), idioma: 'fr', conversacionId: '1' });
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['mensaje', 'idioma', 'conversacionId']);
    expect(validarEntradaChat({ mensaje: '' }).ok).toBe(false);
  });

  it('en vez del mensaje, una respuesta rápida local (agendar o persona), sin IA', () => {
    expect(validarEntradaChat({ accion: 'hablar_persona', mensaje: 'ignorado', idioma: 'en' })).toEqual({ ok: true, entrada: { idioma: 'en', mensaje: '', accion: 'hablar_persona', conversacionId: null } });
    const r = validarEntradaChat({ accion: 'consulta_ia' });
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['accion']);
  });

  it('cuenta los mensajes del visitante y el resultado solo sube', () => {
    expect(mensajesDelVisitante([{ de: 'visitante', texto: 'a', en: '' }, { de: 'bot', texto: 'b', en: '' }])).toBe(1);
    expect(subirResultado('sin_conversion', 'respuesta')).toBe('respuesta');
    expect(subirResultado('demo', 'respuesta')).toBe('demo');
    expect(subirResultado('persona', 'lead')).toBe('lead');
  });

  it('se borra a los 90 días', () => {
    expect(expiraEn(new Date('2026-11-17T00:00:00Z')).toISOString()).toBe('2027-02-15T00:00:00.000Z');
  });
});

describe('IA-20 y la respuesta controlada (CP-133)', () => {
  const CTX: FuenteChat[] = [{ id: 'pregunta:q1', tipo: 'pregunta', titulo: '¿Funciona en Moodle?', texto: 'Sí', ruta: '/' }];

  it('vale si cita fuentes del contexto', () => {
    expect(respuestaDeSalida({ respuesta: 'Sí, sube a Moodle.', fuentesCitadas: ['pregunta:q1'] }, CTX, 'es'))
      .toEqual({ texto: 'Sí, sube a Moodle.', fuentes: [{ id: 'pregunta:q1', titulo: '¿Funciona en Moodle?', ruta: '/' }], acciones: [], controlada: false });
  });

  it('sin fuente o con una inventada, «no lo sé» con agendar y persona', () => {
    for (const fuentesCitadas of [[], ['manual:inventada'], ['pregunta:q1', 'pagina:/otra']]) {
      const r = respuestaDeSalida({ respuesta: 'Cuesta S/ 10', fuentesCitadas }, CTX, 'es');
      expect(r).toEqual(respuestaControlada('es'));
      expect(r.acciones).toEqual(['agendar_demo', 'hablar_persona']);
    }
    expect(respuestaControlada('en').texto).toMatch(/^I don't have/);
  });

  it('la salida se recorta, no repite fuentes y no admite HTML', () => {
    expect(prepararSalidaChatbot({ respuesta: '  Hola  \n\n\n\nmundo ', fuentesCitadas: ['a', 'a'] })).toEqual({ respuesta: 'Hola \n\nmundo', fuentesCitadas: ['a'] });
    expect(erroresSalidaChatbot({ respuesta: '<a href="x">y</a>', fuentesCitadas: ['a'] })).toHaveLength(1);
  });
});

describe('lo que se sirve al sitio', () => {
  const rapidas = [
    { id: '2', textoEs: 'Agendar', textoEn: 'Book', accion: 'agendar_demo', visible: true, orden: 2, ficticio: false },
    { id: '1', textoEs: 'Precios', textoEn: '', accion: 'consulta_ia', visible: true, orden: 1, ficticio: false },
    { id: '3', textoEs: 'Ficticia', textoEn: 'Fake', accion: 'consulta_ia', visible: true, orden: 0, ficticio: true },
    { id: '4', textoEs: 'Oculta', textoEn: 'Hidden', accion: 'consulta_ia', visible: false, orden: 0, ficticio: false },
  ];
  const ahora = new Date('2026-11-17T15:00:00Z');

  it('en producción sin ficticias, en orden, con saludo y horario', () => {
    const p = chatbotPublico(A, rapidas, { idioma: 'es', entorno: 'produccion', ahora, whatsapp: '+51999888777' });
    expect(p.rapidas.map((r) => r.id)).toEqual(['1', '2']);
    expect(p).toMatchObject({ nombre: 'Ana', saludo: A.saludoEs, enHorario: true, horario: 'Lun a vie, 9:00 a 18:00', whatsapp: '+51999888777' });
  });

  it('en inglés solo las traducidas; en pruebas, también las ficticias', () => {
    expect(chatbotPublico(A, rapidas, { idioma: 'en', entorno: 'pruebas', ahora, whatsapp: null }).rapidas.map((r) => r.texto)).toEqual(['Fake', 'Book']);
    expect(chatbotPublico({ ...A, saludoEn: '' }, [], { idioma: 'en', entorno: 'pruebas', ahora, whatsapp: null }).saludo).toBe("Hi, I'm Ana. How can I help?");
  });
});
