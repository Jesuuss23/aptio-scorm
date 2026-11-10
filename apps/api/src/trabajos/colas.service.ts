import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { crearCola, type DatosTrabajo, type NombreCola } from '@aptio/colas';
import type { Queue } from 'bullmq';

/** Crea cada cola al primer uso, para que la API arranque aunque Redis aún no esté listo. */
@Injectable()
export class ColasService implements OnModuleDestroy {
  private readonly colas = new Map<NombreCola, Queue<DatosTrabajo>>();

  /** `jobId` permite volver a encolar el mismo trabajo (por ejemplo, al continuar una generación). */
  async encolar(cola: NombreCola, datos: DatosTrabajo, jobId = datos.trabajoId): Promise<void> {
    let q = this.colas.get(cola);
    if (!q) {
      q = crearCola(cola);
      this.colas.set(cola, q);
    }
    // El id del trabajo de BullMQ es el de TrabajoIA: encolar dos veces el mismo no lo duplica.
    await q.add(datos.tarea, datos, { jobId });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.colas.values()].map((q) => q.close()));
  }
}
