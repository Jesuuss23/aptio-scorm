// HU-1202 · Cola `export`, tarea EXPORTAR: arma el paquete SCORM 1.2 de una Exportacion que creó la API. Lee la versión
// del curso ligada a la exportación (RN-12-4), los archivos de sus recursos desde el almacenamiento y el kit del cliente;
// arma el ZIP con @aptio/exporters y lo guarda cifrado como recurso PAQUETE. El informe lista los recursos que faltan
// (advertencias, no bloquean). Si algo falla, la exportación queda en ERROR con el motivo.
// HU-1203 · Con formato HTML arma la carpeta autocontenida (sin manifiesto ni LMS) y la nombra `<proyecto>-html-v<n>.zip`.
// HU-1406 · Los créditos de IA salen de la procedencia de los recursos que lleva el paquete y del nombre de la
// organización que los revisó; el paquete mismo se registra con proveedor `aptio` (REQ-062, SUP-64).
// HU-0804 · Con `modoIdioma: 'mismo-paquete'` el paquete lleva español e inglés; los créditos van en español e incluyen
// los recursos de los dos idiomas.
// HU-1205 · Con formato KIT_GAMIFICACION arma el kit para el LMS del cliente (insignias SVG y PNG, plan y guía del LMS de
// `perfilLms`) con la paleta, la tipografía y el logo del kit de marca, y lo nombra `<proyecto>-kit-<lms>-v<n>.zip`.
import { createHash, randomUUID } from 'node:crypto';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import { armarCreditos, codigoReproductor, construirHtml, construirKitGamificacion, construirScorm12, LMS_KIT, type LmsKit } from '@aptio/exporters';
import type { CursoReproductor, KitReproductor } from '@aptio/player';
import type { Redis } from 'ioredis';
import { pngDesdeSvg } from './insignias.js';
import { conProcedencia, procedenciaPaquete } from './procedencia.js';
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
  /** HU-1205 · SVG → PNG de las insignias; por defecto, @resvg/resvg-js. */
  png?: (svg: string, lado: number) => Uint8Array | Promise<Uint8Array>;
}

/**
 * Nombre del archivo que se descarga, sin tildes ni espacios: `<proyecto>-scorm12-v<versión>.zip`,
 * `<proyecto>-html-v<versión>.zip` o, con el kit de gamificación, `<proyecto>-kit-<lms>-v<versión>.zip`.
 */
export function nombrePaquete(proyecto: string, version: number, formato: string = 'SCORM12', lms = 'generico'): string {
  const base = proyecto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'curso';
  const tipo = formato === 'HTML' ? 'html' : formato === 'KIT_GAMIFICACION' ? `kit-${lms}` : 'scorm12';
  return `${base}-${tipo}-v${version}.zip`;
}

const esLmsKit = (x: string): x is LmsKit => (LMS_KIT as readonly string[]).includes(x);

