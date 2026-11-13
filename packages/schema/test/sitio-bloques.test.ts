import { describe, expect, it } from 'vitest';
import {
  CATALOGO_BLOQUES,
  TIPOS_BLOQUE,
  aplicarOrden,
  bloquesPublicos,
  compactarOrden,
  contarVisibles,
  esTipoBloque,
  fuenteBloque,
  moverBloque,
  nombreBloque,
  ordenAlFinal,
  validarOrden,
} from '../src/sitio-bloques.js';

const b = (id: string, orden: number, visible = false) => ({ id, orden, visible });

describe('catálogo cerrado de bloques', () => {
  it('trae los 18 tipos del prototipo con su nombre', () => {
    expect(TIPOS_BLOQUE).toHaveLength(18);
    expect(nombreBloque('testimonios')).toBe('Testimonios');
    expect(nombreBloque('metricas')).toBe('Cifras');
    expect(fuenteBloque('logos')).toBe('Contenido › Logos');
    expect(fuenteBloque('hero')).toBeUndefined();
    expect(Object.values(CATALOGO_BLOQUES).every((c) => c.nombre.length > 0)).toBe(true);
  });

  it('rechaza tipos fuera del catálogo', () => {
    expect([esTipoBloque('hero'), esTipoBloque('video'), esTipoBloque('toString'), esTipoBloque(3)]).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(nombreBloque('video')).toBe('video');
  });
});

describe('orden de bloques', () => {
  it('un bloque nuevo va al final', () => {
    expect(ordenAlFinal([])).toBe(0);
    expect(ordenAlFinal([b('a', 0), b('b', 1)])).toBe(2);
  });

  it('cuenta visibles y deja al público solo los visibles en orden (CP-112)', () => {
    const lista = [b('c', 2, true), b('a', 0, true), b('t', 1, false)];
    expect(contarVisibles(lista)).toBe(2);
    expect(bloquesPublicos(lista).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('valida que la lista de ids sea exactamente la de la página', () => {
    const lista = [b('a', 0), b('b', 1), b('c', 2)];
    expect([
      validarOrden(lista, ['c', 'a', 'b']),
      validarOrden(lista, ['a', 'a', 'b', 'c']),
      validarOrden(lista, ['a', 'b', 'c', 'x']),
      validarOrden(lista, ['a', 'b']),
    ]).toEqual([null, { tipo: 'DUPLICADO', id: 'a' }, { tipo: 'AJENO', id: 'x' }, { tipo: 'FALTANTE', id: 'c' }]);
  });

  it('aplica el orden nuevo (CP-113) y falla si no es válido', () => {
    const lista = [b('metricas', 0), b('logos', 1), b('cta', 2)];
    expect(aplicarOrden(lista, ['logos', 'metricas', 'cta'])).toEqual([b('logos', 0), b('metricas', 1), b('cta', 2)]);
    expect(() => aplicarOrden(lista, ['logos'])).toThrow(/FALTANTE/);
  });

  it('mueve un bloque una posición y no pasa de los extremos', () => {
    const ids = ['a', 'b', 'c'];
    expect(moverBloque(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moverBloque(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moverBloque(ids, 'a', -1)).toEqual(ids);
    expect(moverBloque(ids, 'c', 1)).toEqual(ids);
    expect(moverBloque(ids, 'x', 1)).toEqual(ids);
  });

  it('compacta el orden tras borrar', () => {
    expect(compactarOrden([b('c', 5), b('a', 0)])).toEqual([b('a', 0), b('c', 1)]);
  });
});
