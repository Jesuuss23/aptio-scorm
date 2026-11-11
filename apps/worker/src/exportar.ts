// HU-1202 · Cola `export`, tarea EXPORTAR: arma el paquete SCORM 1.2 de una Exportacion que creó la API. Lee la versión
// del curso ligada a la exportación (RN-12-4), los archivos de sus recursos desde el almacenamiento y el kit del cliente;
// arma el ZIP con @aptio/exporters y lo guarda cifrado como recurso PAQUETE. El informe lista los recursos que faltan
// (advertencias, no bloquean). Si algo falla, la exportación queda en ERROR con el motivo.
import { createHash, randomUUID } from 'node:crypto';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import { codigoReproductor, construirScorm12 } from '@aptio/exporters';
import type { CursoReproductor, KitReproductor } from '@aptio/player';
import type { Redis } from 'ioredis';
import type { TrabajoEnCola } from './procesar.js';

export const MIME_ZIP = 'application/zip';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DependenciasExportar {
  bd: PrismaClient;
  redis: Redis;
  leer: (clave: string) => Promise<Uint8Array>;
  subir: (clave: string, cuerpo: Uint8Array, mime: string) => Promise<void>;
  /** El reproductor empaquetado; por defecto se arma una vez por proceso. */
  reproductor?: () => Promise<string>;
}

/** Nombre del archivo que se descarga: `<proyecto>-scorm12-v<versión>.zip`, sin tildes ni espacios. */
export function nombrePaquete(proyecto: string, version: number): string {
  const base = proyecto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'curso';
  return `${base}-scorm12-v${version}.zip`;
}

export function crearExportador({ bd, redis, leer, subir, reproductor = codigoReproductor }: DependenciasExportar) {
  return async function exportar(trabajo: TrabajoEnCola): Promise<{ recursoId: string }> {
    const { trabajoId: exportacionId, organizacionId, tarea } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, { tipo: 'estado', trabajoId: exportacionId, organizacionId, cola: 'export', tarea, estado, progreso, ...(mensaje ? { mensaje } : {}), en: new Date().toISOString() });

    // Siempre con la organización del trabajo: nunca se exporta el curso de otra.
    const exp = await bd.exportacion.findFirst({
      where: { id: exportacionId, organizacionId },
      include: { curso: { include: { proyecto: { include: { cliente: { include: { kit: true } } } } } } },
    });
    if (!exp) throw new Error(`La exportación ${exportacionId} no existe en la organización`);
    try {
      await bd.exportacion.update({ where: { id: exp.id }, data: { estado: 'EN_CURSO' } });
      await emitir('EN_CURSO', 0);

      const version = await bd.cursoVersion.findUnique({ where: { cursoId_version: { cursoId: exp.cursoId, version: exp.versionCurso } } });
      const documento = version?.documento ?? (exp.curso.version === exp.versionCurso ? exp.curso.documento : null);
      if (!documento) throw new Error(`No se encontró la versión ${exp.versionCurso} del curso`);
      const curso = documento as unknown as CursoReproductor;

      // Los recursos del curso son filas de Recurso (uuid); el material del cliente (documento) nunca va en el paquete.
      const ids = curso.recursos.filter((r) => r.tipo !== 'documento' && UUID.test(r.id)).map((r) => r.id);
      const filas = await bd.recurso.findMany({ where: { id: { in: ids }, organizacionId }, select: { id: true, nombre: true, claveS3: true } });
      const recursos = await Promise.all(filas.map(async (f) => {
        try {
          return { id: f.id, nombre: f.nombre, datos: await leer(f.claveS3) };
        } catch (e) {
          throw new Error(`No se pudo leer el recurso «${f.nombre}»: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        }
      }));
      await emitir('EN_CURSO', 50);

      const k = exp.curso.proyecto.cliente.kit;
      const kit: KitReproductor | undefined = k
        ? { paleta: k.paleta as KitReproductor['paleta'] & object, tipografias: k.tipografias as KitReproductor['tipografias'] & object, personaje: (k.personaje as { nombre?: string } | null)?.nombre ?? null }
        : undefined;
      const paquete = await construirScorm12({ curso, recursos, reproductor: await reproductor(), ...(kit ? { kit } : {}) });

      const proyecto = exp.curso.proyecto;
      const recursoId = randomUUID();
      const claveS3 = `org/${organizacionId}/${proyecto.clienteId}/${recursoId}`;
      await subir(claveS3, paquete.zip, MIME_ZIP);
      const nombres = new Map(curso.recursos.map((r) => [r.id, r.nombre]));
      const informe = {
        errores: [] as string[],
        advertencias: paquete.faltantes.map((id) => `Falta el archivo de «${nombres.get(id) ?? id}»: el paquete muestra su texto alternativo.`),
        recursosFaltantes: paquete.faltantes,
        idioma: paquete.idioma,
        archivos: paquete.archivos.length,
      };
      await bd.$transaction([
        bd.recurso.create({
          data: {
            id: recursoId, organizacionId, clienteId: proyecto.clienteId, proyectoId: proyecto.id, tipo: 'PAQUETE', origen: 'GENERADO',
            claveS3, mime: MIME_ZIP, bytes: BigInt(paquete.zip.byteLength), hash: createHash('sha256').update(paquete.zip).digest('hex'),
            nombre: nombrePaquete(proyecto.nombre, exp.versionCurso), licencia: 'Paquete generado por Aptio SCORM',
          },
        }),
        bd.exportacion.update({
          where: { id: exp.id },
          data: { estado: 'COMPLETADO', bytes: BigInt(paquete.zip.byteLength), informe: informe as Prisma.InputJsonValue, recursoId, motivo: null },
        }),
      ]);
      await emitir('COMPLETADO', 100);
      return { recursoId };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await bd.exportacion.update({ where: { id: exp.id }, data: { estado: 'ERROR', motivo: mensaje } });
      await emitir('ERROR', 0, mensaje);
      throw e;
    }
  };
}
