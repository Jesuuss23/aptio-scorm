import { describe, expect, it } from 'vitest';
import { abiertosPorPantalla, filtrarPantallas, textoContador } from './comentarios';

const c = (pantallaId: string, resuelto = false) => ({ pantallaId, resuelto });

describe('comentarios en Revisión (HU-0506)', () => {
  it('cuenta solo los comentarios abiertos por pantalla', () => {
    const m = abiertosPorPantalla([c('p05'), c('p05'), c('p05', true), c('p12', true), c('p20')]);
    expect(Object.fromEntries(m)).toEqual({ p05: 2, p20: 1 });
  });

  it('«Con comentarios» deja las pantallas con alguno abierto; los otros filtros siguen igual', () => {
    const pantallas = [{ id: 'p01' }, { id: 'p05' }, { id: 'p12' }, { id: 'p20' }];
    const criterios = { conObservaciones: new Set(['p12']), abiertos: abiertosPorPantalla([c('p05'), c('p12', true), c('p20')]), conActividad: (p: { id: string }) => p.id === 'p01' };
    expect(filtrarPantallas(pantallas, 'comentarios', criterios).map((p) => p.id)).toEqual(['p05', 'p20']);
    expect(filtrarPantallas(pantallas, 'revisar', criterios).map((p) => p.id)).toEqual(['p12']);
    expect(filtrarPantallas(pantallas, 'actividades', criterios).map((p) => p.id)).toEqual(['p01']);
    expect(filtrarPantallas(pantallas, 'todas', criterios)).toHaveLength(4);
  });

  it('nombra el contador en singular y plural', () => {
    expect(textoContador(1)).toBe('1 comentario abierto');
    expect(textoContador(3)).toBe('3 comentarios abiertos');
  });
});
