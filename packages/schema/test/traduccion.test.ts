// HU-0802 · Textos del curso para traducir, aplicar el inglés y respetar el glosario (RN-08-1, CP-076).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { erroresCurso } from '../src/index.js';
import { aplicarTraducciones, erroresGlosario, erroresLote, huellaTexto, sincronizarFilas, textosDe } from '../src/traduccion.js';

const loto = () => JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));
const GLOSARIO = [
  { termino: 'LOTO', noTraducir: true },
  { termino: 'energía cero', traduccion: 'zero energy' },
  { termino: 'candado personal', traduccion: 'personal lock' },
];

describe('textos del curso (HU-0802)', () => {
  it('recorre todos los { es, en } de LOTO en orden, con su ruta y su pantalla', () => {
    const textos = textosDe(loto());
    expect(textos.length).toBe(291);
    expect(textos[0]).toMatchObject({ pantallaId: null });
    const p01 = textos.filter((t) => t.pantallaId === 'p01');
    expect(p01.map((t) => t.ruta)).toEqual([
      '/modulos/0/capsulas/0/pantallas/0/titulo',
      '/modulos/0/capsulas/0/pantallas/0/bloques/0/contenido',
      '/modulos/0/capsulas/0/pantallas/0/bloques/1/contenido',
      '/modulos/0/capsulas/0/pantallas/0/narracion/texto',
    ]);
    expect(p01[0]).toEqual({ ruta: '/modulos/0/capsulas/0/pantallas/0/titulo', pantallaId: 'p01', es: 'Bloqueo y etiquetado', en: null });
    // Los textos de las actividades también (opciones, retroalimentación) y siempre dentro de su pantalla.
    expect(textos.some((t) => t.ruta.includes('/interaccion/'))).toBe(true);
    expect(new Set(textos.filter((t) => t.ruta.includes('/pantallas/')).map((t) => t.pantallaId)).size).toBe(30);
  });

  it('aplica el inglés sin tocar el original y el curso sigue válido; una ruta que no es texto se rechaza', () => {
    const doc = loto();
    const ruta = '/modulos/0/capsulas/0/pantallas/0/titulo';
    const nuevo = aplicarTraducciones(doc, { [ruta]: 'Lockout and tagout' });
    expect(nuevo.modulos[0].capsulas[0].pantallas[0].titulo).toEqual({ es: 'Bloqueo y etiquetado', en: 'Lockout and tagout' });
    expect(doc.modulos[0].capsulas[0].pantallas[0].titulo).toEqual({ es: 'Bloqueo y etiquetado' });
    expect(erroresCurso(nuevo)).toEqual([]);
    expect(textosDe(nuevo).find((t) => t.ruta === ruta)?.en).toBe('Lockout and tagout');
    expect(() => aplicarTraducciones(doc, { '/modulos/0/capsulas/0/pantallas/0/id': 'x' })).toThrow('no es un texto');
    expect(() => aplicarTraducciones(doc, { [ruta]: '  ' })).toThrow('vacía');
  });

  it('la huella cambia con el texto en español', () => {
    expect(huellaTexto('Bloqueo y etiquetado')).toBe(huellaTexto('Bloqueo y etiquetado'));
    expect(huellaTexto('Bloqueo y etiquetado')).not.toBe(huellaTexto('Bloqueo y etiquetado.'));
    expect(huellaTexto('a')).toMatch(/^[0-9a-f]{14}$/);
  });
});

