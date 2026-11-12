// HU-0903 · Pausas propuestas por la IA (CP-082, REQ-027): reglas de la salida de IA-09 v2 y cómo se aplican las elegidas.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MarcadorVideo } from '../src/marcadores.js';
import { aplicarPausas, alFinDeFrase, erroresPausas, normalizarPausas, type PropuestaPausas, type SegmentoPausas, tramos } from '../src/pausas.js';

const leer = <T>(ruta: string) => JSON.parse(readFileSync(new URL(`../../ai/casos/loto/${ruta}`, import.meta.url), 'utf8')) as T;
const { segmentos } = leer<{ segmentos: SegmentoPausas[] }>('entrada/transcripcion-procedimiento.json');
const propuesta = leer<PropuestaPausas>('salidas/X-IA-09-pausas-p18.json');
const curso = leer<{ modulos: { capsulas: { pantallas: { id: string; bloques: { tipo: string; marcadores?: MarcadorVideo[] }[] }[] }[] }[] }>('curso-esperado-es.json');
const existentes = curso.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === 'p18')!.bloques.find((b) => b.tipo === 'video')!.marcadores!;
const opciones = { pantallaId: 'p18', ruta: 'p18/p18-video', duracionMs: 150000 };

describe('pausas propuestas por la IA (HU-0903)', () => {
  it('CP-082 · la salida grabada de LOTO pasa las reglas: 4 cambios de tema y al menos un marcador en cada uno', () => {
    expect(propuesta.cambiosTema).toHaveLength(4);
    expect(erroresPausas(normalizarPausas(propuesta), segmentos, 150000)).toEqual([]);
    for (const t of tramos(propuesta.cambiosTema, 150000)) {
      expect(propuesta.marcadores.filter((m) => m.tiempoMs >= t.desde && m.tiempoMs <= t.hasta).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('un tema sin marcador, un marcador en mitad de una frase o fuera del video no pasan', () => {
    const sinUltimo = { ...propuesta, marcadores: propuesta.marcadores.filter((m) => m.tiempoMs < 125000) };
    expect(erroresPausas(sinUltimo, segmentos, 150000)).toEqual(['cambiosTema: el tema «Verificar energía cero» (2:05 a 2:30) no tiene ningún marcador']);
    const enMedio = { ...propuesta, marcadores: propuesta.marcadores.map((m) => (m.id === 'ia-2' ? { ...m, tiempoMs: 47000 } : m)) };
    expect(erroresPausas(enMedio, segmentos, 150000)).toEqual(['marcadores/1: 0:47 cae en mitad de una frase; usa el final de un segmento de la transcripción']);
    const fuera = { ...propuesta, marcadores: [...propuesta.marcadores, { ...propuesta.marcadores[0]!, id: 'ia-9', tiempoMs: 160000 }] };
    expect(erroresPausas(fuera, segmentos, 150000)).toEqual(['propuesta/marcadores/8: el tiempo 2:40 pasa la duración del video (2:30)']);
    expect(erroresPausas({ ...propuesta, cambiosTema: [] }, segmentos, 150000)).toEqual(['cambiosTema: la transcripción no trae ningún cambio de tema']);
    expect(alFinDeFrase(52000, segmentos)).toBe(true);
    expect(alFinDeFrase(52200, segmentos)).toBe(true);
    expect(alFinDeFrase(53000, segmentos)).toBe(false);
    expect(alFinDeFrase(0, segmentos)).toBe(true);
  });

  it('al aplicar las elegidas se suman a las existentes con ids nuevos, sin reemplazar ni chocar', () => {
    const r = aplicarPausas(existentes, propuesta, ['ia-1', 'ia-2', 'ia-6'], { ...opciones, idsCurso: ['p18-vm-1'] });
    expect(r.agregados).toEqual(['p18-vm-2', 'p18-vm-3', 'p18-vm-4']);
    expect(r.observaciones).toEqual([]);
    expect(r.marcadores.map((m) => [m.id, m.tiempoMs, m.tipo])).toEqual([
      ['vm-1', 0, 'capitulo'], ['p18-vm-2', 30000, 'capitulo'], ['p18-vm-3', 52000, 'pregunta'], ['vm-2', 62000, 'pregunta'],
      ['vm-3', 95000, 'punto'], ['p18-vm-4', 118000, 'pregunta'], ['vm-4', 130000, 'pregunta'],
    ]);
    const q = r.marcadores.find((m) => m.id === 'p18-vm-3')!.pregunta!;
    expect([q.id, ...q.opciones.map((o) => o.id)]).toEqual(['p18-vm-3-q', 'p18-vm-3-q-a', 'p18-vm-3-q-b', 'p18-vm-3-q-c']);
    // Los existentes no cambian.
    expect(r.marcadores.filter((m) => m.id.startsWith('vm-'))).toEqual(existentes);
  });

  it('una elegida a menos de 2 s de otra del mismo tipo se omite y se dice por qué; de otro tipo, no', () => {
    const r = aplicarPausas(existentes, propuesta, ['ia-3', 'ia-4', 'ia-5'], opciones);
    expect(r.agregados).toEqual(['p18-vm-1', 'p18-vm-2']);
    expect(r.observaciones).toEqual(['Se omitió la pregunta de 1:02: queda a menos de 2 s de otro marcador del mismo tipo (1:02).']);
    // El capítulo de 1:35 queda aunque el punto de 1:35 ya existe: son de tipos distintos.
    expect(r.marcadores.filter((m) => m.tiempoMs === 95000).map((m) => m.tipo).sort()).toEqual(['capitulo', 'punto']);
  });

  it('sin elegidas, con un id que la propuesta no tiene o con un resultado inválido, no aplica', () => {
    expect(() => aplicarPausas(existentes, propuesta, [], opciones)).toThrow('elige al menos un marcador');
    expect(() => aplicarPausas(existentes, propuesta, ['ia-99'], opciones)).toThrow('la propuesta no tiene «ia-99»');
    const mala = { marcadores: [{ ...propuesta.marcadores[1]!, pregunta: { ...propuesta.marcadores[1]!.pregunta!, enunciado: { es: '' } } }] };
    expect(() => aplicarPausas(existentes, mala, ['ia-2'], opciones)).toThrow('p18/p18-video/marcadores/1/pregunta: falta el enunciado');
  });
});
