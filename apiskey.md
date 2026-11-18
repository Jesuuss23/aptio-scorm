# Llaves y servicios externos para producción

Lista de todas las llaves (API keys, tokens y secretos) que Aptio SCORM necesita para funcionar en producción: qué servicio da cada una, dónde se obtiene y qué hace en el sistema. Las revisé contra el código el 18 de noviembre de 2026.

> **Dónde se ponen:** en la nube **nunca** van en el repositorio ni en GitHub. Van en AWS Secrets Manager, en el secreto `aptio-<entorno>-aplicacion` (por ejemplo `aptio-produccion-aplicacion`). Cómo cargarlas está en `docs/24-puesta-en-marcha-aws.md`, paso 5. En local van en los `.env` de `apps/api`, `apps/worker` y `packages/db`, que no se suben al repositorio.
>
> **Cómo se activa producción:** se despliega la infraestructura con el entorno `produccion` (ver el final de este archivo). Así el secreto `aptio-produccion-aplicacion` nace con las variables `*_PRODUCCION` de las pasarelas (vacías) y sin las de pruebas, y `SITIO_ENTORNO` queda en `produccion`. Después, cada pasarela se pone en modo «producción» desde el panel del superadmin (Ventas › Pasarelas).

## Antes de empezar: lo que todavía no está listo para producción

Esto no se arregla con una llave. Conviene saberlo antes de comprar planes o contratar servicios:

| Tema | Estado | Qué falta |
| --- | --- | --- |
| **Facturación electrónica SUNAT** | Solo existe el OSE **simulado**, que emite únicamente en el ambiente de pruebas. | Elegir el OSE o PSE real (DA-09) e integrarlo en una historia nueva. Sin eso, en producción **no se emiten comprobantes válidos ante SUNAT**. |
| **Segundo factor del superadmin** | No existe todavía (SUP-167). | Una historia propia antes de abrir producción. |
| **Imágenes con IA** | No hay un proveedor de imágenes conectado (DA-03). Las ilustraciones salen de la biblioteca y del kit. | No hace falta ninguna llave por ahora. |
| **Pruebas con llaves reales** | Stripe, Culqi, Anthropic, Google, ElevenLabs y los CRM están integrados según su documentación, pero **no se han probado con llaves reales**. | Probarlos primero en el entorno de pruebas con sus llaves de prueba o sandbox. |

## 1. Generadas por el sistema (no tienes que conseguirlas)

| Variable | Qué es | Quién la crea |
| --- | --- | --- |
| `SESSION_SECRET` | Firma la cookie de sesión de los usuarios. | La infraestructura la genera al crear el secreto. No la cambies: si cambia, todos los usuarios deben volver a ingresar. |
| `DATABASE_URL` (`DB_*`) | Conexión a PostgreSQL. | RDS crea el usuario y la clave en `aptio-<entorno>-postgres`. |
| `REDIS_PASSWORD` | Clave de acceso a Redis (colas). | La infraestructura, en `aptio-<entorno>-redis`. |
| `KMS_KEY_ID`, `S3_BUCKET_NAME`, `S3_BUCKET_RESPALDOS` | Cifrado y buckets de archivos y respaldos. | La infraestructura. En la nube no hacen falta llaves de AWS: las tareas usan su rol. |

## 2. Inteligencia artificial y voz

