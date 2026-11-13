// HU-0609 · Imágenes de los extras (REQ-046, REQ-017): una pieza del kit o una imagen subida (no las dos), el texto
// alternativo inicial desde el nombre del archivo y la posición en % de lo que se suelta en el lienzo (CP-070).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { altDeArchivo, erroresExtras, NOMBRE_PIEZA, PIEZAS_KIT, posicionSoltada } from '../src/biblioteca.js';
import { erroresCurso } from '../src/validar.js';

type Doc = { recursos: { id: string; tipo: string; origen: string; nombre: string; mime: string }[]; modulos: { capsulas: { pantallas: { id: string; extras?: unknown[] }[] }[] }[] };
const loto = () => JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as Doc;
const p05 = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === 'p05')!;
const FOTO = '7b0c7d0e-1111-4b8f-9d6a-1f2e3d4c5b6a';
const tipos = new Map([[FOTO, 'imagen'], ['voz', 'audio']]);

describe('imágenes de los extras (HU-0609)', () => {
  it('un extra imagen usa una pieza del kit o una imagen del curso, no las dos', () => {
    expect(PIEZAS_KIT).toHaveLength(6);
    expect(Object.keys(NOMBRE_PIEZA)).toEqual([...PIEZAS_KIT]);
    expect(erroresExtras('p05', [
      { id: 'a', tipo: 'imagen', pieza: 'candado' },
      { id: 'b', tipo: 'imagen', recursoId: FOTO, decorativa: true },
      { id: 'c', tipo: 'imagen' },
    ], tipos)).toEqual([]);
    expect(erroresExtras('p05', [
      { id: 'a', tipo: 'imagen', pieza: 'candado', recursoId: FOTO },
      { id: 'b', tipo: 'imagen', recursoId: 'voz' },
      { id: 'c', tipo: 'titulo', pieza: 'trofeo', decorativa: false },
    ], tipos)).toEqual([
      'p05/extras/0: usa una pieza del kit o una imagen subida, no las dos',
      'p05/extras/1: el recurso «voz» es audio, no una imagen',
      'p05/extras/2: solo un extra imagen puede llevar una pieza del kit',
      'p05/extras/2: solo un extra imagen puede ser decorativo',
    ]);
  });

  it('el validador del curso acepta la pieza y la imagen subida, y rechaza una pieza que no existe', () => {
    const d = loto();
    d.recursos.push({ id: FOTO, tipo: 'imagen', origen: 'subido', nombre: 'operario-casco.png', mime: 'image/png' });
    p05(d).extras = [
      { id: 'p05-extra-imagen-1', tipo: 'imagen', pieza: 'casco', texto: { es: 'Casco de seguridad' }, x: 40, y: 30, ancho: 16 },
      { id: 'p05-extra-imagen-2', tipo: 'imagen', recursoId: FOTO, texto: { es: 'Operario casco' }, x: 10, y: 10, ancho: 20 },
    ];
    expect(erroresCurso(d)).toEqual([]);
    p05(d).extras = [{ id: 'p05-extra-imagen-1', tipo: 'imagen', pieza: 'nube', x: 40, y: 30, ancho: 16 }];
    expect(erroresCurso(d).some((e) => e.includes('/extras/0/pieza'))).toBe(true);
    p05(d).extras = [{ id: 'p05-extra-imagen-1', tipo: 'imagen', recursoId: 'no-existe', x: 40, y: 30, ancho: 16 }];
    expect(erroresCurso(d)).toContain('recurso inexistente "no-existe" en /modulos/0/capsulas/0/pantallas/4/extras/0/recursoId');
  });

  it('el texto alternativo empieza con el nombre del archivo, sin extensión ni guiones', () => {
    expect(altDeArchivo('operario-con_casco.png')).toBe('Operario con casco');
    expect(altDeArchivo('IMG_2041.JPEG')).toBe('IMG 2041');
    expect(altDeArchivo('.png')).toBe('Imagen');
  });

  it('CP-070 · lo soltado queda centrado en el punto, en % de la pantalla, y recortado dentro de ella', () => {
    // Pantalla de 800 × 450 px; se suelta en (400, 225), imagen cuadrada de 20 % del ancho (160 px = 35,6 % del alto).
    expect(posicionSoltada({ x: 400, y: 225 }, { ancho: 800, alto: 450 }, 20)).toEqual({ x: 40, y: 32.2, ancho: 20 });
    expect(posicionSoltada({ x: 200, y: 90 }, { ancho: 800, alto: 450 }, 20, 0.5)).toEqual({ x: 15, y: 11.1, ancho: 20 });
    // En una esquina, queda entera dentro de la pantalla.
    expect(posicionSoltada({ x: 5, y: 5 }, { ancho: 800, alto: 450 }, 20)).toEqual({ x: 0, y: 0, ancho: 20 });
    expect(posicionSoltada({ x: 799, y: 449 }, { ancho: 800, alto: 450 }, 20)).toEqual({ x: 80, y: 64.4, ancho: 20 });
    expect(posicionSoltada({ x: 0, y: 0 }, { ancho: 0, alto: 0 }, 20)).toEqual({ x: 40, y: 50, ancho: 20 });
  });
});
