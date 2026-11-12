// HU-1401 · Curso sintético con las 8 interacciones del catálogo, una por pantalla, armado con las del caso LOTO
// (que no trae Tarjetas, INT-04): portada, INT-01 a INT-08 y cierre. Lo usan Vitest y Playwright (CP-101).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CursoReproductor, Pantalla } from '../src/tipos.ts';

// Ruta y no `URL`: con happy-dom, `URL` es la del navegador simulado y `readFileSync` no la acepta.
const LOTO = join(dirname(fileURLToPath(import.meta.url)), '../../ai/casos/loto/curso-esperado-es.json');

export const cursoLotoBase = (): CursoReproductor => JSON.parse(readFileSync(LOTO, 'utf8')) as CursoReproductor;

/** Pantalla de LOTO que se toma para cada interacción (el quiz es el reto final: sumativo, con tiempo y vidas). */
const DE_LOTO = { 'INT-01': 'p07', 'INT-02': 'p10', 'INT-03': 'p15', 'INT-05': 'p28', 'INT-06': 'p20', 'INT-07': 'p26', 'INT-08': 'p17' } as const;

const texto = (es: string, en: string) => ({ es, en });

/** Tarjetas (INT-04) con el mismo armado de pantalla que la memoria de LOTO. */
function tarjetas(base: Pantalla): Pantalla {
  const copia = structuredClone(base);
  copia.id = 'p-tarjetas';
  copia.titulo = texto('Repasa los conceptos', 'Review the concepts');
  delete copia.narracion;
  copia.bloques = copia.bloques.map((b) => (b.tipo !== 'interaccion' ? b : {
    ...b,
    id: 'p-tarjetas-int',
    interaccion: {
      tipo: 'INT-04', modo: 'formativa',
      instruccion: texto('Voltea cada tarjeta para ver su definición.', 'Flip each card to see its definition.'),
      datos: {
        tarjetas: [
          { id: 'tj-1', frente: { texto: texto('Bloqueo', 'Lockout') }, reverso: { texto: texto('Impide que la energía se libere.', 'Prevents energy release.') } },
          { id: 'tj-2', frente: { texto: texto('Etiquetado', 'Tagout') }, reverso: { texto: texto('Avisa quién bloqueó y por qué.', 'Shows who locked out and why.') } },
          { id: 'tj-3', frente: { texto: texto('Energía cero', 'Zero energy') }, reverso: { texto: texto('Se verifica antes de intervenir.', 'Verified before working.') } },
        ],
      },
    },
  }));
  return copia;
}

/** El curso del catálogo: 10 pantallas (portada, las 8 interacciones en orden y cierre). */
export function cursoCatalogo(): CursoReproductor {
  const curso = cursoLotoBase();
  const todas = curso.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
  const de = (id: string) => structuredClone(todas.find((p) => p.id === id)!);
  const pantallas = [
    de('p01'),
    de(DE_LOTO['INT-01']), de(DE_LOTO['INT-02']), de(DE_LOTO['INT-03']), tarjetas(de(DE_LOTO['INT-01'])),
    de(DE_LOTO['INT-05']), de(DE_LOTO['INT-06']), de(DE_LOTO['INT-07']), de(DE_LOTO['INT-08']),
    de('p30'),
  ];
  const [modulo] = curso.modulos;
  const [capsula] = modulo!.capsulas;
  return {
    ...curso,
    id: `${curso.id}-catalogo`,
    metadatos: { ...curso.metadatos, titulo: texto('Catálogo de interacciones', 'Interaction catalog') },
    modulos: [{ ...modulo!, capsulas: [{ ...capsula!, pantallas }] }],
  };
}

/** Datos de la interacción de una pantalla del catálogo, por tipo. */
export function datosDe(tipo: string): { id: string; modo: 'formativa' | 'sumativa'; datos: Record<string, unknown> } {
  for (const p of cursoCatalogo().modulos[0]!.capsulas[0]!.pantallas) {
    for (const b of p.bloques) if (b.tipo === 'interaccion' && b.interaccion.tipo === tipo) return { id: p.id, modo: b.interaccion.modo, datos: b.interaccion.datos };
  }
  throw new Error(`Sin ${tipo} en el catálogo`);
}
