// Prepara el bucket en local (LocalStack): clave KMS con alias, cifrado KMS por defecto, sin acceso público y CORS para subir desde la web.
// En la nube estos recursos los crea la infraestructura (HU-1405), no la aplicación.
import { CreateAliasCommand, CreateKeyCommand, DescribeKeyCommand, KMSClient } from '@aws-sdk/client-kms';
import {
  CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, PutBucketEncryptionCommand, PutPublicAccessBlockCommand,
} from '@aws-sdk/client-s3';
import { Almacen } from './almacen.js';

export async function prepararAlmacen(almacen: Almacen, origenesWeb: string[]): Promise<{ claveKms: string }> {
  const { config, s3 } = almacen;
  const kms = new KMSClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.credenciales ? { credentials: config.credenciales } : {}),
  });

  let claveKms: string;
  try {
    claveKms = (await kms.send(new DescribeKeyCommand({ KeyId: config.claveKms }))).KeyMetadata!.Arn!;
  } catch {
    const creada = await kms.send(new CreateKeyCommand({ Description: 'Aptio SCORM · documentos de clientes' }));
    claveKms = creada.KeyMetadata!.Arn!;
    if (config.claveKms.startsWith('alias/')) {
      await kms.send(new CreateAliasCommand({ AliasName: config.claveKms, TargetKeyId: creada.KeyMetadata!.KeyId! }));
    }
  }

  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.bucket }));
  }
  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket: config.bucket,
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
    }),
  );
  await s3.send(
    new PutBucketEncryptionCommand({
      Bucket: config.bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms', KMSMasterKeyID: config.claveKms }, BucketKeyEnabled: true }],
      },
    }),
  );
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: config.bucket,
      CORSConfiguration: {
        CORSRules: [{ AllowedOrigins: origenesWeb, AllowedMethods: ['PUT', 'GET'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3000 }],
      },
    }),
  );
  return { claveKms };
}
