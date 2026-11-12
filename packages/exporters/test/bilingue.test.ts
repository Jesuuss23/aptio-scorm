// HU-0804 · Paquete bilingüe (RN-08-4): con `modoIdioma: 'mismo-paquete'` el SCORM 1.2 y el HTML llevan español e
// inglés (textos, audios y subtítulos de los dos idiomas) y abren en español. La validación bloquea si falta un texto en
// inglés, y solo advierte por desbordes y por falta de voz en inglés; el peso suma los recursos de los dos idiomas.
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CursoReproductor } from '@aptio/player';
import { codigoReproductor, construirHtml, construirScorm12, textosEnIngles } from '../src/index.ts';
import type { RecursoPaquete } from '../src/scorm12.ts';
import { type PesoRecurso, validarExportacion } from '../src/validar.ts';
import { cursoLoto, recursosLoto, traducirLoto } from './loto.ts';

const AUDIO_EN = { id: 'aud-p01-en', tipo: 'audio', origen: 'generado', nombre: 'p01-en.mp3', mime: 'audio/mpeg', idioma: 'en' };
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
const VTT_EN = { id: 'vtt-p01-en', tipo: 'subtitulos', origen: 'generado', nombre: 'p01-en.vtt', mime: 'text/vtt', idioma: 'en' };
const TEXTO_VTT_EN = 'WEBVTT\n\n00:00.000 --> 00:02.000\nHello, welcome to this capsule.\n';

/** LOTO con cada texto en inglés («[EN] …») y la narración de p01 con su audio y sus subtítulos en inglés (HU-0804 parte 2). */
function lotoTraducido(): CursoReproductor {
  const curso = traducirLoto(cursoLoto());
  (curso.recursos as unknown[]).push(AUDIO_EN, VTT_EN);
  const p01 = curso.modulos[0]!.capsulas[0]!.pantallas[0]!;
  const es = p01.narracion!.porIdioma!.es!;
  p01.narracion!.porIdioma!.en = { ...structuredClone(es), recursoAudioId: AUDIO_EN.id, subtitulosId: VTT_EN.id };
  return curso;
}
const recursosBilingues = (): RecursoPaquete[] => [...recursosLoto(), { id: AUDIO_EN.id, nombre: AUDIO_EN.nombre, datos: MP3 }, { id: VTT_EN.id, nombre: VTT_EN.nombre, datos: TEXTO_VTT_EN }];
const tamano = (d: Uint8Array | string) => (typeof d === 'string' ? Buffer.byteLength(d) : d.byteLength);
const pesos = (recursos: RecursoPaquete[]): PesoRecurso[] => recursos.map((r) => ({ id: r.id, nombre: r.nombre, bytes: tamano(r.datos) }));
const datosDe = async (zip: JSZip) => JSON.parse((await zip.file('datos.js')!.async('string')).replace(/^window\.APTIO_DATOS = /, '').replace(/;\n$/, '')) as { idioma: string; curso: CursoReproductor & { modoIdioma?: string }; rutas: Record<string, string>; subtitulos: Record<string, string> };

let reproductor: string;
beforeAll(async () => { reproductor = await codigoReproductor(); }, 60_000);

