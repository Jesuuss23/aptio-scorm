// CP-002 · El worker valida el curso con el mismo paquete que la API y la web.
import { readFileSync } from 'node:fs';
import { validarCurso } from '@aptio/schema';
import { describe, expect, it } from 'vitest';

const ejemplo = JSON.parse(
  readFileSync(new URL('../../../packages/schema/ejemplos/ejemplo-capsula.json', import.meta.url), 'utf8'),
);

describe('CP-002 · validación compartida desde el worker', () => {
  it('el ejemplo es válido', () => {
    expect(validarCurso(ejemplo).valido).toBe(true);
  });

  it('devuelve los errores de un curso con un recurso inexistente', () => {
    const curso = structuredClone(ejemplo);
    curso.modulos[0].capsulas[0].pantallas[1].bloques[0].recursoId = 'no-existe';
    expect(validarCurso(curso).errores).toEqual([
      'recurso inexistente "no-existe" en /modulos/0/capsulas/0/pantallas/1/bloques/0/recursoId',
    ]);
  });
});
