# Registro de decisiones de arquitectura

| ADR | Decisión | Estado |
| --- | --- | --- |
| ADR-001 | Node.js + TypeScript en monorepo; API con NestJS | Aceptada |
| ADR-002 | PostgreSQL con el curso en JSONB validado; ORM Prisma | Propuesta (DA-01) |
| ADR-003 | Reproductor único compartido por vista previa y exportación | Aceptada |
| ADR-004 | Claude como IA de texto con salidas estructuradas y propuesta revisable | Aceptada |
| ADR-005 | Boca sincronizada en el navegador (visemas/Rhubarb), sin video | Aceptada, sujeta a PT-01 |
| ADR-006 | Idiomas como capas del mismo curso; exportación separada o en un paquete | Aceptada |
| ADR-007 | SCORM 1.2 con un solo SCO como formato por defecto | Aceptada |
| ADR-008 | Primero el generador, después el editor | Aceptada |
| ADR-009 | Nube, ingreso con correo y clave (Google opcional) y documentos cifrados | Aceptada (proveedor de nube por confirmar) |
| ADR-010 | Proveedores de IA solo con licencia comercial y planes de pago | Aceptada |
| ADR-011 | Sitio comercial administrable desde un panel superadmin | Propuesta |
| ADR-012 | Multi-organización, planes y facturación electrónica (reemplaza la decisión 13 de `CLAUDE.md`) | Propuesta |

---

## ADR-001 · Node.js, TypeScript, monorepo y NestJS

- **Contexto:** el equipo trabajará con Node.js y Claude Code. El reproductor, las interacciones y el editor ya son TypeScript en el navegador.
- **Decisión:** TypeScript en todo; monorepo pnpm; API con NestJS (módulos, inyección de dependencias, validación, OpenAPI); workers con BullMQ.
- **Alternativas:** Fastify o Express sin framework (más libertad, menos estructura); Laravel (descartado: dos lenguajes).
- **Consecuencias:** tipos compartidos entre API, web, worker y reproductor desde `packages/schema`; una sola cadena de herramientas.

## ADR-002 · Almacenamiento del curso

- **Contexto:** el curso es un documento jerárquico que cambia de forma con el catálogo de interacciones.
- **Decisión:** el documento del curso en JSONB validado contra el esquema; entidades con relaciones (clientes, recursos, trabajos, exportaciones) en tablas. ORM recomendado: Prisma.
- **Consecuencias:** validación obligatoria en la API antes de guardar; migraciones del esquema del curso con `versionEsquema` y funciones de migración.

## ADR-003 · Reproductor único

- **Decisión:** `packages/player` renderiza el JSON en la vista previa y dentro de los paquetes exportados; los exportadores solo agregan el adaptador de seguimiento y el manifiesto.
- **Consecuencias:** lo que se ve en la vista previa es lo que se exporta; el reproductor debe ser liviano y sin dependencias del editor.

## ADR-004 · Claude con propuestas revisables

- **Decisión:** las tareas IA-01 a IA-13 usan Claude con salida estructurada validada con Ajv; el resultado se guarda como propuesta y solo se aplica por acción del usuario.
- **Consecuencias:** ninguna ruta de la API aplica salidas de IA directamente; registro de costo y versión de prompt por trabajo.

## ADR-005 · Lip sync en el navegador

- **Decisión:** personaje SVG con bocas A–X; marcas de tiempo desde visemas de Azure o Rhubarb; el reproductor alterna bocas según el audio.
- **Alternativas:** video renderizado (descartado: peso y no regenerable); avatares de video por IA (opción puntual, no por defecto).
- **Riesgo:** calidad en español → PT-01.

## ADR-006 · Idiomas como capas

- **Decisión:** textos `{es, en}`, narración, bocas y subtítulos por idioma en el mismo curso; exportación separada o en un paquete con selector y seguimiento único.
- **Consecuencias:** el validador exige completitud por idioma para exportar en modo bilingüe.

## ADR-007 · SCORM 1.2 con un solo SCO

- **Decisión:** formato por defecto para Moodle, Blackboard, Chamilo y Canvas; navegación interna en el reproductor.
- **Consecuencias:** una sola nota por paquete; `suspend_data` compacto; SCORM 2004 cuando un cliente necesite separar completado y aprobado.

## ADR-008 · Primero el generador, después el editor

