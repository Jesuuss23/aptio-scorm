// HU-1403 · Operaciones de S3 de las copias: listar, copiar entre buckets con el cifrado KMS, subir un archivo y
// borrar una carpeta. Sirven igual con LocalStack (local y CI) y con S3 real.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  CopyObjectCommand, CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command,
  PutObjectCommand, type S3Client,
} from '@aws-sdk/client-s3';

export interface Objeto {
  clave: string;
  bytes: number;
}

export async function listar(s3: S3Client, bucket: string, prefijo = ''): Promise<Objeto[]> {
  const objetos: Objeto[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefijo, ...(token ? { ContinuationToken: token } : {}) }));
    for (const o of r.Contents ?? []) if (o.Key) objetos.push({ clave: o.Key, bytes: o.Size ?? 0 });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return objetos;
}

/** Carpetas de primer nivel (`2026-11-13T08-00-00-000Z/`). */
export async function carpetas(s3: S3Client, bucket: string): Promise<string[]> {
  const salida: string[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Delimiter: '/', ...(token ? { ContinuationToken: token } : {}) }));
    for (const p of r.CommonPrefixes ?? []) if (p.Prefix) salida.push(p.Prefix);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return salida;
}

export async function asegurarBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

const cifrado = (claveKms: string) => ({ ServerSideEncryption: 'aws:kms' as const, SSEKMSKeyId: claveKms });

/** Copia objetos de un bucket a otro, de 8 en 8, con el cifrado KMS. `destino` da la clave nueva. */
export async function copiar(
  s3: S3Client, origen: string, destino: string, objetos: Objeto[], claveDestino: (clave: string) => string, claveKms: string,
): Promise<void> {
  let i = 0;
  const hilo = async () => {
    while (i < objetos.length) {
      const o = objetos[i++]!;
      await s3.send(new CopyObjectCommand({
        Bucket: destino, Key: claveDestino(o.clave), CopySource: `${origen}/${o.clave.split('/').map(encodeURIComponent).join('/')}`, ...cifrado(claveKms),
      }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, objetos.length) }, hilo));
}

export async function subirArchivo(s3: S3Client, bucket: string, clave: string, ruta: string, claveKms: string): Promise<number> {
  const { size } = await stat(ruta);
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: clave, Body: createReadStream(ruta), ContentLength: size, ContentType: 'application/octet-stream', ...cifrado(claveKms),
  }));
  return size;
}

export async function subirTexto(s3: S3Client, bucket: string, clave: string, texto: string, claveKms: string): Promise<number> {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: clave, Body: texto, ContentType: 'application/json', ...cifrado(claveKms) }));
  return Buffer.byteLength(texto);
}

export async function leer(s3: S3Client, bucket: string, clave: string): Promise<Uint8Array> {
  const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: clave }));
  return r.Body ? await r.Body.transformToByteArray() : new Uint8Array();
}

/** Borra todo lo que empieza con `prefijo`; devuelve cuántos objetos borró. */
export async function borrarCarpeta(s3: S3Client, bucket: string, prefijo: string): Promise<number> {
  const objetos = await listar(s3, bucket, prefijo);
  for (let i = 0; i < objetos.length; i += 1000) {
    const lote = objetos.slice(i, i + 1000);
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: lote.map((o) => ({ Key: o.clave })), Quiet: true } }));
  }
  return objetos.length;
}

/** Vacía y borra un bucket (pruebas y entornos de restauración descartables). */
export async function borrarBucket(s3: S3Client, bucket: string): Promise<void> {
  await borrarCarpeta(s3, bucket, '').catch(() => 0);
  await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
}
