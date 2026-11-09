# Proveedores de IA: uso comercial y licencias

Revisión de los términos oficiales de cada proveedor, consultados el **31/10/2026**. Las fuentes están enlazadas en cada fila. Lo que no se pudo confirmar en una fuente oficial dice **no verificado**.

> No es asesoría legal. Antes de firmar con clientes del sector público, un abogado debe revisar los contratos y el tratamiento de datos personales. Los términos cambian: revisar una vez al año y siempre al cambiar de proveedor (ADR-010).

## Recomendación

| Necesidad | Proveedor recomendado | Por qué | Alternativa |
| --- | --- | --- | --- |
| Texto, estructura, pantallas | **Claude API (Anthropic)**, cuenta comercial | Uso comercial permitido, la salida es del cliente, no entrena con nuestros datos e incluye indemnización por propiedad intelectual | — |
| Voz ES/EN | **Google Text-to-Speech**, solo voces **GA** (Chirp 3 HD es-US / en-US) | Es la que usa el equipo hoy; Google declara que no registra el texto ni el audio | Azure Speech con voces prebuilt (exige avisar que la voz es sintética) |
| Ilustraciones SVG | **Recraft API** | SVG vectorial nativo, la salida es nuestra y la API no entrena con nuestros datos | **Adobe Firefly Services** cuando el cliente exija indemnización (cubre Text to Vector Graphic) |
| Escenas en PNG | Recraft API o **Imagen GA en Vertex AI** | Imagen GA en Vertex tiene indemnización de Google | Adobe Firefly |
| Personaje con boca | **SVG propio + Rhubarb Lip Sync (MIT)** | Sin derechos de imagen de terceros; los activos son nuestros | — |
| Video generado (opcional) | **Veo GA en Vertex AI** | Indemnización de Google solo en versiones GA | — |
| Presentador humano (si un cliente lo pide) | **Synthesia** con avatares stock | Su indemnización cubre la imagen y la voz de los avatares stock | — |

**No usar:**
- Planes gratuitos en producción (Gemini API gratuita, ElevenLabs Free, Recraft Free, Luma Free/Lite, Leonardo con imágenes públicas). Entrenan con los datos, publican las imágenes, exigen atribución o no dan licencia comercial.
- Midjourney: no tiene API oficial.
- La API de video Sora: OpenAI la retiró el 24/09/2026.
- Voces o rostros de personas reales sin consentimiento escrito.

Con esto se actualiza **DA-03** (proveedor de imágenes): Recraft, a confirmar con la prueba técnica PT-02 junto a Adobe Firefly.

## Detalle por proveedor

### Texto

