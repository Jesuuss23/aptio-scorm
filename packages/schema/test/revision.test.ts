import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type CursoDoc, observacionesDePantalla, observacionesRegla, origenDe, type PantallaDoc, pantallasDe } from '../src/revision.js';

const loto = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoDoc;
const p = (id: string) => pantallasDe(loto).find((x) => x.id === id)!;
const texto = (id: string, rol: string, es: string) => ({ id, tipo: 'texto', rol, contenido: { es }, origen: { tipo: 'ia' as const, revisado: false } });

describe('revisión: origen de cada pantalla (CP-047)', () => {
  it('una pantalla tomada del manual dice el documento y la página', () => {
    expect(origenDe(p('p04'), loto.recursos)).toEqual({ tipo: 'documento', etiqueta: 'PETS-SEG-014 Bloqueo y etiquetado p. 12' });
    const renombrado = loto.recursos!.map((r) => (r.tipo === 'documento' ? { ...r, nombre: 'Manual.pdf' } : r));
    expect(origenDe(p('p04'), renombrado).etiqueta).toBe('Manual p. 12');
  });
  it('lo redactado por la IA se marca como IA', () => {
    expect(origenDe(p('p01'), loto.recursos)).toEqual({ tipo: 'ia', etiqueta: 'Redactado por la IA' });
  });
});

describe('revisión: observaciones por reglas', () => {
  it('el caso LOTO no rompe ninguna regla', () => {
    expect(observacionesRegla(loto)).toEqual([]);
  });
  it('marca texto largo, dato largo, narración larga, imagen sin alternativo y tres disposiciones iguales', () => {
    const larga: PantallaDoc = {
      id: 'p99', titulo: { es: 'X' }, tipo: 'contenido', estado: 'propuesta-ia', obligatoria: true, disposicion: 'idea',
      bloques: [
        texto('p99-titulo', 'titulo', 'Título'),
        texto('p99-texto', 'cuerpo', Array.from({ length: 31 }, () => 'palabra').join(' ')),
        texto('p99-dato-grande', 'destacado', 'uno dos tres cuatro cinco seis siete'),
        { id: 'p99-img', tipo: 'imagen', decorativa: false },
      ],
      narracion: { texto: { es: Array.from({ length: 91 }, () => 'voz').join(' ') } },
    };
    const obs = observacionesDePantalla(larga, ['idea', 'idea']);
    expect(obs.map((o) => [o.tipo, o.severidad])).toEqual([
      ['CALIDAD', 'aviso'], ['CALIDAD', 'aviso'], ['CALIDAD', 'aviso'], ['ACCESIBILIDAD', 'bloquea-entrega'], ['CALIDAD', 'aviso'],
    ]);
    expect(obs[0]!.mensaje).toContain('38 palabras');
    expect(observacionesDePantalla(larga, ['idea', 'lista']).some((o) => o.mensaje.includes('tercera'))).toBe(false);
  });
});