### Anthropic (Claude): `ANTHROPIC_API_KEY`
- **Dónde:** [console.anthropic.com](https://console.anthropic.com) › Settings › API keys › Create key. Necesita un plan de pago con facturación activa (ADR-010: solo planes de pago con uso comercial).
- **Para qué sirve:** es la IA de texto del generador. Arma la estructura y el storyboard, resume los documentos del cliente, escribe el contenido de las interacciones, traduce al inglés, revisa la calidad, propone correcciones de alineación y responde en el chatbot del sitio.
- **Opcionales:** `ANTHROPIC_MODEL_TEXTO`, `ANTHROPIC_MODEL_RAPIDO` y `ANTHROPIC_MODEL_PANTALLAS` cambian el modelo por tarea (por defecto `claude-opus-5-5`). `ANTHROPIC_ESFUERZO` fija el esfuerzo.
- **Sin ella:** en modo real, las etapas de IA fallan con un motivo claro.

### Google Cloud Text-to-Speech: `GOOGLE_TTS_API_KEY`
- **Dónde:** [console.cloud.google.com](https://console.cloud.google.com). Crea un proyecto, activa **Cloud Text-to-Speech API** (APIs y servicios › Biblioteca) y crea una clave en APIs y servicios › Credenciales › Crear credenciales › Clave de API. Restríngela a esa API. Necesita la facturación activada.
- **Para qué sirve:** es la voz por defecto del personaje (voces GA). Genera las narraciones de la etapa 6 y la muestra de voz en el kit de marca.

### Google Cloud Speech-to-Text: `GOOGLE_STT_API_KEY`
- **Dónde:** en el mismo proyecto de Google Cloud, activa **Cloud Speech-to-Text API** y crea otra clave (o amplía la anterior) restringida a esa API.
- **Para qué sirve:** transcribe el audio y el video que sube el cliente en «Material del cliente», para resumirlos o volverlos interactivos.
- **Opcional:** `GOOGLE_STT_MODELO` (por defecto `latest_long`).

### ElevenLabs: `ELEVENLABS_API_KEY`
- **Dónde:** [elevenlabs.io](https://elevenlabs.io) › Profile › API Keys. Usa un plan de pago con licencia comercial.
- **Para qué sirve:** es la voz alternativa (modelo `eleven_multilingual_v2`). Se elige en Empresa › Conexiones IA y también sirve para el botón «Probar». Es opcional si usarás solo Google.

## 3. Pagos

Cada pasarela tiene un juego de llaves de **pruebas** y otro de **producción**. El superadmin elige el modo en Ventas › Pasarelas, y el panel muestra qué variables faltan (los nombres, nunca los valores).

### Stripe (cobros en dólares)
| Variable | Dónde se obtiene |
| --- | --- |
| `STRIPE_LLAVE_SECRETA_PRODUCCION` | [dashboard.stripe.com](https://dashboard.stripe.com) › Developers › API keys › **Secret key** (`sk_live_…`), con la cuenta activada para cobros reales. |
| `STRIPE_SECRETO_WEBHOOK_PRODUCCION` | Developers › Webhooks › Add endpoint. URL: `https://<tu-dominio>/api/v1/webhooks/pago/stripe`. Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`. Al crearlo, copia el **Signing secret** (`whsec_…`). |
| `STRIPE_LLAVE_SECRETA_PRUEBAS`, `STRIPE_SECRETO_WEBHOOK_PRUEBAS` | Lo mismo con el modo de prueba de Stripe activado (`sk_test_…`), para el entorno de pruebas. |

- **Para qué sirve:** cobra las suscripciones y las cápsulas adicionales en dólares con Stripe Checkout. El webhook firmado confirma el pago. También hace los reembolsos.

### Culqi (cobros en soles)
| Variable | Dónde se obtiene |
| --- | --- |
| `CULQI_LLAVE_PUBLICA_PRODUCCION` | [panel.culqi.com](https://panel.culqi.com) › Desarrollo › API Keys › llave pública (`pk_live_…`), con el comercio aprobado para producción. |
| `CULQI_LLAVE_SECRETA_PRODUCCION` | La misma pantalla › llave secreta (`sk_live_…`). |
| `CULQI_SECRETO_WEBHOOK_PRODUCCION` | Desarrollo › Eventos o Webhooks: registra `https://<tu-dominio>/api/v1/webhooks/pago/culqi` y copia el secreto de firma que entrega Culqi. La firma se integró según su documentación pública y falta confirmarla en su sandbox (SUP-294). |
| `CULQI_..._PRUEBAS` (las tres) | Las mismas llaves del ambiente de integración (`pk_test_…` y `sk_test_…`). |

- **Para qué sirve:** cobra en soles con el formulario de Culqi: tarjetas y, según lo que tenga habilitado tu comercio, otros medios. También hace los reembolsos. La pasarela principal en soles sigue como decisión abierta (DA-10).

### Pasarela de pruebas: `PAGO_PRUEBA_SECRETO`
- **Para qué sirve:** solo en el entorno de pruebas (`SITIO_ENTORNO=pruebas`). Firma los pagos simulados de las tarjetas de prueba 4111 y 0002. **En producción no se usa.** Puedes inventar cualquier cadena larga y aleatoria.

## 4. Facturación electrónica

### OSE simulado: `OSE_PRUEBAS_SECRETO_WEBHOOK`
- **Para qué sirve:** solo en el entorno de pruebas. Firma los avisos del OSE simulado. Es una cadena aleatoria que inventas tú.
- **Producción:** necesita un OSE real (DA-09), que aún no está integrado. Cuando se elija, se sumarán sus llaves a esta lista.

## 5. Correo

### `SMTP_URL` y `CORREO_REMITENTE`
- **Dónde:** en tu proveedor de correo transaccional: Amazon SES (en la misma cuenta AWS, SES › SMTP settings › Create SMTP credentials), SendGrid, Mailgun o el SMTP de Google Workspace. Verifica el dominio remitente (SPF y DKIM) para no caer en spam.
- **Formato:** `smtps://USUARIO:CLAVE@servidor:465` (o `smtp://…:587`). Si el usuario o la clave tienen símbolos, codifícalos para URL.
- **`CORREO_REMITENTE`:** la dirección que verá el usuario, por ejemplo `Aptio SCORM <no-responder@tu-dominio.com>`. No es secreta, así que no va en Secrets Manager: se pasa al desplegar con `-c correoRemitente="Aptio SCORM <no-responder@tu-dominio.com>"`.
- **Para qué sirve:** envía las invitaciones, la recuperación de clave, el aviso de comentarios del revisor del cliente, el aviso del límite de gasto de IA, las confirmaciones de citas del agendador, los comprobantes y los avisos de cobranza (renovación, pago pendiente y suspensión).
- **Sin ella:** en producción la API se niega a enviar correos y la acción falla con un error. No conviene arrancar sin ella.

## 6. Ingreso con Google

### `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`
- **Dónde:** en Google Cloud › APIs y servicios › Pantalla de consentimiento de OAuth (tipo externo o interno, con el nombre y el logo de Aptio SCORM). Luego Credenciales › Crear credenciales › **ID de cliente de OAuth** › Aplicación web. En **URI de redireccionamiento autorizados** agrega `https://<tu-dominio>/api/v1/auth/google/callback`.
- **Opcional:** `GOOGLE_REDIRECT_URI`, solo si el callback no es `<WEB_URL>/api/v1/auth/google/callback`.
- **Para qué sirve:** permite el botón «Ingresar con Google», solo para correos ya invitados (ADR-009). Nunca crea cuentas. Sin estas llaves, el ingreso con correo y clave funciona igual.

## 7. CRM (opcional: solo el que use el equipo comercial, DA-11)

| CRM | Variables | Dónde |
| --- | --- | --- |
| HubSpot | `HUBSPOT_TOKEN` | HubSpot › Configuración › Integraciones › **Apps privadas** › Crear app privada, con permisos de lectura y escritura de contactos. Copia el token de acceso. |
| Pipedrive | `PIPEDRIVE_TOKEN` | Pipedrive › Preferencias personales › **API** › tu token personal. |
| Zoho CRM | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` y `ZOHO_REFRESH_TOKEN` (y `ZOHO_DOMINIO` solo en local) | [api-console.zoho.com](https://api-console.zoho.com) › Self Client o Server-based Application. Genera un código con el alcance `ZohoCRM.modules.ALL` y cámbialo por un refresh token. `ZOHO_DOMINIO` es la región de tu cuenta (`com`, `eu`, `in`…). Por defecto es `com`, y en la nube solo funciona ese valor por ahora. |

- **Para qué sirve:** envía al CRM cada lead del sitio (formulario, popup, chatbot y agendador) con su origen y UTM. El CRM se elige en Captación › CRM. El webhook firmado propio no necesita llaves externas: el sistema genera su secreto.

## 8. Blog (sin llave)

El blog lee la API REST pública de WordPress. Solo hay que guardar la URL del sitio en Sitio web › Blog. No usa llaves y solo lee artículos publicados y sin clave.

## Resumen para producción

| Prioridad | Llaves |
| --- | --- |
| **Imprescindibles** | `ANTHROPIC_API_KEY`, `GOOGLE_TTS_API_KEY`, `SMTP_URL` (+ `CORREO_REMITENTE`) y al menos una pasarela en modo producción (Stripe o Culqi, con su llave secreta y su secreto de webhook) |
| **Recomendadas** | `GOOGLE_STT_API_KEY` (audio y video del cliente), `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (ingreso con Google) |
| **Opcionales** | `ELEVENLABS_API_KEY`, la segunda pasarela y el token del CRM que use ventas |
| **No las consigues tú** | `SESSION_SECRET`, la base, Redis, KMS y los buckets (las crea la infraestructura) |
| **Solo para pruebas** | Las variantes `_PRUEBAS`, `PAGO_PRUEBA_SECRETO` y `OSE_PRUEBAS_SECRETO_WEBHOOK` |

Después de cargar o cambiar una llave en Secrets Manager, fuerza un despliegue nuevo de la API y del worker para que la lean (`docs/24-puesta-en-marcha-aws.md`, paso 5).

## Cómo desplegar producción

El despliegue automático solo actualiza **pruebas**. Producción se despliega a mano, con los mismos pasos de `docs/24-puesta-en-marcha-aws.md` y el nombre de entorno `produccion`:

```bash
export AWS_PROFILE=<perfil-de-la-cuenta>
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
pnpm --filter @aptio/infra exec cdk deploy AptioBase-produccion -c entorno=produccion
# Publica las imágenes en los ECR aptio-produccion-api y aptio-produccion-worker con una etiqueta (p. ej. el SHA de main).
pnpm --filter @aptio/infra exec cdk deploy AptioProduccion -c entorno=produccion -c modoProveedores=real \
  -c etiquetaImagen=<etiqueta> -c replicas=0 -c correoRemitente="Aptio SCORM <no-responder@tu-dominio.com>" \
  -c dominio=<tu-dominio> -c certificadoCloudFrontArn=<arn us-east-1> -c dominioOrigen=<origen.tu-dominio> -c certificadoAlbArn=<arn sa-east-1>
ENTORNO=produccion infra/scripts/migrar.sh AptioProduccion <registro>/aptio-produccion-api:<etiqueta>
# Carga las llaves de este archivo en aptio-produccion-aplicacion y vuelve a desplegar sin -c replicas=0.
```

En producción conviene usar un dominio propio con sus dos certificados: así todo el camino va por HTTPS (SUP-334). Los cuatro valores `-c` del dominio van juntos.
