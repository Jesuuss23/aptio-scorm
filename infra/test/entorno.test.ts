// HU-1405 · CP-105 (parte verificable sin cuenta AWS): la plantilla del entorno cumple las reglas de seguridad antes de
// desplegarse. HTTPS en toda entrada, buckets privados y cifrados con KMS, ningún secreto en texto plano en las tareas
// y los comportamientos de CloudFront que piden los supuestos del sitio (SUP-197, SUP-238, SUP-250, SUP-255, SUP-266, SUP-274).
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BaseStack } from '../src/base';
import { type ConfigEntorno, leerConfig, llavesAplicacion, MIFACT_URL_DEMO, REGION } from '../src/config';
import { CABECERA_ORIGEN, CSP_WEB, EntornoStack } from '../src/entorno';
import { LIMITE_WAF_AUTH, REGION_WAF, WafStack } from '../src/waf';

const CUENTA = '123456789012';
const env = { account: CUENTA, region: REGION };

function plantilla(extra: Record<string, string> = {}): Template {
  const config = leerConfig((k) => ({ etiquetaImagen: 'abc123', ...extra })[k]);
  const app = new App();
  return Template.fromStack(new EntornoStack(app, 'AptioPruebas', { env, config }));
}

type Recurso = { Type: string; Properties: Record<string, any>; DeletionPolicy?: string };
const recursos = (t: Template, tipo: string) => Object.values(t.findResources(tipo)) as Recurso[];
const comportamientos = (t: Template) => {
  const [d] = recursos(t, 'AWS::CloudFront::Distribution');
  const cfg = d!.Properties.DistributionConfig;
  return { cfg, porRuta: Object.fromEntries((cfg.CacheBehaviors as any[]).map((b) => [b.PathPattern, b])) as Record<string, any> };
};

describe('HU-1405 · configuración del entorno', () => {
  it('usa sa-east-1, el entorno pruebas y proveedores simulados por defecto', () => {
    const c = leerConfig(() => undefined);
    expect(REGION).toBe('sa-east-1');
    expect(c).toMatchObject<Partial<ConfigEntorno>>({ entorno: 'pruebas', modoProveedores: 'simulado', proteccionBorrado: true, repositorioGithub: 'jesuuss23/aptio-scorm' });
    expect(c.dominio).toBeUndefined();
    expect(c.replicas).toBe(1);
  });

  it('rechaza un dominio sin certificado, un certificado de otra región y valores no válidos', () => {
    expect(() => leerConfig((k) => ({ dominio: 'pruebas.aptio.pe' })[k])).toThrow('van juntos');
    expect(() => leerConfig((k) => ({ dominio: 'pruebas.aptio.pe', certificadoCloudFrontArn: 'arn:aws:acm:sa-east-1:1:certificate/x' })[k])).toThrow('us-east-1');
    expect(() => leerConfig((k) => ({ dominioOrigen: 'origen.aptio.pe', certificadoAlbArn: 'arn:aws:acm:us-east-1:1:certificate/x' })[k])).toThrow('sa-east-1');
    expect(() => leerConfig((k) => ({ entorno: 'Pruebas Nube' })[k])).toThrow('entorno no válido');
    expect(() => leerConfig((k) => ({ modoProveedores: 'gratis' })[k])).toThrow('modoProveedores');
    expect(() => leerConfig((k) => ({ replicas: '3' })[k])).toThrow('replicas');
    expect(() => leerConfig((k) => ({ mifactUrl: 'http://mifact.pe' })[k])).toThrow('mifactUrl');
  });

  it('HU-1712 · fuera de producción usa la demo de Mifact; en producción solo con mifactUrl', () => {
    expect(leerConfig(() => undefined).mifactUrl).toBe(MIFACT_URL_DEMO);
    expect(leerConfig((k) => ({ entorno: 'produccion', dominioOrigen: 'origen.aptioscorm.pe', certificadoAlbArn: 'arn:aws:acm:sa-east-1:1:certificate/x' })[k]).mifactUrl).toBeUndefined();
    expect(leerConfig((k) => ({ entorno: 'produccion', dominioOrigen: 'origen.aptioscorm.pe', certificadoAlbArn: 'arn:aws:acm:sa-east-1:1:certificate/x', mifactUrl: 'https://www.mifact.net.pe/api/invoiceService.svc' })[k]).mifactUrl).toBe('https://www.mifact.net.pe/api/invoiceService.svc');
  });
});

