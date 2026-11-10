// Apoyo de las pruebas de las etapas del generador: el manual LOTO, un proveedor «real» sobre las salidas grabadas y un
// escenario en PostgreSQL (organización, cliente con glosario, proyecto con el manual y una generación lista).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { type MensajeProveedor, type ProveedorTexto, proveedorSimulado } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { ETAPAS, type Etapa, TAREA_GENERAR } from '@aptio/schema/generacion';
import type { Redis } from 'ioredis';
import { crearGenerador, type EjecutorEtapa } from '../src/generar.js';

export const baseLista = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
export const AI = dirname(createRequire(import.meta.url).resolve('@aptio/ai/package.json'));
export const leerCaso = (archivo: string): unknown => JSON.parse(readFileSync(join(AI, 'casos/loto/salidas', archivo), 'utf8'));

/** El manual LOTO del caso de referencia: 30 páginas marcadas como [p. N]. */
export const PAGINAS = readFileSync(join(AI, 'casos/loto/entrada/manual-loto.md'), 'utf8')
  .split(/^\[p\. (\d+)\]\n/m).slice(1)
  .reduce<{ n: number; texto: string; escaneada: boolean }[]>((l, x, i, a) => (i % 2 ? l : [...l, { n: Number(x), texto: a[i + 1]!.trim(), escaneada: false }]), []);

const redis = { publish: async () => 1 } as unknown as Redis;
type Llamada = { tarea: string; mensajes: MensajeProveedor[] };

/** Proveedor «real» (no simulado) sobre las salidas grabadas, con consumo: activa las reglas propias de cada etapa. */
export function comoReal(guion: Partial<Record<string, string[]>> = {}, alLlamar?: (tarea: string) => Promise<void>) {
  const base = proveedorSimulado(guion);
  const p: ProveedorTexto & { llamadas: Llamada[] } = {
    nombre: 'anthropic', modeloPara: () => 'claude-opus-5-5', llamadas: base.llamadas,
    async completar(x) {
      await alLlamar?.(x.tarea);
      return { ...(await base.completar(x)), modelo: 'claude-opus-5-5', consumo: { tokensEntrada: 12_000, tokensSalida: 2_500, tokensCacheLeidos: 0, tokensCacheEscritos: 0 } };
    },
  };
  return p;
}

/** Datos de prueba en PostgreSQL; `crear` en beforeAll y `borrar` en afterAll. */
export function escenario(nombre: string) {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const e = { orgId: '', clienteId: '', usuarioId: '' };
  return {
    ids: e,
    async crear() {
      e.orgId = (await prisma.organizacion.create({ data: { nombre: `Org ${nombre}`, slug: `${nombre}-${sufijo}` } })).id;
      e.clienteId = (await prisma.cliente.create({ data: { organizacionId: e.orgId, nombre: 'Minera Andina', glosario: { create: [{ termino: 'LOTO', noTraducir: true }] } } })).id;
      e.usuarioId = (await prisma.usuario.create({ data: { nombre: 'di', email: `${nombre}-${sufijo}@prueba.test`, rol: 'DISENADOR_INSTRUCCIONAL', organizacionId: e.orgId } })).id;
    },
    async borrar() {
      await prisma.trabajoIA.deleteMany({ where: { organizacionId: e.orgId } });
      await prisma.proyecto.deleteMany({ where: { organizacionId: e.orgId } });
      await prisma.recurso.deleteMany({ where: { organizacionId: e.orgId } });
      await prisma.usuario.deleteMany({ where: { organizacionId: e.orgId } });
      await prisma.cliente.deleteMany({ where: { organizacionId: e.orgId } });
      await prisma.organizacion.delete({ where: { id: e.orgId } });
    },
    /** Proyecto con el manual LOTO (u otras páginas, o solo el tema si `null`) y una generación lista para correr. */
    async preparar(paginas: typeof PAGINAS | null = PAGINAS, parametros: Record<string, unknown> = { pantallas: 30, publico: 'Operarios de planta', porcentajeActividades: 40 }) {
      const p = await prisma.proyecto.create({
        data: { organizacionId: e.orgId, clienteId: e.clienteId, nombre: 'Bloqueo y etiquetado', creadoPorId: e.usuarioId, pantallasObjetivo: 30, publico: 'Operarios de planta', estado: 'GENERANDO' },
      });
      let materialId: string | null = null;
      if (paginas) {
        const r = await prisma.recurso.create({
          data: { organizacionId: e.orgId, proyectoId: p.id, tipo: 'DOCUMENTO', origen: 'CLIENTE', claveS3: `p/${p.id}`, mime: 'application/pdf', bytes: 1, hash: 'x', nombre: 'PETS-SEG-014 Bloqueo.pdf' },
        });
        materialId = (await prisma.materialFuente.create({ data: { proyectoId: p.id, tipo: 'PDF', recursoId: r.id, estado: 'listo', paginas } })).id;
      } else {
        await prisma.materialFuente.create({ data: { proyectoId: p.id, tipo: 'TEMA', tema: 'Uso de extintores', estado: 'listo' } });
      }
      const g = await prisma.generacion.create({
        data: { organizacionId: e.orgId, proyectoId: p.id, iniciadoPorId: e.usuarioId, parametros: parametros as object, etapas: { create: ETAPAS.map((etapa, i) => ({ etapa, orden: i + 1 })) } },
      });
      return { proyectoId: p.id, generacionId: g.id, materialId };
    },
    correr(generacionId: string, proveedor: ProveedorTexto, ejecutores: Partial<Record<Etapa, EjecutorEtapa>>) {
      return crearGenerador({ bd: prisma, redis, proveedor, ejecutores })({
        data: { trabajoId: generacionId, organizacionId: e.orgId, tarea: TAREA_GENERAR }, queueName: 'ia', updateProgress: async () => undefined,
      });
    },
  };
}

export const etapaDe = (generacionId: string, etapa: Etapa) => prisma.generacionEtapa.findFirstOrThrow({ where: { generacionId, etapa } });
export const conteo = async (generacionId: string) =>
  Object.fromEntries((await prisma.trabajoIA.groupBy({ by: ['tarea'], where: { generacionId }, _count: true })).map((x) => [x.tarea, x._count]));
