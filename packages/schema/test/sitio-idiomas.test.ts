// HU-1510 · Idiomas del sitio en el esquema: cada página toma los elementos de su idioma, el menú y el pie en inglés van
// aparte (y no cambian las versiones sin inglés), el selector se guarda en los ajustes y el pie no mezcla idiomas.
import { describe, expect, it } from 'vitest';
import { AJUSTES_POR_DEFECTO, aplicarCambiosAjustes, leerAjustes } from '../src/sitio-ajustes.js';
import { delIdioma, esIdiomaSitio, idiomaDeFila } from '../src/sitio-contenido.js';
import { validarUbicacion } from '../src/sitio-navegacion.js';
import { alternasDe, armarInstantanea, hayPendientes, navegacionDe } from '../src/sitio-versiones.js';

const F = '2026-11-13T15:00:00.000Z';
const pagina = (idioma: string) => ({ ruta: '/', idioma, titulo: idioma, estado: 'PUBLICADA', publicadaEn: F, bloques: [{ id: `b-${idioma}`, tipo: 'testimonios', orden: 0, visible: true, ajustes: null }] });
const testimonio = (id: string, nombre: string, idioma?: string) => ({ id, coleccion: 'testimonios', orden: 0, visible: true, ficticio: false, datos: { nombre, cargo: 'C', empresa: 'E', texto: 'T', estrellas: 5 }, ...(idioma ? { idioma } : {}) });
const enlace = (id: string, texto: string, idioma?: string) => ({ id, zona: 'menu', padreId: null, texto, ruta: '/x', orden: 0, visible: true, ...(idioma ? { idioma } : {}) });

describe('idiomas del sitio (HU-1510)', () => {
  it('solo es y en; una fila sin idioma es español', () => {
    expect(esIdiomaSitio('en')).toBe(true);
    expect(esIdiomaSitio('fr')).toBe(false);
    expect(idiomaDeFila({})).toBe('es');
    expect(delIdioma([{ idioma: 'en' }, {}, { idioma: 'es' }], 'es')).toEqual([{}, { idioma: 'es' }]);
  });

  it('cada página usa los elementos de su idioma y el menú en inglés va en navegacionEn', () => {
    const inst = armarInstantanea({
      paginas: [pagina('es'), pagina('en')],
      elementos: [testimonio('t1', 'Mariana'), testimonio('t2', 'Laura', 'en')],
      enlaces: [enlace('m1', 'Producto'), enlace('m2', 'Product', 'en')],
    }, 'produccion');
    const nombres = (idioma: string) => inst.paginas.find((p) => p.idioma === idioma)!.bloques[0]!.elementos!.map((e) => e.datos.nombre);
    expect(nombres('es')).toEqual(['Mariana']);
    expect(nombres('en')).toEqual(['Laura']);
    expect(navegacionDe(inst, 'es').menu.map((e) => e.texto)).toEqual(['Producto']);
    expect(navegacionDe(inst, 'en').menu.map((e) => e.texto)).toEqual(['Product']);
  });

  it('sin enlaces en inglés la instantánea no cambia (no marca cambios en las versiones de antes)', () => {
    const datos = { paginas: [pagina('es')], elementos: [testimonio('t1', 'Mariana')], enlaces: [enlace('m1', 'Producto')] };
    const inst = armarInstantanea(datos, 'produccion');
    expect(inst).not.toHaveProperty('navegacionEn');
    expect(navegacionDe(inst, 'en')).toEqual({ menu: [], pie: [] });
    const conIngles = armarInstantanea({ ...datos, enlaces: [...datos.enlaces, enlace('m2', 'Product', 'en')] }, 'produccion');
    expect(hayPendientes(conIngles, inst)).toBe(true);
  });

  it('las alternas existen solo si la ruta está publicada en los dos idiomas', () => {
    expect(alternasDe({ paginas: [{ ...pagina('es'), bloques: [] }, { ...pagina('en'), bloques: [] }] }, '/')).toEqual([{ idioma: 'es' }, { idioma: 'en' }]);
    expect(alternasDe({ paginas: [{ ...pagina('es'), bloques: [] }] }, '/')).toEqual([]);
  });

  it('el selector de idioma se guarda en los ajustes, encendido por defecto, y solo entra en la versión cuando se apaga', () => {
    expect(leerAjustes({}).mostrarSelectorIdioma).toBe(true);
    const r = aplicarCambiosAjustes(AJUSTES_POR_DEFECTO, { mostrarSelectorIdioma: false });
    expect(r.ok && r.ajustes.mostrarSelectorIdioma).toBe(false);
    const apagado = armarInstantanea({ paginas: [], elementos: [], enlaces: [], ajustes: r.ok ? r.ajustes : null }, 'produccion');
    const encendido = armarInstantanea({ paginas: [], elementos: [], enlaces: [], ajustes: AJUSTES_POR_DEFECTO }, 'produccion');
    expect(apagado.sitio?.mostrarSelectorIdioma).toBe(false);
    expect(hayPendientes(apagado, encendido)).toBe(true);
  });

  it('un enlace del pie va en una columna de su mismo idioma', () => {
    const columnaEs = { zona: 'pie', padreId: null, idioma: 'es' };
    expect(validarUbicacion('pie', columnaEs, 'en')).toBe('PADRE_DE_OTRO_IDIOMA');
    expect(validarUbicacion('pie', columnaEs, 'es')).toBeNull();
    expect(validarUbicacion('pie', { zona: 'pie', padreId: null }, 'es')).toBeNull();
  });
});
