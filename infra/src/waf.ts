// Revisión de seguridad para la nube (M1) · AWS WAF delante de CloudFront. Una Web ACL de alcance CLOUDFRONT solo se
// crea en us-east-1, así que vive en su propia pila (`AptioWaf-<entorno>`) y la del entorno la recibe por referencia
// entre regiones. Reglas sin falsos positivos con el JSON de los cursos (no se usa el conjunto común de AWS, que corta
// cuerpos de más de 8 KB): reputación de IP, entradas maliciosas conocidas y dos límites por IP.
import { Stack, type StackProps, Tags } from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';
import type { ConfigEntorno } from './config';

/** La región donde CloudFront busca su Web ACL. */
export const REGION_WAF = 'us-east-1';
/** Peticiones por IP en 5 minutos a las rutas de ingreso (`/api/v1/auth/`); más, 403 durante la ventana. */
export const LIMITE_WAF_AUTH = 100;
/** Peticiones por IP en 5 minutos a todo el sitio y la API. */
export const LIMITE_WAF_GLOBAL = 3000;

export interface WafProps extends StackProps {
  config: ConfigEntorno;
}

const visibilidad = (nombre: string): wafv2.CfnWebACL.VisibilityConfigProperty => ({
  cloudWatchMetricsEnabled: true,
  metricName: nombre,
  sampledRequestsEnabled: true,
});

const administrada = (prioridad: number, nombre: string): wafv2.CfnWebACL.RuleProperty => ({
  name: nombre,
  priority: prioridad,
  overrideAction: { none: {} },
  statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: nombre } },
  visibilityConfig: visibilidad(nombre),
});

export class WafStack extends Stack {
  readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: WafProps) {
    super(scope, id, props);
    const c = props.config;
    Tags.of(this).add('aptio:entorno', c.entorno);
    Tags.of(this).add('aptio:proyecto', 'aptio-scorm');
    const acl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `aptio-${c.entorno}-waf`,
      // CloudFormation solo admite ASCII sin dos puntos en la descripción de una Web ACL.
      description: `Aptio SCORM ${c.entorno} - reputacion de IP, entradas maliciosas y limites por IP`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: visibilidad(`aptio-${c.entorno}-waf`),
      rules: [
        administrada(0, 'AWSManagedRulesAmazonIpReputationList'),
        administrada(1, 'AWSManagedRulesKnownBadInputsRuleSet'),
        {
          name: 'LimiteIngreso',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: LIMITE_WAF_AUTH,
              evaluationWindowSec: 300,
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                byteMatchStatement: {
                  fieldToMatch: { uriPath: {} },
                  positionalConstraint: 'STARTS_WITH',
                  searchString: '/api/v1/auth/',
                  textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                },
              },
            },
          },
          visibilityConfig: visibilidad('LimiteIngreso'),
        },
        {
          name: 'LimiteGlobal',
          priority: 3,
          action: { block: {} },
          statement: { rateBasedStatement: { limit: LIMITE_WAF_GLOBAL, evaluationWindowSec: 300, aggregateKeyType: 'IP' } },
          visibilityConfig: visibilidad('LimiteGlobal'),
        },
      ],
    });
    this.webAclArn = acl.attrArn;
  }
}
