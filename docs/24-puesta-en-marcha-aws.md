# 24 · Puesta en marcha del entorno de pruebas en AWS (HU-1405)

Guía para dejar funcionando, por primera vez, el entorno de pruebas en una cuenta de AWS y cerrar la verificación de CP-105. La infraestructura está en `infra/` (AWS CDK en TypeScript), las imágenes en `docker/` y el despliegue continuo en `.github/workflows/deploy-pruebas.yml`. Todo va en **sa-east-1** (ADR-009). Producción queda fuera: se arma igual, con otro nombre de entorno, en una historia propia.

## Qué se crea

| Pila | Quién la despliega | Contenido |
| --- | --- | --- |
| `AptioBase-pruebas` | Un administrador, una vez, desde su equipo | Repositorios ECR `aptio-pruebas-api` y `aptio-pruebas-worker` (etiquetas inmutables, cifrado KMS, escaneo al subir) y el rol `aptio-pruebas-despliegue-github`, que GitHub Actions asume con OIDC. |
| `AptioPruebas` | El workflow, en cada CI exitoso de `main` | Red con subredes públicas (balanceador y NAT), privadas (tareas) y aisladas (datos); PostgreSQL 16 (RDS, `db.t4g.micro`) y Redis 7 (ElastiCache, `cache.t4g.micro`), una instancia cada uno; buckets de web, material y respaldos cifrados con KMS y sin acceso público; ECS Fargate con 1 réplica de la API y 1 del worker; balanceador y CloudFront. |

Las credenciales viven solo en Secrets Manager:

| Secreto | Contenido | Quién lo llena |
| --- | --- | --- |
| `aptio-pruebas-postgres` | Usuario, clave, host, puerto y base de PostgreSQL | RDS, al crear la base |
| `aptio-pruebas-redis` | Clave de acceso (AUTH) de ElastiCache | CDK, al crear la pila |
| `aptio-pruebas-aplicacion` | `SESSION_SECRET` (generado) y las llaves de proveedores, vacías al crear | El equipo (paso 5) |
| `aptio-pruebas-totp-clave` | `TOTP_CLAVE_CIFRADO` (generada): cifra el segundo factor del superadmin; solo la recibe la API y se conserva al borrar la pila (HU-1515) | Nadie: no se toca |
| `aptio-pruebas-origen-cloudfront` | Valor de la cabecera `X-Origen-Aptio` entre CloudFront y el balanceador | CDK, al crear la pila |

## Requisitos

- Una cuenta de AWS con acceso de administrador para los pasos 1 a 3 (después, el despliegue usa solo el rol de OIDC).
- En el equipo del administrador: Node 22, pnpm 10, AWS CLI v2 con un perfil de esa cuenta (`aws sts get-caller-identity` debe responder) y Docker para el paso 4.
- Permiso de administración del repositorio en GitHub para crear el entorno `pruebas`.

## 1. Preparar CDK en la cuenta (bootstrap)

```bash
pnpm install
export AWS_PROFILE=<perfil-de-la-cuenta>
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
pnpm --filter @aptio/infra exec cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/sa-east-1 aws://$CDK_DEFAULT_ACCOUNT/us-east-1
```

Crea los roles `cdk-*` y el bucket de recursos de CDK en las dos regiones. **us-east-1 hace falta** porque la Web ACL de AWS WAF que protege CloudFront solo puede vivir allí: va en su propia pila, `AptioWaf-<entorno>`, que `cdk deploy Aptio<Entorno>` despliega primero por su cuenta (la del entorno la toma por referencia entre regiones). El certificado de CloudFront de un dominio propio también va en us-east-1 (paso 7).

## 2. Crear la pila base (ECR y rol de GitHub con OIDC)

```bash
pnpm --filter @aptio/infra exec cdk deploy AptioBase-pruebas
```

Si la cuenta ya tiene el proveedor OIDC de GitHub (solo puede haber uno por cuenta), se pasa su ARN para no crear otro: `-c proveedorOidcArn=arn:aws:iam::<cuenta>:oidc-provider/token.actions.githubusercontent.com`.

