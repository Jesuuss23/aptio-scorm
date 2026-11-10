// HU-0404 · Etapa 3 «Storyboard y guion» (IA-05 v2): texto corto en pantalla y narración por pantalla, con la misma
// secuencia y actividades de la estructura; más de 30 palabras en pantalla queda con advertencia (CP-040). PostgreSQL real.
import { proveedorSimulado } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { advertenciasDeLongitud, contarPalabras, type GuionCurso, type PantallaEstructura } from '@aptio/schema/generacion';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EJECUTORES } from '../src/etapas/index.js';
import { revisarGuion, textoGuion } from '../src/etapas/guion.js';
import { baseLista, comoReal, conteo, escenario, etapaDe, leerCaso } from './apoyo-generacion.js';

type Storyboard = { capsulaId: string; pantallas: { id: string; textoPantalla: string; narracion: string; actividad?: { tipo: string; consigna: string }; origen: { tipo: string; documentoId?: string; paginas?: number[] } }[] };
type Estructura = { modulos: { capsulas: { pantallas: PantallaEstructura[] }[] }[] };
const STORYBOARD = leerCaso('03-IA-05-storyboard.json') as Storyboard;
const ESTRUCTURA = leerCaso('02-IA-04-estructura.json') as Estructura;
const LARGO = 'Antes de abrir el tablero mira cada fuente: luz, agua, aire, gas, peso y calor. Pon tu candado y tu tarjeta, y prueba que el equipo no arranque. Si dudas, llama a tu jefe.';

/** La estructura LOTO con 12 actividades (p05 tarjetas y p08 clasificar), como en las pruebas de la etapa 2. */
function estructura12(): Estructura {
  const s = structuredClone(ESTRUCTURA);
  for (const p of s.modulos[0]!.capsulas[0]!.pantallas) {
    if (p.id === 'p05') p.actividadSugerida = 'INT-04';
    if (p.id === 'p08') p.actividadSugerida = 'INT-02';
  }
  return s;
}
/** El storyboard LOTO con las actividades de p05 y p08 y, si se pide, un texto de 34 palabras en p05. */
function storyboard12(largo = false): Storyboard {
  const s = structuredClone(STORYBOARD);
  for (const p of s.pantallas) {
    if (p.id === 'p05') Object.assign(p, { actividad: { tipo: 'INT-04', consigna: 'Voltea cada tarjeta.' } }, largo ? { textoPantalla: LARGO } : {});
    if (p.id === 'p08') p.actividad = { tipo: 'INT-02', consigna: 'Clasifica cada práctica.' };
  }
  return s;
}
const pantallas12 = () => estructura12().modulos[0]!.capsulas[0]!.pantallas;
const UN_DOC = [{ materialId: 'mat-1', nombre: 'PETS-SEG-014 Bloqueo.pdf', totalPaginas: 30 }];