describe('HU-1405 · HTTPS en toda entrada', () => {
  const t = plantilla();

  it('CloudFront redirige o exige HTTPS en todos los comportamientos, con TLS 1.2 como mínimo', () => {
    const { cfg } = comportamientos(t);
    const todos = [cfg.DefaultCacheBehavior, ...cfg.CacheBehaviors];
    expect(todos.length).toBe(5);
    for (const b of todos) expect(['redirect-to-https', 'https-only']).toContain(b.ViewerProtocolPolicy);
    expect(cfg.DefaultCacheBehavior.ViewerProtocolPolicy).toBe('redirect-to-https');
    expect(cfg.ViewerCertificate ?? { CloudFrontDefaultCertificate: true }).toMatchObject({ CloudFrontDefaultCertificate: true });
  });

  it('sin dominio, el balanceador solo atiende a CloudFront (lista de prefijos y cabecera secreta) y responde 403 a lo demás', () => {
    t.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      DefaultActions: [Match.objectLike({ Type: 'fixed-response', FixedResponseConfig: Match.objectLike({ StatusCode: '403' }) })],
    });
    const entradasAlb = recursos(t, 'AWS::EC2::SecurityGroupIngress').filter((r) => JSON.stringify(r.Properties.GroupId).includes('SgAlb'));
    expect(entradasAlb).toHaveLength(1);
    expect(entradasAlb[0]!.Properties).toMatchObject({ SourcePrefixListId: expect.anything(), FromPort: 80, ToPort: 80, IpProtocol: 'tcp' });
    expect(entradasAlb[0]!.Properties.CidrIp).toBeUndefined();
    t.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: [Match.objectLike({ Field: 'http-header', HttpHeaderConfig: Match.objectLike({ HttpHeaderName: CABECERA_ORIGEN }) })],
      Actions: [Match.objectLike({ Type: 'forward' })],
    });
    // La cabecera viaja con una referencia dinámica a Secrets Manager, nunca con su valor.
    const { cfg } = comportamientos(t);
    const origen = (cfg.Origins as any[]).find((o) => o.CustomOriginConfig);
    expect(origen.CustomOriginConfig.OriginProtocolPolicy).toBe('http-only');
    expect(JSON.stringify(origen.OriginCustomHeaders)).toContain('resolve:secretsmanager');
  });

  it('con dominio y certificados: CloudFront usa el certificado de us-east-1 y llega al balanceador solo por HTTPS (443)', () => {
    const conDominio = plantilla({
      dominio: 'pruebas.aptioscorm.pe',
      certificadoCloudFrontArn: 'arn:aws:acm:us-east-1:123456789012:certificate/web',
      dominioOrigen: 'origen-pruebas.aptioscorm.pe',
      certificadoAlbArn: 'arn:aws:acm:sa-east-1:123456789012:certificate/alb',
    });
    const { cfg } = comportamientos(conDominio);
    expect(cfg.Aliases).toEqual(['pruebas.aptioscorm.pe']);
    expect(cfg.ViewerCertificate).toMatchObject({ AcmCertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/web', MinimumProtocolVersion: 'TLSv1.2_2021', SslSupportMethod: 'sni-only' });
    const origen = (cfg.Origins as any[]).find((o) => o.CustomOriginConfig);
    expect(origen.DomainName).toBe('origen-pruebas.aptioscorm.pe');
    expect(origen.CustomOriginConfig).toMatchObject({ OriginProtocolPolicy: 'https-only', OriginSSLProtocols: ['TLSv1.2'] });
    conDominio.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', { Port: 443, Protocol: 'HTTPS', Certificates: [{ CertificateArn: 'arn:aws:acm:sa-east-1:123456789012:certificate/alb' }] });
    conDominio.resourcePropertiesCountIs('AWS::ElasticLoadBalancingV2::Listener', { Port: 80 }, 0);
    // El CORS del material sigue al dominio propio.
    conDominio.hasResourceProperties('AWS::S3::Bucket', { CorsConfiguration: { CorsRules: [Match.objectLike({ AllowedOrigins: ['https://pruebas.aptioscorm.pe'] })] } });
  });

  it('PostgreSQL exige SSL y Redis cifra el tráfico con clave de acceso', () => {
    t.hasResourceProperties('AWS::RDS::DBParameterGroup', { Parameters: { 'rds.force_ssl': '1' } });
    t.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', { TransitEncryptionEnabled: true, AtRestEncryptionEnabled: true, AuthToken: Match.anyValue() });
  });
});