La salida `RolDespliegueArn` es el ARN del rol. El rol solo lo puede asumir un trabajo del repositorio `jesuuss23/aptio-scorm` que use el entorno de GitHub `pruebas` (otro repositorio se indica con `-c repositorioGithub=dueño/nombre`).

## 3. Configurar el entorno `pruebas` en GitHub

En el repositorio: **Settings › Environments › New environment › `pruebas`**.

1. En **Deployment branches and tags**, elegir *Selected branches* y agregar `main`.
2. En **Environment variables**, crear `AWS_ROLE_ARN` con el valor de `RolDespliegueArn`. No es un secreto: el rol solo se asume con el token OIDC de este repositorio y este entorno. No se guarda ninguna llave de AWS en GitHub.

Mientras la variable no exista, el workflow «Despliegue a pruebas» termina con el aviso «Despliegue omitido» y no falla.

## 4. Primer despliegue

Desde **Actions › Despliegue a pruebas › Run workflow** (rama `main`), o con el siguiente push a `main` cuando el CI pase. El workflow:

1. Entra a AWS con OIDC y a ECR.
2. Construye y publica `api` y `worker` con la etiqueta del commit, y construye la web estática.
3. Como la pila `AptioPruebas` aún no existe, la crea con **0 réplicas** (`-c replicas=0`): la API no puede arrancar sobre una base sin migrar. RDS y CloudFront tardan entre 15 y 30 minutos la primera vez.
4. Corre la tarea efímera de base de datos (`infra/scripts/migrar.sh`): `pnpm db:deploy` (`prisma migrate deploy`) y `pnpm --filter @aptio/db verificar-organizaciones`. Si termina con un código distinto de 0, el despliegue se detiene y deja en el registro las últimas líneas de la tarea.
5. Actualiza la pila con 1 réplica de la API y 1 del worker. ECS reemplaza las tareas sin cortar el servicio y vuelve atrás solo si las nuevas no quedan sanas.
6. Sube la web al bucket (los archivos con hash como inmutables, `index.html` sin caché) e invalida `/index.html`.
7. Comprueba por HTTPS que `/api/v1/salud` responde `estado: ok` con `baseDatos: ok`, que la web responde 200 y que HTTP redirige a HTTPS.

La dirección del entorno queda en el resumen del trabajo y en la salida `UrlWeb` de la pila (por ejemplo `https://d1234abcd.cloudfront.net`).

> Para desplegar a mano desde el equipo del administrador, se usan los mismos comandos del workflow: publicar las imágenes en ECR con la etiqueta elegida, `infra/scripts/migrar.sh AptioPruebas <imagen-api>` y `pnpm --filter @aptio/infra exec cdk deploy AptioPruebas -c etiquetaImagen=<etiqueta>`.

## 5. Cargar las llaves de los proveedores

La pila arranca con `PROVEEDORES_MODO=simulado`: funciona sin costo de IA. Para usar los proveedores reales, cargar las llaves en el secreto `aptio-pruebas-aplicacion` (consola de Secrets Manager › *Retrieve secret value* › *Edit*, o con la CLI). Las claves que no se usen quedan vacías.

```bash
aws secretsmanager get-secret-value --secret-id aptio-pruebas-aplicacion --query SecretString --output text > /tmp/llaves.json
# Editar /tmp/llaves.json: ANTHROPIC_API_KEY, GOOGLE_TTS_API_KEY, SMTP_URL, … (no tocar SESSION_SECRET)
aws secretsmanager put-secret-value --secret-id aptio-pruebas-aplicacion --secret-string file:///tmp/llaves.json
shred -u /tmp/llaves.json
```

Luego se cambia el modo a real con un despliegue que lleve `-c modoProveedores=real` (o se cambia ese valor en `infra/cdk.json` con un PR). ECS lee los secretos al arrancar cada tarea: tras editar el secreto, basta forzar un despliegue nuevo de los servicios (`aws ecs update-service --cluster aptio-pruebas-cluster --service aptio-pruebas-api --force-new-deployment`, y lo mismo con `aptio-pruebas-worker`).

