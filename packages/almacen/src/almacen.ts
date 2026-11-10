import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { type ConfigAlmacen, configDesdeEnv, VIGENCIA_URL_S } from './config.js';

export interface InfoObjeto {
  bytes: number;
  mime: string | undefined;
  cifrado: string | undefined;
  claveKms: string | undefined;
}

/**
 * Acceso al almacenamiento. Todo objeto se guarda cifrado con KMS y se lee solo con URLs firmadas
 * de 15 minutos (ADR-009). El bucket no es público.
 */
export class Almacen {
  readonly s3: S3Client;
  readonly config: ConfigAlmacen;

  constructor(config: ConfigAlmacen = configDesdeEnv()) {
    this.config = config;
    this.s3 = new S3Client({
      region: config.region,
      // Sin suma de verificación por defecto: en una URL firmada se firmaría la del cuerpo vacío y S3 rechazaría la subida.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      ...(config.credenciales ? { credentials: config.credenciales } : {}),
    });
  }

  private get cifrado() {
    return { ServerSideEncryption: 'aws:kms' as const, SSEKMSKeyId: this.config.claveKms };
  }

  async subir(clave: string, cuerpo: Uint8Array | string, mime: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: clave, Body: cuerpo, ContentType: mime, ...this.cifrado }));
  }

  /** URL para que el navegador suba directo a S3. Firma el tipo y el cifrado: si no los envía, S3 rechaza. */
  async urlSubida(clave: string, mime: string): Promise<{ url: string; cabeceras: Record<string, string> }> {
    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.config.bucket, Key: clave, ContentType: mime, ...this.cifrado }),
      { expiresIn: VIGENCIA_URL_S, signableHeaders: new Set(['content-type', 'x-amz-server-side-encryption', 'x-amz-server-side-encryption-aws-kms-key-id']) },
    );
    return {
      url,
      cabeceras: {
        'Content-Type': mime,
        'x-amz-server-side-encryption': 'aws:kms',
        'x-amz-server-side-encryption-aws-kms-key-id': this.config.claveKms,
      },
    };
  }

  /** URL de descarga de 15 minutos (CP-103). `nombre` fija el nombre del archivo al descargar. */
  urlDescarga(clave: string, nombre?: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: clave,
        ...(nombre ? { ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(nombre)}` } : {}),
      }),
      { expiresIn: VIGENCIA_URL_S },
    );
  }

  async info(clave: string): Promise<InfoObjeto | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: clave }));
      return { bytes: r.ContentLength ?? 0, mime: r.ContentType, cifrado: r.ServerSideEncryption, claveKms: r.SSEKMSKeyId };
    } catch (e) {
      if ((e as { name?: string }).name === 'NotFound' || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  /** Primeros bytes del objeto, para reconocer su tipo real sin descargarlo entero. */
  async cabecera(clave: string, bytes: number): Promise<Uint8Array> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: clave, Range: `bytes=0-${bytes - 1}` }));
    return r.Body ? await r.Body.transformToByteArray() : new Uint8Array();
  }

  async leer(clave: string): Promise<Uint8Array> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: clave }));
    return r.Body ? await r.Body.transformToByteArray() : new Uint8Array();
  }

  /** sha256 del objeto leyéndolo por partes. */
  async hash(clave: string): Promise<string> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: clave }));
    const h = createHash('sha256');
    for await (const trozo of r.Body as Readable) h.update(trozo as Buffer);
    return h.digest('hex');
  }

  async borrar(claves: string[]): Promise<void> {
    for (let i = 0; i < claves.length; i += 1000) {
      const lote = claves.slice(i, i + 1000);
      if (lote.length === 0) continue;
      await this.s3.send(
        new DeleteObjectsCommand({ Bucket: this.config.bucket, Delete: { Objects: lote.map((Key) => ({ Key })), Quiet: true } }),
      );
    }
  }
}
