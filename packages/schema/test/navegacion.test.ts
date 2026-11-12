// HU-1104 · IA-14 v2 (CP-088): contexto del curso, recorte del nombre, comprobaciones de `erroresPatron` y aplicar solo
// el patrón (RN-11-1, RN-11-3).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aplicarPatron, contextoPatron, erroresPatron, normalizarPatron, type PropuestaPatron, recortarNombre } from '../src/navegacion.js';
import type { CursoDoc } from '../src/revision.js';

const leer = (r: string) => JSON.parse(readFileSync(new URL(`../../ai/casos/loto/${r}`, import.meta.url), 'utf8'));
const loto = () => leer('curso-esperado-es.json') as CursoDoc & { navegacion: Record<string, unknown>; metadatos: Record<string, unknown> };
const recomendada = () => leer('salidas/04-IA-14-navegacion.json') as PropuestaPatron;
const creada = () => leer('salidas/X-IA-14-patron-tablero.json') as PropuestaPatron;

describe('patrón de navegación con IA (HU-1104)', () => {
  it('el contexto sale del curso: 30 pantallas, 9 actividades, 3 estaciones y celular por defecto', () => {
    expect(contextoPatron(loto())).toEqual({
      duracionMin: 15, publico: 'Operarios y técnicos de mantenimiento de planta', dispositivoPrincipal: 'celular', numeroPantallas: 30, numeroActividades: 9, gamificacion: 'ligera', estaciones: 3,
    });
    // Sin duración ni público: 20 s por pantalla (30 pantallas = 10 min) y «sin dato».
    const sinDatos = loto();
    sinDatos.metadatos = { ...sinDatos.metadatos, duracionEstimadaMin: undefined, publico: undefined };
    expect(contextoPatron(sinDatos, 'escritorio')).toMatchObject({ duracionMin: 10, publico: 'sin dato', dispositivoPrincipal: 'escritorio' });
  });

  it('CP-088 · las salidas grabadas pasan: crear da un personalizado completo; recomendar, uno del catálogo con otra alternativa', () => {
    expect(erroresPatron('crear', creada())).toEqual([]);
    expect(erroresPatron('recomendar', recomendada())).toEqual([]);
    // Cruzadas no pasan.
    expect(erroresPatron('recomendar', creada())).toContain('/recomendado/patron debe ser uno de los 7 patrones del catálogo al recomendar');
    expect(erroresPatron('crear', recomendada())).toEqual(expect.arrayContaining(['/recomendado/patron debe ser «personalizado» al crear un patrón', '/navegacion/patronPersonalizado es obligatorio al crear un patrón']));
  });

  it('rechaza una alternativa igual, un personalizado incompleto o un patrón que no coincide', () => {
    const igual = recomendada();
    igual.alternativa.patron = 'historias';
    expect(erroresPatron('recomendar', igual)).toEqual(['/alternativa/patron debe ser distinto del recomendado']);
    const sinBarra = creada();
    delete sinBarra.navegacion.patronPersonalizado!.barra;
    sinBarra.alternativa.patron = 'mapa';
    expect(erroresPatron('crear', sinBarra)).toEqual(['/navegacion/patronPersonalizado/barra es obligatorio al crear un patrón', '/alternativa/patron debe ser distinto del recomendado y de su base']);
    const otro = recomendada();
    otro.navegacion.patron = 'mapa';
    expect(erroresPatron('recomendar', otro)).toEqual(['/navegacion/patron debe ser el recomendado («historias»)']);
  });

  it('el nombre se recorta a 60 caracteres por palabras y queda marcado como de la IA', () => {
    expect(recortarNombre('  Tablero   de misiones ')).toBe('Tablero de misiones');
    const largo = creada();
    largo.navegacion.patronPersonalizado!.nombre = 'Tablero de misiones de seguridad para la planta de chancado y molienda norte';
    delete largo.navegacion.patronPersonalizado!.origen;
    const n = normalizarPatron(largo) as PropuestaPatron;
    expect(n.navegacion.patronPersonalizado).toMatchObject({ nombre: 'Tablero de misiones de seguridad para la planta de chancado', origen: 'ia' });
    expect(largo.navegacion.patronPersonalizado!.origen).toBeUndefined();
    expect(recortarNombre('x'.repeat(80))).toHaveLength(60);
  });

  it('aplicar cambia solo el patrón y sus opciones: las reglas y los elementos visibles se conservan', () => {
    const doc = loto();
    doc.navegacion = { ...doc.navegacion, modo: 'secuencial', mostrar: ['progreso'] };
    aplicarPatron(doc, creada().navegacion);
    expect(doc.navegacion).toMatchObject({ patron: 'personalizado', modo: 'secuencial', mostrar: ['progreso'], reanudar: 'preguntar' });
    expect((doc.navegacion.patronPersonalizado as { base: string }).base).toBe('mapa');
    aplicarPatron(doc, recomendada().navegacion);
    expect(doc.navegacion.patron).toBe('historias');
    expect(doc.navegacion.patronPersonalizado).toBeUndefined();
    expect(doc.navegacion.modo).toBe('secuencial');
  });
});
