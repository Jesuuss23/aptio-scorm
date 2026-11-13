// HU-1304 · Conexión por tarea leída en caliente: cada trabajo lee la ConfigProveedor de su organización al empezar,
// así un cambio en Empresa › Conexiones IA aplica al siguiente trabajo sin reiniciar el worker (CP-099, RN-13-2).
// Sin conexión guardada se usa lo del entorno. El límite de gasto mensual detiene el trabajo antes de llamar al
// proveedor (CP-100, RN-04-7): queda en error «LIMITE_GASTO», con su auditoría, y se continúa al subir el límite.
import type { ConfigProveedor, PrismaClient } from '@aptio/db';
import { definicionConexion, inicioMesLima, mensajeLimiteGasto, type TareaConexion } from '@aptio/schema/conexiones';
import { avisarSinBloquear, type EnviarCorreo } from './correo.js';

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
 * HU-1403 · Cómo se avisa por correo que una tarea llegó a su límite (REQ-057, cierra SUP-148). El worker lo fija al
 * arrancar con el SMTP del entorno; sin configurar no se envía nada. Devuelve la promesa del último aviso para las pruebas.
 */
let enviarAviso: EnviarCorreo | null = null;
let ultimoAviso: Promise<void> = Promise.resolve();
export function configurarAvisoLimite(enviar: EnviarCorreo | null): void {
  enviarAviso = enviar;
}
export const avisoLimitePendiente = () => ultimoAviso;

/** Un correo a cada administración activa de la organización, solo la primera vez que se llega a ese límite en el mes. */
async function avisarLimite(bd: PrismaClient, organizacionId: string, nombreTarea: string, gasto: number, limite: number) {
  if (!enviarAviso) return;
  const admins = await bd.usuario.findMany({ where: { organizacionId, rol: 'ADMINISTRADOR', activo: true }, select: { email: true } });
  const mensaje = mensajeLimiteGasto(nombreTarea, gasto, limite).replace(/^LIMITE_GASTO: /, '');
  ultimoAviso = avisarSinBloquear(enviarAviso, admins.map((a) => ({
    para: a.email,
    asunto: `Aptio SCORM · «${nombreTarea}» llegó a su límite de gasto del mes`,
    texto: `Hola:\n\n${mensaje.charAt(0).toUpperCase()}${mensaje.slice(1)}\n\nMientras tanto, los trabajos de esa tarea se detienen antes de llamar al proveedor, sin gastar más. Cuando subas el límite, vuelve al proyecto y pulsa «Continuar» en Producción.\n\nEste aviso llega una sola vez por límite y por mes.`,
  })), 'el límite de gasto');
}

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
  const nombreTarea = definicionConexion(tarea).nombre;
  const mensaje = mensajeLimiteGasto(nombreTarea, gasto, limite);
  // Solo el primer tope del mes con este límite avisa por correo: los trabajos siguientes se detienen en silencio.
  const yaAvisado = await bd.auditoria.count({
    where: { organizacionId, accion: 'LIMITE_GASTO_ALCANZADO', entidadId: conexion.id, creadoEn: { gte: inicioMesLima(ahora) }, datos: { path: ['limiteUsd'], equals: limite } },
  });
  await bd.auditoria.create({
    data: {
      organizacionId, accion: 'LIMITE_GASTO_ALCANZADO', entidad: 'ConfigProveedor', entidadId: conexion.id,
      datos: { tarea, gastoUsd: gasto, limiteUsd: limite, ...(contexto.proyectoId ? { proyectoId: contexto.proyectoId } : {}), ...(contexto.generacionId ? { generacionId: contexto.generacionId } : {}) },
    },
  });
  if (!yaAvisado) await avisarLimite(bd, organizacionId, nombreTarea, gasto, limite).catch((e: unknown) => console.error(`[correo] aviso de límite: ${String(e)}`));
  throw new LimiteGastoAlcanzado(mensaje);
}
