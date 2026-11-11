// HU-0602 · Retoques del elemento: pasos de A−/A+, rangos del esquema y el ajuste que se guarda.
import { describe, expect, it } from 'vitest';
import { ajusteCon, COLORES_KIT, controlesDe, escalaSiguiente, nombreElemento, tamanoSiguiente } from './ajustes-elemento';

describe('retoques del elemento', () => {
  it('A+ y A− cambian un 10 % el tamaño que se ve, a una décima', () => {
    expect(tamanoSiguiente(5, 1)).toBe(5.5);
    expect(tamanoSiguiente(5, -1)).toBe(4.5);
    expect(tamanoSiguiente(3.37, 1)).toBe(3.7);
  });

  it('el tamaño queda entre 0,5 y 20 y siempre se mueve al menos una décima', () => {
    expect(tamanoSiguiente(19.5, 1)).toBe(20);
    expect(tamanoSiguiente(20, 1)).toBe(20);
    expect(tamanoSiguiente(0.5, -1)).toBe(0.5);
    expect(tamanoSiguiente(0.6, -1)).toBe(0.5);
    expect(tamanoSiguiente(0.6, 1)).toBe(0.7);
  });

  it('la escala de la imagen o el personaje queda entre 0,3 y 3', () => {
    expect(escalaSiguiente(undefined, 1)).toBe(1.1);
    expect(escalaSiguiente(2.9, 1)).toBe(3);
    expect(escalaSiguiente(0.31, -1)).toBe(0.3);
  });

  it('CP-057 · solo se ofrecen colores del kit, como roles', () => {
    expect(COLORES_KIT.map(([rol]) => rol)).toEqual(['primario', 'secundario', 'acento', 'texto', 'blanco', 'alerta']);
  });

  it('cada tipo de elemento ofrece lo suyo', () => {
    expect(controlesDe('texto')).toEqual({ tamano: 'texto', color: true, alineacion: true, animacion: true });
    expect(controlesDe('personaje')).toEqual({ tamano: 'escala', color: false, alineacion: false, animacion: true });
    expect(controlesDe('interaccion').tamano).toBeNull();
  });

  it('el ajuste suma el cambio; «auto» no se guarda y sin nada queda null', () => {
    expect(ajusteCon(undefined, { color: 'acento' })).toEqual({ color: 'acento' });
    expect(ajusteCon({ color: 'acento', animacion: 'zoom' }, { animacion: 'auto' })).toEqual({ color: 'acento' });
    expect(ajusteCon({ animacion: 'zoom' }, { animacion: 'auto' })).toBeNull();
    expect(ajusteCon({ alineacion: 'centro' }, { alineacion: undefined })).toBeNull();
  });

  it('nombra el elemento por su clase y el comienzo de su texto', () => {
    expect(nombreElemento({ tipo: 'texto', rol: 'titulo', contenido: { es: 'Bloqueo y etiquetado' } })).toBe('Título · Bloqueo y etiquetado');
    expect(nombreElemento({ tipo: 'texto', rol: 'cuerpo', contenido: { es: 'Un texto bastante largo que no cabe entero' } })).toBe('Texto · Un texto bastante largo que…');
    expect(nombreElemento({ tipo: 'personaje' })).toBe('Personaje');
  });
});
