import type { TipoInteraccion } from '../tipos.ts';
import { clasificar } from './clasificar.ts';
import type { Actividad } from './comun.ts';
import { decision } from './decision.ts';
import { deslizar } from './deslizar.ts';
import { exploracion } from './exploracion.ts';
import { memoria } from './memoria.ts';
import { ordenar } from './ordenar.ts';
import { quiz } from './quiz.ts';
import { tarjetas } from './tarjetas.ts';

/** Catálogo cerrado (decisión 6): el curso solo elige una de estas; nunca trae código propio. */
export const ACTIVIDADES: Record<TipoInteraccion, Actividad> = {
  'INT-01': memoria,
  'INT-02': clasificar,
  'INT-03': ordenar,
  'INT-04': tarjetas,
  'INT-05': quiz,
  'INT-06': exploracion,
  'INT-07': deslizar,
  'INT-08': decision,
};

export type { ContextoActividad } from './comun.ts';
