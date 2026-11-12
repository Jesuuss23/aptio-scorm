// HU-0901 · Lógica de la vista Video interactivo: la pregunta nueva, los ids libres, el orden, los errores por marcador
// con las reglas de la API y lo que dice cada marcador en la línea.
import { describe, expect, it } from 'vitest';
import { describir, erroresPorMarcador, idLibre, idOpcion, type MarcadorVideo, nuevaPregunta, ordenar, posicion } from './video-marcadores';

const capitulo: MarcadorVideo = { id: 'vm-1', tiempoMs: 0, tipo: 'capitulo', obligatorio: false, titulo: { es: 'Preparar y avisar' } };

describe('vista Video interactivo', () => {
  it('«+ Pregunta en 0:45» crea una pregunta obligatoria con id libre, 2 opciones y la primera correcta', () => {
    const q = nuevaPregunta('p18', [capitulo], 45_300);
    expect(q).toMatchObject({ id: 'p18-vm-1', tiempoMs: 45_300, tipo: 'pregunta', obligatorio: true });
    expect(q.pregunta!.opciones.map((o) => [o.id, o.correcta])).toEqual([['p18-vm-1-q-a', true], ['p18-vm-1-q-b', false]]);
    expect(idLibre('p18', [capitulo, q])).toBe('p18-vm-2');
    expect(idOpcion(q)).toBe('p18-vm-1-q-c');
    expect(ordenar([q, capitulo]).map((m) => m.id)).toEqual(['vm-1', 'p18-vm-1']);
  });

  it('marca cada pregunta con su primer error y nada cuando está completa', () => {
    const q = nuevaPregunta('p18', [], 45_000);
    expect(erroresPorMarcador([capitulo, q])).toEqual(new Map([['p18-vm-1', 'Falta el enunciado']]));
    q.pregunta!.enunciado = { es: '¿Qué se hace antes de apagar el equipo?' };
    expect(erroresPorMarcador([q])).toEqual(new Map([['p18-vm-1', 'Hay una opción vacía']]));
    q.pregunta!.opciones[0]!.contenido = { texto: { es: 'Avisar a los afectados' } };
    q.pregunta!.opciones[1]!.contenido = { texto: { es: 'Retirar los candados' } };
    expect(erroresPorMarcador([q]).size).toBe(0);
    expect(erroresPorMarcador([{ ...q, tiempoMs: 70_000 }], 60_000)).toEqual(new Map([['p18-vm-1', 'El tiempo 1:10 pasa la duración del video (1:00)']]));
  });

  it('dice qué es cada marcador y dónde va en la línea', () => {
    const q = nuevaPregunta('p18', [], 45_000);
    expect(describir(q)).toBe('Pregunta en 0:45');
    q.pregunta!.enunciado = { es: '¿Qué se hace primero?' };
    expect(describir(q)).toBe('Pregunta en 0:45: ¿Qué se hace primero?');
    expect(describir(capitulo)).toBe('Capítulo en 0:00: Preparar y avisar');
    expect(posicion(45_000, 60_000)).toBe(75);
    expect(posicion(90_000, 60_000)).toBe(100);
  });
});
