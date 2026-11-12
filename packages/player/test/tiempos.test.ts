// HU-0608 · Tiempos en el reproductor (CP-065, RN-06-7, RN-06-9): entrada, salida, escalonado y duración, iguales en la
// vista previa y en el paquete porque es el mismo código.
import { describe, expect, it } from 'vitest';
import { ESTILOS } from '../src/estilos.ts';
import { activoEn, duracionDe, tiemposDe, ultimoCambio } from '../src/tiempos.ts';

const p05 = (ajustes = {}) => ({
  bloques: [{ id: 'p05-titulo' }, { id: 'p05-texto' }, { id: 'p05-dato' }, { id: 'p05-imagen' }],
  extras: [{ id: 'p05-extra-boton-1' }],
  ajustes,
  narracion: { texto: { es: 'x' }, porIdioma: { es: { duracionMs: 5330 } } },
}) as unknown as Parameters<typeof duracionDe>[0];

describe('tiempos del reproductor', () => {
  it('RN-06-9 · sin tiempos, bloques y extras entran escalonados de a 0,3 s en su orden', () => {
    expect(tiemposDe(p05()).map((x) => [x.id, x.inicioS, x.definido])).toEqual([
      ['p05-titulo', 0, false], ['p05-texto', 0.3, false], ['p05-dato', 0.6, false], ['p05-imagen', 0.9, false], ['p05-extra-boton-1', 1.2, false],
    ]);
  });

  it('CP-065 · con finS = 4 el elemento se ve hasta los 4 s y luego no; con retardoS aparece en ese segundo', () => {
    const [, , dato] = tiemposDe(p05({ 'p05-dato': { retardoS: 0.85, anclaPalabra: 2, finS: 4 } }));
    expect(dato).toEqual({ id: 'p05-dato', inicioS: 0.85, finS: 4, definido: true });
    expect(activoEn(dato!, 0.5)).toBe(false);
    expect(activoEn(dato!, 0.85)).toBe(true);
    expect(activoEn(dato!, 3.99)).toBe(true);
    expect(activoEn(dato!, 4)).toBe(false);
    // Solo con salida: entra escalonado y el reloj lo saca a los 4 s.
    const [titulo] = tiemposDe(p05({ 'p05-titulo': { finS: 4 } }));
    expect(titulo).toEqual({ id: 'p05-titulo', inicioS: 0, finS: 4, definido: true });
    expect(ultimoCambio(tiemposDe(p05({ 'p05-titulo': { finS: 4 } })))).toBe(4);
    // Un valor que no es válido se ignora.
    expect(tiemposDe(p05({ 'p05-titulo': { retardoS: -2 } }))[0]!.definido).toBe(false);
  });

  it('RN-06-7 · dura la voz + 1 s o hasta la salida del último elemento', () => {
    expect(duracionDe(p05(), 'es')).toBe(6.33);
    expect(duracionDe(p05({ 'p05-dato': { finS: 9 } }), 'es')).toBe(9);
    expect(duracionDe(p05(), 'en')).toBe(3);
    // HU-0610 · Hasta 1 s después del último disparador por tiempo.
    const conDisparador = { ...p05(), disparadores: [{ id: 'd1', cuando: { evento: 'tiempo', segundo: 12 }, accion: { tipo: 'ir-a', pantallaId: 'p06' } }] } as Parameters<typeof duracionDe>[0];
    expect(duracionDe(conDisparador, 'es')).toBe(13);
  });

  it('fuera de su tiempo un elemento no ocupa lugar; lo escalonado entra con una animación', () => {
    expect(ESTILOS).toContain('.ap-fuera{display:none!important}');
    expect(ESTILOS).toContain('.ap-entra{animation:ap-aparecer .4s ease-out both}');
  });
});
