// HU-1404 · CP-104: borrado programado de documentos del cliente, contra PostgreSQL y LocalStack reales.
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { borrarLeadsVencidos, hashearClave, prisma } from '@aptio/db';
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

  it('SUP-139 · el material del cliente sin proyecto subido antes de la regla vence a los días de retención desde su subida', async () => {
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Kit', retencionDocumentosDias: 90 } });
    const clave = `pruebas/${sufijo}/manual-marca.pdf`;
    await almacen.subir(clave, '%PDF-1.7', 'application/pdf');
    const base = { organizacionId: orgId, clienteId: cliente.id, tipo: 'DOCUMENTO' as const, mime: 'application/pdf', bytes: 10n, hash: 'h' };
    const manual = await prisma.recurso.create({ data: { ...base, origen: 'CLIENTE', claveS3: clave, nombre: 'Manual de marca.pdf', creadoEn: new Date('2026-01-01T12:00:00Z') } });
    // Lo del equipo sin proyecto no entra en la retención del cliente.
    const propio = await prisma.recurso.create({ data: { ...base, origen: 'SUBIDO', claveS3: `pruebas/${sufijo}/plantilla.pdf`, nombre: 'Plantilla.pdf', creadoEn: new Date('2026-01-01T12:00:00Z') } });

    expect((await borrarDocumentosVencidos(prisma, almacen, new Date('2026-03-31T11:00:00Z'))).documentos).toBe(0);
    expect((await prisma.recurso.findUniqueOrThrow({ where: { id: manual.id } })).eliminarEn?.toISOString()).toBe('2026-04-01T12:00:00.000Z');
    expect((await borrarDocumentosVencidos(prisma, almacen, new Date('2026-04-01T12:00:00Z'))).documentos).toBe(1);
    expect(await prisma.recurso.findUnique({ where: { id: manual.id } })).toBeNull();
    expect(await almacen.info(clave)).toBeNull();
    expect(await prisma.recurso.findUniqueOrThrow({ where: { id: propio.id } })).toMatchObject({ eliminarEn: null });
    const registro = await prisma.auditoria.findFirstOrThrow({ where: { organizacionId: orgId, accion: 'DOCUMENTOS_BORRADOS', entidad: 'Cliente' } });
    expect(registro).toMatchObject({ entidadId: cliente.id, datos: { motivo: 'retencion', documentos: [{ nombre: 'Manual de marca.pdf' }] } });
  });
});

describe.skipIf(!hayBase && !process.env.CI)('retención de los leads (SUP-237)', () => {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const correo = (n: string) => `${n}-${sufijo}@retencion.example`;
  const ids: { tipo?: string; asesor?: string } = {};
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { correo: { endsWith: `-${sufijo}@retencion.example` } } });
    if (ids.tipo) await prisma.agendaCita.deleteMany({ where: { tipoId: ids.tipo } });
    if (ids.asesor) await prisma.agendaAsesor.delete({ where: { id: ids.asesor } });
    if (ids.tipo) await prisma.agendaTipo.delete({ where: { id: ids.tipo } });
  });

  it('borra los leads sin actividad tras la retención, anonimiza las citas de esa antigüedad y lo audita sin datos personales', async () => {
    const lead = (n: string) => prisma.lead.create({ data: { correo: correo(n), nombre: n, origen: 'formulario', via: 'formulario', paginaEntrada: '/' } });
    const viejo = await lead('viejo');
    const reciente = await lead('reciente');
    // `actualizadoEn` lo pone Prisma: se envejece con SQL.
    await prisma.$executeRaw`UPDATE "Lead" SET "actualizadoEn" = '2024-01-01T00:00:00Z' WHERE id = ${viejo.id}::uuid`;
    ids.tipo = (await prisma.agendaTipo.create({ data: { nombreEs: `Demo ${sufijo}` } })).id;
    ids.asesor = (await prisma.agendaAsesor.create({ data: { nombre: 'Asesor', correo: 'asesor@aptio.test', enlaceVideollamada: 'https://meet.example/x' } })).id;
    const cita = (inicio: string, n: string) => prisma.agendaCita.create({ data: { tipoId: ids.tipo!, asesorId: ids.asesor!, inicio: new Date(inicio), fin: new Date(new Date(inicio).getTime() + 1_800_000), nombre: n, correo: correo(n), estado: 'realizada', tokenCancelacionHash: `${n}-${sufijo}` } });
    const antigua = await cita('2024-01-10T15:00:00Z', 'viejo');
    const nueva = await cita('2026-10-10T15:00:00Z', 'reciente');

    const r = await borrarLeadsVencidos(prisma, new Date('2026-11-19T12:00:00Z'), 730);
    expect(r.leads).toBeGreaterThanOrEqual(1);
    expect(await prisma.lead.findUnique({ where: { id: viejo.id } })).toBeNull();
    expect(await prisma.lead.findUnique({ where: { id: reciente.id } })).not.toBeNull();
    expect(await prisma.agendaCita.findUniqueOrThrow({ where: { id: antigua.id } })).toMatchObject({ nombre: 'Titular eliminado', correo: '', estado: 'realizada' });
    expect(await prisma.agendaCita.findUniqueOrThrow({ where: { id: nueva.id } })).toMatchObject({ nombre: 'reciente', correo: correo('reciente') });
    const aud = await prisma.auditoria.findFirstOrThrow({ where: { accion: 'LEADS_BORRADOS' }, orderBy: { creadoEn: 'desc' } });
    expect(aud.datos).toMatchObject({ motivo: 'retencion', dias: 730 });
    expect(JSON.stringify(aud.datos)).not.toContain('@');
    // Otra vez el mismo día no vuelve a anonimizar ni a auditar lo ya hecho.
    expect(await borrarLeadsVencidos(prisma, new Date('2026-11-19T12:00:00Z'), 730)).toEqual({ leads: 0, citas: 0 });
  });
});
