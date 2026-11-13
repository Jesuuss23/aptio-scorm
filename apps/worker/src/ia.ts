// HU-1301 · Toda tarea de IA queda en TrabajoIA con proveedor, modelo, versión del prompt, consumo, intentos y costo,
// también cuando falla (el consumo de los intentos fallidos se paga igual).
// HU-1304 · Antes de llamar lee la conexión de la organización para el tipo de la tarea (texto, pantallas, traducción
// o calidad): su modelo reemplaza al del entorno y su límite de gasto puede detener el trabajo (LIMITE_GASTO).
import { ejecutarTarea, type ProveedorTexto, type ResultadoTarea, SalidaNoValida, TARIFAS } from '@aptio/ai';
import type { PrismaClient } from '@aptio/db';
import { tipoDeTareaIA } from '@aptio/schema/conexiones';
import { vigilarLimite } from './conexiones.js';

export interface ContextoTrabajo {
  organizacionId: string;
  proyectoId?: string;
  generacionId?: string;
  /** HU-0504 · El TrabajoIA que ya creó la API al encolar; si falta, se crea uno. */
  trabajoId?: string;
}

export async function tareaRegistrada<T = unknown>(
  bd: PrismaClient,
  contexto: ContextoTrabajo,
  proveedor: ProveedorTexto,
  tarea: string,
  variables: Record<string, unknown>,
  opciones: Parameters<typeof ejecutarTarea>[3] = {},
): Promise<ResultadoTarea<T> & { trabajoId: string }> {
  const tipo = tipoDeTareaIA(tarea);
  const trabajo = contexto.trabajoId
    ? await bd.trabajoIA.update({ where: { id: contexto.trabajoId, organizacionId: contexto.organizacionId }, data: { proveedor: proveedor.nombre, tipo, estado: 'EN_CURSO' } })
    : await bd.trabajoIA.create({
      data: {
        organizacionId: contexto.organizacionId,
        ...(contexto.proyectoId ? { proyectoId: contexto.proyectoId } : {}),
        ...(contexto.generacionId ? { generacionId: contexto.generacionId } : {}),
        tarea, tipo, proveedor: proveedor.nombre, modelo: '-', estado: 'EN_CURSO',
      },
    });
  const guardar = (r: Omit<ResultadoTarea, 'datos'>, estado: 'COMPLETADO' | 'ERROR', error: string | null) =>
    bd.trabajoIA.update({
      where: { id: trabajo.id },
      data: {
        estado, error, proveedor: r.proveedor, modelo: r.modelo, versionPrompt: r.versionPrompt, intentos: r.intentos,
        tokensEntrada: r.consumo.tokensEntrada + r.consumo.tokensCacheLeidos + r.consumo.tokensCacheEscritos,
        tokensSalida: r.consumo.tokensSalida, costoUsd: r.costoUsd, duracionMs: r.duracionMs,
      },
    });
  try {
    const conexion = await vigilarLimite(bd, contexto.organizacionId, tipo, contexto);
    const r = await ejecutarTarea<T>(conModeloDe(proveedor, conexion?.proveedor === proveedor.nombre ? conexion.modelo : null), tarea, variables, opciones);
    await guardar(r, 'COMPLETADO', null);
    return { ...r, trabajoId: trabajo.id };
  } catch (e) {
    if (e instanceof SalidaNoValida) await guardar(e.registro, 'ERROR', e.message);
    else await bd.trabajoIA.update({ where: { id: trabajo.id }, data: { estado: 'ERROR', error: e instanceof Error ? e.message : String(e) } });
    throw e;
  }
}

/**
 * El proveedor con el modelo de la conexión en lugar del de la variable del prompt. El modo simulado no cambia: no
 * llama a nadie. Un modelo sin tarifa registrada se rechaza antes de gastar (el costo no se podría calcular).
 */
export function conModeloDe(proveedor: ProveedorTexto, modelo: string | null | undefined): ProveedorTexto {
  if (!modelo || proveedor.nombre === 'simulado') return proveedor;
  if (!TARIFAS[modelo]) throw new Error(`No hay tarifa registrada para el modelo ${modelo}: elige otro en Empresa › Conexiones IA`);
  return { ...proveedor, modeloPara: () => modelo };
}