**Facturación con Mifact (HU-1712).** El token `MIFACT_TOKEN` va en el mismo secreto `aptio-<entorno>-aplicacion`, pero la infraestructura se lo pasa **solo al worker**: la API nunca lo recibe. El RUC del emisor en Ventas › Facturación › Datos fiscales debe ser el del token. La URL no es secreta y se pasa como contexto: fuera de producción, si no se indica, se usa la demo (`https://demo.mifact.net.pe/api/invoiceService.svc`); en producción es obligatorio indicarla con `-c mifactUrl=https://…` (debe ser HTTPS). Tras cambiar el token, basta forzar un despliegue nuevo del worker.

## 6. Crear el primer usuario y verificar CP-105

1. Sembrar los datos iniciales con una tarea efímera sobre la imagen de la API (comando `pnpm db:seed`, con `SEED_CLAVE` definida solo en esa ejecución) o invitar al primer administrador según `docs/manuales/Manual-Sistema.md`. En la nube la semilla corre con `NODE_ENV=production` y por eso **exige `SEED_CLAVE` de al menos 16 caracteres** (distinta de la de desarrollo), **solo corre sobre una base vacía** (no borra nada) y no escribe la clave en el registro. Genera la clave con `openssl rand -base64 24`, entra enseguida como superadmin para configurar su segundo factor y cambia las claves de los usuarios de ejemplo.
2. Completar CP-105 en el entorno, y anotar el resultado en `docs/ESTADO.md`:
   - `GET https://<UrlWeb>/api/v1/salud` responde 200 con `baseDatos: ok`.
   - `http://<UrlWeb>/` responde 301 hacia HTTPS.
   - Entrar, crear un proyecto, subir un documento (va al bucket de material cifrado con la clave `alias/aptio-pruebas-datos`) y exportar LOTO en SCORM 1.2.
   - En Operación, «Respaldar ahora» deja la copia en el bucket de respaldos (SUP-157) y `pnpm respaldo:restaurar` la recupera en una base de prueba.
   - Publicar el sitio y medir Lighthouse detrás de CloudFront: `SITIO_LIGHTHOUSE_URL=https://<UrlWeb>/s pnpm sitio:lighthouse` (SUP-199).
   - Los registros de cada servicio están en CloudWatch, en `/aptio/pruebas/api`, `/aptio/pruebas/worker` y `/aptio/pruebas/migracion`.

## 7. Dominio propio (opcional)

Sin dominio, el entorno usa la URL HTTPS de CloudFront. Para un dominio como `pruebas.aptioscorm.pe`:

1. Pedir en ACM, **en us-east-1**, el certificado del dominio de la web, y en **sa-east-1** el de un nombre para el balanceador (por ejemplo `origen-pruebas.aptioscorm.pe`). Validarlos por DNS.
2. Desplegar con los cuatro valores (en `infra/cdk.json` o con `-c`):
   `dominio`, `certificadoCloudFrontArn`, `dominioOrigen` y `certificadoAlbArn`.
3. En el DNS: `pruebas.aptioscorm.pe` como CNAME (o alias de Route 53) de la distribución, y `origen-pruebas.aptioscorm.pe` como CNAME del balanceador.

Con el certificado del balanceador, CloudFront llega a él solo por HTTPS (TLS 1.2) y el puerto 80 deja de existir. **En producción es obligatorio**: sin `dominioOrigen` y `certificadoAlbArn`, el despliegue de `produccion` se detiene, para que las cookies de sesión y la cabecera secreta nunca viajen sin cifrar. En pruebas es opcional: sin él, el tramo CloudFront → balanceador va por HTTP dentro de la red de AWS, y el balanceador solo acepta la lista de prefijos `com.amazonaws.global.cloudfront.origin-facing` con la cabecera secreta; cualquier otra petición recibe 403.

## Caché y cabeceras de CloudFront

