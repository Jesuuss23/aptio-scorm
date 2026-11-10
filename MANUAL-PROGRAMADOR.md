# Aptio SCORM · Manual del programador

**Versión 0.5 · actualizado con la segunda entrega del Sprint 3 (10 de noviembre de 2026)**

Guía para quien desarrolla y mantiene Aptio SCORM: cómo preparar el entorno, cómo está organizado el código, qué patrones son obligatorios y cómo agregar funciones sin romper lo existente. La visión de conjunto (componentes, flujos, seguridad y operación) está en [`MANUAL-SISTEMA.md`](MANUAL-SISTEMA.md). Las reglas del proyecto y las decisiones tomadas están en [`CLAUDE.md`](CLAUDE.md), y el estado vivo, en [`docs/ESTADO.md`](docs/ESTADO.md).

---

## 1. Requisitos

| Herramienta | Versión | Para qué |
| --- | --- | --- |
| Node.js | 24 (`.nvmrc`; mínimo 22) | API, worker, web y scripts |
| pnpm | 10 (`packageManager` en `package.json`) | Monorepo con workspaces |
| Docker | reciente | PostgreSQL 16, Redis 7, LocalStack (S3 y KMS) y Mailpit |
| ffmpeg y ffprobe | cualquiera reciente | Transcripción de video y audio (HU-0305) |
| Chromium de Playwright | el de la versión fijada | Pruebas de flujos de la web |

## 2. Primer arranque

```bash
pnpm i
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp packages/db/.env.example packages/db/.env   # DATABASE_URL
pnpm dev:infra                                 # PostgreSQL, Redis, LocalStack y Mailpit (docker compose)
pnpm db:migrate && pnpm db:seed                # esquema y datos de ejemplo
pnpm almacen:preparar                          # bucket y clave KMS en LocalStack
pnpm dev                                       # api :3000, web :5173 y worker
```

- **Usuarios de ejemplo:** `admin@`, `instruccional@`, `grafico@`… `@aulaseducativas.test`, con la clave de desarrollo `Aptio-local-2026` (o la de `SEED_CLAVE`).
- **Correo:** los correos de invitación y recuperación llegan a Mailpit (bandeja web del contenedor `mailpit`).
- **Proveedores de IA:** por defecto `PROVEEDORES_MODO=simulado` responde con las salidas grabadas del caso LOTO (`packages/ai/casos/loto/`), sin red ni costo. Para usar Anthropic y Google, pon `PROVEEDORES_MODO=real` y las claves en los `.env` (nunca en el repositorio).

## 3. Estructura del repositorio

```text
apps/
  api/        NestJS · REST /api/v1 · OpenAPI en /api/v1/docs
  web/        React 19 + Vite · interfaz (prototipo: docs/diseno/prototipo-unificado.html)
  worker/     BullMQ · colas ia, voz, media, export y mantenimiento
packages/
  db/         Prisma: esquema, migraciones y datos de ejemplo (@aptio/db)
  schema/     esquema JSON del curso, tipos generados, validador y tipos compartidos (@aptio/schema)
  ai/         proveedores de IA, prompts versionados, esquemas de salida, costos (@aptio/ai)
  colas/      nombres de colas, conexión a Redis y eventos en vivo (@aptio/colas)
  almacen/    S3 cifrado con KMS, URLs firmadas, tipos permitidos, saneo de SVG (@aptio/almacen)
  ui/         tokens visuales, estilos base y estructura de la interfaz (@aptio/ui)
docs/         especificación: módulos, historias, API, ADR, diseño, ESTADO.md
```

`@aptio/schema` se importa por subrutas (`@aptio/schema/generacion`, `@aptio/schema/proyecto`, `@aptio/schema/marca`, `@aptio/schema/voz`) para que la web cargue solo lo que usa.

## 4. Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | API, web y worker en modo desarrollo |
| `pnpm lint` | oxlint en todo el repositorio, sin avisos permitidos |
| `pnpm typecheck` | TypeScript estricto en todos los paquetes |
| `pnpm test` | Vitest de todos los paquetes (usa PostgreSQL y Redis reales) |
| `pnpm ci` | Lo mismo que el primer trabajo de CI: lint, tipos, pruebas, casos de IA y lint de OpenAPI |
| `pnpm web:e2e` | Playwright contra la API simulada de `apps/web/e2e/api-simulada.ts` |
| `pnpm ia:casos` | Valida las salidas grabadas del caso LOTO contra sus esquemas |
| `pnpm openapi:lint` | Lint del contrato `docs/api/openapi.yaml` (hoy: 0 errores y 7 avisos aceptados) |
| `pnpm db:migrate` / `db:seed` / `db:generate` | Migraciones, datos de ejemplo y cliente de Prisma |

