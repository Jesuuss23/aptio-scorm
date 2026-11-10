// HU-0405 y HU-1301 · Tareas de IA de texto: arma el prompt versionado de packages/ai/prompts, llama al proveedor,
// valida la salida contra el esquema de la tarea y reintenta hasta 2 veces con los errores (RN-04-2, CP-041).
// Nada se devuelve sin validar; el consumo de todos los intentos se acumula para registrar el costo aunque falle.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerSalidaSimulada, validarSalida } from './simulado.js';

const PROMPTS = fileURLToPath(new URL('../prompts/', import.meta.url));
/** Intentos totales: el primero y 2 reintentos con el error (CP-041). */
export const INTENTOS_MAXIMOS = 3;

export interface Consumo {
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLeidos: number;
  tokensCacheEscritos: number;
}

export interface RespuestaProveedor {
  texto: string;
  /** Modelo que respondió (puede diferir del pedido si actuó un modelo de respaldo). */
  modelo: string;
  consumo: Consumo;
}

export interface MensajeProveedor {
  rol: 'user' | 'assistant';
  texto: string;
}

export interface ProveedorTexto {
  /** anthropic | simulado */
  nombre: string;
  /** Modelo según la variable del prompt (ANTHROPIC_MODEL_TEXTO, …). */
  modeloPara(variable: string): string;
  completar(p: { tarea: string; modelo: string; sistema: string; mensajes: MensajeProveedor[]; maxTokens: number }): Promise<RespuestaProveedor>;
}

export interface PromptArmado {
  tarea: string;
  version: string;
  variableModelo: string;
  maxTokens: number;
  sistema: string;
  usuario: string;
}

export interface ResultadoTarea<T = unknown> {
  datos: T;
  proveedor: string;
  modelo: string;
  versionPrompt: string;
  intentos: number;
  consumo: Consumo;
  costoUsd: number;
  duracionMs: number;
}

/** La salida no validó tras los 3 intentos: la etapa queda en ERROR y nada se guarda (CP-041). */
export class SalidaNoValida extends Error {
  constructor(
    readonly tarea: string,
    readonly errores: string[],
    readonly registro: Omit<ResultadoTarea, 'datos'>,
  ) {
    super(`La salida de ${tarea} no validó tras ${registro.intentos} intentos: ${errores.slice(0, 3).join('; ')}`);
  }
}

// ---------- Prompts ----------

function bloque(md: string, titulo: string): string {
  const m = md.match(new RegExp(`## ${titulo}\\s*\\n+\`\`\`text\\n([\\s\\S]*?)\\n\`\`\``));
  if (!m) throw new Error(`El prompt no tiene la sección «${titulo}»`);
  return m[1]!;
}

function valor(variables: Record<string, unknown>, ruta: string): string {
  const v = ruta.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), variables);
  if (v === undefined || v === null || v === '') return '(no indicado)';
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