| Proveedor | Uso comercial | Dueño de la salida | Indemnización | Entrena con nuestros datos | A tener en cuenta | Fuente |
| --- | --- | --- | --- | --- | --- | --- |
| Anthropic Claude API | Sí. Prohíbe revender el servicio sin aprobación y crear un producto competidor | El cliente | Sí, por reclamos de PI de terceros. No cubre salidas modificadas por nosotros | No | Por defecto no guarda prompts ni respuestas, con excepciones (Batch 29 días, Files API hasta borrar). Retención cero bajo pedido a ventas. Perú es país soportado | [Términos comerciales](https://www.anthropic.com/legal/commercial-terms) · [Retención](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) |

### Voz

| Proveedor | Uso comercial | Dueño de la salida | Indemnización | Entrena con nuestros datos | A tener en cuenta | Fuente |
| --- | --- | --- | --- | --- | --- | --- |
| Google Cloud Text-to-Speech | Sí (servicio de pago) | No verificado | **No figura** en la lista de servicios indemnizados de Google (verificado; actualizada el 20/07/2026) | Google declara que no registra el texto ni el audio; sobre entrenamiento, no verificado | Chirp 3 HD en GA para es-US y en-US. Gemini-TTS es-419 y es-MX en Preview: no usar para entregas. Clonar voces solo con lista de acceso y consentimiento grabado | [Servicios indemnizados](https://cloud.google.com/terms/generative-ai-indemnified-services) · [Chirp 3 HD](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd) · [Registro de datos](https://docs.cloud.google.com/text-to-speech/docs/data-logging) |
| Microsoft Azure Speech | Sí, voces prebuilt. La voz personalizada requiere aprobación de Microsoft | No verificado | El compromiso de copyright de Microsoft no menciona Speech: no verificado | Las voces prebuilt en tiempo real no guardan texto ni audio | Su código de conducta **exige avisar que la voz es sintética** y prohíbe imitar personas sin consentimiento | [Código de conducta](https://learn.microsoft.com/ko-kr/legal/cognitive-services/speech-service/text-to-speech/code-of-conduct) · [Privacidad](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security) |
| ElevenLabs | Solo planes de pago; el plan Free exige atribución y no es comercial | El cliente, con una licencia amplia a favor de ElevenLabs | No verificado | **Sí por defecto** fuera de Enterprise; se desactiva en Perfil → Data use | Clonar solo tu propia voz | [Publicar contenido](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform) · [Términos](https://elevenlabs.io/terms) |

### Imagen

| Proveedor | Uso comercial | Dueño de la salida | Indemnización | Entrena con nuestros datos | A tener en cuenta | Fuente |
| --- | --- | --- | --- | --- | --- | --- |
| Recraft API | Sí | El cliente («You own all Assets») | No: el cliente indemniza a Recraft | **Nunca** con datos de la API | **SVG nativo**. En el plan web gratuito, Recraft es dueña de las imágenes: no usarlo | [Términos para desarrolladores](https://www.recraft.ai/legal/developer-terms) · [Uso de datos](https://www.recraft.ai/docs/trust-and-security/data-use-and-model-training) |
| Adobe Firefly Services | Sí, con plan empresarial | El cliente | **Sí**, incluye Text to Image y Text to Vector Graphic. No cubre modelos de terceros, betas ni salidas modificadas | No con contenido de clientes empresariales | Agrega credenciales de contenido (C2PA) | [Descripción del producto](https://helpx.adobe.com/legal/product-descriptions/adobe-firefly.html) |
| Google Imagen (Vertex AI) | Sí | Google no reclama la propiedad | **Sí, solo vía Vertex y solo versiones GA** (verificado) | No sin permiso. La Gemini API gratuita sí entrena | Marca de agua invisible SynthID | [Servicios indemnizados](https://cloud.google.com/terms/generative-ai-indemnified-services) · [Gobierno de datos](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance) |
| OpenAI Images | Sí | El cliente | Sí, con exclusiones (salidas modificadas o combinadas) | No por defecto | No genera SVG. Según OpenAI, gpt-image-1 se retiró el 23/10/2026: usar la versión vigente | [Términos de servicio](https://openai.com/policies/service-terms/) · [Retiros](https://developers.openai.com/api/docs/deprecations) |
| Stability AI | Sí por API | El cliente | No | **Sí**, con opción de desactivarlo | La licencia gratuita para instalar sus modelos vale solo con menos de USD 1 M de ingresos al año | [Licencia](https://stability.ai/license) |
| Black Forest Labs (FLUX) | Sí | El cliente | No | No hay forma documentada de desactivarlo | No se pueden quitar las credenciales de contenido | [Términos](https://bfl.ai/legal/developer-terms-of-service) |
| Ideogram | Ambiguo: la API limita el uso a «uso interno»; hay que confirmarlo con Ideogram | — | No | No | Exige poner «Powered by Ideogram» | [Términos de la API](https://ideogram.ai/legal/api-tos/) |
| Midjourney | Sí en planes de pago | El cliente | No verificado | No verificado | **No tiene API oficial** | [Uso comercial](https://docs.midjourney.com/hc/en-us/articles/27870375276557) |

### Video y avatares

| Proveedor | Uso comercial | Indemnización | Entrena con nuestros datos | A tener en cuenta | Fuente |
| --- | --- | --- | --- | --- | --- |
| Google Veo (Vertex AI) | Sí | Sí, solo versiones GA | No en Vertex | — | [Servicios indemnizados](https://cloud.google.com/terms/generative-ai-indemnified-services) |
| OpenAI Sora | **No disponible**: la API se retiró el 24/09/2026 | — | — | — | [Retiros](https://developers.openai.com/api/docs/deprecations) |
| Runway | Sí | Solo en Enterprise | En Enterprise no entrena y no retiene datos | Los permisos de imagen de personas son nuestra responsabilidad | [Uso comercial](https://dev.runwayml.com/learn/commercial-use) |
| Luma | Sí, con suscripción | No | La API no entrena | Prohíbe revender | [Términos de la API](https://lumalabs.ai/legal/api-terms-of-use) |
| Kling | Sí | No verificado | No | Disponibilidad en Perú no verificada | [Acuerdo de servicio](https://kling.ai/document-api/guides/protocols/paid-service.md) |
| Synthesia | Sí; los avatares stock no se usan en publicidad pagada sin permiso | Sí, incluye la imagen y la voz de los avatares stock | Licencia para mejorar el servicio | Los avatares personalizados requieren consentimiento | [Términos](https://www.synthesia.io/legal/customer-terms-of-service) |
| HeyGen | Sí | Solo por PI en EE. UU. | No | El gemelo digital de una persona real requiere un video de consentimiento | [Consentimiento](https://developers.heygen.com/docs/avatar-consent) |

### Otros

| Componente | Licencia | A tener en cuenta | Fuente |
| --- | --- | --- | --- |
| Rhubarb Lip Sync | MIT | Si se distribuye el ejecutable, incluir los avisos de licencia de sus componentes (BSD y otras) | [LICENSE.md](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/master/LICENSE.md) |

## Advertencias generales

1. **Derechos de autor de lo generado.** Según la Oficina de Derechos de Autor de EE. UU. (enero de 2025), solo se protege lo que tiene suficiente autoría humana; el prompt solo no basta. Aunque el contrato diga que la salida es nuestra, eso no garantiza un derecho de autor exigible.
   - El historial de versiones registra la intervención humana (edición, guion, montaje).
   - No prometer al cliente exclusividad absoluta de las imágenes. [Informe](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)
2. **La indemnización se pierde fácil.**
   - OpenAI y Adobe excluyen las salidas modificadas; Google excluye las versiones Preview.
   - Usar modelos GA y guardar el registro de cada generación (`TrabajoIA` y `Recurso.proveedor` / `modelo`).
3. **Datos personales (Perú, Ley 29733 y Reglamento D.S. 016-2024-JUS).** Enviar a una API extranjera documentos con datos personales es una transferencia internacional.
   - Firmar el acuerdo de tratamiento de datos (DPA) de cada proveedor.
   - Pedir retención cero donde exista.
   - Definir en el contrato con el cliente que actuamos como encargado de tratamiento.
   - Pedir al cliente material sin datos personales cuando sea posible. [El Peruano](https://www.elperuano.pe/noticia/259141--peru-fortalece-la-proteccion-de-datos-estos-son-los-principales-cambios-del-nuevo-reglamento) · [D.S. 016-2024-JUS](https://www.congreso.gob.pe/Docs/DGP/DIDP/files/ds_016-2024-jus.pdf)
4. **Aviso en la cápsula.** Los créditos dicen «Voz e ilustraciones generadas con IA y revisadas por AulasEducativas». Azure lo exige; con los demás es buena práctica.

## Pendiente de confirmar con cada proveedor

- Indemnización de Google Text-to-Speech y de Azure Speech.
- Si el acuerdo de la API de Ideogram permite entregar salidas a clientes.
- Términos públicos de HeyGen por plan.
- Disponibilidad de Kling en Perú.
- Si el plan de pago por uso de ElevenLabs incluye uso comercial.
