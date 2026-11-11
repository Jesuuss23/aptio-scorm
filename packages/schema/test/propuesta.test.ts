// HU-0504 · JSON Patch (RFC 6902) y reglas de las propuestas de la IA (SUP-39).
// HU-0604 · Los retoques se conservan cuando la IA cambia el contenido (CP-059, SUP-43).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { erroresCurso } from '../src/index.js';
import { aplicarPatch, ErrorPatch } from '../src/patch.js';
import { aplicarEnPantalla, cambiaDisposicion, cursoConPropuesta, erroresRutas, huellaPantalla, patchDe, pantallaParaPrompt, rutaProtegida } from '../src/propuesta.js';
import { conservarRetoques } from '../src/retoques.js';
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

type ConRetoques = { ajustes?: Record<string, unknown>; extras?: unknown[]; disposicion?: string; bloques: { id: string }[] };
/** p05 con la imagen movida en modo Libre, el título en Acento y un botón agregado a mano. */
const p05Retocada = () => {
  const p = p05() as ReturnType<typeof p05> & ConRetoques;
  p.ajustes = { 'p05-imagen': { desplazamiento: { x: 12.5, y: -4, dispositivo: 'todos' } }, 'p05-titulo': { color: 'acento' } };
  p.extras = [{ id: 'p05-boton', tipo: 'boton', texto: { es: 'Ver ejemplo' }, x: 70, y: 80, ancho: 20, alClic: 'retroalimentacion' }];
  return p;
};
const MENOS_TEXTO = JSON.parse(readFileSync(new URL('../../ai/casos/loto/salidas/X-IA-16-propuestas-p05.json', import.meta.url), 'utf8'))[1].patch;

describe('HU-0604 · retoques separados del contenido', () => {
  it('CP-059 · con la imagen movida y un botón agregado, «Menos texto» deja la imagen movida y el botón ahí', () => {
    const antes = p05Retocada();
    const nueva = aplicarEnPantalla(antes, MENOS_TEXTO) as unknown as ConRetoques;
    expect(nueva.ajustes).toEqual(antes.ajustes);
    expect(nueva.extras).toEqual(antes.extras);
    // El texto sí cambió, y el curso con los retoques sigue válido.
    expect(JSON.stringify(nueva.bloques)).toContain('Energía que puede mover, calentar o liberar algo sin aviso.');
    const doc = loto();
    const c = doc.modulos.flatMap((m) => m.capsulas).find((x) => x.pantallas.some((p) => p.id === 'p05'))!;
    c.pantallas[c.pantallas.findIndex((p) => p.id === 'p05')] = antes;
    expect(erroresCurso(cursoConPropuesta(doc, 'p05', MENOS_TEXTO))).toEqual([]);
  });

  it('un patch no puede tocar los ajustes ni los extras', () => {
    expect(['/ajustes', '/ajustes/p05-imagen', '/extras', '/extras/0/x'].every(rutaProtegida)).toBe(true);
    expect(erroresRutas([{ op: 'remove', path: '/extras/0' }, { op: 'copy', from: '/ajustes/p05-imagen', path: '/bloques/0/x' }])).toHaveLength(2);
    expect(() => aplicarEnPantalla(p05Retocada(), [{ op: 'remove', path: '/ajustes' }])).toThrow(/retoques/);
  });

  it('si la propuesta quita un bloque, su ajuste se va; si cambia la disposición, se reinician los ajustes y quedan los extras', () => {
    const sinDato = aplicarEnPantalla(p05Retocada(), [{ op: 'remove', path: '/bloques/3' }]) as unknown as ConRetoques;
    expect(sinDato.ajustes).toEqual({ 'p05-titulo': { color: 'acento' } });
    const masVisual = [{ op: 'replace' as const, path: '/disposicion', value: 'dato' }];
    expect(cambiaDisposicion(masVisual)).toBe(true);
    expect(cambiaDisposicion(MENOS_TEXTO)).toBe(false);
    const nueva = aplicarEnPantalla(p05Retocada(), masVisual) as unknown as ConRetoques;
    expect(nueva.ajustes).toBeUndefined();
    expect(nueva.extras).toHaveLength(1);
  });

  it('los retoques no van al prompt ni cuentan en la huella: mover la imagen no vence la propuesta', () => {
    const texto = JSON.stringify(pantallaParaPrompt(p05Retocada()));
    expect(texto).not.toMatch(/ajustes|extras|desplazamiento|p05-boton/);
    const doc = loto();
    const antes = huellaPantalla(doc, 'p05');
    const p = pantallasDe(doc).find((x) => x.id === 'p05')! as ReturnType<typeof p05> & ConRetoques;
    p.ajustes = { 'p05-imagen': { desplazamiento: { x: 3, y: 0 } } };
    p.extras = [{ id: 'p05-boton', tipo: 'boton', x: 1, y: 1, ancho: 10 }];
    expect(huellaPantalla(doc, 'p05')).toBe(antes);
  });

  it('«Generar de nuevo» conserva los retoques si la pantalla tiene la misma disposición', () => {
    const antes = p05Retocada();
    const regenerada = { ...structuredClone(p05()), bloques: p05().bloques.filter((b) => b.id !== 'p05-imagen') } as ConRetoques;
    const r = conservarRetoques(antes, regenerada);
    expect(r.extras).toEqual(antes.extras);
    expect(r.ajustes).toEqual({ 'p05-titulo': { color: 'acento' } });
    expect(conservarRetoques(antes, { ...structuredClone(p05()), disposicion: 'lista' } as ConRetoques).ajustes).toBeUndefined();
  });
});

