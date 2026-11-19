# Manual de APIs y servicios externos · Aptio SCORM

**Versión 1.00 · 19 de noviembre de 2026**

Este manual amplía `apiskey.md`: para cada servicio externo que usa Aptio SCORM explica para qué sirve, cómo se consigue la credencial, qué planes hay, cuánto cuesta como referencia, qué límites de uso tiene, dónde va la variable y cómo comprobar que funciona.

> **Costos referenciales.** Todos los montos de este manual se consultaron el **19 de noviembre de 2026** en la página oficial que se enlaza en cada caso. Son **referenciales**: los proveedores cambian sus precios, aplican impuestos o descuentos por volumen, y algunos solo cotizan. Antes de contratar, revisa el enlace. Los montos están en dólares de EE. UU. salvo que se indique otra moneda.

> **Estado de las pruebas.** Stripe, Culqi, Anthropic, Google, ElevenLabs, Mifact y los CRM están integrados según su documentación pública, pero **no se han probado con llaves reales** desde el equipo de desarrollo. El paso «Cómo verificar» de cada servicio es el que hay que hacer en el entorno de pruebas antes de pasar a producción.

## Índice

1. [Dónde van las variables](#1-dónde-van-las-variables)
2. [Resumen de servicios](#2-resumen-de-servicios)
3. [Anthropic (Claude)](#3-anthropic-claude)
4. [Google Cloud Text-to-Speech](#4-google-cloud-text-to-speech)
5. [Google Cloud Speech-to-Text](#5-google-cloud-speech-to-text)
6. [ElevenLabs](#6-elevenlabs)
7. [Mifact (facturación electrónica SUNAT)](#7-mifact-facturación-electrónica-sunat)
8. [Culqi (cobros en soles)](#8-culqi-cobros-en-soles)
9. [Stripe (cobros en dólares)](#9-stripe-cobros-en-dólares)
10. [Correo SMTP (Amazon SES u otro)](#10-correo-smtp-amazon-ses-u-otro)
11. [Ingreso con Google (OAuth)](#11-ingreso-con-google-oauth)
12. [HubSpot](#12-hubspot)
13. [Pipedrive](#13-pipedrive)
14. [Zoho CRM](#14-zoho-crm)
15. [WordPress (blog)](#15-wordpress-blog)
16. [AWS (infraestructura)](#16-aws-infraestructura)
17. [Previstos, aún no conectados](#17-previstos-aún-no-conectados)
18. [Cómo estima el sistema el costo por curso](#18-cómo-estima-el-sistema-el-costo-por-curso)
19. [Historial](#19-historial)

## 1. Dónde van las variables

| Entorno | Dónde | Notas |
| --- | --- | --- |
| Nube (AWS, pruebas y producción) | AWS Secrets Manager, secreto `aptio-<entorno>-aplicacion` | Nunca en el repositorio ni en GitHub. Después de cambiar una llave, fuerza un despliegue nuevo de la API y del worker (`docs/24-puesta-en-marcha-aws.md`, paso 5). |
| VPS de pruebas | Archivos `.env` del servidor, fuera del repositorio | Ver el anexo VPS de `Manual-Sistema.md`. |
| Local | `apps/api/.env`, `apps/worker/.env` y `packages/db/.env` | Copias de los `.env.example`; no se suben al repositorio. |

El sistema funciona sin llaves en **modo simulado** (`PROVEEDORES_MODO=simulado`): la IA responde con el caso LOTO grabado y la voz devuelve silencio. Para usar los servicios reales, el worker y la API corren con `PROVEEDORES_MODO=real`.

Las pasarelas de pago tienen dos juegos de llaves, `*_PRUEBAS` y `*_PRODUCCION`. El superadmin elige el modo en **Ventas › Pasarelas**, y el panel muestra qué variables faltan (los nombres, nunca los valores).

## 2. Resumen de servicios

| Servicio | Para qué | Variables | ¿Imprescindible? | Costo referencial (19-11-2026) |
| --- | --- | --- | --- | --- |
| Anthropic | IA de texto del generador y del chatbot | `ANTHROPIC_API_KEY` | Sí | Opus 5.5: $4 entrada / $20 salida por millón de tokens |
| Google Text-to-Speech | Voz por defecto | `GOOGLE_TTS_API_KEY` | Sí | Neural2 $16 por millón de caracteres (1 millón gratis al mes) |
| Google Speech-to-Text | Transcribir audio y video del cliente | `GOOGLE_STT_API_KEY` | Recomendada | V2 estándar $0,016 por minuto |
| ElevenLabs | Voz alternativa | `ELEVENLABS_API_KEY` | Opcional | Planes desde $6 al mes |
| Mifact | Comprobantes electrónicos SUNAT | `MIFACT_TOKEN` (+ `MIFACT_URL`) | Sí, en producción | Desde S/ 45 al mes; la API se cotiza |
| Culqi | Cobros en soles | `CULQI_*` | Al menos una pasarela | 3,44 % + US$0,20 por cobro nacional |
| Stripe | Cobros en dólares | `STRIPE_*` | Al menos una pasarela | 2,9 % + 30¢ (EE. UU.) |
| SMTP (Amazon SES) | Todos los correos | `SMTP_URL`, `CORREO_REMITENTE` | Sí | SES: $0,10 por 1.000 correos |
| Google OAuth | Botón «Ingresar con Google» | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Recomendada | Sin costo |
| HubSpot | Enviar leads al CRM | `HUBSPOT_TOKEN` | Opcional | Según el plan de HubSpot |
| Pipedrive | Enviar leads al CRM | `PIPEDRIVE_TOKEN` | Opcional | Según el plan de Pipedrive |
| Zoho CRM | Enviar leads al CRM | `ZOHO_*` | Opcional | Según la edición de Zoho |
| WordPress | Artículos del blog | Ninguna (URL en el panel) | Opcional | Sin costo de API |
| AWS | Infraestructura | Las crea la infraestructura | Sí | Usar calculator.aws (sa-east-1) |

## 3. Anthropic (Claude)

**Para qué sirve.** Es la IA de texto. Arma la estructura y el storyboard, resume los documentos del cliente, compone las pantallas y el contenido de las interacciones, traduce al inglés, revisa la calidad, propone correcciones de alineación y responde en el chatbot del sitio comercial. Todas sus salidas se validan contra un esquema JSON antes de guardarse.

**Cómo obtener la credencial.**
1. Entra a [platform.claude.com](https://platform.claude.com) (antes console.anthropic.com) con la cuenta de la empresa.
2. Activa la facturación en **Settings › Billing** y carga crédito o un medio de pago. ADR-010 exige un plan de pago con uso comercial.
3. Ve a **Settings › API keys › Create key**, ponle un nombre (por ejemplo `aptio-produccion`) y cópiala. Solo se muestra una vez.
4. Opcional: crea un *workspace* por entorno para separar el gasto de pruebas y producción.

**Planes y costos referenciales** ([precios](https://platform.claude.com/docs/en/about-claude/pricing), consultado el 19-11-2026, referencial):

| Modelo | Entrada | Salida | Lectura de caché | Uso en Aptio |
| --- | --- | --- | --- | --- |
| Claude Opus 5.5 (`claude-opus-5-5`) | $4 / MTok | $20 / MTok | $0,20 / MTok | Modelo por defecto de todas las tareas |
| Claude Sonnet 5.5 | $2 / MTok | $10 / MTok | — | Alternativa más barata (`ANTHROPIC_MODEL_RAPIDO`) |
| Claude Haiku 5.5 | $0,10 / MTok (hasta 100k tokens) | $0,50 / MTok | — | Alternativa para tareas cortas |

MTok es un millón de tokens. La escritura de caché de 5 minutos cuesta $5 por MTok con Opus 5.5. El procesamiento por lotes (Batch) tiene 50 % de descuento, pero Aptio no lo usa hoy.

**Límites de uso** ([límites](https://platform.claude.com/docs/en/api/rate-limits)): se miden por organización en solicitudes por minuto (RPM), tokens de entrada por minuto (ITPM) y tokens de salida por minuto (OTPM). La organización sube de nivel según su historial; las nuevas empiezan en un nivel de evaluación con límites más bajos. Los niveles Start, Build y Scale tienen tope de gasto mensual ($500, $1.000 y $200.000). El límite estándar publicado para Opus 5.5 es 1.000 RPM, 2 millones ITPM y 400.000 OTPM, como máximo; los límites reales de la cuenta están en **Console › Rate limits**. Al pasarse, la API responde 429 con `retry-after`; la etapa queda en error con su motivo y se puede **Continuar** sin repetir lo que ya estaba listo.

**Dónde va.** `ANTHROPIC_API_KEY` en `aptio-<entorno>-aplicacion` (la usan la API, para el chatbot, y el worker, para el generador). Opcionales: `ANTHROPIC_MODEL_TEXTO`, `ANTHROPIC_MODEL_RAPIDO`, `ANTHROPIC_MODEL_PANTALLAS` y `ANTHROPIC_ESFUERZO`.

**Cómo verificar.**
1. En **Empresa › Conexiones IA**, pulsa **Probar** en una tarea de texto: debe mostrar «✓» con el mensaje y la latencia en ms.
2. Genera un curso corto en el entorno de pruebas y revisa en **Rentabilidad** que aparezca el consumo de tokens y su costo.
3. Si falla, el mensaje dice el motivo (llave inválida, sin crédito o límite).

## 4. Google Cloud Text-to-Speech

**Para qué sirve.** Es la voz por defecto del personaje (voces GA). Genera las narraciones de la etapa 6 y la muestra de voz del kit de marca. La boca del personaje se calcula después desde el audio.

**Cómo obtener la credencial.**
1. En [console.cloud.google.com](https://console.cloud.google.com), crea un proyecto (por ejemplo `aptio-produccion`) y vincúlale una cuenta de facturación.
2. En **APIs y servicios › Biblioteca**, activa **Cloud Text-to-Speech API**.
3. En **APIs y servicios › Credenciales › Crear credenciales › Clave de API**, crea la clave.
4. Edita la clave y en **Restricciones de API** deja solo Cloud Text-to-Speech API.

**Costos referenciales** ([precios](https://cloud.google.com/text-to-speech/pricing), consultado el 19-11-2026, referencial):

| Tipo de voz | Precio por millón de caracteres | Gratis al mes |
| --- | --- | --- |
| Standard y WaveNet | $4 | 4 millones |
| Neural2 | $16 | 1 millón |
| Chirp 3 HD | $30 | 1 millón |
| Studio | $160 | — |

Una cápsula de 5 minutos tiene unos 4.000 a 6.000 caracteres de narración por idioma, así que con Neural2 cuesta menos de un décimo de dólar por idioma.

**Límites de uso** ([cuotas](https://docs.cloud.google.com/text-to-speech/quotas)): 1.000 solicitudes por minuto por proyecto para Standard y Neural2, 500 para Studio y 200 para Chirp 3. Cada solicitud admite hasta 5.000 bytes de texto (una narración por pantalla queda muy por debajo).

**Dónde va.** `GOOGLE_TTS_API_KEY` en `aptio-<entorno>-aplicacion`.

**Cómo verificar.** En **Empresa › Clientes y kits**, abre el cliente y, en **Glosario y pronunciación**, pulsa **Escuchar muestra**. Debe sonar la voz del kit con el diccionario guardado. En **Conexiones IA**, el botón **Probar** de la tarea de voz también llama al proveedor. Con `PROVEEDORES_MODO=simulado` la muestra es silencio y lo indica.

## 5. Google Cloud Speech-to-Text

**Para qué sirve.** Transcribe el audio y el video que sube el cliente en **Material del cliente**, para resumirlo o volverlo interactivo, y para re-locutar.

**Cómo obtener la credencial.** En el mismo proyecto de Google Cloud, activa **Cloud Speech-to-Text API** y crea otra clave restringida a esa API (o agrega la API a la clave anterior).

**Costos referenciales** ([precios](https://cloud.google.com/speech-to-text/pricing), consultado el 19-11-2026, referencial): la API V2 estándar cuesta $0,016 por minuto (de 0 a 500.000 minutos al mes) y el lote dinámico $0,003 por minuto. La V1 incluye 60 minutos gratis al mes; la V2 no tiene capa gratuita. **Ojo:** el código usa hoy el método V1 `speech:recognize` y estima el costo con la tarifa de $0,016 por minuto; revisa en el enlace la tarifa V1 vigente.

**Límites de uso** ([cuotas](https://docs.cloud.google.com/speech-to-text/quotas)): 900 solicitudes por minuto por proyecto, 480 horas de audio por día, unos 60 segundos de audio por solicitud síncrona y 10 MB por solicitud. El worker corta el audio en tramos de 55 segundos.

**Dónde va.** `GOOGLE_STT_API_KEY` en `aptio-<entorno>-aplicacion`. Opcional: `GOOGLE_STT_MODELO` (por defecto `latest_long`).

**Cómo verificar.** Sube un audio corto en **Material del cliente** de un proyecto de pruebas: al terminar, el material muestra su transcripción, y su consumo queda registrado con proveedor y costo.

## 6. ElevenLabs

**Para qué sirve.** Es la voz alternativa (modelo `eleven_multilingual_v2`). Se elige por tarea en **Empresa › Conexiones IA**. Es opcional si se usa solo Google.

**Cómo obtener la credencial.** En [elevenlabs.io](https://elevenlabs.io), contrata un plan de pago con licencia comercial y ve a **Profile › API Keys › Create**. Copia la llave.

**Planes y costos referenciales** ([precios de la API](https://elevenlabs.io/pricing/api), consultado el 19-11-2026, referencial):

| Plan | Precio al mes | Caracteres incluidos | Solicitudes simultáneas |
| --- | --- | --- | --- |
| Starter | $6 | 75.000 | 6 |
| Creator | $22 | 275.000 | 10 |
| Pro | $99 | 1.238.000 | 20 |
| Scale | $299 | — | 30 |
| Business | $990 | — | 40 |

El excedente de Multilingual v2 cuesta $0,08 por cada 1.000 caracteres ($80 por millón); el de Flash, $0,04.

> **Diferencia a revisar:** el sistema estima ElevenLabs con $200 por millón de caracteres (supuesto de `docs/ESTADO.md`, sin verificar contra una factura). La tarifa publicada de excedente es menor. Conviene ajustar `TARIFA_ELEVENLABS_USD_MILLON` cuando llegue la primera factura real.

**Límites de uso:** los marca la concurrencia del plan (tabla anterior). Si se pasa, ElevenLabs responde 429 y la etapa de voz queda en error con su motivo.

**Dónde va.** `ELEVENLABS_API_KEY` en `aptio-<entorno>-aplicacion`.

**Cómo verificar.** En **Conexiones IA**, elige ElevenLabs para la voz y pulsa **Probar**.

## 7. Mifact (facturación electrónica SUNAT)

**Para qué sirve.** El worker envía cada factura, boleta y nota de crédito a Mifact, que la firma y la manda a SUNAT. Al quedar aceptada, guarda el PDF, el XML firmado y la constancia (CDR), y los envía por correo al cliente. Si SUNAT tarda, consulta el estado cada 10 minutos.

**Cómo obtener la credencial.**
1. Contrata Mifact para el RUC emisor de la empresa ([mifact.net](https://mifact.net/)). Mifact entrega un token por RUC.
2. Para probar, pide el token de demo: está asociado al RUC 20100100100 y usa `https://demo.mifact.net.pe`.
3. En **Ventas › Facturación › Datos fiscales**, el RUC del emisor debe ser el mismo del token.

**Planes y costos referenciales** ([mifact.net](https://mifact.net/), consultado el 19-11-2026, referencial): los planes del sistema publicados son Básico S/ 45 al mes, Plus S/ 70 y Premium+ S/ 99. **La integración por API no publica precio: hay que cotizarla.**

**Límites de uso:** Mifact no publica límites. El worker envía un comprobante a la vez por cola y reintenta con espera.

**Dónde va.** `MIFACT_TOKEN` en `aptio-<entorno>-aplicacion`; la infraestructura lo pasa **solo al worker**. `MIFACT_URL` no es secreta: en pruebas usa la demo por defecto y en producción se pasa al desplegar con `-c mifactUrl=https://…`. El token se renueva cada 6 meses aproximadamente.

**Cómo verificar.** En el entorno de pruebas con el token demo, haz una compra de prueba en `/pago`. En **Ventas › Facturación**, el comprobante debe pasar a «Aceptado» con su PDF y su CDR. Desde el contenedor de desarrollo no se pudo llegar al servidor de Mifact (SUP-351), así que esta prueba se hace desde el entorno de pruebas.

## 8. Culqi (cobros en soles)

**Para qué sirve.** Cobra en soles las suscripciones y las cápsulas adicionales con el formulario de Culqi, y hace los reembolsos.

**Cómo obtener la credencial.**
1. Crea el comercio en [culqi.com](https://culqi.com) y completa su validación para producción.
2. En [panel.culqi.com](https://panel.culqi.com) › **Desarrollo › API Keys**, copia la llave pública (`pk_live_…`) y la secreta (`sk_live_…`). En el ambiente de integración son `pk_test_…` y `sk_test_…`.
3. En **Desarrollo › Eventos / Webhooks**, registra `https://<tu-dominio>/api/v1/webhooks/pago/culqi` y copia el secreto de firma.

**Costos referenciales** ([tarifas](https://culqi.com/productos/online-pasarela-de-pagos/), consultado el 19-11-2026, referencial): Culqi Online y Culqi Link cobran 3,44 % por tarjeta nacional y 3,99 % por internacional, más US$0,20 fijos por operación. Bajo S/ 87,72 se aplica un mínimo de S/ 3,50. La página indica que las comisiones están inafectas a IGV. Varían por volumen.

**Límites de uso:** Culqi no publica límites de su API. Aptio limita por IP los intentos de pago en su propio sitio (grupo `pago`).

**Dónde va.** `CULQI_LLAVE_PUBLICA_<MODO>`, `CULQI_LLAVE_SECRETA_<MODO>` y `CULQI_SECRETO_WEBHOOK_<MODO>` (`<MODO>` es `PRUEBAS` o `PRODUCCION`) en `aptio-<entorno>-aplicacion`.

**Cómo verificar.** En **Ventas › Pasarelas**, Culqi debe aparecer sin variables faltantes. Haz un pago en `/pago` con una tarjeta de prueba de Culqi: la suscripción se activa cuando llega el webhook firmado. La firma del webhook se integró según la documentación pública y falta confirmarla en su sandbox (SUP-294).

## 9. Stripe (cobros en dólares)

**Para qué sirve.** Cobra en dólares con Stripe Checkout; el webhook firmado confirma el pago. También hace los reembolsos.

**Cómo obtener la credencial.**
1. En [dashboard.stripe.com](https://dashboard.stripe.com), activa la cuenta para cobros reales.
2. **Developers › API keys › Secret key** (`sk_live_…`, o `sk_test_…` en modo de prueba).
3. **Developers › Webhooks › Add endpoint** con `https://<tu-dominio>/api/v1/webhooks/pago/stripe` y los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`. Copia el *Signing secret* (`whsec_…`).

**Costos referenciales** ([precios](https://stripe.com/pricing), consultado el 19-11-2026, referencial, tarifa de EE. UU.): 2,9 % + 30¢ por cobro con tarjeta; +1,5 % para tarjetas internacionales y +1 % si hay conversión de moneda. Las tarifas dependen del país de la cuenta.

**Límites de uso** ([límites](https://docs.stripe.com/rate-limits)): 100 solicitudes por segundo en modo real y 25 en sandbox, 25 por segundo por operación y 50 solicitudes simultáneas. Al pasarse responde 429.

**Dónde va.** `STRIPE_LLAVE_SECRETA_<MODO>` y `STRIPE_SECRETO_WEBHOOK_<MODO>` en `aptio-<entorno>-aplicacion`.

**Cómo verificar.** En **Ventas › Pasarelas**, Stripe debe aparecer sin variables faltantes. Paga en `/pago` con la tarjeta de prueba `4242 4242 4242 4242`; en el panel de Stripe, el webhook debe figurar como entregado (200) y la suscripción como activa en Aptio.

## 10. Correo SMTP (Amazon SES u otro)

**Para qué sirve.** Envía las invitaciones, la recuperación de clave, los avisos de comentarios del revisor, el aviso del límite de gasto de IA, las confirmaciones de citas, los avisos de leads, los comprobantes y los avisos de cobranza.

**Cómo obtener la credencial.** Con Amazon SES en la misma cuenta AWS: verifica el dominio (SPF y DKIM), pide salir del modo sandbox y crea credenciales en **SES › SMTP settings › Create SMTP credentials**. También sirven SendGrid, Mailgun o el SMTP de Google Workspace.

**Costos referenciales** ([precios de SES](https://aws.amazon.com/ses/pricing), consultado el 19-11-2026, referencial): $0,10 por cada 1.000 correos y $0,12 por GB de adjuntos. Una IP dedicada cuesta $24,95 al mes (no hace falta al inicio).

**Límites de uso:** SES fija una cuota de envío diaria y por segundo para cada cuenta; se ve en **SES › Account dashboard** y se amplía con un pedido a AWS. En sandbox solo envía a direcciones verificadas.

**Dónde va.** `SMTP_URL` (`smtps://USUARIO:CLAVE@servidor:465`) en `aptio-<entorno>-aplicacion`. `CORREO_REMITENTE` no es secreto: se pasa al desplegar con `-c correoRemitente="Aptio SCORM <no-responder@tu-dominio.com>"`.

**Cómo verificar.** Usa **¿Olvidaste tu clave?** con un usuario de pruebas: el correo debe llegar a la bandeja de entrada, no a spam. En producción, sin `SMTP_URL` la API se niega a enviar y la acción falla con un error claro.

## 11. Ingreso con Google (OAuth)

**Para qué sirve.** Muestra el botón «Ingresar con Google», solo para correos ya invitados (ADR-009). Nunca crea cuentas.

**Cómo obtener la credencial.**
1. En Google Cloud › **APIs y servicios › Pantalla de consentimiento de OAuth**, configura el nombre y el logo de Aptio SCORM.
2. En **Credenciales › Crear credenciales › ID de cliente de OAuth › Aplicación web**, agrega el URI de redireccionamiento `https://<tu-dominio>/api/v1/auth/google/callback`.
3. Copia el ID de cliente y el secreto.

**Costos referenciales:** sin costo de API.

**Límites de uso:** los de Google para OAuth; no afectan al volumen de un equipo de producción.

**Dónde va.** `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `aptio-<entorno>-aplicacion`. `GOOGLE_REDIRECT_URI` solo si el callback no es el de por defecto.

**Cómo verificar.** Invita un correo de Gmail desde **Equipo**, sal y pulsa **Ingresar con Google** con ese correo: debe entrar. Con un correo no invitado debe rechazarlo.

## 12. HubSpot

**Para qué sirve.** Recibe cada lead del sitio (formulario, popup, chatbot y agendador) con su origen y sus UTM, como contacto.

**Cómo obtener la credencial.** HubSpot › **Configuración › Integraciones › Apps privadas › Crear app privada**, con permisos de lectura y escritura de contactos (`crm.objects.contacts.read` y `.write`). Copia el token de acceso.

**Costos referenciales:** según el plan de HubSpot de la empresa; la API no tiene cobro aparte.

**Límites de uso** ([pautas de uso](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines), consultado el 19-11-2026): las apps privadas en Free y Starter tienen 100 solicitudes por 10 segundos y 250.000 al día; Professional, 190 por 10 s y 625.000 al día; Enterprise, 190 por 10 s y 1.000.000 al día. Aptio envía los leads en lote (`batch/upsert`).

**Dónde va.** `HUBSPOT_TOKEN` en `aptio-<entorno>-aplicacion`.

**Cómo verificar.** En **Captación › CRM**, la tarjeta de HubSpot debe decir «Clave configurada» (si dice «Falta la clave», nombra la variable). La API tiene una lectura que solo comprueba la clave, `POST /api/v1/captacion/crm/hubspot/probar` (solo superadmin); el panel ofrece «Enviar prueba» solo para el webhook. Luego deja un lead de prueba en el sitio y búscalo en HubSpot.

## 13. Pipedrive

**Para qué sirve.** Igual que HubSpot: recibe los leads del sitio como personas.

**Cómo obtener la credencial.** Pipedrive › **Preferencias personales › API** › copia tu token personal.

**Costos referenciales:** según el plan de Pipedrive; la API no tiene cobro aparte.

**Límites de uso** ([límites](https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting), consultado el 19-11-2026): presupuesto diario de 30.000 tokens × multiplicador del plan (Lite 1, Growth 2, Premium 5, Ultimate 7) × número de asientos, y ráfagas por 2 segundos de 20, 40, 100 o 120 solicitudes según el plan.

**Dónde va.** `PIPEDRIVE_TOKEN` en `aptio-<entorno>-aplicacion`.

**Cómo verificar.** Igual que HubSpot: la tarjeta debe decir «Clave configurada», la lectura de prueba es `POST /api/v1/captacion/crm/pipedrive/probar`, y luego un lead de prueba.

## 14. Zoho CRM

**Para qué sirve.** Recibe los leads del sitio en el módulo Leads de Zoho. Está conectado y es la tercera opción de CRM (DA-11).

**Cómo obtener la credencial.**
1. En [api-console.zoho.com](https://api-console.zoho.com), crea un *Self Client* o una *Server-based Application*.
2. Genera un código con el alcance `ZohoCRM.modules.ALL` y cámbialo por un *refresh token*.
3. Copia el ID de cliente, el secreto y el refresh token.

**Costos referenciales:** según la edición de Zoho CRM; la API no tiene cobro aparte, pero consume créditos.

**Límites de uso** ([límites](https://www.zoho.com/crm/developer/docs/api/v2/api-limits.html), consultado el 19-11-2026): créditos por 24 horas: Free 5.000; Standard 50.000 + 250 por licencia (máximo 100.000); Professional + 500 por licencia (máximo 3 millones); Enterprise + 1.000 por licencia (máximo 5 millones). Concurrencia de 5 a 25 según la edición.

**Dónde va.** `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` y `ZOHO_REFRESH_TOKEN` en `aptio-<entorno>-aplicacion`. `ZOHO_DOMINIO` (por defecto `com`) solo en local; en la nube solo funciona `com` por ahora.

**Cómo verificar.** Igual que HubSpot: la tarjeta debe decir «Clave configurada», la lectura de prueba es `POST /api/v1/captacion/crm/zoho/probar`, y luego un lead de prueba.

## 15. WordPress (blog)

**Para qué sirve.** El blog del sitio comercial lee los artículos publicados de un WordPress con su API REST pública.

**Cómo obtener la credencial.** No usa llaves. Solo hay que guardar la URL del WordPress en **Sitio web › Blog**.

**Costos referenciales:** sin costo de API (el hosting de WordPress es aparte).

**Límites de uso:** los del hosting de WordPress.

**Cómo verificar.** Guarda la URL y abre `/s/blog`: deben aparecer los últimos artículos publicados.

## 16. AWS (infraestructura)

**Para qué sirve.** Aloja todo el sistema: ECS Fargate (API y worker), RDS PostgreSQL, ElastiCache Redis, S3 (archivos y respaldos), KMS (cifrado), ALB, NAT, CloudFront, WAF y Secrets Manager. El detalle está en `Manual-Sistema.md`.

**Cómo obtener la credencial.** En la nube **no hay llaves de AWS en la aplicación**: las tareas usan su rol de IAM. Para desplegar, cada persona usa su perfil de AWS (`AWS_PROFILE`) con permisos de CDK. `SESSION_SECRET`, `TOTP_CLAVE_CIFRADO`, la base, Redis, KMS y los buckets los crea la infraestructura.

**Costos referenciales** (consultado el 19-11-2026, referencial):
- **WAF** ([precios](https://aws.amazon.com/waf/pricing)): $5 al mes por web ACL, $1 al mes por regla o grupo administrado y $0,60 por millón de solicitudes.
- **Fargate, RDS, ElastiCache, ALB, NAT, CloudFront, S3 y KMS:** dependen del tamaño elegido. Usa [calculator.aws](https://calculator.aws/) con la región **sa-east-1 (São Paulo)**, que es de las más caras. El NAT y el ALB suelen ser un costo fijo importante aunque haya poco tráfico.

**Límites de uso:** las cuotas de servicio de la cuenta (Service Quotas). Una cuenta nueva puede necesitar pedir más tareas de Fargate o salir del sandbox de SES.

**Dónde va.** Los valores no secretos se pasan con `-c` al desplegar (`docs/24-puesta-en-marcha-aws.md`).

**Cómo verificar.** `GET /api/v1/salud` debe responder 200 (503 si la base no responde). Si Redis no responde, la API lo avisa en su registro y los límites por IP cuentan en la memoria de cada instancia hasta que vuelva.

## 17. Previstos, aún no conectados

Estos servicios están evaluados en los documentos, pero **no hay código que los llame**. No hace falta contratarlos para producción.

### Recraft (imágenes con IA)
- **Para qué serviría:** generar ilustraciones vectoriales con el estilo del kit (DA-03). Hoy las ilustraciones salen de la biblioteca y del kit.
- **Costo referencial** ([precios](https://www.recraft.ai/docs/api-reference/pricing), consultado el 19-11-2026, referencial): $0,04 por imagen raster (V3 o V4) y $0,08 por imagen vectorial. Pedir 4 variantes por ilustración multiplica el costo por 4.
- **Variable prevista:** `RECRAFT_API_KEY` (no existe en el código).

### Azure Speech (voz con visemas)
- **Para qué serviría:** voz neuronal con visemas propios para la boca (decisión 7 de `CLAUDE.md`). Hoy la boca se calcula desde cualquier audio, así que no hace falta.
- **Costo referencial** ([precios](https://azure.microsoft.com/pricing/details/cognitive-services/speech-services), consultado el 19-11-2026, referencial): el nivel gratuito F0 incluye 0,5 millones de caracteres neuronales al mes. El precio de pago no se mostró en la página al consultar.
- **Variables previstas:** `AZURE_SPEECH_KEY` y `AZURE_SPEECH_REGION` (no existen en el código).

## 18. Cómo estima el sistema el costo por curso

Cada llamada a un proveedor guarda proveedor, modelo, consumo y costo (decisión 12 de `CLAUDE.md`), y **Rentabilidad** los suma por curso y por cliente. Las tarifas que usa el cálculo están en el código:

| Servicio | Tarifa usada | Dónde | Comparada con la página (19-11-2026) |
| --- | --- | --- | --- |
| Claude Opus 5.5 | $4 / $20 por MTok, caché $0,20 | `packages/ai/src/texto.ts` (`TARIFAS`) | Coincide |
| Claude Sonnet 5.5 | $2 / $10 por MTok | `packages/ai/src/texto.ts` | Coincide |
| Claude Haiku 5.5 | $0,10 / $0,50 por MTok | `packages/ai/src/texto.ts` | Coincide hasta 100k tokens por solicitud |
| Google TTS Neural2 | $16 por millón de caracteres | `packages/ai/src/voz.ts` | Coincide (sin descontar la capa gratuita) |
| Google TTS Chirp 3 HD | $30 por millón | `packages/ai/src/voz.ts` | Coincide |
| Google STT | $0,016 por minuto | `packages/ai/src/transcripcion.ts` | Tarifa V2; el código llama a V1 |
| ElevenLabs | $200 por millón de caracteres | `packages/ai/src/voz.ts` | Más alta que el excedente publicado ($80); supuesto sin factura |

Cuando cambie un precio, se actualiza la tabla del código y este manual, con la nueva fecha de consulta.

## 19. Historial

| Versión | Fecha | Cambios |
| --- | --- | --- |
| 1.00 | 19-11-2026 | Primera versión: amplía `apiskey.md` con planes, costos referenciales, límites de uso y verificación de cada servicio, y agrega los servicios previstos. |
