// HU-1001 · Matriz de alineación (CP-083, RN-10-1, RN-10-2): roles, niveles por disposición, alertas e indicadores,
// sobre copias del caso LOTO (que tiene 2 alertas: obj-2 y obj-3 se evalúan con el reto final en «recordar»).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aplicarCorreccion, aplicarNiveles, type CorreccionAlineacion, elementosAlineacion, erroresCorreccion, informeAlineacion } from '../src/alineacion.js';
import { type CursoDoc, pantallasDe } from '../src/revision.js';
import { erroresCurso, validarCurso } from '../src/validar.js';

const original = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoDoc;
const loto = () => structuredClone(original);
// HU-1002 · La salida grabada de IA-17 v2: 2 preguntas nuevas en el Reto final (p28).
const correccionLoto = JSON.parse(readFileSync(new URL('../../ai/casos/loto/salidas/X-IA-17-alineacion.json', import.meta.url), 'utf8')) as CorreccionAlineacion;
const P28 = '/modulos/0/capsulas/0/pantallas/27';
const objetivo = (doc: CursoDoc, id: string) => informeAlineacion(doc).objetivos.find((o) => o.id === id)!;

describe('alineación pedagógica', () => {
  it('LOTO tiene 2 alertas: obj-2 y obj-3 se evalúan solo en «recordar»', () => {
    const informe = informeAlineacion(loto());
    expect(informe.objetivos.map((o) => [o.id, o.alertas])).toEqual([
      ['obj-1', []],
      ['obj-2', ['Se evalúa solo en «recordar», menor que «comprender»']],
      ['obj-3', ['Se evalúa solo en «recordar», menor que «aplicar»']],
    ]);
    expect(informe.totalAlertas).toBe(2);
    // p03 (la presentación de Ana) no tiene objetivo.
    expect(informe.indicadores).toEqual({ objetivosAlineados: 1, elementosSinObjetivo: 1, equilibrio: { presenta: 15, practica: 8, evalua: 8 } });
  });

  it('RN-10-1 · el reto final cuenta cada pregunta con su objetivo; las formativas practican y el contenido presenta', () => {
    const elementos = elementosAlineacion(loto());
    // Portada, objetivos, secciones, resultados y cierre no cuentan.
    expect(elementos.some((x) => ['p01', 'p02', 'p12', 'p23', 'p29', 'p30'].includes(x.pantallaId))).toBe(false);
    expect(elementos.filter((x) => x.pantallaId === 'p28').map((x) => [x.preguntaId, x.rol, x.objetivoIds])).toEqual([
      ['bq-01', 'E', ['obj-2']], ['bq-02', 'E', ['obj-1']], ['bq-03', 'E', ['obj-1']], ['bq-04', 'E', ['obj-1']],
      ['bq-05', 'E', ['obj-2']], ['bq-06', 'E', ['obj-3']], ['bq-07', 'E', ['obj-3']], ['bq-08', 'E', ['obj-2']],
    ]);
    const de = (id: string) => elementos.find((x) => x.pantallaId === id)!;
    expect([de('p07'), de('p10'), de('p15'), de('p20'), de('p18'), de('p04')].map((x) => [x.rol, x.nivelBloom, x.nivelEscrito])).toEqual([
      ['A', 'recordar', false], ['A', 'comprender', false], ['A', 'aplicar', false], ['A', 'comprender', false], ['P', 'comprender', false], ['P', 'recordar', false],
    ]);
    expect(de('p15')).toMatchObject({ numero: 15, titulo: expect.any(String) });
  });

  it('CP-083 · un objetivo «aplicar» evaluado solo con preguntas «recordar» tiene la alerta', () => {
    const doc = loto();
    expect(objetivo(doc, 'obj-3')).toMatchObject({
      nivelBloom: 'aplicar',
      evalua: [{ preguntaId: 'bq-06', nivelBloom: 'recordar' }, { preguntaId: 'bq-07', nivelBloom: 'recordar' }],
      alertas: ['Se evalúa solo en «recordar», menor que «aplicar»'],
    });
    // Una pregunta al nivel del objetivo la resuelve; el nivel queda escrito y el curso sigue validando.
    expect(aplicarNiveles(doc, [{ pantallaId: 'p28', preguntaId: 'bq-06', nivelBloom: 'aplicar' }])).toBeNull();
    expect(objetivo(doc, 'obj-3').alertas).toEqual([]);
    expect(objetivo(doc, 'obj-3').evalua[0]).toMatchObject({ nivelBloom: 'aplicar', nivelEscrito: true });
    expect(validarCurso(doc).valido).toBe(true);
  });

  it('cambiar el nivel de un objetivo o de una pantalla recalcula sus alertas', () => {
    const doc = loto();
    expect(aplicarNiveles(doc, [{ objetivoId: 'obj-2', nivelBloom: 'recordar' }])).toBeNull();
    expect(objetivo(doc, 'obj-2').alertas).toEqual([]);
    // La práctica de obj-1 (memoria, recordar) no llega a «analizar».
    expect(aplicarNiveles(doc, [{ objetivoId: 'obj-1', nivelBloom: 'analizar' }])).toBeNull();
    expect(objetivo(doc, 'obj-1').alertas).toEqual(['La práctica no llega a «analizar»', 'Se evalúa solo en «recordar», menor que «analizar»']);
    expect(aplicarNiveles(doc, [{ pantallaId: 'p07', nivelBloom: 'analizar' }])).toBeNull();
    expect(objetivo(doc, 'obj-1').alertas).toEqual(['Se evalúa solo en «recordar», menor que «analizar»']);
    expect(validarCurso(doc).valido).toBe(true);
  });

  it('RN-10-2 · sin presentación, práctica ni evaluación hay una alerta por cada una', () => {
    const doc = loto() as CursoDoc & { objetivos: { id: string; texto: { es: string }; nivelBloom: string }[] };
    doc.objetivos.push({ id: 'obj-4', texto: { es: 'Explicar el permiso de trabajo' }, nivelBloom: 'comprender' });
    expect(objetivo(doc, 'obj-4').alertas).toEqual(['No se presenta', 'No tiene práctica', 'No se evalúa']);
  });

  it('un cambio a algo que no existe no toca nada y lo dice', () => {
    const doc = loto();
    expect(aplicarNiveles(doc, [{ objetivoId: 'obj-9', nivelBloom: 'aplicar' }])).toBe('El objetivo obj-9 no existe');
    expect(aplicarNiveles(doc, [{ pantallaId: 'p28', preguntaId: 'bq-99', nivelBloom: 'aplicar' }])).toBe('La pregunta bq-99 no existe en p28');
    expect(aplicarNiveles(doc, [{ pantallaId: 'p99', nivelBloom: 'aplicar' }])).toBe('La pantalla p99 no existe');
  });
});