describe('HU-1405 · buckets privados y cifrados con KMS', () => {
  const t = plantilla();
  const buckets = recursos(t, 'AWS::S3::Bucket');

  it('los tres buckets (web, material y respaldos) bloquean todo acceso público y cifran con una clave KMS', () => {
    expect(buckets).toHaveLength(3);
    for (const b of buckets) {
      expect(b.Properties.PublicAccessBlockConfiguration).toEqual({ BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true });
      const [regla] = b.Properties.BucketEncryption.ServerSideEncryptionConfiguration;
      expect(regla.ServerSideEncryptionByDefault.SSEAlgorithm).toBe('aws:kms');
      expect(regla.ServerSideEncryptionByDefault.KMSMasterKeyID).toBeDefined();
      expect(regla.BucketKeyEnabled).toBe(true);
    }
    const nombres = buckets.map((b) => b.Properties.BucketName).sort();
    expect(nombres).toEqual([`aptio-pruebas-material-${CUENTA}`, `aptio-pruebas-respaldos-${CUENTA}`, `aptio-pruebas-web-${CUENTA}`]);
  });

  it('cada bucket niega toda petición sin HTTPS o con TLS menor a 1.2', () => {
    const politicas = recursos(t, 'AWS::S3::BucketPolicy');
    expect(politicas).toHaveLength(3);
    for (const p of politicas) {
      const negaciones = (p.Properties.PolicyDocument.Statement as any[]).filter((s) => s.Effect === 'Deny');
      expect(negaciones.some((s) => s.Condition?.Bool?.['aws:SecureTransport'] === 'false')).toBe(true);
      expect(negaciones.some((s) => s.Condition?.NumericLessThan?.['s3:TlsVersion'] === 1.2)).toBe(true);
    }
  });

  it('solo el bucket de material tiene CORS, limitado al origen de la web', () => {
    const conCors = buckets.filter((b) => b.Properties.CorsConfiguration);
    expect(conCors).toHaveLength(1);
    expect(conCors[0]!.Properties.BucketName).toBe(`aptio-pruebas-material-${CUENTA}`);
    const [regla] = conCors[0]!.Properties.CorsConfiguration.CorsRules;
    expect(regla.AllowedOrigins).toHaveLength(1);
    expect(JSON.stringify(regla.AllowedOrigins)).not.toContain('*');
    expect(JSON.stringify(regla.AllowedOrigins)).toContain('https://');
  });

  it('la web solo se lee desde CloudFront (OAC) y las claves KMS rotan', () => {
    t.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    for (const k of recursos(t, 'AWS::KMS::Key')) expect(k.Properties.EnableKeyRotation).toBe(true);
  });
});