| Ruta | Origen | Caché | Notas |
| --- | --- | --- | --- |
| `/` y rutas de la aplicación | Bucket web (OAC) | Optimizada | Una función cambia toda ruta sin extensión por `/index.html`; los errores de la API no se reemplazan. |
| `/assets/*` | Bucket web (OAC) | Optimizada | Archivos con hash, inmutables. |
| `/api/*` | Balanceador | Sin caché | Todos los métodos, cookies, consulta y cabeceras del visitante (salvo `Host`). Incluye `/api/v1/publico/leads` y `/api/v1/publico/citas*` (SUP-250, SUP-255). |
| `/s` y `/s/*` | Balanceador | La decide el origen con `Cache-Control` (SUP-197) | Sin cookies ni consulta (SUP-238). Deja pasar `POST /s/_lead`, `_popup`, `_cita` y `_visita` (SUP-238, SUP-250, SUP-255, SUP-274). |

Todas las respuestas llevan HSTS de un año y `X-Content-Type-Options: nosniff`. En `/s/*` CloudFront no agrega ni reemplaza la CSP: la arma cada versión del sitio (SUP-266). La web y la API llevan la CSP `CSP_WEB` de `infra/src/entorno.ts`: sin scripts en línea ni `eval`, scripts solo propios y de Culqi Checkout, imágenes, audio y subidas solo hacia S3, sin marcos ajenos salvo Culqi y sin ser incrustada por otros sitios. Si se agrega un servicio externo en la web, hay que sumarlo ahí.

## AWS WAF

La pila `AptioWaf-<entorno>` (us-east-1) crea la Web ACL `aptio-<entorno>-waf` asociada a la distribución:

| Regla | Qué hace |
| --- | --- |
| `AWSManagedRulesAmazonIpReputationList` | Bloquea IP conocidas por bots y ataques (lista de AWS). |
| `AWSManagedRulesKnownBadInputsRuleSet` | Bloquea entradas maliciosas conocidas (por ejemplo, Log4Shell). |
| `LimiteIngreso` | Más de 100 peticiones en 5 minutos de una IP a `/api/v1/auth/`: bloqueada hasta que baje. |
| `LimiteGlobal` | Más de 3000 peticiones en 5 minutos de una IP a cualquier ruta: bloqueada hasta que baje. |

No se usa el conjunto común de AWS (`AWSManagedRulesCommonRuleSet`) porque corta los cuerpos de más de 8 KB y rompería el guardado de los cursos. La API suma su propio límite por IP: 20 intentos de ingreso por minuto (`LIMITE_INGRESO_POR_MINUTO`) y 60 por minuto en `/api/v1/publico/*` y en los formularios del sitio. Las métricas y las peticiones bloqueadas se ven en la consola de WAF (us-east-1). Costo aproximado: US$ 5 por la Web ACL, US$ 1 por regla al mes y US$ 0,60 por millón de peticiones; se confirma en la factura.

## Antes de producción

- MFA en la cuenta raíz de AWS y en cada usuario de IAM; la cuenta raíz no se usa para el día a día.
- GuardDuty y CloudTrail activos en sa-east-1 y us-east-1.
- Solo administradores pueden leer Secrets Manager y las plantillas de CloudFormation (`cloudformation:GetTemplate`): el token de Redis y la cabecera secreta del origen quedan en la plantilla de la pila.
- El entorno `produccion` de GitHub con aprobación manual.
- Rotar toda llave de proveedor que se haya compartido por chat o correo.
- El entorno de pruebas es público y usa la pasarela y el OSE simulados: solo con datos ficticios.

## Costos y tamaño

Dimensionamiento mínimo: 1 tarea de la API (0,5 vCPU, 1 GB), 1 del worker (1 vCPU, 2 GB), RDS `db.t4g.micro` con 20 GB (crece hasta 100 GB), ElastiCache `cache.t4g.micro`, 1 NAT y 1 balanceador. El NAT y el balanceador son los costos fijos más altos. El costo real se confirma en la factura del primer mes; esta guía no lo estima.

## Borrar el entorno

`cdk destroy AptioPruebas` borra el cómputo, la red y la web. La base tiene protección contra borrado (se quita con `-c proteccionBorrado=false` y un despliegue) y deja una instantánea; los buckets de material y respaldos, la clave de datos y los repositorios ECR se conservan a propósito y se borran a mano.
