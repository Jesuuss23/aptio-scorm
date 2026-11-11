// HU-0605 · Panel Diseños: qué se ofrece y el curso de una sola pantalla que dibuja cada miniatura.
import type { CursoDoc, PantallaDoc } from '@aptio/schema/revision';
import { describe, expect, it } from 'vitest';
import { cursoConDiseno, nombreDiseno, opcionesDiseno } from './disenos-pantalla';

const texto = (disposicion: string) => ({ id: 'p05', disposicion, bloques: [{ id: 'p05-titulo', tipo: 'texto' }] }) as unknown as PantallaDoc & { disposicion: string };

describe('panel Diseños', () => {
  it('ofrece las 4 composiciones en un orden fijo; una de texto, como la portada, va primero', () => {
    expect(opcionesDiseno(texto('lista'))).toEqual(['idea', 'personaje', 'dato', 'lista']);
    expect(opcionesDiseno(texto('portada'))).toEqual(['portada', 'idea', 'personaje', 'dato', 'lista']);
    const actividad = { id: 'p07', disposicion: 'memoria', bloques: [{ id: 'x', tipo: 'interaccion' }] } as unknown as PantallaDoc;
    expect(opcionesDiseno(actividad)).toEqual([]);
  });

  it('nombra los diseños como el prototipo', () => {
    expect(['idea', 'personaje', 'dato', 'lista', 'portada'].map(nombreDiseno)).toEqual(['Idea + ilustración', 'Personaje habla', 'Dato grande', 'Tarjetas con íconos', 'Portada']);
  });

  it('la miniatura es el curso con esa sola pantalla; los ajustes solo valen en su disposición (RN-06-3)', () => {
    const p = { ...texto('idea'), ajustes: { 'p05-titulo': { color: 'acento' } } };
    const doc = { idiomas: ['es'], modulos: [{ id: 'm1', capsulas: [{ id: 'c1', pantallas: [p, texto('dato')] }] }] } as unknown as CursoDoc;
    const pantallas = (c: unknown) => (c as CursoDoc).modulos[0]!.capsulas[0]!.pantallas as (PantallaDoc & { disposicion: string; ajustes?: unknown })[];
    expect(pantallas(cursoConDiseno(doc, p, 'idea'))).toEqual([p]);
    const otra = pantallas(cursoConDiseno(doc, p, 'lista'));
    expect(otra).toHaveLength(1);
    expect(otra[0]).toMatchObject({ id: 'p05', disposicion: 'lista' });
    expect(otra[0]!.ajustes).toBeUndefined();
    // El documento original no cambia.
    expect(p.disposicion).toBe('idea');
    expect(p.ajustes).toBeDefined();
  });
});
