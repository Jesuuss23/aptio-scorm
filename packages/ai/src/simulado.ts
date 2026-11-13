// Modo simulado de los proveedores (docs/17-guia-desarrollo.md): responde con las salidas grabadas
// del caso LOTO en lugar de llamar a la IA, para que el desarrollo y CI no gasten ni dependan de la red.
// Toda salida se valida contra el esquema de su tarea antes de devolverse (regla 5 de CLAUDE.md).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import formatosModulo from 'ajv-formats';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SALIDAS = join(RAIZ, 'casos', 'loto', 'salidas');
const ESQUEMAS = join(RAIZ, 'esquemas');
const ESQUEMA_CURSO = join(RAIZ, '..', 'schema', 'esquemas', 'curso-v0.schema.json');

/** Tareas sin IA de texto que también tienen salida grabada. */
const OTRAS: Record<string, string> = { VOZ: '06-voz-es.json', BOCA: '07-boca-p03.json' };
/** Tareas con varias salidas grabadas: la que responde el modo simulado (HU-0504: una propuesta por tipo de pedido). */
const PREFERIDAS: Record<string, string> = { 'IA-16': 'X-IA-16-propuestas-p05.json', 'IA-14': '04-IA-14-navegacion.json', 'IA-09': 'X-IA-09-pausas-p18.json' };

export interface ResultadoSimulado {
  tarea: string;
  archivo: string;
  datos: unknown;
}

let validadores: Map<string, ValidateFunction> | undefined;

function cargarValidadores(): Map<string, ValidateFunction> {
  if (validadores) return validadores;
  type FormatsPlugin = (ajv: Ajv2020) => Ajv2020;
  const formatos = ((formatosModulo as unknown as { default?: FormatsPlugin }).default ?? formatosModulo) as unknown as FormatsPlugin;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  formatos(ajv);
  ajv.addSchema(JSON.parse(readFileSync(ESQUEMA_CURSO, 'utf8')));
  validadores = new Map();
  for (const f of readdirSync(ESQUEMAS).filter((f) => f.endsWith('.salida.schema.json'))) {
    validadores.set(f.slice(0, 5), ajv.compile(JSON.parse(readFileSync(join(ESQUEMAS, f), 'utf8'))));
  }
  return validadores;
}

/** Tareas que el modo simulado sabe responder: IA-01 … IA-19, VOZ y BOCA. */
export function tareasSimuladas(): string[] {
  const ia = readdirSync(SALIDAS)
    .map((f) => f.match(/IA-\d\d/)?.[0])
    .filter((t): t is string => Boolean(t));
  return [...new Set(ia)].sort().concat(Object.keys(OTRAS));
}

/** Valida una salida contra el esquema de su tarea. Las tareas sin esquema (VOZ, BOCA) no se validan aquí. */
export function validarSalida(tarea: string, datos: unknown): string[] {
  const validar = cargarValidadores().get(tarea);
  if (!validar) return [];
  const lista = Array.isArray(datos) ? datos : [datos];
  const errores: string[] = [];
  for (const d of lista) {
    if (!validar(d)) errores.push(...(validar.errors ?? []).map((e: ErrorObject) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim()));
  }
  return errores;
}

/** Devuelve la salida grabada de la tarea (o el archivo `cual`), ya validada. Lanza un error si no existe o no valida. */
export function leerSalidaSimulada(tarea: string, cual?: string): ResultadoSimulado {
  const archivo = cual ?? OTRAS[tarea] ?? PREFERIDAS[tarea] ?? readdirSync(SALIDAS).find((f) => f.includes(`-${tarea}-`) && f.endsWith('.json'));
  if (!archivo) throw new Error(`El modo simulado no tiene salida para la tarea ${tarea}`);
  const datos: unknown = JSON.parse(readFileSync(join(SALIDAS, archivo), 'utf8'));
  const errores = validarSalida(tarea, datos);
  if (errores.length) throw new Error(`La salida simulada de ${tarea} no valida: ${errores.slice(0, 3).join('; ')}`);
  return { tarea, archivo, datos };
}
