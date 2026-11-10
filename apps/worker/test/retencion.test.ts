// HU-1404 · CP-104: borrado programado de documentos del cliente, contra PostgreSQL y LocalStack reales.
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { hashearClave, prisma } from '@aptio/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarDocumentosVencidos } from '../src/retencion.js';

const endpoint = process.env.AWS_ENDPOINT ?? 'http://localhost:9000';
const hayS3 = await fetch(`${endpoint}/_localstack/health`).then((r) => r.ok).catch(() => false);
const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const almacen = new Almacen({
  ...configDesdeEnv({ AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', ...process.env, AWS_ENDPOINT: endpoint }),
  bucket: 'aptio-pruebas-worker',
});
const DIA = 24 * 60 * 60 * 1000;

describe.skipIf((!hayS3 || !hayBase) && !process.env.CI)('borrado programado de documentos (CP-104)', () => {
  const sufijo = Math.random().toString(36).slice(2, 8);
  let orgId: string;
  let proyectoId: string;
  const claves = { documento: `pruebas/${sufijo}/loto.pdf`, vigente: `pruebas/${sufijo}/vigente.pdf`, generado: `pruebas/${sufijo}/ilustracion.png` };

  beforeAll(async () => {
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org retención', slug: `retencion-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera', retencionDocumentosDias: 180 } });
    const autor = await prisma.usuario.create({
      data: { nombre: 'p', email: `p-${sufijo}@prueba.test`, rol: 'PRODUCTOR', organizacionId: orgId, hashClave: await hashearClave('x-123456789') },
    });
    const proyecto = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'LOTO', creadoPorId: autor.id, estado: 'ENTREGADO' } });
    proyectoId = proyecto.id;
    await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: { titulo: 'LOTO' } } });

    const entregado = new Date('2026-01-01T12:00:00Z');
    const base = { organizacionId: orgId, clienteId: cliente.id, proyectoId, mime: 'application/pdf', bytes: 10n, hash: 'h' };
    for (const clave of Object.values(claves)) await almacen.subir(clave, '%PDF-1.7', 'application/pdf');
    const documento = await prisma.recurso.create({
      data: { ...base, tipo: 'DOCUMENTO', origen: 'CLIENTE', claveS3: claves.documento, nombre: 'Procedimiento LOTO.pdf', eliminarEn: new Date(entregado.getTime() + 180 * DIA) },
    });
    // Otro documento del cliente que aún no vence, y una ilustración generada que nunca se borra por retención.
    await prisma.recurso.create({
      data: { ...base, tipo: 'DOCUMENTO', origen: 'CLIENTE', claveS3: claves.vigente, nombre: 'Anexo.pdf', eliminarEn: new Date(entregado.getTime() + 400 * DIA) },
    });
    await prisma.recurso.create({ data: { ...base, tipo: 'IMAGEN', origen: 'GENERADO', mime: 'image/png', claveS3: claves.generado, nombre: 'ilustracion.png' } });
    await prisma.materialFuente.create({
      data: { proyectoId, tipo: 'PDF', recursoId: documento.id, estado: 'listo', paginas: [{ n: 1, texto: 'Bloquear la energía', escaneada: false }] },
    });
  });

  afterAll(async () => {
    await prisma.organizacion.delete({ where: { id: orgId } });
    await almacen.borrar(Object.values(claves));
  });

  it('a los 180 días borra los documentos fuente, conserva el curso y registra en Auditoría', async () => {
    expect((await borrarDocumentosVencidos(prisma, almacen, new Date('2026-06-29T12:00:00Z'))).documentos).toBe(0);

    const r = await borrarDocumentosVencidos(prisma, almacen, new Date('2026-06-30T12:00:00Z'));
    expect(r).toEqual({ documentos: 1, proyectos: 1 });

    expect(await almacen.info(claves.documento)).toBeNull();
    expect(await almacen.info(claves.vigente)).not.toBeNull();
    expect(await almacen.info(claves.generado)).not.toBeNull();
    const restantes = await prisma.recurso.findMany({ where: { organizacionId: orgId }, select: { nombre: true } });
    expect(restantes.map((x) => x.nombre).sort()).toEqual(['Anexo.pdf', 'ilustracion.png']);

    const material = await prisma.materialFuente.findFirstOrThrow({ where: { proyectoId } });
    expect(material).toMatchObject({ estado: 'borrado', paginas: null });
    expect(await prisma.curso.count({ where: { proyectoId } })).toBe(1);

    const registro = await prisma.auditoria.findFirstOrThrow({ where: { organizacionId: orgId, accion: 'DOCUMENTOS_BORRADOS' } });
    expect(registro).toMatchObject({ entidad: 'Proyecto', entidadId: proyectoId, usuarioId: null });
    expect(registro.datos).toMatchObject({ motivo: 'retencion', documentos: [{ nombre: 'Procedimiento LOTO.pdf' }] });

    // Volver a correr el mismo día no hace nada.
    expect((await borrarDocumentosVencidos(prisma, almacen, new Date('2026-06-30T12:00:00Z'))).documentos).toBe(0);
  });
});
