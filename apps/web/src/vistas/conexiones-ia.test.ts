import { describe, expect, it } from 'vitest';
import { leerLimite, medidorMes, sinCodigoLimite } from './conexiones-ia';

describe('Conexiones IA', () => {
  it('lee el límite mensual: vacío lo quita, coma decimal, nada negativo', () => {
    expect(leerLimite('')).toEqual({ valor: null });
    expect(leerLimite(' 25,5 ')).toEqual({ valor: 25.5 });
    expect(leerLimite('0')).toEqual({ valor: 0 });
    expect(leerLimite('-1')).toHaveProperty('error');
    expect(leerLimite('1.234')).toHaveProperty('error');
    expect(leerLimite('diez')).toHaveProperty('error');
  });

  it('el medidor compara el total del mes con la suma de los límites y se pone en rojo al tope', () => {
    expect(medidorMes(58.2, null)).toEqual({ porcentaje: null, alTope: false });
    expect(medidorMes(58.2, 200)).toEqual({ porcentaje: 29, alTope: false });
    expect(medidorMes(200, 200)).toEqual({ porcentaje: 100, alTope: true });
    expect(medidorMes(250, 200)).toEqual({ porcentaje: 100, alTope: true });
    expect(medidorMes(0, 0)).toEqual({ porcentaje: 100, alTope: true });
  });

  it('quita el código LIMITE_GASTO del mensaje que se muestra', () => {
    expect(sinCodigoLimite('LIMITE_GASTO: la tarea «Voz» llegó a su límite')).toBe('la tarea «Voz» llegó a su límite');
    expect(sinCodigoLimite('Otro error')).toBe('Otro error');
  });
});
