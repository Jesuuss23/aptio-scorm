// HU-1405 · Parámetros del entorno, leídos del contexto de CDK (`-c clave=valor` o cdk.json). Ninguno es secreto: las
// credenciales viven en Secrets Manager y las tareas las reciben de ahí (ADR-009).

/** Región de todo el despliegue (ADR-009: datos de clientes peruanos lo más cerca posible). */
export const REGION = 'sa-east-1';

export interface ConfigEntorno {
  /** Nombre corto del entorno: entra en los nombres de los recursos (`aptio-pruebas-…`). */
  entorno: string;
  /** Etiqueta de las imágenes en ECR que corren los servicios (el SHA del commit en el despliegue continuo). */
  etiquetaImagen: string;
  /** Dominio propio de la web (p. ej. `pruebas.aptioscorm.pe`). Sin él se usa la URL HTTPS de CloudFront. */
  dominio?: string;
  /** Certificado de ACM en us-east-1 para `dominio` (CloudFront solo acepta certificados de esa región). */
  certificadoCloudFrontArn?: string;
  /** Nombre del balanceador para CloudFront (p. ej. `origen-pruebas.aptioscorm.pe`), cubierto por `certificadoAlbArn`. */
  dominioOrigen?: string;
  /** Certificado de ACM en sa-east-1 para `dominioOrigen`: con él, CloudFront llega al balanceador solo por HTTPS. */
  certificadoAlbArn?: string;
  /** `simulado` (sin costo de IA, por defecto) o `real` (necesita las llaves de los proveedores en Secrets Manager). */
  modoProveedores: 'simulado' | 'real';
  /** Repositorio de GitHub que puede desplegar con OIDC (`dueño/nombre`). */
  repositorioGithub: string;
  /** Impide borrar la base de datos por error (activado por defecto). */
  proteccionBorrado: boolean;
  /** Remitente de los correos (`CORREO_REMITENTE`), p. ej. `Aptio SCORM <no-responder@aptioscorm.pe>`. No es secreto. */
  correoRemitente?: string;
  /** Réplicas de la API y del worker: 1; 0 solo en el primer despliegue, antes de migrar la base vacía. */
  replicas: 0 | 1;
  /**
   * HU-1712 · URL del servicio de Mifact (`MIFACT_URL`, no es secreto). Fuera de producción, la demo por defecto; en
   * producción se indica con `-c mifactUrl=…` (la que entregue Mifact). Sin ella, Mifact no está disponible.
   */
  mifactUrl?: string;
}

/** HU-1712 · La demo de Mifact (ambiente de pruebas, sin valor tributario). */
export const MIFACT_URL_DEMO = 'https://demo.mifact.net.pe/api/invoiceService.svc';

type LeerContexto = (clave: string) => unknown;

