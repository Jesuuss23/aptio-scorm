// HU-0606 · Agregar elementos y capas: valores iniciales, ids únicos, nombres, capas y edición del texto de un extra.
import type { PantallaDoc } from '@aptio/schema/revision';
import { describe, expect, it } from 'vitest';
import { controlesDe } from './ajustes-elemento';
import { edicionDe, esEditable } from './edicion-texto';
import { capasDe, extraNuevo, nombreExtra, type PantallaConExtras, sinExtra, TIPOS_EXTRA } from './extras';

const p05 = (extra: Partial<PantallaConExtras> = {}) => ({
  id: 'p05', titulo: { es: 'Energía' }, estado: 'borrador',
  bloques: [
    { id: 'p05-titulo', tipo: 'texto', rol: 'titulo', contenido: { es: 'Energía' } },
    { id: 'p05-imagen', tipo: 'imagen', recursoId: 'img', decorativa: false },
    { id: 'p05-int', tipo: 'interaccion' },
  ],
  ...extra,
}) as unknown as PantallaConExtras;

describe('extras del editor', () => {
  it('el panel Agregar ofrece los 8 tipos del prototipo', () => {
    expect(TIPOS_EXTRA.map(([, n]) => n)).toEqual(['Título', 'Texto', 'Dato clave', 'Botón', 'Imagen del kit', 'Insignia', 'Forma', 'Personaje']);
  });

  it('CP-061 · un botón nuevo dice «Continuar», avanza con «Siguiente» y tiene un id libre', () => {
    expect(extraNuevo('boton', p05())).toEqual({ id: 'p05-extra-boton-1', tipo: 'boton', texto: { es: 'Continuar' }, x: 40, y: 80, ancho: 14, alClic: 'siguiente' });
    const con = p05({ extras: [extraNuevo('boton', p05())] });
    expect(extraNuevo('boton', con).id).toBe('p05-extra-boton-2');
    expect(extraNuevo('forma', p05())).toEqual({ id: 'p05-extra-forma-1', tipo: 'forma', x: 40, y: 45, ancho: 20 });
    expect(extraNuevo('personaje', p05(), 'svg-ana')).toMatchObject({ tipo: 'personaje', recursoId: 'svg-ana' });
    expect(extraNuevo('personaje', p05())).not.toHaveProperty('recursoId');
  });

  it('cada extra ofrece sus controles: los de texto como un texto, la forma con color', () => {
    expect(controlesDe('boton')).toEqual({ tamano: 'texto', color: true, alineacion: true, animacion: true });
    expect(controlesDe('insignia')).toEqual({ tamano: 'escala', color: false, alineacion: false, animacion: true });
    expect(controlesDe('forma')).toEqual({ tamano: 'escala', color: true, alineacion: false, animacion: true });
  });

  it('las capas son los bloques que se retocan y, encima, los extras, con su estado oculto', () => {
    const boton = extraNuevo('boton', p05());
    const p = p05({ extras: [boton], ajustes: { 'p05-imagen': { oculto: true } } });
    expect(capasDe(p)).toEqual([
      { id: 'p05-titulo', nombre: 'Título · Energía', tipo: 'texto', extra: false, oculto: false },
      { id: 'p05-imagen', nombre: 'Imagen', tipo: 'imagen', extra: false, oculto: true },
      { id: 'p05-extra-boton-1', nombre: 'Botón · Continuar', tipo: 'boton', extra: true, oculto: false },
    ]);
    expect(nombreExtra(extraNuevo('insignia', p05()))).toBe('Insignia');
    expect(sinExtra(p, boton.id)).toEqual([]);
  });

  it('el texto de un extra se escribe en el lienzo y se guarda con la lista de extras', () => {
    const boton = extraNuevo('boton', p05());
    const p = p05({ extras: [boton, extraNuevo('forma', p05())] }) as unknown as PantallaDoc;
    expect(esEditable(p, boton.id)).toBe(true);
    expect(esEditable(p, 'p05-extra-forma-1')).toBe(false);
    const r = edicionDe(p, boton.id, '  Ver   ejemplo ');
    expect(r).toEqual({ tipo: 'cambio', cambio: { extras: [{ ...boton, texto: { es: 'Ver ejemplo' } }, expect.objectContaining({ tipo: 'forma' })] } });
    expect(edicionDe(p, boton.id, 'Continuar')).toEqual({ tipo: 'sin-cambios' });
    expect(edicionDe(p, boton.id, '   ')).toEqual({ tipo: 'vacio' });
  });
});
