// HU-0610 · Lógica del panel «Avanzado: disparadores»: el disparador nuevo, los cambios de evento y acción, los errores
// por fila con las reglas de la API y las marcas ◆ de la línea de tiempo.
import { describe, expect, it } from 'vitest';
import { conAccion, conEvento, describir, erroresPorFila, marcasDisparo, nuevoDisparador } from './disparadores-panel';

const elementos = [{ id: 'p05-titulo', nombre: 'Título' }, { id: 'p05-boton', nombre: 'Botón · Ver ejemplo', oculto: true }];
const pantallas = [{ id: 'p08', nombre: '8. Dispositivos' }];
const pantalla = { id: 'p05', bloques: [{ id: 'p05-titulo' }, { id: 'p05-boton' }] };

describe('panel de disparadores', () => {
  it('el nuevo es «a los 3 s → mostrar» el primer oculto, con un id libre', () => {
    const d1 = nuevoDisparador('p05', [], elementos);
    expect(d1).toEqual({ id: 'p05-disp-1', cuando: { evento: 'tiempo', segundo: 3 }, accion: { tipo: 'mostrar', elementoId: 'p05-boton' } });
    expect(nuevoDisparador('p05', [d1], [elementos[0]!]).id).toBe('p05-disp-2');
    expect(nuevoDisparador('p05', [d1], [elementos[0]!]).accion.elementoId).toBe('p05-titulo');
  });

  it('cambiar evento y acción conserva lo que sirve', () => {
    const d = nuevoDisparador('p05', [], elementos);
    expect(conEvento(d, 'fin-voz').cuando).toEqual({ evento: 'fin-voz' });
    expect(conEvento(conEvento(d, 'fin-voz'), 'tiempo').cuando).toEqual({ evento: 'tiempo', segundo: 3 });
    const ir = conAccion(d, 'ir-a', elementos, pantallas);
    expect(ir.accion).toEqual({ tipo: 'ir-a', pantallaId: 'p08' });
    expect(conAccion(ir, 'ocultar', elementos, pantallas).accion).toEqual({ tipo: 'ocultar', elementoId: 'p05-titulo' });
  });

  it('marca la fila con el error de la API, con mayúscula', () => {
    const d = nuevoDisparador('p05', [], elementos);
    const fuera = { ...d, id: 'p05-disp-2', cuando: { evento: 'tiempo' as const, segundo: 700 } };
    expect(erroresPorFila(pantalla, [d, fuera], ['p05', 'p08'])).toEqual(new Map([[1, 'El segundo debe estar entre 0 y 600']]));
    expect(erroresPorFila(pantalla, [d], ['p05', 'p08']).size).toBe(0);
  });

  it('describe y marca con ◆ solo los de tiempo', () => {
    const d = nuevoDisparador('p05', [], elementos);
    const ir = { id: 'p05-disp-2', cuando: { evento: 'fin-voz' as const }, accion: { tipo: 'ir-a' as const, pantallaId: 'p08' } };
    expect(describir(d, elementos, pantallas)).toBe('A los 3 s → mostrar «Botón · Ver ejemplo»');
    expect(describir(ir, elementos, pantallas)).toBe('Al terminar la voz → ir a 8. Dispositivos');
    expect(marcasDisparo([d, ir], elementos, pantallas)).toEqual([{ id: 'p05-disp-1', segundo: 3, texto: 'A los 3 s → mostrar «Botón · Ver ejemplo»' }]);
  });
});
