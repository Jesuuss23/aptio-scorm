/**
 * HU-1701 · Auditoría del acceso a otra organización (CP-139, RN-18-1). Cuando una petición de un usuario de una
 * organización termina en 404, se buscan los ids de la ruta (`:id`, `:proyectoId`, `:clienteId`, `:cursoId`…) en las
 * tablas de las organizaciones. Si alguno es de otra organización, queda `ACCESO_OTRA_ORGANIZACION` en la auditoría de
 * plataforma (`organizacionId` null, la ve solo el superadmin) con el usuario, las dos organizaciones, el método, la
 * ruta y los recursos.
 *
 * La respuesta no cambia: es el mismo 404 de un id que no existe, y se registra después de enviarla para que tampoco
 * el tiempo de respuesta delate que el id existe en otra organización. Un fallo al registrar no afecta la respuesta.
 */
import { Logger } from '@nestjs/common';
import { esUuid, organizacionDeIds, type PrismaClient } from '@aptio/db';
import type { Request } from 'express';
import type { UsuarioSesion } from './roles.js';

export const ACCION_ACCESO_OTRA_ORGANIZACION = 'ACCESO_OTRA_ORGANIZACION';

/** Los valores de los parámetros de ruta que son UUID (sin repetir). */
export function idsDeRuta(params: Request['params'] | undefined): string[] {
  return [...new Set(Object.values(params ?? {}).filter(esUuid).map((v) => v.toLowerCase()))];
}

export class AuditorAccesoCruzado {
  private readonly log = new Logger('AccesoCruzado');

  /** `enSegundoPlano` guarda la tarea para esperarla al cerrar la app (así no corre después de desconectar la base). */
  constructor(private readonly bd: PrismaClient, private readonly enSegundoPlano: (tarea: Promise<unknown>) => void = () => {}) {}

  /** Lanza `revisar` sin esperar la respuesta. */
  despues(req: Request & { usuario?: UsuarioSesion }): void {
    this.enSegundoPlano(this.revisar(req));
  }

  /** Registra el acceso si algún id de la ruta es de otra organización. Devuelve si lo registró. */
  async revisar(req: Request & { usuario?: UsuarioSesion }): Promise<boolean> {
    const u = req.usuario;
    if (!u?.organizacionId) return false;
    const ids = idsDeRuta(req.params);
    if (ids.length === 0) return false;
    try {
      const ajenos = (await organizacionDeIds(this.bd, ids)).filter((x) => x.organizacionId !== u.organizacionId);
      if (ajenos.length === 0) return false;
      const [primero] = ajenos;
      await this.bd.auditoria.create({
        data: {
          organizacionId: null,
          usuarioId: u.id,
          accion: ACCION_ACCESO_OTRA_ORGANIZACION,
          entidad: primero!.entidad,
          entidadId: primero!.id,
          datos: {
            usuarioId: u.id,
            rol: u.rol,
            organizacionOrigen: u.organizacionId,
            organizacionPropietaria: primero!.organizacionId,
            metodo: req.method,
            ruta: req.originalUrl.split('?')[0] ?? req.originalUrl,
            recursos: ajenos.map((x) => ({ entidad: x.entidad, id: x.id, organizacionId: x.organizacionId })),
          },
        },
      });
      return true;
    } catch (e) {
      this.log.error(`No se pudo auditar el acceso cruzado: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
}