describe('glosario en la traducción (RN-08-1)', () => {
  it('CP-076 · «LOTO» como «no traducir» queda igual; «Lockout» o «loto» no lo respetan', () => {
    const origen = 'Bloqueo y etiquetado (LOTO)';
    expect(erroresGlosario(origen, 'Lockout and tagout (LOTO)', GLOSARIO)).toEqual([]);
    expect(erroresGlosario(origen, 'Lockout and tagout (Lockout)', GLOSARIO)).toEqual(['«LOTO» no se traduce: debe quedar igual']);
    expect(erroresGlosario(origen, 'Lockout and tagout (loto)', GLOSARIO)).toEqual(['«LOTO» no se traduce: debe quedar igual']);
    // Dentro de otra palabra no cuenta: «PILOTOS» no lleva el término.
    expect(erroresGlosario('PILOTOS de prueba', 'Test pilots', GLOSARIO)).toEqual([]);
    expect(erroresGlosario(origen, 'Lockout and tagout (LOTOS)', GLOSARIO)).toHaveLength(1);
  });

  it('un término con traducción exige esa traducción, como palabra completa y sin importar mayúsculas', () => {
    const origen = 'Comprueba la Energía cero con tu candado personal.';
    expect(erroresGlosario(origen, 'Check zero energy with your personal lock.', GLOSARIO)).toEqual([]);
    expect(erroresGlosario('Energía cero', 'Zero Energy', GLOSARIO)).toEqual([]);
    expect(erroresGlosario(origen, 'Check zero energy with your own padlock.', GLOSARIO)).toEqual([
      '«candado personal» se traduce «personal lock» (glosario del cliente)',
    ]);
    expect(erroresGlosario(origen, 'Check no energy with your personal locks.', GLOSARIO)).toEqual([
      '«energía cero» se traduce «zero energy» (glosario del cliente)',
      '«candado personal» se traduce «personal lock» (glosario del cliente)',
    ]);
    // Un término que no está en el origen no se exige.
    expect(erroresGlosario('Apaga la máquina.', 'Turn off the machine.', GLOSARIO)).toEqual([]);
  });
});

describe('filas de traducción y lotes de IA-10', () => {
  it('crea las que faltan, vuelve a Pendiente lo que cambió en español (aunque esté revisado) y borra las rutas que ya no existen', () => {
    const textos = [
      { ruta: '/a', pantallaId: 'p01', es: 'Hola', en: null },
      { ruta: '/b', pantallaId: 'p01', es: 'Adiós', en: 'Bye' },
      { ruta: '/c', pantallaId: 'p02', es: 'Texto nuevo', en: 'Old text' },
      { ruta: '/d', pantallaId: 'p02', es: 'Igual', en: 'Same' },
    ];
    const filas = [
      { id: '1', ruta: '/c', textoOrigenHash: huellaTexto('Texto viejo'), estado: 'REVISADA' as const },
      { id: '2', ruta: '/d', textoOrigenHash: huellaTexto('Igual'), estado: 'REVISADA' as const },
      { id: '3', ruta: '/z', textoOrigenHash: 'x', estado: 'PENDIENTE' as const },
    ];
    expect(sincronizarFilas(textos, filas)).toEqual({
      crear: [
        { ruta: '/a', textoOrigenHash: huellaTexto('Hola'), estado: 'PENDIENTE' },
        { ruta: '/b', textoOrigenHash: huellaTexto('Adiós'), estado: 'TRADUCIDA_IA' },
      ],
      reiniciar: [{ id: '1', textoOrigenHash: huellaTexto('Texto nuevo') }],
      borrar: ['3'],
    });
  });

  it('un lote debe traer exactamente las rutas pedidas, sin repetir, y respetar el glosario en cada texto', () => {
    const pedidos = [{ ruta: '/a', es: 'El LOTO salva vidas' }, { ruta: '/b', es: 'Apaga' }];
    expect(erroresLote(pedidos, { traducciones: [{ ruta: '/a', texto: 'LOTO saves lives' }, { ruta: '/b', texto: 'Turn off' }] }, GLOSARIO)).toEqual([]);
    expect(erroresLote(pedidos, { traducciones: [{ ruta: '/a', texto: 'Lockout saves lives' }, { ruta: '/a', texto: 'x' }, { ruta: '/x', texto: 'y' }] }, GLOSARIO)).toEqual([
      '/a: «LOTO» no se traduce: debe quedar igual',
      '/a: la ruta está repetida',
      '/x: no se pidió esta ruta',
      '/b: falta la traducción',
    ]);
  });
});