- **Contexto:** hoy un SCORM de unas 30 pantallas toma unos 15 días y se vende a S/ 4.500; la competencia entrega en ese tiempo más de 5 SCORM a S/ 1.500. El tiempo se pierde sobre todo al pasar el trabajo entre herramientas: chat de IA, imágenes con IA, Illustrator y Photoshop, voz de Google, Premiere para la boca, y Articulate o Genially para armar. Competir con Articulate o Genially en el editor no es viable.
- **Decisión:** el producto es un **generador** que convierte el material del cliente en un SCORM completo y revisable. Arma estructura, guion, pantallas animadas, ilustraciones, voz, boca sincronizada, subtítulos, versión en inglés, control de calidad y paquete. El equipo **revisa y ajusta** pantalla por pantalla. Cuando un texto cambia, la voz, la boca, los subtítulos y el inglés se regeneran solos. El editor visual queda para retoques finos y se construye después.
- **Pantallas generadas por IA con componentes del kit:** la IA puede componer pantallas nuevas, no solo llenar plantillas. Lo hace siempre con los componentes, tipografías y colores del kit del cliente, y con las pantallas modelo que diseña el equipo gráfico. El resultado se valida contra el esquema. Esto flexibiliza la decisión 6 de `CLAUDE.md`: el catálogo de componentes es cerrado, pero la composición de cada pantalla es libre. El usuario sigue sin insertar código.
- **Proveedores:** se conectan por API y se pagan por uso, con un proveedor elegible por tarea:
  - texto y pantallas: Claude;
  - imágenes: el proveedor que gane PT-02;
  - voz: Google Text-to-Speech por defecto, porque es la que usa el equipo hoy (Azure y ElevenLabs quedan como alternativas);
  - boca: automática desde cualquier audio, con un reconocedor fonético tipo Rhubarb.
- **Consecuencias:**
  - el backlog prioriza el flujo Generar → Producción → Revisión → Entrega;
  - se agrega un tablero de rentabilidad;
  - la decisión de construir depende del piloto de `docs/11-medicion-y-piloto.md`.
- **Editor dentro del flujo:** desde Revisión, "✎ Editar pantalla" abre el editor sobre lo generado.
  - Riel con Diseños (la misma pantalla en otras composiciones), Agregar, Imágenes, Capas e IA.
  - Barra contextual con tamaño, colores del kit, alineación, animación, ✦ mejorar texto, ocultar y eliminar.
  - Doble clic para escribir sobre la pantalla.
  - Modo Automático (la plantilla acomoda) o Libre (arrastrar y flechas).
  - Panel de propiedades: texto, tamaño, color, animación y retardo, imagen (cambiar o subir), pose de Ana, respuesta correcta y retroalimentación; narración con regeneración en cascada.
  - Deshacer y rehacer, y tira de pantallas.
  - Los ajustes se guardan como estilos por elemento (`sty`) y elementos agregados (`ex`) sobre la pantalla generada, así la IA puede regenerar el contenido sin perder los retoques.
- **Prototipo de referencia:** `docs/diseno/prototipo-unificado.html`. Reúne en un solo menú:
  - el flujo Generar → Producción → Revisión → Editor → Entrega;
  - los módulos Proyectos, Alineación pedagógica, Navegación (patrones y reglas), Vista previa del participante, Personaje y voz, Video interactivo, Idiomas, Clientes y kits, Rentabilidad y Conexiones IA;
  - la estimación opcional dentro de Nuevo SCORM.

  Todos trabajan sobre las mismas pantallas generadas.

## ADR-009 · Nube, acceso y cifrado

- **Contexto:** la herramienta la usarán el equipo y revisores de clientes desde distintos lugares, y procesa documentos internos de los clientes (procedimientos, manuales, a veces con nombres de personas).
- **Decisión (aprobada por el responsable del producto):**
  - **Nube.** Recomendado: AWS, región São Paulo (`sa-east-1`), la más cercana a Perú. El proveedor final se confirma en el S0 (`docs/21-arranque-s0.md`). Dos entornos: **pruebas** (para las demos de cada sprint) y **producción**. Mismos contenedores que en local: API, web, worker; PostgreSQL administrado, Redis administrado y S3. Secretos en el gestor de secretos de la nube, nunca en el repositorio.
  - **Ingreso con correo y clave.** Clave con hash argon2id, mínimo 10 caracteres, bloqueo de 15 minutos tras 5 intentos fallidos, enlace de cambio de clave de un solo uso que vence en 60 minutos, sesión en cookie httpOnly y Secure.
  - **Ingreso con Google, opcional.** OpenID Connect con PKCE. Solo entran correos ya invitados por un administrador: Google no crea cuentas. La cuenta se vincula por correo verificado, y un usuario puede tener los dos métodos.
  - **Documentos cifrados.**
    - En tránsito: HTTPS (TLS 1.2 o superior) en todo.
    - En reposo: bucket con cifrado KMS por defecto, base de datos y copias de seguridad cifradas.
    - Acceso a archivos solo con URLs firmadas de 15 minutos.
    - Los documentos fuente del cliente se borran automáticamente después de la entrega, según `Cliente.retencionDocumentosDias` (180 días por defecto, ajustable por contrato). Se conserva el curso.
