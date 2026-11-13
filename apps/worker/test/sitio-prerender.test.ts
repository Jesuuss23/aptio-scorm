// HU-1508 · Pre-render del sitio al bucket (DA-08), contra PostgreSQL y el S3 local reales: las páginas de la versión,
// el sitemap, robots.txt, la 404 y las fuentes; el puntero `sitio/actual.json` solo avanza; el estado queda en la versión
// y en la auditoría. En producción el HTML nunca trae un dato ficticio aunque la instantánea lo tenga (RN-16-3).
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { crearVersion, prisma } from '@aptio/db';
import { CLAVE_ACTUAL, claveFuente, claveVersion, fuentes, instantaneaDeEjemplo } from '@aptio/sitio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { leerPuntero, prerenderizarVersion, versionPendienteDePrerender } from '../src/sitio-prerender.js';

const endpoint = process.env.AWS_ENDPOINT ?? 'http://localhost:9000';
const hayS3 = await fetch(`${endpoint}/_localstack/health`).then((r) => r.ok).catch(() => false);
const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const config = configDesdeEnv({ AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', ...process.env, AWS_ENDPOINT: endpoint });
const almacen = new Almacen({ ...config, bucket: 'aptio-pruebas-sitio' });
const env = { SITIO_ENTORNO: 'produccion', SITIO_URL: 'https://aptioscorm.com/', SITIO_BASE: '/s' };
const texto = async (clave: string) => new TextDecoder().decode(await almacen.leer(clave));

describe.skipIf((!hayS3 || !hayBase) && !process.env.CI)('pre-render del sitio (HU-1508)', () => {
  const creadas: string[] = [];
  const nueva = async () => {
    const v = await crearVersion(prisma, { origen: 'publicacion', entorno: 'pruebas', instantanea: instantaneaDeEjemplo('pruebas') });
    creadas.push(v.id);
    return v;
  };

  beforeAll(async () => {
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    const actual = await almacen.info(CLAVE_ACTUAL);
    if (actual) await almacen.borrar([CLAVE_ACTUAL]);
  });

  afterAll(async () => {
    await prisma.auditoria.deleteMany({ where: { entidad: 'SitioVersion', entidadId: { in: creadas } } });
    await prisma.sitioVersion.deleteMany({ where: { id: { in: creadas } } });
  });

  it('sube las páginas, el sitemap, robots.txt, la 404 y las fuentes, y mueve el puntero al final', async () => {
    const v = await nueva();
    expect(v.prerenderEstado).toBe('en_curso');
    expect(await versionPendienteDePrerender(prisma)).toBe(v.numero);
    const r = await prerenderizarVersion(prisma, almacen, v.numero, env);
    expect(r).toEqual({ numero: v.numero, estado: 'listo', archivos: 10, puntero: true });
    // HU-1514 · Las 4 landings publicadas del ejemplo suben; la de borrador (Sector público) no.
    expect(await texto(claveVersion(v.numero, 'sectores/mineria-y-energia/index.html'))).toContain('Minería y energía');
    expect(await almacen.info(claveVersion(v.numero, 'sectores/sector-publico/index.html'))).toBeNull();
    // HU-1510 · El inicio en inglés del ejemplo sube en en/index.html, con su idioma.
    expect(await texto(claveVersion(v.numero, 'en/index.html'))).toMatch(/^<!doctype html><html lang="en">/);

    const inicio = await texto(claveVersion(v.numero, 'index.html'));
    expect(inicio).toMatch(/^<!doctype html><html lang="es">/);
    expect(inicio).toContain('Mariana Paredes');
    expect(inicio).not.toContain('Persona de ejemplo');
    expect(inicio).toContain('<link rel="canonical" href="https://aptioscorm.com/"/>');
    expect(await texto(claveVersion(v.numero, 'en/index.html'))).toContain('<html lang="en">');
    expect(await texto(claveVersion(v.numero, 'funcionalidades/personaje/index.html'))).toContain('Un personaje que habla');
    expect(await texto(claveVersion(v.numero, 'sitemap.xml'))).toContain('<loc>https://aptioscorm.com/funcionalidades/personaje</loc>');
    expect(await texto(claveVersion(v.numero, 'robots.txt'))).toContain('Sitemap: https://aptioscorm.com/sitemap.xml');
    expect(await texto(claveVersion(v.numero, '404.html'))).toContain('Página no encontrada');
    for (const f of fuentes()) expect((await almacen.info(claveFuente(f.archivo)))?.mime).toBe('font/woff2');
    expect((await leerPuntero(almacen))?.version).toBe(v.numero);

    const fila = await prisma.sitioVersion.findUniqueOrThrow({ where: { numero: v.numero } });
    expect(fila).toMatchObject({ prerenderEstado: 'listo', prerenderError: null });
    expect(fila.prerenderEn).toBeInstanceOf(Date);
    const aud = await prisma.auditoria.findFirst({ where: { entidad: 'SitioVersion', entidadId: v.id, accion: 'SITIO_PRERENDER_LISTO' } });
    expect(aud?.datos).toMatchObject({ numero: v.numero, archivos: 10, puntero: true, entorno: 'produccion' });
    expect(await versionPendienteDePrerender(prisma)).toBeNull();
  });

  it('el puntero solo avanza: volver a renderizar una versión vieja no la publica', async () => {
    const vieja = await nueva();
    const nuevaV = await nueva();
    expect((await prerenderizarVersion(prisma, almacen, nuevaV.numero, env)).puntero).toBe(true);
    const r = await prerenderizarVersion(prisma, almacen, vieja.numero, env);
    expect(r).toMatchObject({ estado: 'listo', puntero: false });
    expect((await leerPuntero(almacen))?.version).toBe(nuevaV.numero);
  });

  it('si el bucket falla queda en error, con el motivo en la versión y en la auditoría, y el puntero no cambia', async () => {
    const antes = await leerPuntero(almacen);
    const v = await nueva();
    const roto = new Almacen({ ...config, bucket: 'aptio-bucket-que-no-existe' });
    const r = await prerenderizarVersion(prisma, roto, v.numero, env);
    expect(r.estado).toBe('error');
    expect(r.error).toBeTruthy();
    const fila = await prisma.sitioVersion.findUniqueOrThrow({ where: { numero: v.numero } });
    expect(fila.prerenderEstado).toBe('error');
    expect(fila.prerenderError).toBe(r.error);
    expect(await prisma.auditoria.count({ where: { entidad: 'SitioVersion', entidadId: v.id, accion: 'SITIO_PRERENDER_ERROR' } })).toBe(1);
    expect(await leerPuntero(almacen)).toEqual(antes);
    expect(await prerenderizarVersion(prisma, almacen, 999_999, env)).toMatchObject({ estado: 'omitido' });
  });
});
