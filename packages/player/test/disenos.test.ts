// HU-0605 · Cambiar diseño con los mismos bloques: el reproductor compone por la clase de la disposición.
import { describe, expect, it } from 'vitest';
import { ESTILOS } from '../src/estilos.ts';

const regla = (selector: string) => new RegExp(`(^|[},\\n])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,{]`);

describe('diseños de contenido', () => {
  it('«Tarjetas con íconos» vuelve tarjetas los párrafos y el dato, con el título a todo el ancho', () => {
    expect(ESTILOS).toMatch(regla('.ap-d-lista .ap-texto'));
    expect(ESTILOS).toMatch(regla('.ap-d-lista .ap-parrafo'));
    expect(ESTILOS).toMatch(regla('.ap-d-lista .ap-dato'));
    expect(ESTILOS).toMatch(/\.ap-d-lista \.ap-titulo-pantalla,[^{]*\{grid-column:1\/-1\}/);
  });

  it('«Dato grande» agranda el destacado según el ancho del reproductor (cqi)', () => {
    const dato = ESTILOS.match(/\.ap-d-dato \.ap-dato\{([^}]*)\}/)![1]!;
    expect(dato).toMatch(/font-size:clamp\(32px,9cqi,64px\)/);
    expect(dato).toContain('color:var(--ap-primario)');
  });
});
