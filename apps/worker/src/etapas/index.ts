// Ejecutores de las etapas del generador. Cada historia de S2 en adelante agrega el suyo (HU-0402 resumen,
// HU-0403 estructura, HU-0404 guion, HU-0406 pantallas, …); una etapa sin ejecutor queda en cola con el aviso de que se habilita después.
import type { Etapa } from '@aptio/schema/generacion';
import type { EjecutorEtapa } from '../generar.js';
import { estructurarCurso } from './estructura.js';
import { escribirGuion } from './guion.js';
import { componerPantallas } from './pantallas.js';
import { resumirMaterial } from './resumen.js';

export const EJECUTORES: Partial<Record<Etapa, EjecutorEtapa>> = {
  RESUMEN_MATERIAL: resumirMaterial,
  OBJETIVOS_ESTRUCTURA: estructurarCurso,
  STORYBOARD_GUION: escribirGuion,
  PANTALLAS: componerPantallas,
};