describe('HU-1405 · cero secretos en texto plano', () => {
  const t = plantilla();
  const tareas = recursos(t, 'AWS::ECS::TaskDefinition');
  const contenedores = tareas.flatMap((d) => d.Properties.ContainerDefinitions as any[]);
  const SOSPECHOSO = /SECRET|SECRETO|PASSWORD|CLAVE|TOKEN|API_KEY|LLAVE|DATABASE_URL|SMTP_URL/;

  it('hay tres tareas (api, worker y migración) y ninguna variable de entorno parece un secreto', () => {
    expect(contenedores.map((c) => c.Name).sort()).toEqual(['api', 'migracion', 'worker']);
    for (const c of contenedores) {
      for (const v of c.Environment ?? []) expect(v.Name, `${c.Name}: ${v.Name}`).not.toMatch(SOSPECHOSO);
    }
  });

  it('las credenciales llegan como referencias a Secrets Manager', () => {
    for (const c of contenedores) {
      const nombres = (c.Secrets as any[]).map((s) => s.Name);
      expect(nombres).toEqual(expect.arrayContaining(['DB_HOST', 'DB_USER', 'DB_PASSWORD']));
      for (const s of c.Secrets as any[]) expect(JSON.stringify(s.ValueFrom)).toMatch(/Ref|Fn::Join|arn:aws:secretsmanager/);
    }
    const api = contenedores.find((c) => c.Name === 'api')!;
    expect((api.Secrets as any[]).map((s) => s.Name)).toEqual(expect.arrayContaining(['SESSION_SECRET', 'REDIS_PASSWORD', 'TOTP_CLAVE_CIFRADO', ...llavesAplicacion('pruebas')]));
    // HU-1515 · La clave TOTP es un secreto generado propio, solo para la API, y se conserva al borrar la pila.
    const worker = contenedores.find((c) => c.Name === 'worker')!;
    expect((worker.Secrets as any[]).map((s) => s.Name)).not.toContain('TOTP_CLAVE_CIFRADO');
    const totp = recursos(t, 'AWS::SecretsManager::Secret').find((s) => s.Properties.Name === 'aptio-pruebas-totp-clave')!;
    expect(totp.Properties.GenerateSecretString).toMatchObject({ PasswordLength: 64, ExcludePunctuation: true });
    expect(totp.DeletionPolicy).toBe('Retain');
    expect(JSON.stringify((api.Secrets as any[]).find((s) => s.Name === 'TOTP_CLAVE_CIFRADO').ValueFrom)).toContain('SecretoTotp');
    // HU-1712 · El token de Mifact (en el secreto de la aplicación) solo llega al worker; la URL, que no es secreta, a los dos.
    expect((worker.Secrets as any[]).map((s) => s.Name)).toContain('MIFACT_TOKEN');
    expect((api.Secrets as any[]).map((s) => s.Name)).not.toContain('MIFACT_TOKEN');
    expect(JSON.stringify((worker.Secrets as any[]).find((s) => s.Name === 'MIFACT_TOKEN').ValueFrom)).toContain('SecretoAplicacion');
    const app = recursos(t, 'AWS::SecretsManager::Secret').find((s) => s.Properties.Name === 'aptio-pruebas-aplicacion')!;
    expect(JSON.parse(app.Properties.GenerateSecretString.SecretStringTemplate)).toMatchObject({ MIFACT_TOKEN: '' });
    for (const c of [api, worker]) expect(c.Environment).toEqual(expect.arrayContaining([{ Name: 'MIFACT_URL', Value: MIFACT_URL_DEMO }]));
    // La API confía en 2 proxies (CloudFront y el balanceador) para leer la IP del visitante (SUP-169).
    expect(api.Environment).toEqual(expect.arrayContaining([{ Name: 'TRUST_PROXY', Value: '2' }, { Name: 'REDIS_TLS', Value: 'true' }, { Name: 'SITIO_ENTORNO', Value: 'pruebas' }]));
  });

  it('la plantilla no lleva valores de secretos: los secretos se generan y la clave de Redis es una referencia dinámica', () => {
    const json = JSON.stringify(t.toJSON());
    expect(json).not.toMatch(/"SESSION_SECRET"\s*:\s*"[^"]+"/);
    for (const s of recursos(t, 'AWS::SecretsManager::Secret')) {
      expect(s.Properties.SecretString).toBeUndefined();
      expect(s.Properties.GenerateSecretString).toBeDefined();
    }
    const [redis] = recursos(t, 'AWS::ElastiCache::ReplicationGroup');
    expect(JSON.stringify(redis!.Properties.AuthToken)).toContain('resolve:secretsmanager');
    // La plantilla de llaves de la aplicación solo trae los nombres, vacíos.
    const app = recursos(t, 'AWS::SecretsManager::Secret').find((s) => s.Properties.Name === 'aptio-pruebas-aplicacion')!;
    const plantillaLlaves = JSON.parse(app.Properties.GenerateSecretString.SecretStringTemplate) as Record<string, string>;
    expect(Object.values(plantillaLlaves).every((v) => v === '')).toBe(true);
    expect(app.Properties.GenerateSecretString.GenerateStringKey).toBe('SESSION_SECRET');
  });

  it('la tarea de migraciones corre prisma migrate deploy y la verificación de organizaciones', () => {
    const m = contenedores.find((c) => c.Name === 'migracion')!;
    expect(m.Command.join(' ')).toContain('pnpm db:deploy && pnpm --filter @aptio/db verificar-organizaciones');
  });
});