describe('corrección de la alineación con IA (HU-1002)', () => {
  const pantalla = (doc: CursoDoc, id: string) => pantallasDe(doc).find((p) => p.id === id)! as ReturnType<typeof pantallasDe>[number] & { bloques: { interaccion?: { datos: { preguntas: { id: string; origen?: unknown }[] } } }[] };
  type Pregunta = { id: string; origen?: unknown };
  const preguntas = (doc: CursoDoc, id: string) => (pantalla(doc, id).bloques as { interaccion?: { datos: { preguntas: Pregunta[] } } }[]).find((b) => b.interaccion)!.interaccion!.datos.preguntas;

  it('CP-084 · aplicar la propuesta de LOTO deja 0 alertas, p28 en borrador y las preguntas nuevas marcadas como IA sin revisar', () => {
    const doc = loto();
    expect(informeAlineacion(doc).totalAlertas).toBe(2);
    expect(erroresCorreccion(doc, correccionLoto, erroresCurso)).toEqual([]);
    const { documento, afectadas } = aplicarCorreccion(doc, correccionLoto);
    expect(informeAlineacion(documento).totalAlertas).toBe(0);
    expect(afectadas).toEqual([{ pantallaId: 'p28', numero: 28, titulo: 'Reto final', nueva: false }]);
    expect(pantalla(documento, 'p28').estado).toBe('borrador');
    const nuevas = preguntas(documento, 'p28').filter((q) => q.origen);
    expect(nuevas.map((q) => [q.id, q.origen])).toEqual([['bq-09', { tipo: 'ia', revisado: false }], ['bq-10', { tipo: 'ia', revisado: false }]]);
    expect(validarCurso(documento).valido).toBe(true);
    // Inmutable: el curso recibido no cambia.
    expect(doc).toEqual(original);
  });

  it('rechaza un patch que toca rutas fuera de lo permitido, sin aplicar nada', () => {
    const doc = loto();
    const con = (patch: CorreccionAlineacion['patch'], cambios = correccionLoto.cambios) => erroresCorreccion(doc, { ...correccionLoto, cambios, patch }, erroresCurso);
    expect(con([{ op: 'replace', path: `${P28}/narracion/texto/es`, value: 'Otra' }])[0]).toMatch(/Operación 1: la ruta «.*\/narracion\/texto\/es» no se puede cambiar/);
    expect(con([{ op: 'replace', path: `${P28}/estado`, value: 'aprobado' }])[0]).toMatch(/no se puede cambiar/);
    expect(con([{ op: 'replace', path: '/seguimiento/notaMinima', value: 0 }])[0]).toMatch(/«\/seguimiento\/notaMinima» no se puede cambiar/);
    expect(con([{ op: 'remove', path: `${P28}/bloques/1/interaccion/datos/preguntas/0` }])[0]).toMatch(/solo se permiten add, replace y test/);
    // Las preguntas de una pantalla que no nombran los cambios tampoco se tocan.
    expect(con([{ op: 'replace', path: '/modulos/0/capsulas/0/pantallas/21/bloques/1/interaccion/datos/preguntas/0/nivelBloom', value: 'aplicar' }])[0]).toMatch(/no se puede cambiar/);
    expect(con([{ op: 'replace', path: `${P28}`, value: {} }])[0]).toMatch(/no se reemplaza entera/);
    expect(() => aplicarCorreccion(doc, { ...correccionLoto, patch: [{ op: 'replace', path: '/metadatos/titulo', value: 'x' }] })).toThrow(/no se puede cambiar/);
    // Un patch permitido que no resuelve la alerta del objetivo tratado tampoco sirve.
    const soloObj3 = correccionLoto.cambios.slice(0, 1);
    expect(con([{ op: 'add', path: `${P28}/bloques/1/interaccion/datos/preguntas/-`, value: { ...(correccionLoto.patch[0] as { value: object }).value, nivelBloom: 'recordar' } }], soloObj3))
      .toEqual(['obj-3 sigue con alertas tras aplicar: Se evalúa solo en «recordar», menor que «aplicar»']);
    // Y un patch que deja el curso inválido (pregunta sin opciones correctas).
    expect(con([{ op: 'replace', path: `${P28}/bloques/1/interaccion/datos/preguntas/5/opciones/1/correcta`, value: false }], [{ ...soloObj3[0]!, tipo: 'ajustar-pregunta', preguntaId: 'bq-06' }])[0]).toMatch(/^el curso queda inválido/);
    expect(doc).toEqual(original);
  });

  it('nueva-pantalla · una actividad sumativa nueva para obj-2 entra en borrador con sus textos y preguntas marcados', () => {
    const doc = loto();
    const p28 = structuredClone(pantallasDe(original)[27]) as unknown as Record<string, unknown> & { bloques: { id: string; interaccion?: { datos: { preguntas: { id: string; objetivoId?: string; nivelBloom?: string; opciones: { id: string }[] }[] } } }[] };
    delete p28.narracion;
    const nueva = {
      ...p28, id: 'p31', titulo: { es: 'Reto de prácticas' }, objetivoIds: ['obj-2'], estado: 'propuesta-ia',
      bloques: p28.bloques.map((b) => ({ ...b, id: b.id.replace('p28', 'p31'), ...(b.interaccion ? { interaccion: { ...b.interaccion, datos: { ...b.interaccion.datos, preguntasPorIntento: 3, preguntas: b.interaccion.datos.preguntas.slice(0, 3).map((q, i) => ({ ...q, id: `bq-3${i}`, opciones: q.opciones.map((x, j) => ({ ...x, id: `bq-3${i}-${j}` })), objetivoId: 'obj-2', nivelBloom: 'comprender' })) } } } : {}) })),
    };
    const correccion: CorreccionAlineacion = {
      resumen: 'Una pantalla nueva evalúa obj-2 al nivel comprender.',
      cambios: [{ tipo: 'nueva-pantalla', objetivoId: 'obj-2', nivelBloom: 'comprender', motivo: 'obj-2 no se evalúa a su nivel.', pantallaId: 'p31' }],
      patch: [{ op: 'add', path: P28, value: nueva }],
    };
    expect(erroresCorreccion(doc, correccion, erroresCurso)).toEqual([]);
    const { documento, afectadas } = aplicarCorreccion(doc, correccion);
    expect(afectadas).toEqual([{ pantallaId: 'p31', numero: 28, titulo: 'Reto de prácticas', nueva: true }]);
    const p31 = pantalla(documento, 'p31');
    expect(p31.estado).toBe('borrador');
    expect((p31.bloques as unknown as { tipo: string; origen?: unknown }[]).filter((b) => b.tipo === 'texto').every((b) => JSON.stringify(b.origen) === '{"tipo":"ia","revisado":false}')).toBe(true);
    expect(preguntas(documento, 'p31').every((q) => (q.origen as { tipo: string }).tipo === 'ia')).toBe(true);
    expect(objetivo(documento, 'obj-2').alertas).toEqual([]);
    // p28 no cambió: sigue en su estado.
    expect(pantalla(documento, 'p28').estado).toBe('propuesta-ia');
    // Una pantalla nueva que no figura en los cambios, o con un id que ya existe, se rechaza.
    expect(erroresCorreccion(doc, { ...correccion, cambios: [{ ...correccion.cambios[0]!, tipo: 'nueva-pregunta', pantallaId: 'p28' }] }, erroresCurso)).toContain('La pantalla nueva p31 no figura en los cambios (tipo nueva-pantalla)');
    expect(erroresCorreccion(doc, { ...correccion, patch: [{ op: 'add', path: P28, value: { ...nueva, id: 'p05' } }] }, erroresCurso)).toEqual(['Operación 1: ya existe una pantalla con el id p05']);
  });
});
