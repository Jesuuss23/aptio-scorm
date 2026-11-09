import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { prisma, type PrismaClient } from '@aptio/db';

/** Acceso a PostgreSQL con el cliente compartido de @aptio/db. */
@Injectable()
export class BaseDatosService implements OnModuleDestroy {
  readonly cliente: PrismaClient = prisma;

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
    await this.cliente.$disconnect();
  }
}
