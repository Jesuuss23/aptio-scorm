import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { crearCola, type DatosTrabajo, type NombreCola } from '@aptio/colas';
import type { Queue } from 'bullmq';

/** Crea cada cola al primer uso, para que la API arranque aunque Redis aún no esté listo. */
@Injectable()
export class ColasService implements OnModuleDestroy {
  private readonly colas = new Map<NombreCola, Queue<DatosTrabajo>>();

  /** `jobId` permite volver a encolar el mismo trabajo (por ejemplo, al continuar una generación). */
  async encolar(cola: NombreCola, datos: DatosTrabajo, jobId = datos.trabajoId): Promise<void> {
    // El id del trabajo de BullMQ es el de TrabajoIA: encolar dos veces el mismo no lo duplica.
    await this.cola(cola).add(datos.tarea, datos, { jobId });
  }

  /**
   * HU-0503 · Encola con espera y reemplaza el pendiente del mismo `jobId`: varios guardados seguidos dejan un solo
   * trabajo, que corre `esperaMs` después del último (CP-051). Si el anterior ya está corriendo, el nuevo va detrás
   * con otro id (y ese segundo también se reemplaza), para que el último cambio siempre se procese.
   */
  async encolarConEspera(cola: NombreCola, datos: DatosTrabajo, jobId: string, esperaMs: number): Promise<string> {
    const q = this.cola(cola);
    let id = jobId;
    for (const candidato of [jobId, `${jobId}-tras`]) {
      id = candidato;
      const previo = await q.getJob(candidato);
      if (!previo) break;
      if ((await previo.getState()) === 'active') continue;
      await previo.remove();
      break;
    }
    await q.add(datos.tarea, datos, { jobId: id, delay: esperaMs });
    return id;
  }

  private cola(nombre: NombreCola): Queue<DatosTrabajo> {
    let q = this.colas.get(nombre);
    if (!q) {
      q = crearCola(nombre);
      this.colas.set(nombre, q);
    }
    return q;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.colas.values()].map((q) => q.close()));
  }
}