describe('reglas del guion', () => {
  it('cuenta palabras sin los separadores sueltos: p02 del caso LOTO tiene 28', () => {
    expect(contarPalabras(STORYBOARD.pantallas[1]!.textoPantalla)).toBe(28);
    expect(contarPalabras('')).toBe(0);
    expect(contarPalabras('  Paso 1 — corta   la energía ')).toBe(5);
    expect(contarPalabras(LARGO)).toBe(34);
  });

  it('CP-040 · el guion LOTO no tiene advertencias; un texto de 34 palabras sí', () => {
    expect(advertenciasDeLongitud(STORYBOARD.pantallas)).toEqual([]);
    expect(advertenciasDeLongitud(storyboard12(true).pantallas)).toEqual([{ pantallaId: 'p05', campo: 'textoPantalla', palabras: 34, limite: 30 }]);
    const narracion = STORYBOARD.pantallas.map((p) => (p.id === 'p09' ? { ...p, narracion: `${LARGO} ${LARGO}` } : p));
    expect(advertenciasDeLongitud(narracion)).toEqual([{ pantallaId: 'p09', campo: 'narracion', palabras: 68, limite: 45 }]);
  });

  it('el resumen de la etapa dice cuántas pantallas pasan el límite', () => {
    const guion = (advertencias: GuionCurso['advertencias']): GuionCurso => ({ capsulas: [{ id: 'c', moduloId: 'm', titulo: {}, pantallas: new Array(30).fill({}) }], advertencias });
    expect(textoGuion(guion([]))).toBe('30 pantallas con texto en pantalla y narración · todas dentro del límite de palabras');
    expect(textoGuion(guion([{ pantallaId: 'p05', campo: 'textoPantalla', palabras: 34, limite: 30 }, { pantallaId: 'p09', campo: 'narracion', palabras: 50, limite: 45 }, { pantallaId: 'p10', campo: 'narracion', palabras: 50, limite: 45 }])))
      .toBe('30 pantallas con texto en pantalla y narración · 1 pantalla supera 30 palabras en pantalla · 2 narraciones superan 45 palabras');
  });

  it('acepta el storyboard con la misma secuencia y las actividades de la estructura', () => {
    expect(revisarGuion({ capsulaId: 'cap-loto', pantallas: pantallas12(), documentos: UN_DOC })(storyboard12(true))).toEqual([]);
    // Con un solo documento, el id que escriba la IA no importa: se corrige al guardar.
    expect(STORYBOARD.pantallas.find((p) => p.origen.tipo === 'documento')!.origen.documentoId).toBe('doc-pets-seg-014');
  });

  it('rechaza otra secuencia, la actividad que no sugiere la estructura y páginas o documentos que no existen', () => {
    const s = storyboard12();
    s.capsulaId = 'otra';
    delete s.pantallas[7]!.actividad;
    s.pantallas[3]!.origen.paginas = [12, 31];
    [s.pantallas[0], s.pantallas[1]] = [s.pantallas[1]!, s.pantallas[0]!];
    const errores = revisarGuion({ capsulaId: 'cap-loto', pantallas: pantallas12(), documentos: UN_DOC })(s);
    expect(errores).toEqual([
      'capsulaId debe ser "cap-loto"',
      expect.stringMatching(/^Las pantallas deben ser exactamente p01, p02, p03.* en ese orden \(llegaron p02, p01, p03/),
      'La pantalla p04 cita páginas que no existen en PETS-SEG-014 Bloqueo.pdf: 31',
      'La pantalla p08 debe llevar la actividad INT-02 que sugiere la estructura',
    ]);
    const dos = [...UN_DOC, { materialId: 'mat-2', nombre: 'Anexo.pdf', totalPaginas: 4 }];
    expect(revisarGuion({ capsulaId: 'cap-loto', pantallas: pantallas12(), documentos: dos })(storyboard12())).toContain('La pantalla p04 cita un documento que no existe: doc-pets-seg-014');
    expect(revisarGuion({ capsulaId: 'cap-loto', pantallas: pantallas12(), documentos: [] })(storyboard12())).toContain('La pantalla p04 no puede tener origen documento: el proyecto no tiene documentos');
  });
});

describe.skipIf(!baseLista && !process.env.CI)('etapa 3 en el generador', () => {
  const e = escenario('guion');
  beforeAll(e.crear);
  afterAll(e.borrar);
  const etapas = { RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION! };

  it('CP-040 · cada pantalla trae texto y narración; la que pasa de 30 palabras queda con advertencia, no rechazada', async () => {
    const { generacionId, materialId } = await e.preparar();
    // La primera respuesta pierde la actividad de p08: se reintenta con el motivo. La segunda trae p05 con 34 palabras.
    const proveedor = comoReal({ 'IA-04': [JSON.stringify(estructura12())], 'IA-05': [JSON.stringify(storyboard12()).replace('"INT-02","consigna":"Clasifica cada práctica."', '"INT-05","consigna":"Responde."'), JSON.stringify(storyboard12(true))] });
    expect(await e.correr(generacionId, proveedor, etapas)).toEqual({ estado: 'COMPLETADO' });

    const ia05 = proveedor.llamadas.filter((l) => l.tarea === 'IA-05');
    expect(ia05).toHaveLength(2);
    const pedido = ia05[0]!.mensajes[0]!.texto;
    expect(pedido).toContain('capsulaId = "cap-loto"');
    // Solo las ideas que usa la cápsula, en el orden de las pantallas, con su documento y página.
    expect(pedido).toContain(`<material_cliente archivo="ideas clave de la etapa 1">\nt06-f02 · documento ${materialId} · p. 12 · `);
    expect(pedido).not.toContain('t04-f02 ·');
    expect(pedido).toContain('Personaje: Guía, guía del curso. Tono: cercano.');
    expect(ia05[1]!.mensajes.at(-1)!.texto).toContain('La pantalla p08 debe llevar la actividad INT-02 que sugiere la estructura');

    const etapa = await etapaDe(generacionId, 'STORYBOARD_GUION');
    expect(etapa.estado).toBe('COMPLETADO');
    const { texto, datos } = etapa.detalle as unknown as { texto: string; datos: GuionCurso };
    expect(texto).toBe('30 pantallas con texto en pantalla y narración · 1 pantalla supera 30 palabras en pantalla');
    expect(datos.advertencias).toEqual([{ pantallaId: 'p05', campo: 'textoPantalla', palabras: 34, limite: 30 }]);
    const lista = datos.capsulas.flatMap((c) => c.pantallas);
    expect(lista).toHaveLength(30);
    expect(lista.every((p) => p.narracion.length > 0)).toBe(true);
    expect(lista.filter((p) => p.palabras.textoPantalla > 30).map((p) => p.id)).toEqual(['p05']);
    expect(lista.find((p) => p.id === 'p05')).toMatchObject({ tipo: 'contenido', textoPantalla: LARGO, palabras: { textoPantalla: 34 }, actividad: { tipo: 'INT-04' } });
    // El origen apunta al material real, con su archivo y página.
    expect(lista.find((p) => p.id === 'p06')!.origen).toEqual({ tipo: 'documento', documentoId: materialId, archivo: 'PETS-SEG-014 Bloqueo.pdf', paginas: [13], revisado: false });
    expect(datos.capsulas[0]).toMatchObject({ id: 'cap-loto', moduloId: 'mod-1' });

    const trabajo = await prisma.trabajoIA.findFirstOrThrow({ where: { generacionId, tarea: 'IA-05' } });
    expect(trabajo).toMatchObject({ versionPrompt: 'IA-05.v2', intentos: 2 });
    expect(await conteo(generacionId)).toMatchObject({ 'IA-04': 1, 'IA-05': 1 });
  });

  it('sin la estructura de la etapa 2 la etapa 3 queda en error y no llama a la IA', async () => {
    const { generacionId } = await e.preparar();
    const sinDatos = { RESUMEN_MATERIAL: async () => ({ texto: 'sin datos' }), OBJETIVOS_ESTRUCTURA: async () => ({ texto: 'sin datos' }), STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION! };
    expect(await e.correr(generacionId, comoReal(), sinDatos)).toEqual({ estado: 'ERROR' });
    expect(await etapaDe(generacionId, 'STORYBOARD_GUION')).toMatchObject({ estado: 'ERROR', detalle: { texto: 'Falta el resultado de la etapa 2 (Objetivos y estructura)' } });
    expect(await conteo(generacionId)).toEqual({});
  });

  it('en modo simulado, con solo el tema, ninguna pantalla dice venir de un documento que no existe', async () => {
    const { generacionId } = await e.preparar(null);
    expect(await e.correr(generacionId, proveedorSimulado(), etapas)).toEqual({ estado: 'COMPLETADO' });
    const { texto, datos } = (await etapaDe(generacionId, 'STORYBOARD_GUION')).detalle as unknown as { texto: string; datos: GuionCurso };
    expect(texto).toBe('30 pantallas con texto en pantalla y narración · todas dentro del límite de palabras');
    expect(datos.capsulas[0]!.pantallas.every((p) => p.origen.tipo === 'ia')).toBe(true);
  });
});
