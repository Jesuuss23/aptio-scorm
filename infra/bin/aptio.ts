// HU-1405 · App de CDK: la pila base (ECR y rol de GitHub con OIDC) y la del entorno en sa-east-1, más AWS WAF en us-east-1.
//   pnpm --filter @aptio/infra exec cdk deploy AptioBase-pruebas            (una vez, un administrador)
//   pnpm --filter @aptio/infra exec cdk deploy AptioPruebas -c etiquetaImagen=<sha>   (el despliegue continuo)
import { App } from 'aws-cdk-lib';
import { BaseStack } from '../src/base';
import { leerConfig, REGION } from '../src/config';
import { EntornoStack } from '../src/entorno';
import { REGION_WAF, WafStack } from '../src/waf';

const app = new App();
const config = leerConfig((clave) => app.node.tryGetContext(clave));
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION };
const titulo = config.entorno.charAt(0).toUpperCase() + config.entorno.slice(1);
const proveedorOidcArn = app.node.tryGetContext('proveedorOidcArn') as string | undefined;

new BaseStack(app, `AptioBase-${config.entorno}`, { env, config, ...(proveedorOidcArn ? { proveedorOidcArn } : {}), description: 'Aptio SCORM: imágenes y rol de despliegue (HU-1405)' });
// La Web ACL de CloudFront solo existe en us-east-1; la pila del entorno la toma por referencia entre regiones.
const waf = new WafStack(app, `AptioWaf-${config.entorno}`, {
  env: { account: env.account, region: REGION_WAF },
  config,
  crossRegionReferences: true,
  description: `Aptio SCORM: AWS WAF del entorno ${config.entorno}`,
});
new EntornoStack(app, `Aptio${titulo}`, { env, config, webAclArn: waf.webAclArn, crossRegionReferences: true, description: `Aptio SCORM: entorno ${config.entorno} (HU-1405)` });
app.synth();
