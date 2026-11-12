// HU-0610 · Disparadores simples (CP-069, REQ-045): reglas de `erroresDisparadores` (como mucho 10, segundo de 0 a 600,
// referencias que existen), el validador del curso, la purga al quitar un extra y que la IA no los toca (RN-06-1).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Disparador, erroresDisparadores, purgarDisparadores } from '../src/disparadores.js';
import { conservarRetoques, sinRetoques } from '../src/retoques.js';
import { erroresCurso } from '../src/validar.js';

type P = { id: string; bloques: { id: string }[]; extras?: { id: string; tipo: string; x: number; y: number; ancho: number }[]; disparadores?: Disparador[]; disposicion?: string };
const loto = () => JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as { modulos: { capsulas: { pantallas: P[] }[] }[] };
const pantallas = (d: ReturnType<typeof loto>) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
const IDS = Array.from({ length: 30 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
const boton = { id: 'p05-boton-seguir', tipo: 'boton', x: 60, y: 80, ancho: 25 };
const mostrarA3 = (id = 'p05-disp-1'): Disparador => ({ id, cuando: { evento: 'tiempo', segundo: 3 }, accion: { tipo: 'mostrar', elementoId: 'p05-boton-seguir' } });
const p05 = (disparadores: Disparador[]): P => ({ id: 'p05', bloques: [{ id: 'p05-titulo' }, { id: 'p05-imagen' }], extras: [boton], disparadores });

describe('disparadores (HU-0610)', () => {
  it('CP-069 · «a los 3 s → mostrar botón» es válido, igual que ocultar un bloque al terminar la voz e ir a otra pantalla', () => {
    expect(erroresDisparadores(p05([
      mostrarA3(),
      { id: 'p05-disp-2', cuando: { evento: 'fin-voz' }, accion: { tipo: 'ocultar', elementoId: 'p05-imagen' } },
      { id: 'p05-disp-3', cuando: { evento: 'tiempo', segundo: 0 }, accion: { tipo: 'ir-a', pantallaId: 'p08' } },
      { id: 'p05-disp-4', cuando: { evento: 'tiempo', segundo: 600 }, accion: { tipo: 'ocultar', elementoId: 'p05-titulo' } },
    ]), IDS)).toEqual([]);
    expect(erroresDisparadores({ id: 'p05', bloques: [] }, IDS)).toEqual([]);
  });

  it('como mucho 10 por pantalla, con ids sin repetir', () => {
    const once = Array.from({ length: 11 }, (_, i) => mostrarA3(`p05-disp-${i + 1}`));
    expect(erroresDisparadores(p05(once), IDS)).toEqual(['p05: como mucho 10 disparadores por pantalla (hay 11)']);
    expect(erroresDisparadores(p05(once.slice(0, 10)), IDS)).toEqual([]);
    expect(erroresDisparadores(p05([mostrarA3(), mostrarA3()]), IDS)).toEqual(['p05/disparadores/1: el id «p05-disp-1» se repite']);
  });

  it('el segundo va de 0 a 600 y es obligatorio con «tiempo»', () => {
    const conSegundo = (segundo?: number): Disparador => ({ ...mostrarA3(), cuando: { evento: 'tiempo', ...(segundo === undefined ? {} : { segundo }) } });
    const error = 'p05/disparadores/0/cuando: el segundo debe estar entre 0 y 600';
    expect([601, -1, undefined, Number.NaN].map((s) => erroresDisparadores(p05([conSegundo(s)]), IDS))).toEqual([[error], [error], [error], [error]]);
  });

  it('el elemento debe estar en la pantalla y la destino en el curso (y no ser la misma)', () => {
    expect(erroresDisparadores(p05([{ id: 'd1', cuando: { evento: 'fin-voz' }, accion: { tipo: 'mostrar', elementoId: 'p06-titulo' } }]), IDS))
      .toEqual(['p05/disparadores/0/accion: el elemento «p06-titulo» no está en la pantalla']);
    expect(erroresDisparadores(p05([{ id: 'd1', cuando: { evento: 'fin-voz' }, accion: { tipo: 'ocultar' } }]), IDS))
      .toEqual(['p05/disparadores/0/accion: el elemento «» no está en la pantalla']);
    expect(erroresDisparadores(p05([{ id: 'd1', cuando: { evento: 'fin-voz' }, accion: { tipo: 'ir-a', pantallaId: 'p99' } }]), IDS))
      .toEqual(['p05/disparadores/0/accion: la pantalla «p99» no está en el curso']);
    expect(erroresDisparadores(p05([{ id: 'd1', cuando: { evento: 'fin-voz' }, accion: { tipo: 'ir-a', pantallaId: 'p05' } }]), IDS))
      .toEqual(['p05/disparadores/0/accion: ir a la misma pantalla no hace nada']);
  });

  it('el validador del curso aplica las mismas reglas', () => {
    const d = loto();
    const p = pantallas(d).find((x) => x.id === 'p05')!;
    p.extras = [boton];
    p.disparadores = [mostrarA3()];
    expect(erroresCurso(d)).toEqual([]);
    p.disparadores = [{ ...mostrarA3(), accion: { tipo: 'mostrar', elementoId: 'no-existe' } }];
    expect(erroresCurso(d)).toEqual(['p05/disparadores/0/accion: el elemento «no-existe» no está en la pantalla']);
    p.disparadores = [{ id: 'p05-disp-1', cuando: { evento: 'nunca' }, accion: { tipo: 'mostrar' } } as unknown as Disparador];
    expect(erroresCurso(d)[0]).toMatch(/^esquema \/modulos\/0\/capsulas\/0\/pantallas\/4\/disparadores\/0\/cuando\/evento/);
  });

  it('quitar un extra purga sus disparadores; los de ir-a y los de bloques quedan', () => {
    const p = p05([mostrarA3(), { id: 'p05-disp-2', cuando: { evento: 'fin-voz' }, accion: { tipo: 'ir-a', pantallaId: 'p08' } }]);
    p.extras = [];
    expect(purgarDisparadores(p).disparadores!.map((x) => x.id)).toEqual(['p05-disp-2']);
    const solo = p05([mostrarA3()]);
    solo.extras = [];
    expect(purgarDisparadores(solo)).not.toHaveProperty('disparadores');
  });

  it('son retoques: la IA no los ve y se conservan si su elemento sigue (RN-06-1)', () => {
    const antes = p05([mostrarA3(), { id: 'p05-disp-2', cuando: { evento: 'fin-voz' }, accion: { tipo: 'ocultar', elementoId: 'p05-imagen' } }]);
    expect(sinRetoques(antes)).not.toHaveProperty('disparadores');
    // La IA quitó la imagen: queda el del botón (extra), se va el de la imagen.
    const despues = conservarRetoques(antes, { id: 'p05', bloques: [{ id: 'p05-titulo' }] } as P);
    expect(despues.disparadores!.map((x) => x.id)).toEqual(['p05-disp-1']);
  });
});
