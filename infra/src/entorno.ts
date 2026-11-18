// HU-1405 · Pila del entorno (pruebas por defecto) en sa-east-1:
//   red privada → PostgreSQL 16 (RDS) y Redis 7 (ElastiCache), 1 instancia cada uno, sin acceso desde internet;
//   S3 → buckets de material y de respaldos cifrados con KMS, sin acceso público y solo por HTTPS (más el de la web);
//   ECS Fargate → 1 réplica de la API y 1 del worker, con sus credenciales solo desde Secrets Manager;
//   entrada → CloudFront (HTTPS) con la web estática y /api/* y /s/* hacia el balanceador de la API.
import { Aws, CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { type ConfigEntorno, LLAVES_APLICACION, nombreBucket } from './config';

export interface EntornoProps extends StackProps {
  config: ConfigEntorno;
}

/** Cabecera que CloudFront agrega hacia el balanceador; sin ella (o con otro valor) el balanceador responde 403. */
export const CABECERA_ORIGEN = 'X-Origen-Aptio';
/** Puerto de la API dentro del contenedor. */
const PUERTO_API = 3000;
/** Caracteres que no van en la clave de PostgreSQL: el punto de entrada arma DATABASE_URL sin codificarla (docker/entrada.sh). */
const FUERA_DE_URL = ` %+~\`#$&*()|[]{}:;<>?!'/@"\\=,^`;

export class EntornoStack extends Stack {
  constructor(scope: Construct, id: string, props: EntornoProps) {
    super(scope, id, props);
    const c = props.config;
    const nombre = (sufijo: string) => `aptio-${c.entorno}-${sufijo}`;
    Tags.of(this).add('aptio:entorno', c.entorno);
    Tags.of(this).add('aptio:proyecto', 'aptio-scorm');

    // ── Red: pública solo para el balanceador y la salida NAT; las tareas en privadas; los datos en aisladas. ──
    const vpc = new ec2.Vpc(this, 'Red', {
      vpcName: nombre('red'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'publica', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'privada', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'datos', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    vpc.addGatewayEndpoint('S3Directo', { service: ec2.GatewayVpcEndpointAwsService.S3 });

    const sgTareas = new ec2.SecurityGroup(this, 'SgTareas', { vpc, description: 'Tareas de la API y del worker' });
    const sgDatos = new ec2.SecurityGroup(this, 'SgDatos', { vpc, description: 'PostgreSQL y Redis: solo desde las tareas', allowAllOutbound: false });
    sgDatos.addIngressRule(sgTareas, ec2.Port.tcp(5432), 'PostgreSQL desde las tareas');
    sgDatos.addIngressRule(sgTareas, ec2.Port.tcp(6379), 'Redis desde las tareas');

    // ── Claves KMS: una para los datos (material, respaldos, base y caché) y otra para la web pública. ──
    const claveDatos = new kms.Key(this, 'ClaveDatos', {
      alias: `alias/${nombre('datos')}`,
      description: `Aptio SCORM ${c.entorno}: documentos del cliente, recursos, respaldos, base de datos y caché (ADR-009)`,
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const claveWeb = new kms.Key(this, 'ClaveWeb', {
      alias: `alias/${nombre('web')}`,
      description: `Aptio SCORM ${c.entorno}: archivos de la web estática`,
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ── Datos: PostgreSQL 16 y Redis 7, una instancia cada uno. ──
    const bd = new rds.DatabaseInstance(this, 'BaseDatos', {
      instanceIdentifier: nombre('postgres'),
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [sgDatos],
      databaseName: 'aptio_scorm',
      credentials: rds.Credentials.fromGeneratedSecret('aptio', { secretName: nombre('postgres'), excludeCharacters: FUERA_DE_URL, encryptionKey: claveDatos }),
      storageEncrypted: true,
      storageEncryptionKey: claveDatos,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: Duration.days(7),
      deletionProtection: c.proteccionBorrado,
      removalPolicy: c.proteccionBorrado ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      parameters: { 'rds.force_ssl': '1' },
      cloudwatchLogsExports: ['postgresql'],
    });
    const secretoBd = bd.secret!;

    const secretoRedis = new secretsmanager.Secret(this, 'SecretoRedis', {
      secretName: nombre('redis'),
      description: 'Clave de acceso (AUTH) de ElastiCache',
      encryptionKey: claveDatos,
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });
    const subredesRedis = new elasticache.CfnSubnetGroup(this, 'SubredesRedis', {
      description: 'Subredes aisladas de Redis',
      subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      cacheSubnetGroupName: nombre('redis'),
    });
    // BullMQ exige que Redis no descarte claves cuando se llena la memoria.
    const parametrosRedis = new elasticache.CfnParameterGroup(this, 'ParametrosRedis', {
      cacheParameterGroupFamily: 'redis7',
      description: 'Redis para BullMQ (sin desalojo de claves)',
      properties: { 'maxmemory-policy': 'noeviction' },
    });
    const redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupId: nombre('redis'),
      replicationGroupDescription: `Colas de Aptio SCORM (${c.entorno})`,
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: 'cache.t4g.micro',
      numCacheClusters: 1,
      automaticFailoverEnabled: false,
      cacheSubnetGroupName: subredesRedis.ref,
      cacheParameterGroupName: parametrosRedis.ref,
      securityGroupIds: [sgDatos.securityGroupId],
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      kmsKeyId: claveDatos.keyArn,
      authToken: secretoRedis.secretValue.unsafeUnwrap(),
      snapshotRetentionLimit: 1,
    });

    // ── Secretos de la aplicación: la clave de sesión se genera; las llaves de proveedores las carga el equipo. ──
    const secretoApp = new secretsmanager.Secret(this, 'SecretoAplicacion', {
      secretName: nombre('aplicacion'),
      description: 'Llaves de la aplicación (vacías al crear; ver docs/24-puesta-en-marcha-aws.md)',
      encryptionKey: claveDatos,
      generateSecretString: {
        secretStringTemplate: JSON.stringify(Object.fromEntries(LLAVES_APLICACION.map((k) => [k, '']))),
        generateStringKey: 'SESSION_SECRET',
        passwordLength: 64,
        excludePunctuation: true,
      },
    });
    const secretoOrigen = new secretsmanager.Secret(this, 'SecretoOrigen', {
      secretName: nombre('origen-cloudfront'),
      description: `Valor de la cabecera ${CABECERA_ORIGEN} entre CloudFront y el balanceador`,
      encryptionKey: claveDatos,
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });

    // ── Buckets: privados, cifrados con KMS y solo por HTTPS. ──
    const seguro = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.KMS,
      bucketKeyEnabled: true,
    } as const;
    const bucketWeb = new s3.Bucket(this, 'BucketWeb', {
      ...seguro,
      bucketName: nombreBucket(c.entorno, 'web', this.account),
      encryptionKey: claveWeb,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ── Entrada: balanceador de la API (solo atiende a CloudFront) y la distribución. ──
    const albHttps = Boolean(c.dominioOrigen && c.certificadoAlbArn);
    const sgAlb = new ec2.SecurityGroup(this, 'SgAlb', { vpc, description: 'Balanceador: solo desde CloudFront', allowAllOutbound: false });
    const prefijoCloudFront = ec2.PrefixList.fromLookup(this, 'PrefijoCloudFront', { prefixListName: 'com.amazonaws.global.cloudfront.origin-facing' });
    sgAlb.addIngressRule(ec2.Peer.prefixList(prefijoCloudFront.prefixListId), ec2.Port.tcp(albHttps ? 443 : 80), 'CloudFront (origin-facing)');
    sgAlb.addEgressRule(sgTareas, ec2.Port.tcp(PUERTO_API), 'Hacia la API');
    sgTareas.addIngressRule(sgAlb, ec2.Port.tcp(PUERTO_API), 'Desde el balanceador');

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Balanceador', {
      loadBalancerName: nombre('alb'),
      vpc,
      internetFacing: true,
      securityGroup: sgAlb,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      dropInvalidHeaderFields: true,
    });
    const listener = albHttps
      ? alb.addListener('Https', {
          port: 443,
          protocol: elbv2.ApplicationProtocol.HTTPS,
          sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
          certificates: [elbv2.ListenerCertificate.fromArn(c.certificadoAlbArn!)],
          open: false,
          defaultAction: elbv2.ListenerAction.fixedResponse(403, { contentType: 'text/plain', messageBody: 'Prohibido' }),
        })
      : alb.addListener('Http', {
          port: 80,
          protocol: elbv2.ApplicationProtocol.HTTP,
          open: false,
          defaultAction: elbv2.ListenerAction.fixedResponse(403, { contentType: 'text/plain', messageBody: 'Prohibido' }),
        });

    const respuestaSitio = new cloudfront.ResponseHeadersPolicy(this, 'CabecerasSitio', {
      responseHeadersPolicyName: nombre('cabeceras-sitio'),
      comment: 'Cabeceras de seguridad sin tocar la CSP de cada versión del sitio (SUP-266)',
      securityHeadersBehavior: {
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
        contentTypeOptions: { override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: false },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: false },
      },
    });
    const respuestaWeb = new cloudfront.ResponseHeadersPolicy(this, 'CabecerasWeb', {
      responseHeadersPolicyName: nombre('cabeceras-web'),
      comment: 'Cabeceras de seguridad de la web y la API',
      securityHeadersBehavior: {
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
        contentTypeOptions: { override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.SAMEORIGIN, override: false },
      },
    });

    // El sitio público respeta el Cache-Control del origen y no reenvía cookies ni la cadena de consulta (SUP-197, SUP-238).
    const cacheSitio = new cloudfront.CachePolicy(this, 'CacheSitio', {
      cachePolicyName: nombre('cache-sitio'),
      comment: 'Sitio público: el origen decide con Cache-Control (SUP-197)',
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Con dominio propio del balanceador, CloudFront valida su certificado; sin él, va por HTTP dentro de AWS hasta un
    // balanceador que solo acepta la lista de prefijos de CloudFront y la cabecera secreta.
    const cabecerasOrigen = { [CABECERA_ORIGEN]: secretoOrigen.secretValue.unsafeUnwrap() };
    const origenApi: cloudfront.IOrigin = albHttps
      ? new origins.HttpOrigin(c.dominioOrigen!, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
          customHeaders: cabecerasOrigen,
          readTimeout: Duration.seconds(60),
        })
      : new origins.LoadBalancerV2Origin(alb, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          customHeaders: cabecerasOrigen,
          readTimeout: Duration.seconds(60),
        });
    const haciaApi: Omit<cloudfront.BehaviorOptions, 'origin'> = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: respuestaWeb,
      compress: true,
    };
    const haciaSitio: Omit<cloudfront.BehaviorOptions, 'origin'> = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      // Los formularios del sitio (POST /s/_lead, _popup, _cita y _visita) llegan al origen sin guardarse en caché.
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cacheSitio,
      responseHeadersPolicy: respuestaSitio,
      compress: true,
    };

    // Las rutas de la aplicación (React) vuelven a index.html sin tocar las respuestas de la API.
    const rutasSpa = new cloudfront.Function(this, 'RutasSpa', {
      functionName: nombre('rutas-spa'),
      comment: 'Rutas de la web sin extensión → /index.html',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (r.uri.indexOf('.') === -1) { r.uri = '/index.html'; } return r; }",
      ),
    });
    const origenWeb = origins.S3BucketOrigin.withOriginAccessControl(bucketWeb);
    const dominioPropio = c.dominio && c.certificadoCloudFrontArn;
    const distribucion = new cloudfront.Distribution(this, 'Distribucion', {
      comment: `Aptio SCORM ${c.entorno}`,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      ...(dominioPropio
        ? { domainNames: [c.dominio!], certificate: acm.Certificate.fromCertificateArn(this, 'CertificadoWeb', c.certificadoCloudFrontArn!) }
        : {}),
      defaultBehavior: {
        origin: origenWeb,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: respuestaWeb,
        functionAssociations: [{ function: rutasSpa, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
        compress: true,
      },
      additionalBehaviors: {
        '/assets/*': {
          origin: origenWeb,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: respuestaWeb,
          compress: true,
        },
        '/api/*': { origin: origenApi, ...haciaApi },
        '/s/*': { origin: origenApi, ...haciaSitio },
        '/s': { origin: origenApi, ...haciaSitio },
      },
    });
    const urlWeb = dominioPropio ? `https://${c.dominio}` : `https://${distribucion.distributionDomainName}`;

    // El material se sube y se baja con URL firmadas desde el navegador: CORS solo para el origen de la web.
    const bucketMaterial = new s3.Bucket(this, 'BucketMaterial', {
      ...seguro,
      bucketName: nombreBucket(c.entorno, 'material', this.account),
      encryptionKey: claveDatos,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [{
        allowedOrigins: [urlWeb],
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD, s3.HttpMethods.PUT, s3.HttpMethods.POST],
        allowedHeaders: ['*'],
        exposedHeaders: ['ETag'],
        maxAge: 3000,
      }],
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(2) }],
    });
    // Respaldos (HU-1403, SUP-157): nadie los pide desde el navegador, así que no tienen CORS.
    const bucketRespaldos = new s3.Bucket(this, 'BucketRespaldos', {
      ...seguro,
      bucketName: nombreBucket(c.entorno, 'respaldos', this.account),
      encryptionKey: claveDatos,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30), abortIncompleteMultipartUploadAfter: Duration.days(2) }],
    });

    // ── Cómputo: ECS Fargate con 1 réplica de cada servicio. ──
    const cluster = new ecs.Cluster(this, 'Cluster', { clusterName: nombre('cluster'), vpc, containerInsightsV2: ecs.ContainerInsights.ENABLED });
    const repos: Record<string, ecr.IRepository> = {};
    const imagen = (servicio: 'api' | 'worker') => {
      repos[servicio] ??= ecr.Repository.fromRepositoryName(this, `Repo-${servicio}`, nombre(servicio));
      return ecs.ContainerImage.fromEcrRepository(repos[servicio], c.etiquetaImagen);
    };

    // Variables sin secretos: nombres, regiones y direcciones.
    const entornoComun: Record<string, string> = {
      NODE_ENV: 'production',
      AWS_REGION: Aws.REGION,
      S3_BUCKET_NAME: bucketMaterial.bucketName,
      S3_BUCKET_RESPALDOS: bucketRespaldos.bucketName,
      KMS_KEY_ID: claveDatos.keyArn,
      REDIS_HOST: redis.attrPrimaryEndPointAddress,
      REDIS_PORT: redis.attrPrimaryEndPointPort,
      REDIS_TLS: 'true',
      PROVEEDORES_MODO: c.modoProveedores,
      // Fuera de producción: avisos de datos ficticios, pasarela de pruebas y OSE simulado (HU-1505, SUP-314).
      SITIO_ENTORNO: c.entorno === 'produccion' ? 'produccion' : 'pruebas',
      WEB_URL: urlWeb,
      SITIO_URL: `${urlWeb}/s`,
    };
    // Credenciales: solo referencias a Secrets Manager; ECS las inyecta al arrancar la tarea.
    const secretosComunes: Record<string, ecs.Secret> = {
      DB_HOST: ecs.Secret.fromSecretsManager(secretoBd, 'host'),
      DB_PORT: ecs.Secret.fromSecretsManager(secretoBd, 'port'),
      DB_NAME: ecs.Secret.fromSecretsManager(secretoBd, 'dbname'),
      DB_USER: ecs.Secret.fromSecretsManager(secretoBd, 'username'),
      DB_PASSWORD: ecs.Secret.fromSecretsManager(secretoBd, 'password'),
      REDIS_PASSWORD: ecs.Secret.fromSecretsManager(secretoRedis),
      SESSION_SECRET: ecs.Secret.fromSecretsManager(secretoApp, 'SESSION_SECRET'),
      ...Object.fromEntries(LLAVES_APLICACION.map((k) => [k, ecs.Secret.fromSecretsManager(secretoApp, k)])),
    };

    const registros = (servicio: string) => ecs.LogDrivers.awsLogs({
      streamPrefix: servicio,
      logGroup: new logs.LogGroup(this, `Registros-${servicio}`, { logGroupName: `/aptio/${c.entorno}/${servicio}`, retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
    });
    const permisosDatos = (tarea: ecs.TaskDefinition) => {
      bucketMaterial.grantReadWrite(tarea.taskRole);
      bucketMaterial.grantDelete(tarea.taskRole);
      bucketRespaldos.grantReadWrite(tarea.taskRole);
      bucketRespaldos.grantDelete(tarea.taskRole);
      claveDatos.grantEncryptDecrypt(tarea.taskRole);
    };

    // API
    const tareaApi = new ecs.FargateTaskDefinition(this, 'TareaApi', { family: nombre('api'), cpu: 512, memoryLimitMiB: 1024, runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX } });
    tareaApi.addContainer('api', {
      image: imagen('api'),
      // CloudFront y el balanceador: la API toma la IP del visitante para sus límites (SUP-169).
      environment: { ...entornoComun, PORT: String(PUERTO_API), TRUST_PROXY: '2' },
      secrets: secretosComunes,
      portMappings: [{ containerPort: PUERTO_API }],
      logging: registros('api'),
      healthCheck: {
        command: ['CMD-SHELL', `node -e "fetch('http://127.0.0.1:${PUERTO_API}/api/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        startPeriod: Duration.seconds(60),
        retries: 3,
      },
    });
    permisosDatos(tareaApi);
    const servicioApi = new ecs.FargateService(this, 'ServicioApi', {
      serviceName: nombre('api'),
      cluster,
      taskDefinition: tareaApi,
      desiredCount: c.replicas,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      securityGroups: [sgTareas],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { enable: true, rollback: true },
      healthCheckGracePeriod: Duration.seconds(90),
      enableExecuteCommand: false,
    });
    const grupoApi = new elbv2.ApplicationTargetGroup(this, 'DestinoApi', {
      vpc,
      port: PUERTO_API,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targets: [servicioApi],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: { path: '/api/v1/salud', healthyHttpCodes: '200', interval: Duration.seconds(30) },
    });
    // Solo pasa lo que trae la cabecera secreta de CloudFront.
    listener.addAction('DesdeCloudFront', {
      priority: 10,
      conditions: [elbv2.ListenerCondition.httpHeader(CABECERA_ORIGEN, [secretoOrigen.secretValue.unsafeUnwrap()])],
      action: elbv2.ListenerAction.forward([grupoApi]),
    });

    // Worker
    const tareaWorker = new ecs.FargateTaskDefinition(this, 'TareaWorker', { family: nombre('worker'), cpu: 1024, memoryLimitMiB: 2048, runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX } });
    tareaWorker.addContainer('worker', {
      image: imagen('worker'),
      environment: { ...entornoComun, WORKER_CONCURRENCIA: '2' },
      secrets: secretosComunes,
      logging: registros('worker'),
    });
    permisosDatos(tareaWorker);
    new ecs.FargateService(this, 'ServicioWorker', {
      serviceName: nombre('worker'),
      cluster,
      taskDefinition: tareaWorker,
      desiredCount: c.replicas,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      securityGroups: [sgTareas],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { enable: true, rollback: true },
    });

    // Tarea efímera de base de datos (el despliegue la corre antes de actualizar los servicios).
    const tareaMigracion = new ecs.FargateTaskDefinition(this, 'TareaMigracion', { family: nombre('migracion'), cpu: 256, memoryLimitMiB: 512, runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX } });
    tareaMigracion.addContainer('migracion', {
      image: imagen('api'),
      workingDirectory: '/app',
      command: ['sh', '-c', 'pnpm db:deploy && pnpm --filter @aptio/db verificar-organizaciones'],
      environment: { NODE_ENV: 'production' },
      secrets: {
        DB_HOST: ecs.Secret.fromSecretsManager(secretoBd, 'host'),
        DB_PORT: ecs.Secret.fromSecretsManager(secretoBd, 'port'),
        DB_NAME: ecs.Secret.fromSecretsManager(secretoBd, 'dbname'),
        DB_USER: ecs.Secret.fromSecretsManager(secretoBd, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(secretoBd, 'password'),
      },
      logging: registros('migracion'),
    });

    // ── Salidas que lee el despliegue continuo. ──
    new CfnOutput(this, 'UrlWeb', { value: urlWeb, description: 'Dirección HTTPS del entorno' });
    new CfnOutput(this, 'DistribucionId', { value: distribucion.distributionId });
    new CfnOutput(this, 'BucketWebNombre', { value: bucketWeb.bucketName });
    new CfnOutput(this, 'ClusterNombre', { value: cluster.clusterName });
    new CfnOutput(this, 'FamiliaMigracion', { value: tareaMigracion.family });
    new CfnOutput(this, 'SubredesTareas', { value: Fn.join(',', vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds) });
    new CfnOutput(this, 'SgTareasId', { value: sgTareas.securityGroupId });
    new CfnOutput(this, 'SecretoAplicacionArn', { value: secretoApp.secretArn, description: 'Aquí se cargan las llaves de los proveedores' });
  }
}
