// HU-0504 · JSON Patch (RFC 6902) y reglas de las propuestas de la IA (SUP-39).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { erroresCurso } from '../src/index.js';
import { aplicarPatch, ErrorPatch } from '../src/patch.js';
import { aplicarEnPantalla, cursoConPropuesta, erroresRutas, huellaPantalla, patchDe, pantallaParaPrompt, rutaProtegida } from '../src/propuesta.js';
import { type CursoDoc, pantallasDe } from '../src/revision.js';

const loto = () => JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoDoc;
const p05 = () => pantallasDe(loto()).find((p) => p.id === 'p05')!;

describe('aplicarPatch (RFC 6902)', () => {
  const base = { a: 1, b: { c: [1, 2, 3] }, 'x/y': { '~z': true } };

  it('agrega, quita, reemplaza, mueve, copia y comprueba sin tocar el original', () => {
    const r = aplicarPatch(base, [
      { op: 'add', path: '/b/c/1', value: 9 },
      { op: 'add', path: '/b/c/-', value: 4 },
      { op: 'remove', path: '/a' },
      { op: 'replace', path: '/b/c/0', value: 0 },
      { op: 'copy', from: '/b/c', path: '/d' },
      { op: 'move', from: '/x~1y/~0z', path: '/e' },
      { op: 'test', path: '/e', value: true },
    ]);
    expect(r).toEqual({ b: { c: [0, 9, 2, 3, 4] }, d: [0, 9, 2, 3, 4], 'x/y': {}, e: true });
    expect(base).toEqual({ a: 1, b: { c: [1, 2, 3] }, 'x/y': { '~z': true } });
  });

  it('falla entero con el número de la operación si una ruta no existe, un índice sobra o un test no coincide', () => {
    expect(() => aplicarPatch(base, [{ op: 'replace', path: '/a', value: 2 }, { op: 'remove', path: '/nada' }])).toThrow(/Operación 2: la ruta \/nada no existe/);
    expect(() => aplicarPatch(base, [{ op: 'add', path: '/b/c/7', value: 1 }])).toThrow(ErrorPatch);
    expect(() => aplicarPatch(base, [{ op: 'replace', path: '/b/c/3', value: 1 }])).toThrow(/índice 3 no existe/);
    expect(() => aplicarPatch(base, [{ op: 'test', path: '/a', value: 2 }])).toThrow(/no coincide/);
    expect(() => aplicarPatch(base, [{ op: 'move', from: '/b', path: '/b/c/0' }])).toThrow(/dentro de sí mismo/);
  });
});

describe('propuestas sobre una pantalla', () => {
  it('protege el id, el estado y la narración (SUP-39)', () => {
    expect(['/id', '/estado', '/narracion', '/narracion/texto/es', ''].every(rutaProtegida)).toBe(true);
    expect(rutaProtegida('/bloques/1/contenido')).toBe(false);
    expect(erroresRutas([{ op: 'replace', path: '/narracion/texto', value: {} }, { op: 'move', from: '/estado', path: '/x' }])).toHaveLength(2);
    expect(() => aplicarEnPantalla(p05(), [{ op: 'replace', path: '/id', value: 'p99' }])).toThrow(/no se puede cambiar/);
  });

  it('marca como propuesta de la IA los textos que cambian y conserva su página de origen', () => {
    const nueva = aplicarEnPantalla(p05(), [{ op: 'replace', path: '/bloques/1/contenido', value: { es: 'Energía que mueve o calienta sin aviso.' } }]);
    const [titulo, texto] = nueva.bloques as { origen?: { tipo: string; revisado: boolean; paginas?: number[] } }[];
    expect(texto!.origen).toEqual({ tipo: 'ia', revisado: false, documentoId: 'doc-pets-seg-014', paginas: [12] });
    expect(titulo!.origen!.tipo).toBe('documento');
  });

  it('aplica la propuesta solo a su pantalla y el curso sigue válido', () => {
    const doc = loto();
    const nuevo = cursoConPropuesta(doc, 'p05', [{ op: 'replace', path: '/disposicion', value: 'dato' }]);
    expect(pantallasDe(nuevo).find((p) => p.id === 'p05')!.disposicion).toBe('dato');
    expect(pantallasDe(doc).find((p) => p.id === 'p05')!.disposicion).toBe('idea');
    expect(erroresCurso(nuevo)).toEqual([]);
    expect(() => cursoConPropuesta(doc, 'p99', [])).toThrow(/no tiene la pantalla p99/);
  });

  it('la huella cambia con el contenido de la pantalla, no con su aprobación ni con su audio (RN-05-4)', () => {
    const doc = loto();
    const antes = huellaPantalla(doc, 'p05');
    const p = pantallasDe(doc).find((x) => x.id === 'p05')! as { estado: string; narracion?: { porIdioma?: { es: { estado: string } } } };
    p.estado = 'aprobado';
    p.narracion!.porIdioma!.es.estado = 'desactualizado';
    expect(huellaPantalla(doc, 'p05')).toBe(antes);
    expect(huellaPantalla(cursoConPropuesta(doc, 'p05', [{ op: 'replace', path: '/fondo', value: 'primario' }]), 'p05')).not.toBe(antes);
    expect(huellaPantalla(doc, 'p99')).toBeNull();
  });

  it('elige el patch de la variante y manda la pantalla al prompt sin los datos de la voz', () => {
    const variantes = [{ nombre: 'A', disposicion: 'dato', patch: [{ op: 'remove' as const, path: '/bloques/3' }] }];
    expect(patchDe({ variantes }, 0)).toBe(variantes[0]!.patch);
    expect(() => patchDe({ variantes }, 3)).toThrow(/Elige una de las variantes/);
    expect(JSON.stringify(pantallaParaPrompt(p05()))).not.toMatch(/bocas|hashTexto|recursoAudioId/);
  });
});