describe('paquete bilingüe (HU-0804)', () => {
  it('el SCORM 1.2 lleva los dos idiomas, abre en español y suma los recursos en inglés', async () => {
    const p = await construirScorm12({ curso: lotoTraducido(), recursos: recursosBilingues(), reproductor, modoIdioma: 'mismo-paquete' });
    expect(p.idioma).toBe('es');
    expect(p.idiomas).toEqual(['es', 'en']);
    expect(p.archivos).toContain('recursos/aud-p01-en.mp3');
    expect(p.archivos).toContain('recursos/aud-p01-es.mp3');
    const zip = await JSZip.loadAsync(p.zip);
    const datos = await datosDe(zip);
    expect(datos.idioma).toBe('es');
    expect(datos.curso.idiomas).toEqual(['es', 'en']);
    expect(datos.curso.modoIdioma).toBe('mismo-paquete');
    expect(datos.rutas['aud-p01-en']).toBe('recursos/aud-p01-en.mp3');
    // Los subtítulos en inglés van dentro de datos.js, como los de español.
    expect(datos.subtitulos['vtt-p01-en']).toBe(TEXTO_VTT_EN);
    expect(datos.subtitulos['vtt-p03-es']).toMatch(/^WEBVTT/);
    expect(await zip.file('index.html')!.async('string')).toContain('<html lang="es">');
  }, 30_000);

  it('el HTML también, y sin el modo bilingüe el paquete sigue siendo de un idioma', async () => {
    const h = await construirHtml({ curso: lotoTraducido(), recursos: recursosBilingues(), reproductor, modoIdioma: 'mismo-paquete' });
    expect(h.idiomas).toEqual(['es', 'en']);
    expect(h.archivos).toContain('recursos/aud-p01-en.mp3');
    expect((await datosDe(await JSZip.loadAsync(h.zip))).curso.idiomas).toEqual(['es', 'en']);
    const unico = await construirScorm12({ curso: lotoTraducido(), recursos: recursosBilingues(), reproductor });
    expect(unico.idiomas).toEqual(['es']);
    expect(unico.archivos).not.toContain('recursos/aud-p01-en.mp3');
  }, 30_000);
});

describe('validar el paquete bilingüe (HU-0804)', () => {
  it('si falta un texto en inglés no se puede exportar, y dice cuántos faltan', () => {
    const curso = cursoLoto();
    const { total } = textosEnIngles(curso);
    const v = validarExportacion('SCORM12', curso, pesos(recursosLoto()), 0, 100, { modoIdioma: 'mismo-paquete' });
    expect(v.modoIdioma).toBe('mismo-paquete');
    expect(v.textosIngles).toEqual({ traducidos: 0, total });
    expect(v.errores).toContain(`Faltan ${total} textos en inglés: tradúcelos en Idiomas`);
    // En español solo, el mismo curso exporta sin errores.
    expect(validarExportacion('SCORM12', curso, pesos(recursosLoto()), 0, 100).errores).toEqual([]);
  });

  it('con la voz en inglés en todas las narraciones, no hay advertencia de voz', () => {
    const curso = lotoTraducido();
    for (const p of curso.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas))) {
      if (p.narracion?.porIdioma?.es) p.narracion.porIdioma.en = { ...structuredClone(p.narracion.porIdioma.es), recursoAudioId: AUDIO_EN.id, subtitulosId: VTT_EN.id };
    }
    const v = validarExportacion('SCORM12', curso, pesos(recursosBilingues()), 0, 100, { modoIdioma: 'mismo-paquete' });
    expect(v.errores).toEqual([]);
    expect(v.advertencias.some((a) => a.startsWith('Sin voz en inglés'))).toBe(false);
  });

  it('con todo traducido no hay errores; los desbordes y la falta de voz en inglés solo advierten', () => {
    const curso = lotoTraducido();
    const v = validarExportacion('HTML', curso, pesos(recursosBilingues()), 0, null, { modoIdioma: 'mismo-paquete', desbordes: 1 });
    expect(v.errores).toEqual([]);
    expect(v.textosIngles?.traducidos).toBe(v.textosIngles?.total);
    expect(v.advertencias).toContain('1 texto en inglés no cabe en su espacio (Desborde): revísalos en Idiomas.');
    // p01 ya tiene su voz en inglés: faltan las otras 29 narradas.
    expect(v.advertencias).toContain('Sin voz en inglés en 29 pantallas: en inglés esas pantallas muestran la narración como texto. Genérala en Idiomas.');
  });

  it('el peso suma los recursos de los dos idiomas', () => {
    const curso = lotoTraducido();
    const grande = pesos(recursosBilingues()).map((r) => (r.id === AUDIO_EN.id ? { ...r, bytes: 5 * 1024 * 1024 } : r));
    const es = validarExportacion('SCORM12', curso, grande, 0, 100);
    const ambos = validarExportacion('SCORM12', curso, grande, 0, 100, { modoIdioma: 'mismo-paquete' });
    expect(ambos.pesoEstimadoBytes - es.pesoEstimadoBytes).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(ambos.recursosPesados[0]?.id).toBe(AUDIO_EN.id);
  });
});
