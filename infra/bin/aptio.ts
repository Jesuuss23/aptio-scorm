// HU-1405 · App de CDK: la pila base (ECR y rol de GitHub con OIDC) y la del entorno, ambas en sa-east-1.
//   pnpm --filter @aptio/infra exec cdk deploy AptioBase-pruebas            (una vez, un administrador)
//   pnpm --filter @aptio/infra exec cdk deploy AptioPruebas -c etiquetaImagen=<sha>   (el despliegue continuo)
import { App } from 'aws-cdk-lib';
import { BaseStack } from '../src/base';
import { leerConfig, REGION } from '../src/config';
import { EntornoStack } from '../src/entorno';

const app = new App();
const config = leerConfig((clave) => app.node.tryGetContext(clave));
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION };
const titulo = config.entorno.charAt(0).toUpperCase() + config.entorno.slice(1);
const proveedorOidcArn = app.node.tryGetContext('proveedorOidcArn') as string | undefined;

new BaseStack(app, `AptioBase-${config.entorno}`, { env, config, ...(proveedorOidcArn ? { proveedorOidcArn } : {}), description: 'Aptio SCORM: imágenes y rol de despliegue (HU-1405)' });
new EntornoStack(app, `Aptio${titulo}`, { env, config, description: `Aptio SCORM: entorno ${config.entorno} (HU-1405)` });
app.synth();
