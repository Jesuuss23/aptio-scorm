// HU-1502 · CP-111: la tarea `publicar-paginas` de la cola `mantenimiento` publica las páginas del sitio programadas
// cuya hora ya llegó y no toca las futuras ni los borradores. PostgreSQL real.
import { prisma, publicarProgramadas } from '@aptio/db';
import { afterAll, describe, expect, it } from 'vitest';

const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const MIN = 60_000;

describe.skipIf(!hayBase && !process.env.CI)('publicación programada de páginas del sitio (CP-111)', () => {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const ruta = (n: string) => `/prueba-${sufijo}-${n}`;

  afterAll(async () => {
    const ids = (await prisma.sitioPagina.findMany({ where: { ruta: { startsWith: `/prueba-${sufijo}-` } }, select: { id: true } })).map((p) => p.id);
    await prisma.auditoria.deleteMany({ where: { entidad: 'SitioPagina', entidadId: { in: ids } } });
    await prisma.sitioPagina.deleteMany({ where: { id: { in: ids } } });
  });

  it('publica las vencidas, con auditoría, y deja las futuras y los borradores', async () => {
    const ahora = new Date();
    const vencida = await prisma.sitioPagina.create({ data: { ruta: ruta('vencida'), titulo: 'Vencida', estado: 'PROGRAMADA', publicarEn: new Date(ahora.getTime() - 5 * MIN) } });
    const justo = await prisma.sitioPagina.create({ data: { ruta: ruta('justo'), titulo: 'Justo ahora', estado: 'PROGRAMADA', publicarEn: ahora } });
    const futura = await prisma.sitioPagina.create({ data: { ruta: ruta('futura'), titulo: 'Futura', estado: 'PROGRAMADA', publicarEn: new Date(ahora.getTime() + 24 * 60 * MIN) } });
    const borrador = await prisma.sitioPagina.create({ data: { ruta: ruta('borrador'), titulo: 'Borrador' } });

    const ids = await publicarProgramadas(prisma, ahora);
    expect(ids).toEqual(expect.arrayContaining([vencida.id, justo.id]));
    expect(ids).not.toContain(futura.id);

    const filas = await prisma.sitioPagina.findMany({ where: { id: { in: [vencida.id, justo.id, futura.id, borrador.id] } } });
    const de = (id: string) => filas.find((f) => f.id === id)!;
    expect(de(vencida.id)).toMatchObject({ estado: 'PUBLICADA', publicadaEn: ahora, publicarEn: null });
    expect(de(justo.id).estado).toBe('PUBLICADA');
    expect(de(futura.id)).toMatchObject({ estado: 'PROGRAMADA', publicadaEn: null });
    expect(de(borrador.id).estado).toBe('BORRADOR');

    const auditoria = await prisma.auditoria.findMany({ where: { entidad: 'SitioPagina', entidadId: vencida.id } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({ accion: 'SITIO_PAGINA_PUBLICADA', usuarioId: null, organizacionId: null, datos: expect.objectContaining({ programada: true }) });

    // Una segunda vuelta no vuelve a publicar ni a auditar.
    expect(await publicarProgramadas(prisma, ahora)).not.toContain(vencida.id);
    expect(await prisma.auditoria.count({ where: { entidad: 'SitioPagina', entidadId: vencida.id } })).toBe(1);
  });
});
