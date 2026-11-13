import { describe, expect, it } from 'vitest';
import { bloqueaPublicacion, elementosParaPublico, entornoSitio, ficticiosVisibles } from '../src/sitio-ficticios.js';

const e = (id: string, coleccion: string, orden: number, visible: boolean, ficticio: boolean) => ({ id, coleccion, orden, visible, ficticio });

describe('datos ficticios (HU-1505)', () => {
  it('SITIO_ENTORNO: solo «pruebas» es pruebas; sin definir o desconocido es producción', () => {
    expect([undefined, null, '', 'produccion', 'PRODUCCION', 'pruebas', ' Pruebas ', 'staging', 'test'].map(entornoSitio))
      .toEqual(['produccion', 'produccion', 'produccion', 'produccion', 'produccion', 'pruebas', 'pruebas', 'produccion', 'produccion']);
  });

  it('lista solo los ficticios visibles, por colección del catálogo y orden', () => {
    const lista = [
      e('t2', 'testimonios', 1, true, true), e('c1', 'cifras', 0, true, true), e('t1', 'testimonios', 0, true, true),
      e('t3', 'testimonios', 2, false, true), e('l1', 'logos', 0, true, false),
    ];
    expect(ficticiosVisibles(lista).map((x) => x.id)).toEqual(['c1', 't1', 't2']);
  });

  it('CP-116 y CP-117: bloquea solo en producción y solo si hay alguno visible', () => {
    expect([bloqueaPublicacion('produccion', 2), bloqueaPublicacion('produccion', 0), bloqueaPublicacion('pruebas', 2)]).toEqual([true, false, false]);
  });

  it('el público de producción nunca ve ficticios; el de pruebas sí', () => {
    const lista = [e('a', 'logos', 0, true, true), e('b', 'logos', 1, true, false)];
    expect(elementosParaPublico('produccion', lista).map((x) => x.id)).toEqual(['b']);
    expect(elementosParaPublico('pruebas', lista).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