describe('Producción · llaves del entorno', () => {
  it('en producción las pasarelas usan *_PRODUCCION y no existen la pasarela de pruebas ni el OSE simulado', () => {
    const llaves = llavesAplicacion('produccion');
    expect(llaves).toEqual(expect.arrayContaining(['STRIPE_LLAVE_SECRETA_PRODUCCION', 'STRIPE_SECRETO_WEBHOOK_PRODUCCION', 'CULQI_LLAVE_PUBLICA_PRODUCCION', 'CULQI_LLAVE_SECRETA_PRODUCCION', 'CULQI_SECRETO_WEBHOOK_PRODUCCION', 'ANTHROPIC_API_KEY', 'SMTP_URL', 'HUBSPOT_TOKEN', 'PIPEDRIVE_TOKEN']));
    expect(llaves.some((k) => k.endsWith('_PRUEBAS') || k.startsWith('PAGO_PRUEBA') || k.startsWith('OSE_PRUEBAS'))).toBe(false);
    expect(llavesAplicacion('pruebas')).toEqual(expect.arrayContaining(['STRIPE_LLAVE_SECRETA_PRUEBAS', 'PAGO_PRUEBA_SECRETO', 'OSE_PRUEBAS_SECRETO_WEBHOOK']));
  });

  it('la pila de producción lleva sitio en producción, sus llaves y el remitente sin secretos en el entorno', () => {
    const t = plantilla({ entorno: 'produccion', dominioOrigen: 'origen.aptioscorm.pe', certificadoAlbArn: 'arn:aws:acm:sa-east-1:1:certificate/x', modoProveedores: 'real', correoRemitente: 'Aptio SCORM <no-responder@aptioscorm.pe>' });
    const api = (recursos(t, 'AWS::ECS::TaskDefinition').flatMap((d) => d.Properties.ContainerDefinitions as any[])).find((c) => c.Name === 'api');
    expect(api.Environment).toEqual(expect.arrayContaining([{ Name: 'SITIO_ENTORNO', Value: 'produccion' }, { Name: 'PROVEEDORES_MODO', Value: 'real' }, { Name: 'CORREO_REMITENTE', Value: 'Aptio SCORM <no-responder@aptioscorm.pe>' }]));
    expect((api.Secrets as any[]).map((s) => s.Name)).toEqual(expect.arrayContaining(['STRIPE_LLAVE_SECRETA_PRODUCCION', 'CULQI_SECRETO_WEBHOOK_PRODUCCION']));
    expect((api.Secrets as any[]).map((s) => s.Name)).not.toContain('PAGO_PRUEBA_SECRETO');
    const app = recursos(t, 'AWS::SecretsManager::Secret').find((s) => s.Properties.Name === 'aptio-produccion-aplicacion')!;
    expect(Object.keys(JSON.parse(app.Properties.GenerateSecretString.SecretStringTemplate))).toEqual(expect.arrayContaining(['STRIPE_LLAVE_SECRETA_PRODUCCION', 'MIFACT_TOKEN']));
    // Sin mifactUrl, producción no apunta a la demo de Mifact.
    expect((api.Environment as any[]).map((e) => e.Name)).not.toContain('MIFACT_URL');
  });
});