export function crearExportador({ bd, redis, leer, subir, reproductor = codigoReproductor, png = pngDesdeSvg }: DependenciasExportar) {
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
      if (exp.formato === 'KIT_GAMIFICACION') {
        // HU-1205 · Kit de gamificación: insignias con la marca del cliente, plan y guía del LMS elegido.
        const proyecto = exp.curso.proyecto;
        const k = proyecto.cliente.kit;
        let logo: { datos: Uint8Array; mime: string } | null = null;
        if (k?.logoRecursoId) {
          const r = await bd.recurso.findFirst({ where: { id: k.logoRecursoId, organizacionId }, select: { claveS3: true, mime: true } });
          if (r) logo = { datos: await leer(r.claveS3), mime: r.mime };
        }
        const lms = esLmsKit(exp.perfilLms) ? exp.perfilLms : 'generico';
        const idioma = exp.modoIdioma === 'mismo-paquete' ? 'ambos' : curso.idiomas[0] === 'en' ? 'en' : 'es';
        const organizacion = await bd.organizacion.findUnique({ where: { id: organizacionId }, select: { nombre: true } });
        await emitir('EN_CURSO', 30);
        const kitArmado = await construirKitGamificacion({
          curso, lms, idioma, png, proyecto: proyecto.nombre, organizacion: organizacion?.nombre ?? '',
          marca: { nombreCliente: proyecto.cliente.nombre, paleta: (k?.paleta ?? null) as Record<string, string> | null, tipografias: (k?.tipografias ?? null) as { titulos?: string } | null, logo },
        });
        const recursoId = randomUUID();
        const claveS3 = `org/${organizacionId}/${proyecto.clienteId}/${recursoId}`;
        await subir(claveS3, kitArmado.zip, MIME_ZIP);
        const informe = { errores: [] as string[], advertencias: kitArmado.advertencias, idioma, lms, insignias: kitArmado.plan.insignias.length, archivos: kitArmado.archivos.length };
        await bd.$transaction([
          bd.recurso.create({
            data: conProcedencia({
              id: recursoId, organizacionId, clienteId: proyecto.clienteId, proyectoId: proyecto.id, tipo: 'PAQUETE', origen: 'GENERADO',
              claveS3, mime: MIME_ZIP, bytes: BigInt(kitArmado.zip.byteLength), hash: createHash('sha256').update(kitArmado.zip).digest('hex'),
              nombre: nombrePaquete(proyecto.nombre, exp.versionCurso, exp.formato, lms), ...procedenciaPaquete(exp.formato),
            }),
          }),
          bd.exportacion.update({ where: { id: exp.id }, data: { estado: 'COMPLETADO', bytes: BigInt(kitArmado.zip.byteLength), informe: informe as Prisma.InputJsonValue, recursoId, motivo: null } }),
        ]);
        await emitir('COMPLETADO', 100);
        return { recursoId };
      }

      // Los recursos del curso son filas de Recurso (uuid); el material del cliente (documento) nunca va en el paquete.
      const ids = curso.recursos.filter((r) => r.tipo !== 'documento' && UUID.test(r.id)).map((r) => r.id);
      const filas = await bd.recurso.findMany({ where: { id: { in: ids }, organizacionId }, select: { id: true, nombre: true, claveS3: true, tipo: true, proveedor: true, modelo: true, licencia: true } });
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
      // Créditos con los recursos de los idiomas que van en el paquete (los de otro idioma no entran, SUP-49).
      const bilingue = exp.modoIdioma === 'mismo-paquete';
      const idioma = bilingue ? 'es' : curso.idiomas[0] ?? 'es';
      const idiomas: string[] = bilingue ? ['es', 'en'] : [idioma];
      const delIdioma = new Set(curso.recursos.filter((r) => { const i = (r as { idioma?: string }).idioma; return !i || idiomas.includes(i); }).map((r) => r.id));
      const organizacion = await bd.organizacion.findUnique({ where: { id: organizacionId }, select: { nombre: true } });
      const creditos = armarCreditos(filas.filter((f) => delIdioma.has(f.id)), organizacion?.nombre ?? '', idioma);
      const comun = { curso, recursos, reproductor: await reproductor(), creditos, modoIdioma: bilingue ? 'mismo-paquete' as const : 'unico' as const, ...(kit ? { kit } : {}) };
      const paquete = exp.formato === 'HTML' ? await construirHtml(comun) : await construirScorm12({ ...comun, incluirDiagnostico: exp.incluirDiagnostico });

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
        idiomas: paquete.idiomas,
        archivos: paquete.archivos.length,
      };
      await bd.$transaction([
        bd.recurso.create({
          data: conProcedencia({
            id: recursoId, organizacionId, clienteId: proyecto.clienteId, proyectoId: proyecto.id, tipo: 'PAQUETE', origen: 'GENERADO',
            claveS3, mime: MIME_ZIP, bytes: BigInt(paquete.zip.byteLength), hash: createHash('sha256').update(paquete.zip).digest('hex'),
            nombre: nombrePaquete(proyecto.nombre, exp.versionCurso, exp.formato), ...procedenciaPaquete(exp.formato),
          }),
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
