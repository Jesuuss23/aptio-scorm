// HU-1304 · Conexión por tarea leída en caliente: cada trabajo lee la ConfigProveedor de su organización al empezar,
// así un cambio en Empresa › Conexiones IA aplica al siguiente trabajo sin reiniciar el worker (CP-099, RN-13-2).
// Sin conexión guardada se usa lo del entorno. El límite de gasto mensual detiene el trabajo antes de llamar al
// proveedor (CP-100, RN-04-7): queda en error «LIMITE_GASTO», con su auditoría, y se continúa al subir el límite.
import type { ConfigProveedor, PrismaClient } from '@aptio/db';
import { definicionConexion, inicioMesLima, mensajeLimiteGasto, type TareaConexion } from '@aptio/schema/conexiones';

/** La conexión activa de la organización para la tarea; null si no configuró nada (se usa el entorno). */
export async function conexionDe(bd: PrismaClient, organizacionId: string, tarea: TareaConexion): Promise<ConfigProveedor | null> {
  return bd.configProveedor.findFirst({ where: { organizacionId, tarea, activo: true } });
}

/** USD gastados por la organización en la tarea desde el día 1 del mes de Lima. */
export async function gastoDelMes(bd: PrismaClient, organizacionId: string, tarea: TareaConexion, ahora = new Date()): Promise<number> {
  const r = await bd.trabajoIA.aggregate({ where: { organizacionId, tipo: tarea, creadoEn: { gte: inicioMesLima(ahora) } }, _sum: { costoUsd: true } });
  return Number(r._sum.costoUsd ?? 0);
}

export class LimiteGastoAlcanzado extends Error {}

/**
 * Lanza LimiteGastoAlcanzado (y lo audita) si la tarea ya gastó su límite del mes. Devuelve la conexión para no
 * leerla dos veces.
 */
export async function vigilarLimite(
  bd: PrismaClient, organizacionId: string, tarea: TareaConexion, contexto: { proyectoId?: string | null; generacionId?: string | null } = {}, ahora = new Date(),
): Promise<ConfigProveedor | null> {
  const conexion = await conexionDe(bd, organizacionId, tarea);
  if (conexion?.limiteGastoMensualUsd == null) return conexion;
  const limite = Number(conexion.limiteGastoMensualUsd);
  const gasto = await gastoDelMes(bd, organizacionId, tarea, ahora);
  if (gasto < limite) return conexion;
  const mensaje = mensajeLimiteGasto(definicionConexion(tarea).nombre, gasto, limite);
  await bd.auditoria.create({
    data: {
      organizacionId, accion: 'LIMITE_GASTO_ALCANZADO', entidad: 'ConfigProveedor', entidadId: conexion.id,
      datos: { tarea, gastoUsd: gasto, limiteUsd: limite, ...(contexto.proyectoId ? { proyectoId: contexto.proyectoId } : {}), ...(contexto.generacionId ? { generacionId: contexto.generacionId } : {}) },
    },
  });
  throw new LimiteGastoAlcanzado(mensaje);
}
