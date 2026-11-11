// HU-0602 · Retoques del elemento: pasos de A−/A+, rangos del esquema y el ajuste que se guarda.
import { describe, expect, it } from 'vitest';
import { ajusteCon, cambioDesplazamiento, COLORES_KIT, controlesDe, desplazado, escalaSiguiente, nombreElemento, PASO_FLECHA, pxAPorcentaje, tamanoSiguiente } from './ajustes-elemento';

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

  it('HU-0603 · CP-058: lo arrastrado se guarda en % del ancho del reproductor', () => {
    expect(pxAPorcentaje(100, 800)).toBe(12.5);
    expect(pxAPorcentaje(-37, 1000)).toBe(-3.7);
    expect(pxAPorcentaje(10, 0)).toBe(0);
  });

  it('HU-0603 · las flechas suman 0,5 % y el desplazamiento no pasa de ±100 %', () => {
    expect(PASO_FLECHA).toBe(0.5);
    expect(desplazado(undefined, PASO_FLECHA, 0)).toEqual({ x: 0.5, y: 0 });
    expect(desplazado({ x: 12.5, y: -3 }, 0, -PASO_FLECHA)).toEqual({ x: 12.5, y: -3.5 });
    expect(desplazado({ x: 99.8, y: -99.9 }, 1, -1)).toEqual({ x: 100, y: -100 });
  });

  it('HU-0603 · en (0, 0) se quita el desplazamiento; si no, vale para todos los dispositivos', () => {
    expect(cambioDesplazamiento({ x: 2, y: 0 })).toEqual({ desplazamiento: { x: 2, y: 0, dispositivo: 'todos' } });
    expect(ajusteCon({ color: 'acento', desplazamiento: { x: 1, y: 1 } }, cambioDesplazamiento({ x: 0, y: 0 }))).toEqual({ color: 'acento' });
  });
});
