// HU-0608 PR 2 · El ancla sigue a su palabra cuando cambia la narración (RN-06-8, CP-067) y «Sincronizar con la voz»
// (SUP-48, CP-068) da la salida esperada del caso LOTO.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pantallasDe, type CursoDoc } from '../src/revision.js';
import { elementoRevisarTiempo, marcasPalabra, mensajeRevisarTiempo, reanclar, reanclarAjustes, recalcularAnclas, retardoDeAncla, sincronizarConVoz } from '../src/tiempos.js';

const leer = (ruta: string) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const P08 = 'Después de apagar puede quedar energía residual: presión, carga o un resorte tenso.';

describe('reanclar (CP-067)', () => {
  it('la palabra se mantiene en su lugar aunque cambie la puntuación o una tilde', () => {
    expect(reanclar(P08, 'Despues de apagar puede quedar energia residual, presion, carga o un resorte tenso', 6)).toBe(6);
  });

  it('la palabra se desplaza cuando se agregan o quitan palabras antes', () => {
    expect(reanclar(P08, 'Ojo: después de apagar el equipo todavía puede quedar energía residual: presión o carga.', 6)).toBe(10);
    expect(reanclar(P08, 'Puede quedar energía residual: presión, carga o un resorte tenso.', 6)).toBe(3);
  });

  it('la palabra eliminada no tiene índice nuevo; tampoco un índice fuera del texto', () => {
    expect(reanclar(P08, 'Después de apagar puede quedar energía: presión, carga o un resorte tenso.', 6)).toBeUndefined();
    expect(reanclar(P08, P08, 40)).toBeUndefined();
  });

  it('el segundo del ancla sale de las marcas de la voz nueva', () => {
    const nuevo = 'Ojo: después de apagar el equipo todavía puede quedar energía residual: presión o carga.';
    const m = marcasPalabra(nuevo, nuevo.length * 65);
    expect(retardoDeAncla(m, 10)).toBeCloseTo((nuevo.indexOf('residual') * 65) / 1000, 2);
    expect(retardoDeAncla(m, 99)).toBeUndefined();
  });
});

describe('sincronizarConVoz (CP-068)', () => {
  it('p05: da los tiempos de X-IA-16-sincronizar-p05.json (paridad con el caso LOTO)', () => {
    const doc = leer('../../ai/casos/loto/curso-esperado-es.json') as CursoDoc;
    const p05 = pantallasDe(doc).find((p) => p.id === 'p05')!;
    const voz = (leer('../../ai/casos/loto/salidas/06-voz-es.json') as { narraciones: { pantallaId: string; texto: string; duracionMs: number }[] }).narraciones.find((n) => n.pantallaId === 'p05')!;
    const r = sincronizarConVoz(p05 as Parameters<typeof sincronizarConVoz>[0], marcasPalabra(voz.texto, voz.duracionMs));
    const esperado = leer('../../ai/casos/loto/salidas/X-IA-16-sincronizar-p05.json');
    expect(esperado.tipo).toBe('sincronizar-voz');
    expect(esperado.patch).toEqual([{ op: 'add', path: '/ajustes', value: r.tiempos }]);
    expect(r.total).toBe(4);
    expect(r.tiempos['p05-titulo']).toEqual({ retardoS: 0 });
    // La imagen no se nombra en la narración: conserva su tiempo.
    expect(r.tiempos['p05-imagen']).toBeUndefined();
  });

  it('el personaje y los títulos agregados entran en 0 s; un extra con texto se ancla por prefijo', () => {
    const marcas = marcasPalabra('Bloquea siempre la energía antes de intervenir.', 3000);
    const r = sincronizarConVoz(
      { bloques: [{ id: 'ana', tipo: 'personaje' }], extras: [{ id: 'x1', tipo: 'titulo', texto: { es: 'Hola' } }, { id: 'x2', tipo: 'dato', texto: { es: 'Intervención segura' } }] },
      marcas,
    );
    expect(r.tiempos).toEqual({ ana: { retardoS: 0 }, x1: { retardoS: 0 }, x2: { retardoS: retardoDeAncla(marcas, 6), anclaPalabra: 6 } });
    expect(r.encontrados).toBe(1);
  });
});

describe('anclas de los ajustes al cambiar la narración y la voz (CP-067)', () => {
  it('reubica el ancla, quita la de la palabra eliminada y conserva su segundo', () => {
    const ajustes: Record<string, { retardoS?: number; anclaPalabra?: number; color?: string }> = {
      'p08-dato': { retardoS: 2.6, anclaPalabra: 6, color: 'acento' },
      'p08-titulo': { retardoS: 0.4, anclaPalabra: 0 },
      'p08-imagen': { retardoS: 1 },
    };
    const perdidos = reanclarAjustes(ajustes, P08, 'Antes de tocar: después de apagar puede quedar energía: presión, carga o un resorte tenso.');
    expect(perdidos).toEqual(['p08-dato']);
    expect(ajustes['p08-dato']).toEqual({ retardoS: 2.6, color: 'acento' });
    expect(ajustes['p08-titulo']).toEqual({ retardoS: 0.4, anclaPalabra: 3 });
    expect(ajustes['p08-imagen']).toEqual({ retardoS: 1 });
    expect(elementoRevisarTiempo(mensajeRevisarTiempo('p08-dato'))).toBe('p08-dato');
  });

  it('con la voz nueva, el ancla toma el segundo de su palabra; si la voz no la tiene, queda el segundo', () => {
    const nuevo = 'Ojo: después de apagar el equipo todavía puede quedar energía residual: presión o carga.';
    const marcas = marcasPalabra(nuevo, nuevo.length * 65);
    const ajustes: Record<string, { retardoS?: number; anclaPalabra?: number }> = { a: { retardoS: 2.6, anclaPalabra: 10 }, b: { retardoS: 1, anclaPalabra: 50 } };
    expect(recalcularAnclas(ajustes, marcas)).toEqual(['b']);
    expect(ajustes.a).toEqual({ retardoS: retardoDeAncla(marcas, 10), anclaPalabra: 10 });
    expect(ajustes.b).toEqual({ retardoS: 1 });
  });
});