- **Consecuencias:**
  - Modelo: `Usuario.hashClave` pasa a opcional; se agregan `googleSub`, `emailVerificado` y el bloqueo por intentos; nuevo modelo `TokenAcceso`; `Cliente.retencionDocumentosDias`.
  - API: `/auth/google`, `/auth/google/callback`, `/auth/clave/olvido` y `/auth/clave/restablecer`.
  - Local: Mailpit para ver correos y MinIO con cifrado.
  - Historias HU-0108, HU-0109 y HU-1404.

## ADR-010 · Proveedores con licencia comercial

- **Contexto:** lo que se genera se entrega a clientes que pagan. No todos los planes de IA permiten uso comercial, algunos entrenan con los datos enviados y pocos ofrecen indemnización por propiedad intelectual. Detalle en `docs/19-proveedores-y-licencias.md`.
- **Decisión:**
  - Solo planes de pago o empresariales con uso comercial explícito. Nunca planes gratuitos en producción.
  - Desactivar el entrenamiento con nuestros datos donde exista la opción.
  - No clonar voces ni rostros de personas reales sin consentimiento escrito.
  - Cada `Recurso` generado guarda proveedor, modelo y licencia.
  - Por defecto:
    - Claude (texto);
    - Google Text-to-Speech con voces GA (voz);
    - Recraft (ilustraciones SVG), o Adobe Firefly cuando el cliente exija indemnización;
    - personaje propio en SVG con Rhubarb (MIT) en lugar de video o avatares.
- **Consecuencias:**
  - Los créditos de cada cápsula indican «voz e ilustraciones generadas con IA».
  - El contrato con el cliente no promete exclusividad absoluta de las imágenes generadas.
  - Se revisan los términos de cada proveedor una vez al año o al cambiar de proveedor.

## ADR-011 · Sitio comercial administrable desde un panel superadmin

- **Contexto:** para vender Aptio SCORM se necesita un sitio comercial con varias páginas, SEO, captación de leads, chatbot, agendamiento y enlace al CRM. El sitio debe cambiar sin programar y sin publicar datos inventados.
- **Decisión:**
  - Rol nuevo **superadmin** de plataforma, separado del administrador de cada organización, con segundo factor obligatorio.
  - El panel va dentro de `apps/web`, con el mismo sistema visual (REQ-063), en tres grupos: Sitio web, Captación y Ventas.
  - Cada elemento del sitio tiene orden y mostrar/ocultar; ocultar no borra. Lo nuevo nace oculto.
  - Los datos marcados «ficticio» bloquean la publicación en producción mientras estén visibles.
  - Al publicar se crea una versión inmutable y se pre-renderiza HTML con React en el worker (DA-08).
  - El blog vive en WordPress. El sitio solo muestra sus artículos publicados, leídos por la API REST, con filtro por categoría; el panel elige qué categorías y artículos se ven.
- **Alternativas:**
  - CMS externo (WordPress, Webflow): duplica usuarios, marca y datos de planes, y separa el pago del producto.
  - Sitio fijo en código: cada cambio pasa por desarrollo.
- **Consecuencias:**
  - Módulos M16 y M17, épicas E15 y E16, sprints S11 y S12.
  - La prueba de HU-0110 se extiende al panel superadmin.
  - Las pantallas de Stitch quedan como referencia de marca (`docs/diseno/stitch/sitio/`).

## ADR-012 · Multi-organización, planes y facturación electrónica

- **Contexto:** la decisión 13 de `CLAUDE.md` dejaba multi-tenant, planes y facturación para la fase comercial. Negocio pide incluirlos para vender a otras productoras.
- **Decisión:**
  - Organizaciones con datos aislados por `organizacionId` en todas las tablas; los datos actuales pasan a la organización AulasEducativas.
  - Planes administrables que alimentan /precios y el pago.
  - Cobro con pasarelas intercambiables (PEN y USD), confirmado solo por webhook firmado e idempotente. No se guardan datos de tarjeta.
  - Comprobantes electrónicos SUNAT (factura, boleta, nota de crédito) por un OSE/PSE (DA-09).
  - Cobranza con 3 reintentos y solo lectura al día 10.
- **Alternativas:** facturar a mano fuera del sistema (no escala y retrasa comprobantes); usar solo Stripe Billing (no emite comprobantes SUNAT y no cubre los medios locales).
- **Consecuencias:**
  - Módulo M18, épica E17, sprints S13 y S14.
  - Migración de todas las tablas con `organizacionId` (HU-1701), antes de cualquier venta.
  - La tasa y el umbral de detracción se validan con el contador antes de producción.