function texto(leer: LeerContexto, clave: string): string | undefined {
  const v = leer(clave);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function replicas(v: string | undefined): 0 | 1 {
  if (v === undefined || v === '1') return 1;
  if (v === '0') return 0;
  throw new Error(`replicas no válido: «${v}» (0 o 1)`);
}

/** Arma la configuración y rechaza combinaciones incompletas (un dominio sin su certificado, por ejemplo). */
export function leerConfig(leer: LeerContexto): ConfigEntorno {
  const entorno = texto(leer, 'entorno') ?? 'pruebas';
  if (!/^[a-z][a-z0-9-]{1,20}$/.test(entorno)) throw new Error(`entorno no válido: «${entorno}» (minúsculas, números y guiones)`);
  const modo = texto(leer, 'modoProveedores') ?? 'simulado';
  if (modo !== 'simulado' && modo !== 'real') throw new Error(`modoProveedores no válido: «${modo}» (simulado o real)`);
  const dominio = texto(leer, 'dominio');
  const certificadoCloudFrontArn = texto(leer, 'certificadoCloudFrontArn');
  if (Boolean(dominio) !== Boolean(certificadoCloudFrontArn)) throw new Error('dominio y certificadoCloudFrontArn van juntos');
  if (certificadoCloudFrontArn && !certificadoCloudFrontArn.startsWith('arn:aws:acm:us-east-1:')) {
    throw new Error('certificadoCloudFrontArn debe ser un certificado de ACM en us-east-1');
  }
  const dominioOrigen = texto(leer, 'dominioOrigen');
  const certificadoAlbArn = texto(leer, 'certificadoAlbArn');
  if (Boolean(dominioOrigen) !== Boolean(certificadoAlbArn)) throw new Error('dominioOrigen y certificadoAlbArn van juntos');
  if (certificadoAlbArn && !certificadoAlbArn.startsWith(`arn:aws:acm:${REGION}:`)) {
    throw new Error(`certificadoAlbArn debe ser un certificado de ACM en ${REGION}`);
  }
  // M4 · En producción, CloudFront habla con el balanceador solo por HTTPS: exige su dominio y su certificado.
  if (entorno === 'produccion' && !certificadoAlbArn) {
    throw new Error('En producción dominioOrigen y certificadoAlbArn son obligatorios (CloudFront → balanceador por HTTPS)');
  }
  const mifactUrl = texto(leer, 'mifactUrl') ?? (entorno === 'produccion' ? undefined : MIFACT_URL_DEMO);
  if (mifactUrl && !/^https:\/\/[^\s/]+(\/\S*)?$/.test(mifactUrl)) throw new Error(`mifactUrl no válida: «${mifactUrl}» (una URL https)`);
  return {
    entorno,
    etiquetaImagen: texto(leer, 'etiquetaImagen') ?? 'inicial',
    ...(dominio && certificadoCloudFrontArn ? { dominio, certificadoCloudFrontArn } : {}),
    ...(dominioOrigen && certificadoAlbArn ? { dominioOrigen, certificadoAlbArn } : {}),
    modoProveedores: modo,
    repositorioGithub: texto(leer, 'repositorioGithub') ?? 'jesuuss23/aptio-scorm',
    proteccionBorrado: texto(leer, 'proteccionBorrado') !== 'false',
    replicas: replicas(texto(leer, 'replicas')),
    ...(texto(leer, 'correoRemitente') ? { correoRemitente: texto(leer, 'correoRemitente')! } : {}),
    ...(mifactUrl ? { mifactUrl } : {}),
  };
}

/** Llaves comunes a todo entorno: proveedores de IA y voz, ingreso con Google, correo y CRM (ver apiskey.md). */
const LLAVES_COMUNES = [
  'ANTHROPIC_API_KEY',
  'GOOGLE_TTS_API_KEY',
  'GOOGLE_STT_API_KEY',
  'ELEVENLABS_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SMTP_URL',
  'HUBSPOT_TOKEN',
  'PIPEDRIVE_TOKEN',
  'ZOHO_CLIENT_ID',
  'ZOHO_CLIENT_SECRET',
  'ZOHO_REFRESH_TOKEN',
] as const;

/**
 * Llaves de la aplicación que el equipo carga en Secrets Manager después del primer despliegue (vacías al crear).
 * Las pasarelas usan el juego del modo del entorno (`*_PRODUCCION` en producción, `*_PRUEBAS` en los demás); la
 * pasarela de pruebas y el OSE simulado solo existen fuera de producción.
 */
export function llavesAplicacion(entorno: string): string[] {
  const s = entorno === 'produccion' ? 'PRODUCCION' : 'PRUEBAS';
  const pasarelas = [`STRIPE_LLAVE_SECRETA_${s}`, `STRIPE_SECRETO_WEBHOOK_${s}`, `CULQI_LLAVE_PUBLICA_${s}`, `CULQI_LLAVE_SECRETA_${s}`, `CULQI_SECRETO_WEBHOOK_${s}`];
  const soloPruebas = entorno === 'produccion' ? [] : ['PAGO_PRUEBA_SECRETO', 'OSE_PRUEBAS_SECRETO_WEBHOOK'];
  return [...LLAVES_COMUNES, ...pasarelas, ...soloPruebas];
}

/**
 * HU-1712 · Llaves que solo recibe el worker (también viven en el secreto `aptio-<entorno>-aplicacion`): el token de
 * Mifact, que es de un RUC emisor y rota cada 6 meses aprox. La API no emite: solo necesita `MIFACT_URL`.
 */
export const LLAVES_SOLO_WORKER = ['MIFACT_TOKEN'] as const;

/** Nombre único de un bucket del entorno: la cuenta lo vuelve irrepetible en todo S3. */
export function nombreBucket(entorno: string, uso: 'web' | 'material' | 'respaldos', cuenta: string): string {
  return `aptio-${entorno}-${uso}-${cuenta}`;
}