Para las pruebas de almacenamiento en local: `AWS_ENDPOINT=http://localhost:9000 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test pnpm ci`.

## 5. Flujo de trabajo

1. Lee `docs/ESTADO.md` y la historia en `docs/16-historias-y-pruebas.md` (con sus casos CP-###), el módulo en `docs/14-modulos.md` y el contrato en `docs/api/openapi.yaml`.
2. Trabaja solo en el sprint vigente (`docs/18-plan-sprints.md`).
3. Crea una rama `feat/HU-####-nombre` desde `main`; un PR por historia (o por grupo pequeño), con Conventional Commits.
4. Escribe las pruebas de los CP de la historia: Vitest para la lógica y Playwright para los flujos.
5. Antes del PR: `pnpm ci` y `pnpm web:e2e` en verde.
6. Al cerrar, actualiza `docs/ESTADO.md` (cambios, supuestos SUP-##, pendientes), el contrato OpenAPI y **los tres manuales** de la raíz.

## 6. Patrones obligatorios

### 6.1 API (NestJS)

- **Prefijo y contrato:** todo cuelga de `/api/v1`, y cada ruta nueva se agrega a `docs/api/openapi.yaml`.
- **Validación:** los DTO usan class-validator y la validación global rechaza propiedades desconocidas.
- **Errores:** siempre `{ codigo, mensaje, detalles }` (`apps/api/src/comun/filtro-errores.ts`). Usa 422 para datos inválidos con un `codigo` en mayúsculas (por ejemplo, `SIN_MATERIAL`), 404 cuando no existe o no es de la organización, y 409 para conflictos (`GENERACION_ACTIVA`, `KIT_DESACTUALIZADO`).
- **Sesión y roles:** toda ruta exige sesión salvo `@Publico()`, y `@Roles(...)` la limita por rol (`guarda-roles.ts`).
- **Alcance por organización:** toda consulta filtra por `organizacionId` (`organizacionDe(u)`). El `REVISOR_CLIENTE` además queda limitado a su `clienteId`.
- **Auditoría:** las acciones relevantes dejan una fila en `Auditoria` (por ejemplo, `MATERIAL_AGREGADO` o `RECURSO_SUBIDO`).

### 6.2 Trabajos en segundo plano

- **Nada pesado en la petición.** La API encola con `ColasService.encolar(cola, { trabajoId, organizacionId, tarea })` y el worker despacha por `tarea` en `apps/worker/src/index.ts`:

  | Tarea | Cola | Qué hace |
  | --- | --- | --- |
  | `EXTRAER_TEXTO` | `media` | Extrae el texto por página |
  | `TRANSCRIBIR` | `media` | Transcribe video y audio |
  | `GENERAR` | `ia` | Corre la generación por etapas |

- **Organización:** el worker vuelve a buscar cada entidad con la `organizacionId` del trabajo y nunca procesa datos de otra organización.
- **Si no se puede encolar,** la entidad queda en `error` con un motivo legible y nunca en `pendiente` para siempre.
- **Avance en vivo:** se publica con `publicarEvento` (`@aptio/colas`) y la API lo reenvía por SSE.

### 6.3 Tareas de IA

- Prompts versionados en `packages/ai/prompts/IA-xx.vN.md`. **Cambiar un prompt = nueva versión** (`.v2.md`), sin editar la anterior.
- Toda salida se valida contra `packages/ai/esquemas/IA-xx.salida.schema.json` antes de usarse. `ejecutarTarea` reintenta con los errores hasta 3 intentos y, si sigue fallando, lanza `SalidaNoValida`: **nunca se guarda una salida a medias**.
- Las reglas propias de una etapa van como `validarExtra` (devuelven `string[]` de errores, que vuelven al modelo en el reintento). Se aplican solo con un proveedor real, porque el simulado responde siempre el caso LOTO.
- Todo texto del cliente va neutralizado dentro de `<material_cliente>`: `paginasParaPrompt`, `materialParaPrompt` y `textoSeguro`. El texto del cliente nunca puede cambiar las instrucciones.
- Cada llamada queda en `TrabajoIA` con proveedor, modelo, versión del prompt, consumo, intentos y costo, también si falla (`tareaRegistrada` en `apps/worker/src/ia.ts`). Las tarifas están en `TARIFAS` (`packages/ai/src/texto.ts`).

### 6.4 Web

- Referencia visual: `docs/diseno/prototipo-unificado.html` y `docs/diseno/DESIGN.md`. Usa solo los tokens de `@aptio/ui`, la escala de 6 tamaños de letra y márgenes de 32 px (16 px en celular, sin desborde horizontal a 390 px).
- Los archivos de componentes solo exportan componentes (regla de oxlint). Las funciones auxiliares van a `apps/web/src/formato.ts`.
- Cada vista nueva se prueba en Playwright con la API simulada (`apps/web/e2e/api-simulada.ts`), que imita el avance del worker en cada consulta.
- Las interacciones funcionan con dedo, ratón y teclado, y cumplen la accesibilidad de `docs/05-interacciones.md`.

### 6.5 TypeScript

- `strict` con `exactOptionalPropertyTypes`: no asignes `undefined` a una propiedad opcional, sino que omítela con `...(x ? { x } : {})`.
- Para leer columnas `Json` de Prisma, convierte con `as unknown as Tipo`.

## 7. Cómo extender

### 7.1 Agregar una etapa del generador

Las 11 etapas están en `ETAPAS` (`packages/schema/src/generacion.ts`). Una etapa sin ejecutor queda «En espera» con `DETALLE_PROXIMAMENTE`. Para habilitarla:

1. Define en `@aptio/schema/generacion` el tipo de lo que guarda (por ejemplo, `GuionCurso`) y las funciones compartidas con la web.
2. Escribe el ejecutor en `apps/worker/src/etapas/<nombre>.ts` con la firma `EjecutorEtapa`:
   - recibe `ctx` con `generacionId`, `organizacionId`, `proyectoId`, `parametros`, `anteriores` (los `datos` de las etapas terminadas), `bd`, `proveedor` e `ia<T>(tarea, variables, opciones)`;
   - devuelve `{ texto, datos? }`: `texto` es la línea que ve el usuario y `datos` se guarda en `GeneracionEtapa.detalle`;
   - para mostrar resultados parciales mientras corre, llama a `ctx.avance(texto, datos)`: guarda el avance y lo avisa por SSE, y la API lo devuelve con la etapa en curso. La etapa 4 lo usa para cada pantalla lista (encadena las llamadas para que un avance viejo no pise a uno nuevo).
3. Si falta el resultado de la etapa anterior, lanza un error claro (la etapa queda en ERROR sin llamar a la IA).
4. Regístralo en `EJECUTORES` (`apps/worker/src/etapas/index.ts`).
5. En la web, crea la vista del resultado y agrégala a `RESULTADOS` en `GeneracionScorm.tsx`. Lee los datos con `api.etapaGeneracion<T>(id, etapa)`. Con `enVivo: true` la vista se muestra sola mientras la etapa corre y recibe `clave` (el detalle de la etapa), que cambia con cada avance para volver a pedir los datos.
6. Pruebas:
   - worker: con `apps/worker/test/apoyo-generacion.ts`, que trae `escenario()`, `comoReal()` (proveedor «real» sobre salidas grabadas, con consumo) y `etapaDe()`;
   - unitarias de las reglas propias;
   - Playwright del CP.
7. Documenta: esquema en OpenAPI (`EtapaResultado`), entrada en ESTADO y supuesto si aplica.

La etapa 4 (`apps/worker/src/etapas/pantallas.ts`) es el ejemplo más completo. Encadena dos tareas por pantalla: IA-15 la compone y, si tiene actividad, IA-07 escribe sus datos (`apps/worker/src/etapas/actividades.ts`, con las fichas del catálogo y `interaccionDe`, que antepone el id de la pantalla a los ids para que no choquen). Además corre IA-15 en paralelo (`EN_PARALELO = 4`), convierte los campos en bloques con `bloquesDe` y guarda el documento del curso validado con `validarCurso` en `Curso` y `CursoVersion`.

`ctx.ia` comprueba antes de cada llamada que la etapa siga en curso: si cancelan, lanza `GeneracionCancelada` y el costo gastado se conserva.

### 7.2 Agregar un proveedor

- **Texto:** implementa `ProveedorTexto` (`nombre`, `modeloPara`, `completar`) y elígelo en `proveedorDesdeEntorno`.
- **Transcripción:** implementa `ProveedorTranscripcion` (`packages/ai/src/transcripcion.ts`) y elígelo en `transcriptorDesdeEntorno`. En modo real sin clave, el proveedor debe fallar con un motivo y no inventar texto.
- Registra la tarifa y la licencia (`docs/19-proveedores-y-licencias.md`, ADR-010). Si no está verificada, déjala como supuesto.

### 7.3 Agregar un tipo de material

1. Permite el tipo en `PERMITIDOS` (`packages/almacen/src/tipos.ts`), con su verificación por contenido.
2. Decide la tarea en `MaterialesService.agregar` (`apps/api/src/proyectos/materiales.service.ts`).
3. Procésalo en el worker y guarda el resultado en `MaterialFuente` (`paginas` o `transcripcion`). Marca con `posibleInstruccion` lo que parezca una orden para la IA.

## 8. Pruebas

- **Vitest** usa PostgreSQL y Redis reales. Sin ellos, las pruebas que los necesitan se saltan en local, pero **en CI fallan** para no dar un falso verde.
- **Playwright** usa la API simulada. Corre con `npx playwright test --trace off` desde `apps/web`.
- La transcripción se prueba con ffmpeg real sobre un video generado en la misma prueba (`apps/worker/test/transcribir.test.ts`).
- **Prohibido** saltarse, desactivar o poner en cuarentena una prueba para obtener verde.

## 9. Integración continua

`.github/workflows/ci.yml` corre en cada PR y en cada push a `main`:

- **Lint, tipos y pruebas:**
  - lint y tipos;
  - migraciones y datos de ejemplo sobre PostgreSQL 16 y Redis 7;
  - LocalStack;
  - ffmpeg (se instala si falta);
  - Vitest, `ia:casos` y lint de OpenAPI.
- **Flujos de la web:** Playwright con Chromium.

Para que un PR en rojo no se pueda fusionar, el administrador del repositorio debe exigir ambos controles en la protección de `main`.

## 10. Variables de entorno principales

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | db, api, worker | PostgreSQL |
| `REDIS_HOST`, `REDIS_PORT`, `COLAS_PREFIJO` | api, worker | Colas y eventos (el prefijo debe coincidir en ambos) |
| `SESSION_SECRET`, `SESSION_TTL_HOURS` | api | Firma y vigencia de la cookie de sesión (obligatorio en producción) |
| `AWS_*`, `S3_BUCKET_NAME`, `KMS_KEY_ID` | api, worker | Almacenamiento cifrado |
| `SMTP_URL`, `CORREO_REMITENTE` | api | Invitaciones y recuperación de clave |
| `PROVEEDORES_MODO` | api, worker | `simulado` o `real` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_*`, `ANTHROPIC_ESFUERZO` | worker | IA de texto |
| `GOOGLE_STT_API_KEY`, `GOOGLE_STT_MODELO` | worker | Transcripción |
| `GOOGLE_TTS_API_KEY` | api | Muestra de voz |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | api | Ingreso con Google |

Ninguna clave real va al repositorio.

## 11. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Pruebas «skipped» en local | PostgreSQL o Redis apagados | `pnpm dev:infra` (o iniciar los servicios) |
| `PrismaClientInitializationError` | Base no disponible o `DATABASE_URL` sin definir | Revisa `packages/db/.env` |
| El material de video queda en error «No se pudo extraer el audio» | El archivo no tiene pista de sonido, o falta ffmpeg | Instala ffmpeg o revisa el archivo |
| En modo real, la transcripción falla con `GOOGLE_STT_API_KEY` | Falta la clave | Agrégala al `.env` del worker |
| `openapi:lint` con más de 7 avisos | Un componente sin usar o `nullable` sin `type` | Usa el componente o agrega `type` |
| oxlint «solo exportar componentes» | Una función auxiliar en un `.tsx` | Muévela a `formato.ts` |

---

## Historial de este manual

| Versión | Fecha | Cambios |
| --- | --- | --- |
| 0.5 | 2026-11-10 | IA-07 dentro de la etapa 4 (datos de las actividades). |
| 0.4 | 2026-11-10 | `ctx.avance` y vistas en vivo; la etapa 4 como ejemplo de etapa en paralelo que guarda el curso. |
| 0.3 | 2026-11-10 | Primera versión, al cierre del S2: entorno, estructura, patrones, cómo agregar etapas, proveedores y materiales, pruebas y CI. |
