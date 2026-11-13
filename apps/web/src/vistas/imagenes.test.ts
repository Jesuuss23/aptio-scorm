// HU-0609 · Imágenes propias en el editor (REQ-046, CP-070): formatos y topes antes de subir, el extra con una pieza del
// kit o una imagen subida en el punto donde se soltó, y el aviso de revisar el texto alternativo (RN-14-3).
import { describe, expect, it } from 'vitest';
import type { PantallaConExtras } from './extras';
import { ACEPTA_IMAGEN, altPorRevisar, extraImagen, motivoImagen } from './imagenes';

const p05 = { id: 'p05', titulo: { es: 'Energía' }, estado: 'borrador', bloques: [{ id: 'p05-titulo', tipo: 'texto' }], extras: [{ id: 'p05-extra-imagen-1', tipo: 'imagen', x: 1, y: 1, ancho: 10 }] } as unknown as PantallaConExtras;
const MB = 1024 * 1024;

describe('imágenes del editor (HU-0609)', () => {
  it('acepta PNG, JPEG y WebP hasta 20 MB y SVG hasta 2 MB; lo demás se explica', () => {
    expect(ACEPTA_IMAGEN).toBe('image/png,image/jpeg,image/webp,image/svg+xml');
    expect(motivoImagen({ name: 'foto.png', type: 'image/png', size: 20 * MB })).toBeNull();
    expect(motivoImagen({ name: 'logo.svg', type: 'image/svg+xml', size: 2 * MB })).toBeNull();
    expect(motivoImagen({ name: 'foto.gif', type: 'image/gif', size: 10 })).toBe('«foto.gif» no es una imagen que se pueda usar: sube PNG, JPEG, WebP o SVG.');
    expect(motivoImagen({ name: 'grande.jpg', type: 'image/jpeg', size: 20 * MB + 1 })).toBe('«grande.jpg» pesa más de 20 MB, el máximo para este tipo de imagen.');
    expect(motivoImagen({ name: 'plano.svg', type: 'image/svg+xml', size: 3 * MB })).toBe('«plano.svg» pesa más de 2 MB, el máximo para este tipo de imagen.');
  });

  it('CP-070 · la imagen soltada es un extra nuevo con su recurso, su texto alternativo y la posición del punto', () => {
    expect(extraImagen(p05, { recursoId: 'r1', nombre: 'operario-con_casco.png' }, { x: 40, y: 32.2, ancho: 20 })).toEqual({
      id: 'p05-extra-imagen-2', tipo: 'imagen', recursoId: 'r1', texto: { es: 'Operario con casco' }, x: 40, y: 32.2, ancho: 20,
    });
  });

  it('una pieza del kit empieza con su nombre como texto alternativo y en la posición inicial', () => {
    expect(extraImagen(p05, { pieza: 'casco' })).toEqual({ id: 'p05-extra-imagen-2', tipo: 'imagen', pieza: 'casco', texto: { es: 'Casco de seguridad' }, x: 42, y: 30, ancho: 16 });
  });

  it('pide revisar el texto alternativo mientras sea el nombre del archivo', () => {
    const recursos = [{ id: 'r1', nombre: 'operario-con_casco.png' }];
    const e = extraImagen(p05, { recursoId: 'r1', nombre: 'operario-con_casco.png' });
    expect(altPorRevisar(e, recursos)).toBe(true);
    expect(altPorRevisar({ ...e, texto: { es: 'Operario cerrando la válvula' } }, recursos)).toBe(false);
    expect(altPorRevisar({ ...e, decorativa: true }, recursos)).toBe(false);
    expect(altPorRevisar(extraImagen(p05, { pieza: 'casco' }), recursos)).toBe(false);
  });
});