/** Lee `IA-xx.vN.md`, antepone el bloque común y llena las variables `{{ruta}}`. */
export function armarPrompt(tarea: string, variables: Record<string, unknown>, version = 'v1'): PromptArmado {
  const md = readFileSync(join(PROMPTS, `${tarea}.${version}.md`), 'utf8');
  const comun = readFileSync(join(PROMPTS, '_comun.md'), 'utf8').match(/```text\n([\s\S]*?)\n```/)?.[1] ?? '';
  const cabecera = (clave: string) => md.match(new RegExp(`^${clave}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  const llenar = (t: string) => t.replace('{{> _comun}}', comun).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, r: string) => valor(variables, r));
  return {
    tarea, version,
    variableModelo: cabecera('modelo') ?? 'ANTHROPIC_MODEL_TEXTO',
    maxTokens: Number(cabecera('max_tokens') ?? 8000),
    sistema: llenar(bloque(md, 'Sistema')),
    usuario: llenar(bloque(md, 'Usuario')),
  };
}

// ---------- Salida ----------

/** Extrae el JSON de la respuesta (tolera un bloque ```json alrededor). */
export function leerJson(texto: string): { datos?: unknown; error?: string } {
  const limpio = texto.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  try {
    return { datos: JSON.parse(limpio) };
  } catch (e) {
    return { error: `La respuesta no es JSON válido: ${(e as Error).message}` };
  }
}

/** Esquema primero; las reglas propias solo corren sobre una salida con la forma correcta. */
function revisar(tarea: string, datos: unknown, extra?: (datos: unknown) => string[]): string[] {
  // validarSalida acepta listas (salidas grabadas con varias respuestas); una respuesta debe ser un solo objeto.
  if (Array.isArray(datos)) return ['La respuesta debe ser un objeto JSON, no una lista'];
  const errores = validarSalida(tarea, datos);
  return errores.length ? errores : (extra?.(datos) ?? []);
}

const sumar = (a: Consumo, b: Consumo): Consumo => ({
  tokensEntrada: a.tokensEntrada + b.tokensEntrada,
  tokensSalida: a.tokensSalida + b.tokensSalida,
  tokensCacheLeidos: a.tokensCacheLeidos + b.tokensCacheLeidos,
  tokensCacheEscritos: a.tokensCacheEscritos + b.tokensCacheEscritos,
});
export const SIN_CONSUMO: Consumo = { tokensEntrada: 0, tokensSalida: 0, tokensCacheLeidos: 0, tokensCacheEscritos: 0 };

// ---------- Costos (HU-1301) ----------

/** USD por millón de tokens, tarifas de la API de Anthropic (revisadas el 2026-11-03). Ver docs/19-proveedores-y-licencias.md. */
export const TARIFAS: Record<string, { entrada: number; salida: number; cacheLectura: number }> = {
  'claude-opus-5-5': { entrada: 4, salida: 20, cacheLectura: 0.2 },
  'claude-opus-5': { entrada: 5, salida: 25, cacheLectura: 0.5 },
  'claude-opus-4-8': { entrada: 5, salida: 25, cacheLectura: 0.5 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10, cacheLectura: 0.1 },
  'claude-sonnet-5': { entrada: 2, salida: 10, cacheLectura: 0.2 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, cacheLectura: 0.01 },
};

/** Costo en USD de un consumo. La escritura de caché cuesta 1,25 veces la entrada. Un modelo sin tarifa conocida lanza error. */
export function costoTexto(modelo: string, c: Consumo): number {
  if (modelo.startsWith('simulado')) return 0;
  const t = TARIFAS[modelo];
  if (!t) throw new Error(`No hay tarifa registrada para el modelo ${modelo}`);
  const usd = (c.tokensEntrada * t.entrada + c.tokensCacheEscritos * t.entrada * 1.25 + c.tokensCacheLeidos * t.cacheLectura + c.tokensSalida * t.salida) / 1_000_000;
  return Math.round(usd * 10_000) / 10_000;
}

// ---------- Ejecución ----------

/**
 * Ejecuta una tarea de texto: prompt versionado → proveedor → JSON → esquema. Si no valida, reintenta con los errores
 * de Ajv hasta completar 3 intentos; si sigue sin validar lanza SalidaNoValida (con el consumo para registrar el costo).
 */
export async function ejecutarTarea<T = unknown>(
  proveedor: ProveedorTexto,
  tarea: string,
  variables: Record<string, unknown>,
  opciones: { version?: string; validarExtra?: (datos: unknown) => string[] } = {},
): Promise<ResultadoTarea<T>> {
  const prompt = armarPrompt(tarea, variables, opciones.version);
  const modeloPedido = proveedor.modeloPara(prompt.variableModelo);
  const inicio = Date.now();
  const mensajes: MensajeProveedor[] = [{ rol: 'user', texto: prompt.usuario }];
  let consumo = SIN_CONSUMO;
  let costoUsd = 0;
  let modelo = modeloPedido;
  let errores: string[] = [];

  for (let intento = 1; intento <= INTENTOS_MAXIMOS; intento++) {
    const r = await proveedor.completar({ tarea, modelo: modeloPedido, sistema: prompt.sistema, mensajes, maxTokens: prompt.maxTokens });
    modelo = r.modelo;
    consumo = sumar(consumo, r.consumo);
    costoUsd = Math.round((costoUsd + costoTexto(r.modelo, r.consumo)) * 10_000) / 10_000;
    const leido = leerJson(r.texto);
    errores = leido.error ? [leido.error] : revisar(tarea, leido.datos, opciones.validarExtra);
    const registro = { proveedor: proveedor.nombre, modelo, versionPrompt: `${tarea}.${prompt.version}`, intentos: intento, consumo, costoUsd, duracionMs: Date.now() - inicio };
    if (!errores.length) return { datos: leido.datos as T, ...registro };
    if (intento === INTENTOS_MAXIMOS) throw new SalidaNoValida(tarea, errores, registro);
    mensajes.push(
      { rol: 'assistant', texto: r.texto },
      {
        rol: 'user',
        texto: `Tu respuesta no valida contra el esquema de salida de ${tarea}. Corrige estos errores y responde de nuevo SOLO con el JSON completo:\n${errores.slice(0, 20).map((e) => `- ${e}`).join('\n')}`,
      },
    );
  }
  throw new Error('inalcanzable');
}

// ---------- Proveedor simulado ----------

/**
 * Ajusta la salida grabada del caso LOTO al pedido: de una lista por tema (IA-03) toma la del tema pedido o, si no
 * existe, la primera con el id del tema; de la lista por pantalla (IA-15, IA-07), la de la pantalla pedida; y usa el
 * documentoId pedido (IA-01).
 */
function ajustarAlPedido(datos: unknown, pedido: string): unknown {
  const temaId = pedido.match(/temaId = "([^"]+)"/)?.[1];
  const pantallaId = pedido.match(/pantallaId = "([^"]+)"/)?.[1];
  // IA-16 (HU-0504): una propuesta grabada por tipo de pedido.
  const tipoPedido = pedido.match(/tipoPedido = "([^"]+)"/)?.[1];
  if (Array.isArray(datos) && tipoPedido) return (datos as { tipo: string }[]).find((d) => d.tipo === tipoPedido) ?? datos[0];
  // IA-15 e IA-07: una salida por pantalla; si el caso no tiene esa pantalla, la primera del mismo tipo de actividad
  // (IA-07) o la primera, con el id pedido.
  if (Array.isArray(datos) && pantallaId) {
    const tipo = pedido.match(/tipo = "(INT-\d\d)"/)?.[1];
    const lista = datos as { pantallaId: string; tipo?: string }[];
    return lista.find((d) => d.pantallaId === pantallaId) ?? { ...(lista.find((d) => tipo && d.tipo === tipo) ?? lista[0]!), pantallaId };
  }
  if (Array.isArray(datos)) {
    const lista = datos as { temaId?: string; fragmentos?: { id: string }[] }[];
    const propia = lista.find((d) => d.temaId === temaId);
    if (propia || !temaId) return propia ?? lista[0];
    const base = lista[0]!;
    return { ...base, temaId, fragmentos: (base.fragmentos ?? []).map((f, i) => ({ ...f, id: `${temaId}-f${String(i + 1).padStart(2, '0')}` })) };
  }
  const documentoId = pedido.match(/documentoId = "([^"]+)"/)?.[1];
  if (documentoId && datos && typeof datos === 'object' && 'documentoId' in datos) return { ...datos, documentoId };
  return datos;
}

/**
 * Responde con las salidas grabadas del caso LOTO (modo simulado). `guion` permite a las pruebas forzar respuestas
 * (por ejemplo, una salida inválida) antes de la grabada.
 */
export function proveedorSimulado(guion: Partial<Record<string, string[]>> = {}): ProveedorTexto & { llamadas: { tarea: string; mensajes: MensajeProveedor[] }[] } {
  const llamadas: { tarea: string; mensajes: MensajeProveedor[] }[] = [];
  return {
    nombre: 'simulado',
    llamadas,
    modeloPara: () => 'simulado-loto',
    async completar({ tarea, mensajes }) {
      llamadas.push({ tarea, mensajes: mensajes.map((m) => ({ ...m })) });
      const forzada = guion[tarea]?.shift();
      const texto = forzada ?? JSON.stringify(ajustarAlPedido(leerSalidaSimulada(tarea).datos, mensajes[0]?.texto ?? ''));
      return { texto, modelo: 'simulado-loto', consumo: SIN_CONSUMO };
    },
  };
}
