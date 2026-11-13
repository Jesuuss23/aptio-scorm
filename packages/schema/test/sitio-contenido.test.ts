import { describe, expect, it } from 'vitest';
import { aplicarOrden, compactarOrden, ordenAlFinal } from '../src/sitio-bloques.js';
import { COLECCIONES, COLECCION_DE_BLOQUE, elementosDeBloque, esColeccion, esTextoPlano, mezclarDatos, nombreElemento, validarDatos } from '../src/sitio-contenido.js';

const VALIDOS = {
  cifras: { valor: '4 días', etiqueta: 'para entregar una cápsula' },
  testimonios: { nombre: 'Ana', cargo: 'Jefa', empresa: 'Minera', sector: 'Minería', texto: 'Muy útil.', estrellas: 5, desde: 'mar. 2026' },
  logos: { nombre: 'Minera Andina' },
  funcionalidades: { etiqueta: 'Voz', titulo: 'Un personaje que habla', texto: 'La boca se anima.', vinetas: 'Google\nAzure' },
  pasos: { titulo: 'Sube el material', texto: 'PDF, video o temas.' },
  lms: { nombre: 'Moodle 4.5', nota: 'Perfil con recomendaciones' },
  preguntas: { pregunta: '¿Necesito programar?', respuesta: 'No.', pagina: '/precios' },
} as const;

describe('colecciones de contenido (HU-1504)', () => {
  it('son 7 y cada bloque que las usa apunta a una', () => {
    expect(COLECCIONES).toEqual(['cifras', 'testimonios', 'logos', 'funcionalidades', 'pasos', 'lms', 'preguntas']);
    expect(Object.values(COLECCION_DE_BLOQUE).every(esColeccion)).toBe(true);
    expect([esColeccion('cifras'), esColeccion('planes'), esColeccion('toString')]).toEqual([true, false, false]);
  });

  it('nombra un elemento por su primer campo (HU-1505)', () => {
    expect([nombreElemento('testimonios', VALIDOS.testimonios), nombreElemento('cifras', {}), nombreElemento('otra', {})]).toEqual(['Ana', 'cifra', 'otra']);
  });

  it('acepta los datos válidos de las 7 colecciones', () => {
    const r = COLECCIONES.map((c) => validarDatos(c, VALIDOS[c]).ok);
    expect(r).toEqual(COLECCIONES.map(() => true));
  });

  it('recorta, limpia viñetas vacías y quita opcionales vacíos', () => {
    expect(validarDatos('funcionalidades', { etiqueta: ' Voz ', titulo: 'T', texto: 'X', vinetas: ' a \r\n\n b ' })).toEqual({
      ok: true, datos: { etiqueta: 'Voz', titulo: 'T', texto: 'X', vinetas: 'a\nb' },
    });
    expect(validarDatos('lms', { nombre: 'Canvas', nota: '  ' })).toEqual({ ok: true, datos: { nombre: 'Canvas' } });
  });

  it('rechaza campos faltantes, ajenos, largos, de otro tipo o con saltos donde no van', () => {
    const errores = (c: Parameters<typeof validarDatos>[0], d: unknown) => {
      const r = validarDatos(c, d);
      return r.ok ? [] : r.errores.map((e) => e.campo);
    };
    expect(errores('cifras', { valor: '4' })).toEqual(['etiqueta']);
    expect(errores('logos', { nombre: 'X', url: 'http://x' })).toEqual(['url']);
    expect(errores('cifras', { valor: 'x'.repeat(21), etiqueta: 'e' })).toEqual(['valor']);
    expect(errores('testimonios', { ...VALIDOS.testimonios, estrellas: 6 })).toEqual(['estrellas']);
    expect(errores('testimonios', { ...VALIDOS.testimonios, estrellas: '5' })).toEqual(['estrellas']);
    expect(errores('pasos', { titulo: 'a\nb', texto: 'ok' })).toEqual(['titulo']);
    expect(errores('preguntas', { ...VALIDOS.preguntas, pagina: 'precios' })).toEqual(['pagina']);
    expect(errores('cifras', [])).toEqual(['datos']);
  });

  it('RN-16-7: rechaza HTML y caracteres de control', () => {
    expect([esTextoPlano('3 < 5 y 7 > 2'), esTextoPlano('<b>hola</b>'), esTextoPlano('x </p>'), esTextoPlano('<!-- x -->'), esTextoPlano('a\u0007b'), esTextoPlano('a\nb\tc')])
      .toEqual([true, false, false, false, false, true]);
    const r = validarDatos('testimonios', { ...VALIDOS.testimonios, texto: 'Hola <script>alert(1)</script>' });
    expect(r.ok ? [] : r.errores).toEqual([{ campo: 'texto', mensaje: 'Testimonio solo admite texto, sin etiquetas HTML' }]);
  });

  it('un cambio parcial solo revisa lo que trae y vaciar un opcional lo quita', () => {
    const r = validarDatos('lms', { nota: '' }, true);
    expect(r).toEqual({ ok: true, datos: { nota: '' } });
    expect(mezclarDatos({ nombre: 'Canvas', nota: 'vieja' }, r.ok ? r.datos : {})).toEqual({ nombre: 'Canvas' });
    expect(validarDatos('lms', { nombre: '' }, true).ok).toBe(false);
  });
});

describe('elementos por bloque (RN-16-4)', () => {
  const e = (id: string, coleccion: string, orden: number, visible: boolean, datos: object = {}) => ({ id, coleccion, orden, visible, datos });
  const todos = [
    e('t2', 'testimonios', 1, true), e('t1', 'testimonios', 0, true), e('t3', 'testimonios', 2, false),
    e('c1', 'cifras', 0, true),
    e('q1', 'preguntas', 0, true), e('q2', 'preguntas', 1, true, { pagina: '/precios' }), e('q3', 'preguntas', 2, true, { pagina: '/otra' }), e('q4', 'preguntas', 3, false),
  ];
  const ids = (l: { id: string }[] | null) => l?.map((x) => x.id) ?? null;

  it('CP-114: un testimonio oculto no sale; los visibles van en orden', () => {
    expect(ids(elementosDeBloque('testimonios', '/', todos))).toEqual(['t1', 't2']);
    expect(ids(elementosDeBloque('testimonios', '/precios', todos))).toEqual(['t1', 't2']);
  });

  it('preguntas: las generales en todas; las de una ruta solo en esa', () => {
    expect(ids(elementosDeBloque('faq', '/', todos))).toEqual(['q1']);
    expect(ids(elementosDeBloque('faq', '/precios', todos))).toEqual(['q1', 'q2']);
  });

  it('un bloque sin colección no lleva elementos', () => {
    expect(elementosDeBloque('hero', '/', todos)).toBeNull();
    expect(ids(elementosDeBloque('metricas', '/', todos))).toEqual(['c1']);
  });

  it('el orden por colección reutiliza las funciones de la HU-1503', () => {
    const cifras = [e('a', 'cifras', 0, false), e('b', 'cifras', 1, false)];
    expect(ordenAlFinal(cifras)).toBe(2);
    expect(aplicarOrden(cifras, ['b', 'a']).map((x) => [x.id, x.orden])).toEqual([['b', 0], ['a', 1]]);
    expect(compactarOrden([e('c', 'cifras', 4, true), e('d', 'cifras', 9, true)]).map((x) => x.orden)).toEqual([0, 1]);
  });
});
