/**
 * HU-1602 · Cola `crm`: envía un lead a HubSpot, Pipedrive, Zoho o el webhook firmado (REQ-075, RN-17-2). Cada trabajo
 * es un `LeadEnvio`; manda el lead como está al momento del envío (alta o actualización por correo). Si no entra, se
 * reintenta 3 veces con espera creciente (30 s, 2 min, 8 min) y al final queda en «error» con el motivo (CP-129). Un
 * error que no cambia al repetir (falta la clave, el CRM rechazó los datos) termina en el primer intento.
 */
import type { PrismaClient } from '@aptio/db';
import { COLA_CRM, type DatosEnvioCrm, ESPERAS_CRM_MS, esperaCrm, INTENTOS_CRM } from '@aptio/colas';
import { esTipoCrm, mapeoDe, motivoSeguro, NOMBRE_CRM, tieneMapeo } from '@aptio/schema/crm';
import { type DependenciasCrm, enviarACrm, ErrorCrm } from '@aptio/schema/crm-envio';
import { type ConnectionOptions, UnrecoverableError, Worker } from 'bullmq';

export interface ResultadoEnvioCrm { estado: 'enviado' | 'omitido'; idExterno?: string | null }

/**
 * Un intento de envío. `intento` es el número de este intento (1 a `maximo`). Si falla y quedan reintentos, el envío
 * sigue «pendiente» con el motivo del último error y se lanza el error para que la cola reintente; si es el último o
 * el error no se arregla repitiendo, queda «error» y se lanza un `ErrorCrm` no reintentable.
 */
export async function procesarEnvioCrm(bd: PrismaClient, datos: DatosEnvioCrm, intento: { numero: number; maximo: number }, deps: DependenciasCrm = {}): Promise<ResultadoEnvioCrm> {
  const envio = await bd.leadEnvio.findUnique({ where: { id: datos.envioId }, include: { lead: true, conexion: true } });
  if (!envio || !esTipoCrm(envio.conexion.tipo)) return { estado: 'omitido' };
  const tipo = envio.conexion.tipo;
  const nombre = NOMBRE_CRM[tipo];
  try {
    if (!envio.conexion.activa) throw new ErrorCrm(`La conexión con ${nombre} se desactivó antes del envío`, false);
    const r = await enviarACrm({
      tipo, evento: datos.evento, entrega: datos.entrega, lead: envio.lead,
      ...(tieneMapeo(tipo) ? { mapeo: mapeoDe(tipo, envio.conexion.mapeo) } : { url: envio.conexion.url, secreto: envio.conexion.secreto }),
    }, deps);
    await bd.leadEnvio.update({ where: { id: envio.id }, data: { estado: 'enviado', intentos: { increment: 1 }, motivo: null, idExterno: r.idExterno ?? envio.idExterno, enviadoEn: (deps.ahora ?? (() => new Date()))() } });
    return { estado: 'enviado', idExterno: r.idExterno };
  } catch (e) {
    const motivo = e instanceof ErrorCrm ? e.message : motivoSeguro(`No se pudo enviar a ${nombre}: ${e instanceof Error ? e.message : String(e)}`, [envio.conexion.secreto]);
    const final = !(e instanceof ErrorCrm && e.reintentable) || intento.numero >= intento.maximo;
    await bd.leadEnvio.update({ where: { id: envio.id }, data: { estado: final ? 'error' : 'pendiente', intentos: { increment: 1 }, motivo } });
    throw new ErrorCrm(motivo, !final);
  }
}

/** El trabajador de la cola `crm`. Las pruebas acortan las esperas; producción usa 30 s, 2 min y 8 min. */
export function crearTrabajadorCrm(bd: PrismaClient, opciones: { connection: ConnectionOptions; prefix: string; esperas?: readonly number[]; deps?: DependenciasCrm; concurrencia?: number }): Worker<DatosEnvioCrm> {
  const esperas = opciones.esperas ?? ESPERAS_CRM_MS;
  return new Worker<DatosEnvioCrm>(
    COLA_CRM,
    async (job) => {
      const maximo = job.opts.attempts ?? INTENTOS_CRM;
      try {
        return await procesarEnvioCrm(bd, job.data, { numero: job.attemptsMade + 1, maximo }, opciones.deps);
      } catch (e) {
        // Sin reintentos que sirvan: BullMQ no vuelve a intentarlo.
        if (e instanceof ErrorCrm && !e.reintentable) throw new UnrecoverableError(e.message);
        throw e;
      }
    },
    { connection: opciones.connection, prefix: opciones.prefix, concurrency: opciones.concurrencia ?? 4, settings: { backoffStrategy: (hechos: number) => esperaCrm(hechos, esperas) } },
  );
}
