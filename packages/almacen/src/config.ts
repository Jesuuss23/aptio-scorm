/** Configuración del almacenamiento compatible con S3 (LocalStack en local, S3 real en la nube; SUP-08). */
export interface ConfigAlmacen {
  /** Vacío en la nube: el SDK usa el punto de acceso de AWS. */
  endpoint?: string;
  region: string;
  bucket: string;
  /** Clave KMS con la que se cifra todo objeto (ADR-009). Id, ARN o alias. */
  claveKms: string;
  credenciales?: { accessKeyId: string; secretAccessKey: string };
}

/** Vigencia de toda URL firmada: 15 minutos (ADR-009, CP-103). */
export const VIGENCIA_URL_S = 15 * 60;

export function configDesdeEnv(env: NodeJS.ProcessEnv = process.env): ConfigAlmacen {
  return {
    ...(env.AWS_ENDPOINT ? { endpoint: env.AWS_ENDPOINT } : {}),
    region: env.AWS_REGION ?? 'us-east-1',
    bucket: env.S3_BUCKET_NAME ?? 'aptio-scorm-assets',
    claveKms: env.KMS_KEY_ID ?? 'alias/aptio-documentos',
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? { credenciales: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY } }
      : {}),
  };
}
