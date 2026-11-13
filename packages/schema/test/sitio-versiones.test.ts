import { describe, expect, it } from 'vitest';
import { armarInstantanea, ficticiosDeInstantanea, hayPendientes, leerInstantanea, paginaServida } from '../src/sitio-versiones.js';

const F = '2026-11-10T15:00:00.000Z';
const pagina = (ruta: string, estado: string, bloques: { tipo: string; orden: number; visible: boolean }[]) =>
  ({ ruta, idioma: 'es', titulo: ruta, estado, publicadaEn: estado === 'PUBLICADA' ? new Date(F) : null, bloques: bloques.map((b, i) => ({ id: `b${i}`, ajustes: null, ...b })) });
const testimonio = (id: string, orden: number, visible: boolean, ficticio = false) =>
  ({ id, coleccion: 'testimonios', orden, visible, ficticio, datos: { nombre: id, cargo: 'Jefa', empresa: 'Minera', texto: 'Útil.', estrellas: 5 } });
const enlace = (id: string, orden: number, visible: boolean) => ({ id, zona: 'menu', padreId: null, texto: id, ruta: `/${id}`, orden, visible });

const datos = () => ({
  paginas: [
    pagina('/precios', 'PUBLICADA', [{ tipo: 'cta', orden: 1, visible: true }, { tipo: 'testimonios', orden: 0, visible: true }, { tipo: 'faq', orden: 2, visible: false }]),
    pagina('/', 'PUBLICADA', [{ tipo: 'hero', orden: 0, visible: true }]),
    pagina('/borrador', 'BORRADOR', [{ tipo: 'hero', orden: 0, visible: true }]),
  ],
  elementos: [testimonio('t2', 1, true), testimonio('t1', 0, true, true), testimonio('t3', 2, false)],
  enlaces: [enlace('precios', 1, true), enlace('casos', 0, false)],
});

describe('versiones del sitio (HU-1507)', () => {
  it('la instantánea guarda solo lo publicado y visible, en orden (RN-16-4, RN-16-5)', () => {
    const i = armarInstantanea(datos(), 'pruebas');
    expect(i.paginas.map((p) => p.ruta)).toEqual(['/', '/precios']);
    const precios = i.paginas[1]!;
    expect(precios.publicadaEn).toBe(F);
    expect(precios.bloques.map((b) => b.tipo)).toEqual(['testimonios', 'cta']);
    expect(precios.bloques[0]!.elementos!.map((e) => [e.id, e.ficticio ?? false])).toEqual([['t1', true], ['t2', false]]);
    expect(precios.bloques[1]).not.toHaveProperty('elementos');
    expect(i.navegacion.menu.map((e) => e.texto)).toEqual(['precios']);
  });

  it('en producción la instantánea nunca guarda un ficticio', () => {
    const i = armarInstantanea(datos(), 'produccion');
    expect(i.paginas[1]!.bloques[0]!.elementos!.map((e) => e.id)).toEqual(['t2']);
    expect(ficticiosDeInstantanea(i)).toEqual([]);
    expect(ficticiosDeInstantanea(armarInstantanea(datos(), 'pruebas'))).toEqual([{ id: 't1', coleccion: 'testimonios', nombre: 't1' }]);
  });

  it('detecta cambios pendientes por contenido, no por el orden de las claves', () => {
    const a = armarInstantanea(datos(), 'pruebas');
    const invertir = (v: unknown): unknown => (Array.isArray(v) ? v.map(invertir) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, invertir(x)])) : v);
    const copia = invertir(JSON.parse(JSON.stringify(a))) as typeof a;
    expect(Object.keys(copia)).toEqual(Object.keys(a).reverse());
    expect(hayPendientes(a, copia)).toBe(false);
    const d = datos();
    d.enlaces[1]!.visible = true;
    expect(hayPendientes(armarInstantanea(d, 'pruebas'), a)).toBe(true);
    const sinCambioVisible = datos();
    sinCambioVisible.elementos[2]!.datos.nombre = 'otro'; // oculto: no cambia lo publicable
    expect(hayPendientes(armarInstantanea(sinCambioVisible, 'pruebas'), a)).toBe(false);
    expect(hayPendientes(armarInstantanea({ paginas: [], elementos: [], enlaces: [] }, 'pruebas'), null)).toBe(false);
    expect(hayPendientes(a, null)).toBe(true);
  });

  it('el sitio sirve la página sin ids internos y, en producción, sin ficticios', () => {
    const i = armarInstantanea(datos(), 'pruebas');
    expect(paginaServida(i, '/borrador', 'es', 'pruebas')).toBeNull();
    expect(paginaServida(i, '/precios', 'en', 'pruebas')).toBeNull();
    const pruebas = paginaServida(i, '/precios', 'es', 'pruebas')!;
    expect(pruebas.bloques[0]!.elementos).toEqual([
      { datos: expect.objectContaining({ nombre: 't1' }), ficticio: true }, { datos: expect.objectContaining({ nombre: 't2' }) },
    ]);
    expect(paginaServida(i, '/precios', 'es', 'produccion')!.bloques[0]!.elementos!.map((e) => e.datos.nombre)).toEqual(['t2']);
  });

  it('una instantánea guardada sin la forma esperada se lee como sitio vacío', () => {
    for (const v of [null, {}, { formato: 2, paginas: [] }, 'x']) expect(leerInstantanea(v)).toEqual({ formato: 1, paginas: [], navegacion: { menu: [], pie: [] } });
  });
});
