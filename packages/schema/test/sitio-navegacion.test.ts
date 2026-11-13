import { describe, expect, it } from 'vitest';
import { compactarOrden, validarOrden } from '../src/sitio-bloques.js';
import {
  arbolNavegacion, esColumnaPie, hermanosDe, navegacionPublica, validarRuta, validarTextoEnlace, validarUbicacion,
} from '../src/sitio-navegacion.js';

const e = (id: string, zona: string, padreId: string | null, orden: number, visible: boolean, texto = id, ruta: string | null = `/${id}`) =>
  ({ id, zona, padreId, orden, visible, texto, ruta });

describe('menú y pie (HU-1506)', () => {
  it('acepta rutas internas y https://, y rechaza el resto', () => {
    for (const r of ['/', '/precios', '/#testimonios', '/funcionalidades/personaje', '/sectores/mineria-y-energia#casos']) {
      expect(validarRuta(r)).toEqual({ ok: true, ruta: r, externo: false });
    }
    expect(validarRuta(' https://blog.aptioscorm.com/guias ')).toEqual({ ok: true, ruta: 'https://blog.aptioscorm.com/guias', externo: true });
    for (const r of ['javascript:alert(1)', 'http://aptioscorm.com', 'data:text/html,hola', '//otro.com', 'precios', '/Precios',
      '/precios/', '/pre cios', '/<b>', 'https://localhost', 'https://usuario:clave@aptioscorm.com', 'https://', '', null, 3]) {
      expect([String(r), validarRuta(r).ok]).toEqual([String(r), false]);
    }
  });

  it('el texto es una línea de texto plano de hasta 60 caracteres', () => {
    expect(validarTextoEnlace('  Casos ')).toEqual({ ok: true, texto: 'Casos' });
    expect(validarTextoEnlace('<a href=x>Casos</a>').ok).toBe(false);
    expect(validarTextoEnlace('Ca\u0007sos').ok).toBe(false);
    expect(validarTextoEnlace('Dos\nlíneas').ok).toBe(false);
    expect(validarTextoEnlace('x'.repeat(61)).ok).toBe(false);
    expect(validarTextoEnlace('').ok).toBe(false);
  });

  it('el menú es plano y el pie tiene solo columna y enlace', () => {
    const columna = { zona: 'pie', padreId: null };
    expect(validarUbicacion('menu', null)).toBeNull();
    expect(validarUbicacion('pie', null)).toBeNull();
    expect(validarUbicacion('pie', columna)).toBeNull();
    expect(validarUbicacion('cabecera', null)).toBe('ZONA_INVALIDA');
    expect(validarUbicacion('menu', columna)).toBe('MENU_SIN_NIVELES');
    expect(validarUbicacion('pie', { zona: 'menu', padreId: null })).toBe('PADRE_DE_OTRA_ZONA');
    expect(validarUbicacion('pie', { zona: 'pie', padreId: 'c1' })).toBe('PROFUNDIDAD_INVALIDA');
    expect(esColumnaPie(columna)).toBe(true);
    expect(esColumnaPie({ zona: 'pie', padreId: 'c1' })).toBe(false);
  });

  it('ordena y valida el orden solo entre hermanos', () => {
    const lista = [e('m2', 'menu', null, 1, true), e('m1', 'menu', null, 0, true), e('c1', 'pie', null, 0, true), e('a', 'pie', 'c1', 0, true)];
    const menu = hermanosDe(lista, 'menu', null);
    expect(menu.map((x) => x.id)).toEqual(['m1', 'm2']);
    expect(validarOrden(menu, ['m2', 'm1'])).toBeNull();
    expect(validarOrden(menu, ['m2', 'c1'])).toEqual({ tipo: 'AJENO', id: 'c1' });
    expect(compactarOrden([e('x', 'menu', null, 4, true), e('y', 'menu', null, 2, true)]).map((x) => [x.id, x.orden])).toEqual([['y', 0], ['x', 1]]);
    const arbol = arbolNavegacion(lista);
    expect(arbol.pie[0]!.enlaces.map((x) => x.id)).toEqual(['a']);
  });

  it('CP-118: lo oculto no sale, y una columna oculta oculta sus enlaces', () => {
    const lista = [
      e('producto', 'menu', null, 0, true, 'Producto', '/funcionalidades/personaje'),
      e('casos', 'menu', null, 1, false, 'Casos', '/#testimonios'),
      e('blog', 'menu', null, 2, true, 'Blog', 'https://blog.aptioscorm.com'),
      e('legal', 'pie', null, 0, true, 'Legal', null),
      e('privacidad', 'pie', 'legal', 0, true, 'Privacidad', '/privacidad'),
      e('trabaja', 'pie', 'legal', 1, false, 'Trabaja con nosotros', '/empleo'),
      e('empresa', 'pie', null, 1, false, 'Empresa', null),
      e('nosotros', 'pie', 'empresa', 0, true, 'Nosotros', '/nosotros'),
      e('vacia', 'pie', null, 2, true, 'Vacía', null),
    ];
    expect(navegacionPublica(lista)).toEqual({
      menu: [
        { texto: 'Producto', ruta: '/funcionalidades/personaje', externo: false },
        { texto: 'Blog', ruta: 'https://blog.aptioscorm.com', externo: true },
      ],
      pie: [{ titulo: 'Legal', enlaces: [{ texto: 'Privacidad', ruta: '/privacidad', externo: false }] }],
    });
  });
});
