// HU-1406 · CP-107 · Créditos de IA: el aviso según lo que se generó con IA (voz e ilustraciones, solo voz, solo
// ilustraciones, nada), una fila por proveedor y modelo, sin lo que arma la plataforma (`aptio`, SUP-64), y en datos.js
// del SCORM y del HTML.
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { armarCreditos, avisoCreditos, codigoReproductor, construirHtml, construirScorm12, esDeIa, type ProcedenciaRecurso } from '../src/index.ts';
import { cursoLoto, recursosLoto } from './loto.ts';

const VOZ: ProcedenciaRecurso = { tipo: 'AUDIO', proveedor: 'google', modelo: 'es-US-Neural2-A', licencia: 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)' };
const IMAGEN: ProcedenciaRecurso = { tipo: 'IMAGEN', proveedor: 'recraft', modelo: 'recraftv3', licencia: 'Recraft · uso comercial (plan de pago)' };
const VTT: ProcedenciaRecurso = { tipo: 'SUBTITULO', proveedor: 'aptio', modelo: 'subtitulos-por-letras v1', licencia: 'Generado por Aptio SCORM desde el guion' };
const ANA: ProcedenciaRecurso = { tipo: 'SVG', proveedor: null, modelo: null, licencia: null };

describe('créditos de IA (HU-1406)', () => {
  it('CP-107 · con voz e ilustraciones, la frase exacta con el nombre de la organización', () => {
    expect(armarCreditos([VOZ, IMAGEN, VTT, ANA], 'AulasEducativas')?.aviso).toBe('Voz e ilustraciones generadas con IA y revisadas por AulasEducativas');
  });

  it('solo voz, solo ilustraciones, y nada de IA', () => {
    expect(armarCreditos([VOZ, VTT], 'AulasEducativas')?.aviso).toBe('Voz generada con IA y revisada por AulasEducativas');
    expect(armarCreditos([IMAGEN, { ...IMAGEN, tipo: 'SVG' }], 'AulasEducativas')?.aviso).toBe('Ilustraciones generadas con IA y revisadas por AulasEducativas');
    // Subtítulos por letras, el personaje de la biblioteca y el paquete no son IA: no hay créditos.
    expect(armarCreditos([VTT, ANA, { tipo: 'PAQUETE', proveedor: 'aptio', modelo: 'exportador-scorm12 v1', licencia: 'Paquete generado por Aptio SCORM' }], 'AulasEducativas')).toBeNull();
    expect(armarCreditos([], 'AulasEducativas')).toBeNull();
  });

  it('una fila por cada voz o modelo distinto, voz primero; las 30 narraciones de una misma voz son una fila', () => {
    const narraciones = Array.from({ length: 30 }, () => VOZ);
    const creditos = armarCreditos([IMAGEN, ...narraciones, VTT, { ...VOZ, modelo: 'es-US-Neural2-B' }], 'AulasEducativas')!;
    expect(creditos.filas).toEqual([
      { que: 'Voz', proveedor: 'Google', modelo: 'es-US-Neural2-A', licencia: VOZ.licencia },
      { que: 'Voz', proveedor: 'Google', modelo: 'es-US-Neural2-B', licencia: VOZ.licencia },
      { que: 'Ilustraciones', proveedor: 'Recraft', modelo: 'recraftv3', licencia: IMAGEN.licencia },
    ]);
  });

  it('solo `aptio` y la falta de proveedor quedan fuera; un video de IA cuenta como contenido', () => {
    expect(esDeIa(VOZ)).toBe(true);
    expect(esDeIa({ proveedor: 'Aptio' })).toBe(false);
    expect(esDeIa({ proveedor: '  ' })).toBe(false);
    expect(esDeIa({ proveedor: null })).toBe(false);
    // El audio simulado de desarrollo hace de voz: la demo muestra créditos.
    expect(armarCreditos([{ ...VOZ, proveedor: 'simulado', licencia: 'Audio simulado de prueba' }], 'AulasEducativas')?.filas[0]?.proveedor).toBe('Simulado (pruebas)');
    expect(armarCreditos([{ tipo: 'VIDEO', proveedor: 'runway', modelo: 'gen-4', licencia: 'Runway Enterprise' }], 'AulasEducativas')?.aviso).toBe('Contenido generado con IA y revisado por AulasEducativas');
  });

  it('en inglés, y sin nombre de organización', () => {
    expect(avisoCreditos({ voz: true, ilustraciones: true }, 'AulasEducativas', 'en')).toBe('AI-generated voice and illustrations, reviewed by AulasEducativas');
    expect(armarCreditos([VOZ], 'AulasEducativas', 'en')?.filas[0]?.que).toBe('Voice');
    expect(avisoCreditos({ voz: true, ilustraciones: false }, '  ')).toBe('Voz generada con IA y revisada por el equipo de producción');
  });
});

describe('créditos dentro del paquete (HU-1406)', () => {
  let reproductor: string;
  beforeAll(async () => { reproductor = await codigoReproductor(); }, 60_000);
  const datosDe = async (zip: Uint8Array) => {
    const js = await (await JSZip.loadAsync(zip)).file('datos.js')!.async('string');
    return JSON.parse(js.replace(/^window\.APTIO_DATOS = /, '').replace(/;\n?$/, '')) as { creditos?: unknown };
  };

  it('el SCORM y el HTML llevan los créditos en datos.js; sin créditos no hay clave', async () => {
    const creditos = armarCreditos([VOZ, IMAGEN], 'AulasEducativas');
    const entrada = { curso: cursoLoto(), recursos: recursosLoto(), reproductor, creditos };
    expect((await datosDe((await construirScorm12(entrada)).zip)).creditos).toEqual(creditos);
    expect((await datosDe((await construirHtml(entrada)).zip)).creditos).toEqual(creditos);
    expect(await datosDe((await construirScorm12({ ...entrada, creditos: null })).zip)).not.toHaveProperty('creditos');
  }, 60_000);
});
