// Contra LocalStack (S3 + KMS). Sin LocalStack se omite en local; en CI es obligatoria.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { Almacen, configDesdeEnv, prepararAlmacen, verificarContenido } from '../src/index.js';

const endpoint = process.env.AWS_ENDPOINT ?? 'http://localhost:9000';
const disponible = await fetch(`${endpoint}/_localstack/health`).then((r) => r.ok).catch(() => false);
if (!disponible && process.env.CI) throw new Error(`LocalStack no responde en ${endpoint}`);

const almacen = new Almacen({
  ...configDesdeEnv({ AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', ...process.env, AWS_ENDPOINT: endpoint }),
  bucket: 'aptio-pruebas',
});

describe.skipIf(!disponible)('almacenamiento cifrado (HU-1404)', () => {
  let claveKms: string;
  beforeAll(async () => {
    ({ claveKms } = await prepararAlmacen(almacen, ['http://localhost:5173']));
  });

  it('CP-103: guarda cifrado con KMS y la URL de descarga dura 15 minutos', async () => {
    const clave = `pruebas/${randomUUID()}.pdf`;
    await almacen.subir(clave, '%PDF-1.7\nhola', 'application/pdf');
    const info = await almacen.info(clave);
    expect(info).toMatchObject({ cifrado: 'aws:kms', mime: 'application/pdf' });
    // AWS devuelve el ARN de la clave; LocalStack puede devolver el alias.
    expect([claveKms, almacen.config.claveKms].some((c) => info?.claveKms?.endsWith(c.split('/').pop()!))).toBe(true);

    const url = new URL(await almacen.urlDescarga(clave, 'Política de seguridad.pdf'));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    const r = await fetch(url);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('%PDF-1.7\nhola');
    expect(r.headers.get('content-disposition')).toContain('Pol%C3%ADtica');
  });

  it('sube por URL firmada con el cifrado obligatorio y lee solo la cabecera', async () => {
    const clave = `pruebas/${randomUUID()}.pdf`;
    const { url, cabeceras } = await almacen.urlSubida(clave, 'application/pdf');
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('900');
    const r = await fetch(url, { method: 'PUT', headers: cabeceras, body: '%PDF-1.4\n' + 'x'.repeat(10_000) });
    expect(r.status).toBe(200);
    expect((await almacen.info(clave))?.cifrado).toBe('aws:kms');
    expect((await almacen.cabecera(clave, 8)).length).toBe(8);
    expect(await verificarContenido((n) => almacen.cabecera(clave, n), 'application/pdf')).toMatchObject({ valido: true });
    expect(await almacen.hash(clave)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el objeto no se puede leer sin firma y se borra', async () => {
    const clave = `pruebas/${randomUUID()}.txt`;
    await almacen.subir(clave, 'secreto', 'text/plain');
    // LocalStack no aplica la política de acceso público; se comprueba que el bloqueo quedó configurado.
    const bloqueo = await almacen.s3.send(new (await import('@aws-sdk/client-s3')).GetPublicAccessBlockCommand({ Bucket: 'aptio-pruebas' }));
    expect(bloqueo.PublicAccessBlockConfiguration).toMatchObject({ BlockPublicAcls: true, RestrictPublicBuckets: true });
    await almacen.borrar([clave]);
    expect(await almacen.info(clave)).toBeNull();
  });
});
