// HU-1502 · CP-111: la tarea `publicar-paginas` de la cola `mantenimiento` publica las páginas del sitio programadas
// cuya hora ya llegó y no toca las futuras ni los borradores. PostgreSQL real.
// HU-1505 · En producción no publica mientras haya datos ficticios visibles y audita el bloqueo una sola vez.
// HU-1507 · Cada vuelta que publica algo crea una versión del sitio completo con origen `programada` (RN-16-5).
import { prisma, publicarProgramadas } from '@aptio/db';
import { afterAll, describe, expect, it } from 'vitest';

const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const MIN = 60_000;

describe.skipIf(!hayBase && !process.env.CI)('publicación programada de páginas del sitio (CP-111)', () => {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const ruta = (n: string) => `/prueba-${sufijo}-${n}`;

  const elementos: string[] = [];

  afterAll(async () => {
    await prisma.sitioElemento.deleteMany({ where: { id: { in: elementos } } });
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

  it('HU-1507 · la vuelta que publica crea una versión «programada» con la página; la que no publica, ninguna', async () => {
    const ahora = new Date();
    const p = await prisma.sitioPagina.create({ data: { ruta: ruta('version'), titulo: 'Con versión', estado: 'PROGRAMADA', publicarEn: new Date(ahora.getTime() - MIN) } });
    const antes = (await prisma.sitioVersion.aggregate({ _max: { numero: true } }))._max.numero ?? 0;
    expect(await publicarProgramadas(prisma, ahora, 'pruebas')).toContain(p.id);
    const v = await prisma.sitioVersion.findFirstOrThrow({ orderBy: { numero: 'desc' } });
    expect(v).toMatchObject({ numero: antes + 1, origen: 'programada', entorno: 'pruebas', publicadoPorId: null, restauradaDe: null });
    expect((v.instantanea as { paginas: { ruta: string }[] }).paginas.map((x) => x.ruta)).toContain(ruta('version'));
    expect(await prisma.auditoria.count({ where: { entidad: 'SitioVersion', entidadId: v.id, accion: 'SITIO_VERSION_PUBLICADA' } })).toBe(1);
    await publicarProgramadas(prisma, ahora, 'pruebas');
    expect((await prisma.sitioVersion.aggregate({ _max: { numero: true } }))._max.numero).toBe(antes + 1);
  });

  it('en producción, con un ficticio visible, la deja programada y audita SITIO_PAGINA_BLOQUEADA una sola vez', async () => {
    const ahora = new Date();
    const p = await prisma.sitioPagina.create({ data: { ruta: ruta('bloqueada'), titulo: 'Bloqueada', estado: 'PROGRAMADA', publicarEn: new Date(ahora.getTime() - MIN) } });
    const f = await prisma.sitioElemento.create({ data: { coleccion: 'testimonios', orden: 999, visible: true, ficticio: true, datos: { nombre: 'Inventado' } } });
    elementos.push(f.id);

    expect(await publicarProgramadas(prisma, ahora, 'produccion')).not.toContain(p.id);
    expect(await publicarProgramadas(prisma, new Date(ahora.getTime() + 30_000), 'produccion')).not.toContain(p.id);
    expect((await prisma.sitioPagina.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('PROGRAMADA');
    const bloqueos = await prisma.auditoria.findMany({ where: { entidad: 'SitioPagina', entidadId: p.id } });
    expect(bloqueos.map((a) => a.accion)).toEqual(['SITIO_PAGINA_BLOQUEADA']);
    expect(bloqueos[0]!.datos).toMatchObject({ motivo: 'FICTICIOS_VISIBLES' });

    // Al ocultar el ficticio, la siguiente vuelta la publica.
    await prisma.sitioElemento.update({ where: { id: f.id }, data: { visible: false } });
    expect(await publicarProgramadas(prisma, new Date(ahora.getTime() + 60_000), 'produccion')).toContain(p.id);
    expect((await prisma.auditoria.findMany({ where: { entidad: 'SitioPagina', entidadId: p.id }, orderBy: { creadoEn: 'asc' } })).map((a) => a.accion))
      .toEqual(['SITIO_PAGINA_BLOQUEADA', 'SITIO_PAGINA_PUBLICADA']);
  });

  it('en pruebas publica aunque haya ficticios visibles', async () => {
    const ahora = new Date();
    const p = await prisma.sitioPagina.create({ data: { ruta: ruta('pruebas'), titulo: 'Pruebas', estado: 'PROGRAMADA', publicarEn: new Date(ahora.getTime() - MIN) } });
    const f = await prisma.sitioElemento.create({ data: { coleccion: 'logos', orden: 999, visible: true, ficticio: true, datos: { nombre: 'Inventado' } } });
    elementos.push(f.id);
    expect(await publicarProgramadas(prisma, ahora, 'pruebas')).toContain(p.id);
    await prisma.sitioElemento.update({ where: { id: f.id }, data: { visible: false } });
  });
});
