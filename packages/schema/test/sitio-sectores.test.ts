// HU-1514 · Reglas de las landings por sector: ruta del sector, validación (texto plano, sin «General»), RN-16-9 y la
// instantánea con los testimonios del sector (CP-157) y las preguntas del inicio.
import { describe, expect, it } from 'vitest';
import {
  aplicarCambiosSector, type DatosSector, faltantesParaPublicar, rutaSector, slugSector, testimoniosDeSector,
} from '../src/sitio-sectores.js';
import { armarInstantanea } from '../src/sitio-versiones.js';

const vacio: DatosSector = { sector: null, portada: null, metaTitulo: null, blogCategoriaInicial: null };

describe('landings por sector (HU-1514)', () => {
  it('arma la ruta del sector sin tildes ni signos', () => {
    expect(slugSector('Minería y energía')).toBe('mineria-y-energia');
    expect(rutaSector('  Retail & Consumo ')).toBe('/sectores/retail-consumo');
  });

  it('valida el sector, la portada, el meta título y la categoría; un texto vacío se guarda null', () => {
    const ok = aplicarCambiosSector(vacio, { sector: ' Banca  y seguros ', portada: { titulo: 'Cumplimiento', texto: '' }, metaTitulo: '', blogCategoriaInicial: 'Estándares' });
    expect(ok).toEqual({ ok: true, datos: { sector: 'Banca y seguros', portada: { titulo: 'Cumplimiento', texto: '' }, metaTitulo: null, blogCategoriaInicial: 'Estándares' } });
    const mal = aplicarCambiosSector(vacio, { sector: 'general', portada: { titulo: '<b>x</b>' }, metaTitulo: 'x'.repeat(61) });
    expect(mal.ok ? [] : mal.errores.map((e) => e.campo)).toEqual(['sector', 'portada.titulo', 'metaTitulo']);
    expect(aplicarCambiosSector(vacio, { sector: '' })).toMatchObject({ ok: false, errores: [{ campo: 'sector', mensaje: 'El sector es obligatorio' }] });
  });

  it('RN-16-9: no se publica sin título y texto de portada ni meta título', () => {
    expect(faltantesParaPublicar(vacio).map((f) => f.campo)).toEqual(['portada.titulo', 'portada.texto', 'metaTitulo']);
    expect(faltantesParaPublicar({ portada: { titulo: 'T', texto: 'X' }, metaTitulo: 'M' })).toEqual([]);
  });

  it('CP-157: los testimonios del sector, sin importar mayúsculas; si no hay, todos', () => {
    const t = [{ datos: { nombre: 'A', sector: 'Minería y energía' } }, { datos: { nombre: 'B', sector: 'General' } }, { datos: { nombre: 'C' } }];
    expect(testimoniosDeSector('minería y energía ', t).map((x) => x.datos.nombre)).toEqual(['A']);
    expect(testimoniosDeSector('Banca y seguros', t).map((x) => x.datos.nombre)).toEqual(['A', 'B', 'C']);
  });

  it('la instantánea guarda el sector solo en landings y filtra testimonios y preguntas', () => {
    const bloques = ['hero', 'testimonios', 'faq'].map((tipo, orden) => ({ id: `b${orden}`, tipo, orden, visible: true, ajustes: null }));
    const el = (id: string, coleccion: string, datos: Record<string, string | number>) => ({ id, coleccion, orden: Number(id.slice(1)), visible: true, ficticio: false, datos });
    const inst = armarInstantanea({
      paginas: [
        { ruta: '/', idioma: 'es', titulo: 'Inicio', estado: 'PUBLICADA', publicadaEn: null, bloques },
        { ruta: '/sectores/mineria', idioma: 'es', titulo: 'Minería', estado: 'PUBLICADA', publicadaEn: null, bloques, tipo: 'sector', sector: 'Minería', portada: { titulo: 'T', texto: 'X' }, metaTitulo: 'M', blogCategoriaInicial: null },
      ],
      elementos: [
        el('e1', 'testimonios', { nombre: 'Ana', sector: 'Minería' }), el('e2', 'testimonios', { nombre: 'Luis', sector: 'Banca' }),
        el('e3', 'preguntas', { pregunta: 'General' }), el('e4', 'preguntas', { pregunta: 'Del inicio', pagina: '/' }),
        el('e5', 'preguntas', { pregunta: 'De precios', pagina: '/precios' }), el('e6', 'preguntas', { pregunta: 'De minería', pagina: '/sectores/mineria' }),
      ],
      enlaces: [],
    }, 'produccion');
    const [inicio, mineria] = inst.paginas;
    expect(inicio!.sector).toBeUndefined();
    expect(inicio!.bloques[1]!.elementos!.map((e) => e.datos.nombre)).toEqual(['Ana', 'Luis']);
    expect(mineria!.sector).toEqual({ nombre: 'Minería', portada: { titulo: 'T', texto: 'X' }, metaTitulo: 'M', blogCategoria: null });
    expect(mineria!.bloques[1]!.elementos!.map((e) => e.datos.nombre)).toEqual(['Ana']);
    expect(mineria!.bloques[2]!.elementos!.map((e) => e.datos.pregunta)).toEqual(['General', 'Del inicio', 'De minería']);
  });
});
