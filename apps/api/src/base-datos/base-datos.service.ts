import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { prisma, type PrismaClient } from '@aptio/db';

/** Acceso a PostgreSQL con el cliente compartido de @aptio/db. */
@Injectable()
export class BaseDatosService implements OnModuleDestroy {
  readonly cliente: PrismaClient = prisma;
  /** Escrituras que siguen después de responder (HU-1701, auditoría del acceso cruzado); se esperan al cerrar. */
  private readonly pendientes = new Set<Promise<unknown>>();

  enSegundoPlano(tarea: Promise<unknown>): void {
    const p = tarea.catch(() => undefined).finally(() => this.pendientes.delete(p));
    this.pendientes.add(p);
  }

  /** true si la base responde a una consulta mínima. */
  async disponible(): Promise<boolean> {
    try {
      await this.cliente.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.pendientes]);
    await this.cliente.$disconnect();
  }
}