describe('HU-1405 · comportamientos de CloudFront', () => {
  const t = plantilla();
  const { cfg, porRuta } = comportamientos(t);
  const CACHING_DISABLED = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
  const CACHING_OPTIMIZED = '658327ea-f89d-4fab-a63d-7e88639e58f6';
  const ALL_VIEWER_EXCEPT_HOST = 'b689b0a8-53d0-40ab-baf2-68738e2966ac';

  it('la web estática sale del bucket con caché optimizada y las rutas de la SPA caen en index.html', () => {
    expect(Object.keys(porRuta).sort()).toEqual(['/api/*', '/assets/*', '/s', '/s/*']);
    expect(cfg.DefaultRootObject).toBe('index.html');
    expect(cfg.DefaultCacheBehavior.CachePolicyId).toBe(CACHING_OPTIMIZED);
    expect(cfg.DefaultCacheBehavior.FunctionAssociations).toEqual([expect.objectContaining({ EventType: 'viewer-request' })]);
    expect(porRuta['/assets/*'].CachePolicyId).toBe(CACHING_OPTIMIZED);
    // Sin respuestas de error personalizadas: un 404 de la API llega tal cual.
    expect(cfg.CustomErrorResponses).toBeUndefined();
  });

  it('/api/* va al balanceador sin caché, con todos los métodos y las cookies, la consulta y las cabeceras del visitante', () => {
    const api = porRuta['/api/*'];
    expect(api.CachePolicyId).toBe(CACHING_DISABLED);
    expect(api.OriginRequestPolicyId).toBe(ALL_VIEWER_EXCEPT_HOST);
    expect(api.AllowedMethods).toEqual(expect.arrayContaining(['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE']));
    expect(api.ViewerProtocolPolicy).toBe('https-only');
    expect(api.TargetOriginId).toBe(porRuta['/s/*'].TargetOriginId);
  });

  it('/s/* respeta el Cache-Control del origen, no reenvía cookies ni consulta y deja pasar los POST de los formularios', () => {
    for (const ruta of ['/s/*', '/s']) {
      const b = porRuta[ruta];
      expect(b.AllowedMethods).toEqual(expect.arrayContaining(['POST']));
      expect(b.OriginRequestPolicyId).toBeUndefined();
    }
    t.hasResourceProperties('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: Match.objectLike({
        MinTTL: 0,
        DefaultTTL: 0,
        MaxTTL: 31536000,
        ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
          CookiesConfig: { CookieBehavior: 'none' },
          QueryStringsConfig: { QueryStringBehavior: 'none' },
          HeadersConfig: { HeaderBehavior: 'none' },
        }),
      }),
    });
  });

  it('las cabeceras de seguridad del sitio no reemplazan la CSP que arma cada versión (SUP-266)', () => {
    const politicas = recursos(t, 'AWS::CloudFront::ResponseHeadersPolicy');
    expect(politicas).toHaveLength(2);
    // La del sitio no trae CSP (la pone cada versión); la de la web sí (M3, más abajo).
    const sitio = politicas.find((p) => p.Properties.ResponseHeadersPolicyConfig.Name.endsWith('cabeceras-sitio'))!;
    expect(sitio.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy).toBeUndefined();
    for (const p of politicas) {
      const seg = p.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig;
      expect(seg.StrictTransportSecurity).toMatchObject({ AccessControlMaxAgeSec: 31536000, IncludeSubdomains: true });
      expect(seg.ContentTypeOptions).toMatchObject({ Override: true });
    }
  });
});

describe('HU-1405 · dimensionamiento mínimo', () => {
  const t = plantilla();

  it('1 réplica de la API y 1 del worker en Fargate, con vuelta atrás si el despliegue falla', () => {
    const servicios = recursos(t, 'AWS::ECS::Service');
    expect(servicios).toHaveLength(2);
    for (const s of servicios) {
      expect(s.Properties.DesiredCount).toBe(1);
      expect(s.Properties.LaunchType).toBe('FARGATE');
      expect(s.Properties.DeploymentConfiguration.DeploymentCircuitBreaker).toEqual({ Enable: true, Rollback: true });
      expect(s.Properties.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp).toBe('DISABLED');
    }
  });

  it('el primer despliegue deja los servicios en 0 hasta migrar la base', () => {
    for (const s of recursos(plantilla({ replicas: '0' }), 'AWS::ECS::Service')) expect(s.Properties.DesiredCount).toBe(0);
  });

  it('PostgreSQL 16 y Redis 7 con una instancia cada uno, en subredes aisladas y sin acceso público', () => {
    t.hasResourceProperties('AWS::RDS::DBInstance', { Engine: 'postgres', EngineVersion: Match.stringLikeRegexp('^16'), MultiAZ: false, PubliclyAccessible: false, StorageEncrypted: true, DeletionProtection: true });
    t.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', { Engine: 'redis', EngineVersion: Match.stringLikeRegexp('^7'), NumCacheClusters: 1 });
    t.hasResourceProperties('AWS::ElastiCache::ParameterGroup', { Properties: { 'maxmemory-policy': 'noeviction' } });
  });

  it('las imágenes de los servicios llevan la etiqueta del despliegue', () => {
    const json = JSON.stringify(recursos(t, 'AWS::ECS::TaskDefinition'));
    expect(json).toContain('aptio-pruebas-api:abc123');
    expect(json).toContain('aptio-pruebas-worker:abc123');
  });
});

