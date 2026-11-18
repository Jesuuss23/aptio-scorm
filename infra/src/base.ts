// HU-1405 · Pila base de la cuenta: los repositorios de imágenes (ECR) y el rol que GitHub Actions asume con OIDC para
// desplegar. La crea una sola vez un administrador desde su equipo (docs/24-puesta-en-marcha-aws.md); el despliegue
// continuo nunca guarda llaves de AWS en GitHub.
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { type ConfigEntorno, nombreBucket } from './config';

export const SERVICIOS = ['api', 'worker'] as const;

export interface BaseProps extends StackProps {
  config: Pick<ConfigEntorno, 'entorno' | 'repositorioGithub'>;
  /** Si la cuenta ya tiene el proveedor OIDC de GitHub (solo puede haber uno por cuenta), su ARN. */
  proveedorOidcArn?: string;
}

export class BaseStack extends Stack {
  readonly repositorios: Record<(typeof SERVICIOS)[number], ecr.Repository>;
  readonly rolDespliegue: iam.Role;

  constructor(scope: Construct, id: string, props: BaseProps) {
    super(scope, id, props);
    const { entorno, repositorioGithub } = props.config;

    const repos = {} as Record<(typeof SERVICIOS)[number], ecr.Repository>;
    for (const servicio of SERVICIOS) {
      repos[servicio] = new ecr.Repository(this, `Repo-${servicio}`, {
        repositoryName: `aptio-${entorno}-${servicio}`,
        imageScanOnPush: true,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        encryption: ecr.RepositoryEncryption.KMS,
        removalPolicy: RemovalPolicy.RETAIN,
        lifecycleRules: [{ description: 'Guarda las 30 imágenes más recientes', maxImageCount: 30 }],
      });
    }
    this.repositorios = repos;

    const proveedor = props.proveedorOidcArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GithubOidc', props.proveedorOidcArn)
      : new iam.OpenIdConnectProvider(this, 'GithubOidc', { url: 'https://token.actions.githubusercontent.com', clientIds: ['sts.amazonaws.com'] });

    // Solo el entorno de GitHub con el mismo nombre (`pruebas`), que el workflow usa en la rama main, puede asumirlo.
    this.rolDespliegue = new iam.Role(this, 'RolDespliegue', {
      roleName: `aptio-${entorno}-despliegue-github`,
      description: `GitHub Actions (${repositorioGithub}, entorno ${entorno}) despliega Aptio SCORM con OIDC`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(proveedor.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${repositorioGithub}:environment:${entorno}`,
        },
      }),
    });

    for (const repo of Object.values(repos)) repo.grantPullPush(this.rolDespliegue);
    this.rolDespliegue.addToPolicy(new iam.PolicyStatement({ sid: 'TokenEcr', actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }));
    // `cdk deploy` asume los roles que crea `cdk bootstrap`; los permisos sobre los recursos los tienen esos roles.
    this.rolDespliegue.addToPolicy(new iam.PolicyStatement({
      sid: 'RolesCdk',
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
    }));
    // La tarea previa de migraciones, la subida de la web y la lectura de las salidas de la pila.
    this.rolDespliegue.addToPolicy(new iam.PolicyStatement({
      sid: 'TareaMigraciones',
      actions: ['ecs:DescribeTaskDefinition', 'ecs:RegisterTaskDefinition', 'ecs:RunTask', 'ecs:DescribeTasks', 'ecs:DescribeServices', 'logs:GetLogEvents', 'cloudformation:DescribeStacks'],
      resources: ['*'],
    }));
    this.rolDespliegue.addToPolicy(new iam.PolicyStatement({
      sid: 'PasarRolesDeTareas',
      actions: ['iam:PassRole'],
      resources: [`arn:aws:iam::${this.account}:role/Aptio*`],
      conditions: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
    }));
    // La web estática va a su bucket (con su clave KMS, vía S3) y se invalida la caché de la distribución del entorno.
    const bucketWeb = nombreBucket(entorno, 'web', this.account);
    this.rolDespliegue.addToPolicy(new iam.PolicyStatement({
      sid: 'Web',
      actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [`arn:aws:s3:::${bucketWeb}`, `arn:aws:s3:::${bucketWeb}/*`],
    }));
    this.rolDespliegue.addToPolicy(new iam.PolicyStatement({
      sid: 'ClaveWeb',
      actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
      resources: ['*'],
      conditions: { StringEquals: { 'kms:ViaService': `s3.${this.region}.amazonaws.com` } },
    }));
    this.rolDespliegue.addToPolicy(new iam.PolicyStatement({
      sid: 'Invalidacion',
      actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
      resources: ['*'],
      conditions: { StringEquals: { 'aws:ResourceTag/aptio:entorno': entorno } },
    }));

    new CfnOutput(this, 'RolDespliegueArn', { value: this.rolDespliegue.roleArn, description: 'Va en el secreto AWS_ROLE_ARN del entorno de GitHub' });
    for (const [servicio, repo] of Object.entries(repos)) new CfnOutput(this, `Repo${servicio}`, { value: repo.repositoryUri });
  }
}
