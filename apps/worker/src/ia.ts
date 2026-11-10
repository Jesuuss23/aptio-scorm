// HU-1301 · Toda tarea de IA queda en TrabajoIA con proveedor, modelo, versión del prompt, consumo, intentos y costo,
// también cuando falla (el consumo de los intentos fallidos se paga igual).
import { ejecutarTarea, type ProveedorTexto, type ResultadoTarea, SalidaNoValida } from '@aptio/ai';
import type { PrismaClient } from '@aptio/db';

export interface ContextoTrabajo {
  organizacionId: string;
  proyectoId?: string;
  generacionId?: string;
}

export async function tareaRegistrada<T = unknown>(
  bd: PrismaClient,
  contexto: ContextoTrabajo,
  proveedor: ProveedorTexto,
  tarea: string,
  variables: Record<string, unknown>,
  opciones: Parameters<typeof ejecutarTarea>[3] = {},
): Promise<ResultadoTarea<T> & { trabajoId: string }> {
  const trabajo = await bd.trabajoIA.create({
    data: {
      organizacionId: contexto.organizacionId,
      ...(contexto.proyectoId ? { proyectoId: contexto.proyectoId } : {}),
      ...(contexto.generacionId ? { generacionId: contexto.generacionId } : {}),
      tarea, tipo: 'TEXTO', proveedor: proveedor.nombre, modelo: '-', estado: 'EN_CURSO',
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
    const r = await ejecutarTarea<T>(proveedor, tarea, variables, opciones);
    await guardar(r, 'COMPLETADO', null);
    return { ...r, trabajoId: trabajo.id };
  } catch (e) {
    if (e instanceof SalidaNoValida) await guardar(e.registro, 'ERROR', e.message);
    else await bd.trabajoIA.update({ where: { id: trabajo.id }, data: { estado: 'ERROR', error: e instanceof Error ? e.message : String(e) } });
    throw e;
  }
}