describe('HU-1405 · pila base (ECR y OIDC)', () => {
  const app = new App();
  const t = Template.fromStack(new BaseStack(app, 'AptioBase-pruebas', { env, config: { entorno: 'pruebas', repositorioGithub: 'jesuuss23/aptio-scorm' } }));

  it('dos repositorios con etiquetas inmutables, cifrado KMS y escaneo al subir', () => {
    t.resourceCountIs('AWS::ECR::Repository', 2);
    for (const nombre of ['aptio-pruebas-api', 'aptio-pruebas-worker']) {
      t.hasResourceProperties('AWS::ECR::Repository', { RepositoryName: nombre, ImageTagMutability: 'IMMUTABLE', ImageScanningConfiguration: { ScanOnPush: true }, EncryptionConfiguration: { EncryptionType: 'KMS' } });
    }
  });

  it('el rol de despliegue solo lo asume el entorno «pruebas» del repositorio con OIDC (sin llaves de AWS en GitHub)', () => {
    t.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'aptio-pruebas-despliegue-github',
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: { StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com', 'token.actions.githubusercontent.com:sub': 'repo:jesuuss23/aptio-scorm:environment:pruebas' } },
        })],
      },
    });
    t.resourceCountIs('AWS::IAM::AccessKey', 0);
    t.resourceCountIs('AWS::IAM::User', 0);
  });
});

describe('Revisión de seguridad para la nube · infraestructura', () => {
  it('M4 · producción exige HTTPS entre CloudFront y el balanceador', () => {
    expect(() => leerConfig((k) => ({ entorno: 'produccion' })[k])).toThrow('dominioOrigen y certificadoAlbArn son obligatorios');
    expect(() => leerConfig((k) => ({ entorno: 'pruebas' })[k])).not.toThrow();
  });

  it('M3 · la web y la API salen con una CSP sin scripts en línea ni eval', () => {
    const politicas = recursos(plantilla(), 'AWS::CloudFront::ResponseHeadersPolicy');
    const web = politicas.find((p) => p.Properties.ResponseHeadersPolicyConfig.Name === 'aptio-pruebas-cabeceras-web')!;
    const csp = web.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy;
    expect(csp).toEqual({ ContentSecurityPolicy: CSP_WEB, Override: true });
    const script = CSP_WEB.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(script).toBe("script-src 'self' https://checkout.culqi.com");
    expect(CSP_WEB).not.toContain('unsafe-eval');
    expect(CSP_WEB).toContain("object-src 'none'");
    expect(CSP_WEB).toContain("frame-ancestors 'self'");
    // El sitio público conserva la CSP propia de cada versión (SUP-266).
    const sitio = politicas.find((p) => p.Properties.ResponseHeadersPolicyConfig.Name === 'aptio-pruebas-cabeceras-sitio')!;
    expect(sitio.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy).toBeUndefined();
  });

  it('M1 · AWS WAF en us-east-1 con reputación de IP, entradas maliciosas y límites por IP, asociado a la distribución', () => {
    const app = new App();
    const config = leerConfig((k) => ({ etiquetaImagen: 'abc123' })[k as 'etiquetaImagen']);
    const waf = new WafStack(app, 'AptioWaf-pruebas', { env: { account: CUENTA, region: REGION_WAF }, config, crossRegionReferences: true });
    const entorno = new EntornoStack(app, 'AptioPruebas', { env, config, webAclArn: waf.webAclArn, crossRegionReferences: true });
    const tw = Template.fromStack(waf);
    const [acl] = recursos(tw, 'AWS::WAFv2::WebACL');
    expect(acl!.Properties.Scope).toBe('CLOUDFRONT');
    expect(acl!.Properties.DefaultAction).toEqual({ Allow: {} });
    const reglas = acl!.Properties.Rules as any[];
    expect(reglas.map((r) => r.Name)).toEqual(['AWSManagedRulesAmazonIpReputationList', 'AWSManagedRulesKnownBadInputsRuleSet', 'LimiteIngreso', 'LimiteGlobal']);
    // Sin el conjunto común de AWS: corta cuerpos de más de 8 KB y rompería el guardado de cursos.
    expect(reglas.some((r) => r.Statement.ManagedRuleGroupStatement?.Name === 'AWSManagedRulesCommonRuleSet')).toBe(false);
    const ingreso = reglas.find((r) => r.Name === 'LimiteIngreso');
    expect(ingreso.Action).toEqual({ Block: {} });
    expect(ingreso.Statement.RateBasedStatement).toMatchObject({ Limit: LIMITE_WAF_AUTH, AggregateKeyType: 'IP', EvaluationWindowSec: 300 });
    expect(ingreso.Statement.RateBasedStatement.ScopeDownStatement.ByteMatchStatement).toMatchObject({ SearchString: '/api/v1/auth/', PositionalConstraint: 'STARTS_WITH' });
    const { cfg } = comportamientos(Template.fromStack(entorno));
    expect(cfg.WebACLId).toBeDefined();
  });
});
