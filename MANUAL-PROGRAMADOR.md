# Aptio SCORM · Manual del programador

**Versión 0.36 · actualizado con la primera entrega del Sprint 8 (12 de noviembre de 2026)**

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
  player/     reproductor único del curso: vista previa y paquete, con las 8 interacciones (@aptio/player)
docs/         especificación: módulos, historias, API, ADR, diseño, ESTADO.md
```

`@aptio/schema` se importa por subrutas (`@aptio/schema/generacion`, `@aptio/schema/proyecto`, `@aptio/schema/marca`, `@aptio/schema/voz`, `@aptio/schema/revision`) para que la web cargue solo lo que usa.

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
- **Id del trabajo:** BullMQ descarta un trabajo con un id repetido y no acepta «:» en un id propio. La generación usa `{generacionId}-{intento}`; `GeneracionesService.intento()` cuenta las auditorías `GENERACION_CONTINUADA` y `NARRACIONES_REGENERADAS`.

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

### 6.5 Reproductor (`@aptio/player`)

- Es el mismo código en la vista previa y en el paquete (decisión 3). Sin dependencias: no agregues librerías, el empaquetado debe seguir bajo 300 KB comprimido (`test/paquete.test.ts`, CP-085; hoy pesa 12 KB).
- Entrada: `montar(contenedor, curso, { kit, revision, inicio, marco, urlRecurso, alCambiar })`. Con `marco: false` dibuja solo la pantalla, sin barra, pie ni atajos de teclado (lo usa la Revisión). Se monta en un Shadow DOM propio; los estilos viven en `src/estilos.ts` con variables `--ap-*` que salen del kit.
- Las reglas de avance (`src/navegacion.ts`) y el seguimiento (`src/seguimiento.ts`) son funciones puras: cualquier patrón nuevo las reutiliza.
- Cada interacción es una función `(datos, ctx) => HTMLElement` en `src/interacciones/` que llama `ctx.terminar({ completada, puntaje })`. Todo con botones; el orden barajado usa `barajar(lista, clave)` con el id de la pantalla para que vista previa y paquete coincidan.
- Reanudación (HU-1105): `montar(..., { reanudar: { pantallaId, vistas, resultados, preguntar }, alReanudar })` restaura el avance y, con `preguntar`, muestra el aviso «¿Continuar donde lo dejaste?» dentro del Shadow DOM. La decisión y la restauración son funciones puras en `src/reanudacion.ts`. `suspend_data` v2 vive en `src/suspend.ts` (`2|<huella>|<idioma>|<vistas>|<pos:c:p[:intentos]>`; la huella sale de `huellaCurso(curso.id, orden)`) y se sigue leyendo v1. `leerSuspend` nunca lanza: lo inválido devuelve `null`. `conectarScorm12` no hace commit al entrar, no degrada un `lesson_status` cerrado y, con `mejorNota`, no baja `score.raw`. `iniciarPaquete` no reporta nada hasta que el participante elige. Si cambias el formato, súbele la versión y conserva la lectura de las anteriores.
- Modo diagnóstico (HU-1204): `src/diagnostico.ts` (`RegistroDiagnostico`, `informeDiagnostico`, `navegadorResumido`) es lógica sin DOM; `src/panel-diagnostico.ts` es el panel. `buscarApi(ventana, registro)` y `conectarScorm12(api, { registro })` anotan solos: si agregas una llamada al LMS, pásala por `llamar(..., nota)` para que quede en el registro. Nunca leas datos del participante; si hiciera falta, agrégalos a `ELEMENTOS_PRIVADOS`. Si cambias la forma del informe, súbele `version` (lo guardan las fichas de los clientes). `DatosPaquete.diagnostico: false` lo desactiva (lo pone `construirScorm12` con `incluirDiagnostico: false`).
- HTML (HU-1203): con `DatosPaquete.modo: 'html'`, `conectarPaquete` no toca `API`, `parent` ni `opener` y no avisa; tampoco hay modo diagnóstico. No agregues `fetch` al camino del paquete: en `file://` no funciona. Los SVG y los WebVTT van en `datos.js`.
- Accesibilidad (HU-1401): no uses `disabled` en un control que puede tener el foco en ese momento (una carta emparejada usa `aria-disabled`); si una acción quita o desactiva el control enfocado, mueve el foco con `enfocar(el)` de `interacciones/comun.ts` (espera a que el elemento esté en la página). `pieResultado` ya enfoca el resultado; el texto que debe leerse al empezar o al pasar de paso lleva `tabindex=-1` y `data-enfocar` (`inicioDe` lo busca al repetir). Los colores del kit que se usan como texto pasan por `colorLegible` (`src/contraste.ts`) y se exponen como `--ap-bien-texto`, `--ap-mal-texto` y `--ap-foco`; no pongas `var(--ap-secundario)` como color de texto.
- Créditos (HU-1406): `montar(..., { creditos })` suma el botón «Créditos» a la barra (solo con marco); `src/creditos.ts` (`abrirCreditos`) dibuja el diálogo modal, deja `inert` el resto de la raíz y devuelve el foco al botón. `DatosPaquete.creditos` lo pasa desde `datos.js`. Si agregas controles al diálogo, cambia el manejo de Tab, que hoy deja el foco en «Cerrar».
- Para el paquete: `pnpm --filter @aptio/player construir` deja `packages/player/dist/aptio-reproductor.js` con `window.AptioReproductor.montar`.

### 6.5.1 Entrega (`@aptio/exporters`)

- `construirScorm12` arma el ZIP (HU-1202) y `construirHtml` la carpeta autocontenida (HU-1203). Las dos parten de `armarContenido` y `comprimir` (ZIP determinista), así que comparten las reglas de qué recursos entran: nunca `documento` (SUP-52) ni recursos de otro idioma (SUP-49).
- `validarExportacion(formato, curso, pesosRecursos, pesoReproductor, limiteMb, { origenLimite })` valida antes de exportar (HU-1201); `validarScorm12` es su atajo para SCORM. En HTML devuelve `limiteMb`, `suspendDataCaracteres` (y en la API `origenLimite`) en `null`. Si cambias qué recursos entran en `armarContenido`, cambia también la estimación de peso.
- La validación es pura y no lanza con un documento roto: devuelve los errores de esquema y lo que se pueda calcular. Solo `errores` impide exportar; el peso nunca (RN-12-2). Los textos de las alternativas están en `ALTERNATIVAS_PESO` y siguen a `docs/08-entregas-y-lms.md`.
- Créditos (HU-1406): `armarCreditos(recursos, organizacion, idioma)` de `src/creditos.ts` arma `{ aviso, filas }` o `null`; `construirScorm12` y `construirHtml` lo reciben como `creditos`. `esDeIa` deja fuera el proveedor `aptio` (`PROVEEDOR_APTIO`). Un proveedor nuevo suma su nombre comercial en `NOMBRE_PROVEEDOR`.
- La API (`ExportacionesService.validar`) pide las filas de `Recurso` solo para ids con forma de UUID: los ids de ejemplo del caso LOTO no son filas y salen como faltantes.

### 6.5.2 Idiomas y traducción (M08)

- `@aptio/schema/traduccion` es la base: `textosDe(doc)` recorre los textos `{ es, en }` (un objeto con solo esas claves y `es` no vacío) con su ruta JSON Pointer y su pantalla; `aplicarTraducciones(doc, { ruta: en })` devuelve una copia; `huellaTexto` es la huella del español; `sincronizarFilas` dice qué filas crear, reiniciar y borrar; `erroresGlosario` y `erroresLote` validan la salida de IA-10. Las usan la API y el worker: no repitas esa lógica.
- IA-10 v2 (`packages/ai/prompts/IA-10.v2.md`): los textos van como JSON neutralizado (`neutralizar`) en `<material_cliente>` y el glosario en el bloque común. `erroresLote` va como `validarExtra`, así el reintento lleva los errores del glosario. El modo simulado (`traduccionSimulada` en `packages/ai/src/texto.ts`) lee el glosario del sistema y responde la traducción grabada si lo respeta, o «[EN] » más el español.
- Worker (`apps/worker/src/traducir.ts`): el despacho exige `tarea: 'IA-10'` y `traduccion: { cursoId }` en los datos del trabajo. `guardarLote` aplica solo lo que sigue Pendiente y con la misma huella, con reintento si la versión del curso cambió. Si cambias el tamaño del lote, cambia `LOTE_TRADUCCION`.
- API (`apps/api/src/traducciones/`): listar sincroniza en una transacción; editar pasa por `CursosService.guardar` (ahora exportado por `CursosModule`).
- Web: `IdiomasVista.tsx` (PNT-11) sigue el patrón de Entrega para el avance (SSE `trabajo` más consulta de `/trabajos/{id}` cada 2 s).
- Desbordes (HU-0803): `limiteDe(doc, ruta)` clasifica la ruta con `componenteDe` (un bloque de texto por su `rol`; el resto por la forma de la ruta con `#` en lugar de las posiciones, en `COMPONENTES`) y devuelve el límite de `LIMITE_CARACTERES`. Un componente nuevo del esquema suma su forma en `COMPONENTES`; la prueba «el componente de cada forma de ruta de LOTO» falla si una forma cambia de tipo. En el worker, `guardarLote` devuelve los textos largos y `proponerCortas` pide su versión corta (con `erroresLimite` como validación extra) sin pedir dos veces la misma ruta en un trabajo. `sincronizarFilas` devuelve también `desbordar`.
- Paquete bilingüe (HU-0804): en `packages/player/src/reproductor.ts`, `montar` es un envoltorio que guarda el `Reproductor` de `montarUno` y lo reemplaza al cambiar de idioma (`destruir` y montar de nuevo con `reanudar` y `inicio` de la pantalla actual); el objeto devuelto delega en el actual, así quien lo guardó sigue mandando. El botón `.ap-idioma` sale con `es` y `en` en `opciones.idiomas ?? curso.idiomas`; `alCambiarIdioma(idioma, estado)` avisa. En el paquete, `iniciarPaquete` elige el idioma con `idiomaInicial` (lo guardado en suspend_data si el curso lo trae) y `ConexionScorm12.cambiarIdioma` cambia el idioma que se codifica. El exportador tiene `bilingue.ts` (`cursoBilingue`, `textosEnIngles`, `pantallasSinVozIngles`); `armarContenido` recibe `modoIdioma` y filtra los recursos por `idiomas`. `OpcionesValidacion` suma `modoIdioma` y `desbordes`. En las pruebas, `traducirLoto` (`packages/exporters/test/loto.ts`) da el LOTO con «[EN] …» y `simularApi({ cursoTraducido: true })` lo usa en la web.
- Voz en inglés (HU-0804 parte 2): las etapas `voz.ts`, `boca.ts` y `subtitulos.ts` del worker leen el idioma con `idiomaDe(ctx)` (`parametros.regenerarVoz.idioma`, `es` por defecto) y todo lo que escriben va por idioma: `porIdioma[idioma]`, la fila `Narracion`, los nombres `${pantalla}-${idioma}.mp3|vtt` y los recursos filtrados por `idioma`. `VOZ_INGLES_PREDETERMINADA` es la voz si el kit no trae `voces.en`; las `anclas` solo se recalculan en español. La API rechaza dos idiomas a la vez y `en` sin traducciones (`narracionesTraducidas`). En la web, `VozIngles.tsx` sigue la generación por SSE y consulta cada 2 s. En las pruebas: `simularApi({ cursoTraducido: true, sinIngles: [...] })` deja pantallas sin inglés y `abrirEnLms(..., { recursosExtra })` suma audios y VTT al paquete.

### 6.6 Cambios al documento del curso (M05)

- Todo cambio al curso pasa por `CursosService.guardar(u, cursoId, versionLeida, motivo, cambiar)` (`apps/api/src/cursos/`):
  - Compara la versión leída. Si otra persona guardó antes, responde 409 `VERSION_CAMBIO`.
  - Aplica `cambiar` sobre una copia del documento y la valida con `erroresCurso`. Si no valida, responde 422 y nada se guarda.
  - En una transacción, actualiza solo si la versión no cambió, crea un `CursoVersion` con el motivo y recalcula las observaciones por reglas.
- Las observaciones por reglas (`observacionesRegla`) y el origen de una pantalla (`origenDe`) viven en `@aptio/schema/revision`. Las usan el worker (al terminar la etapa 4), la API (en cada guardado) y la web. Las observaciones `origen: regla` se borran y se vuelven a crear; las de la IA y las de personas no se tocan.
- Control de calidad (HU-0505): las reglas viven en `@aptio/schema/calidad` (`observacionesRegla(doc, { paleta, desbordesEn })`, `LIMITES`, `TOPE_OBSERVACIONES_IA`, `severidadDeGravedad`, `tipoDeCategoria`); `@aptio/schema/revision` las reexporta. Para guardarlas usa siempre `recalcularReglas(bd, cursoId, documento)` de `@aptio/db` (dentro de la transacción cuando la hay): lee el kit y los desbordes por ti. Una regla nueva se agrega en `calidad.ts` con su prueba en `packages/schema/test/calidad.test.ts`, y LOTO debe seguir sin observaciones.
- IA-12: `apps/worker/src/calidad.ts` tiene `revisarCurso(bd, cursoId, llamar, alLote)`, que comparten la etapa 10 (`controlCalidad`) y el trabajo de la cola `ia` (`crearRevisorCalidad`, `data.calidad.cursoId`). La API está en `apps/api/src/cursos/calidad.service.ts` y `calidad.controller.ts`; la tarjeta web, en `apps/web/src/vistas/ControlCalidad.tsx`. Las pruebas: `apps/worker/test/calidad.test.ts`, `apps/api/test/calidad.e2e.test.ts` y `apps/web/e2e/calidad.spec.ts` (con axe).
- Alineación (HU-1001): `@aptio/schema/alineacion` tiene `elementosAlineacion`, `informeAlineacion`, `alertasObjetivo` y `aplicarNiveles` (cambia niveles en el documento y devuelve el error en palabras, para no guardar a medias), y la tabla `NIVEL_DISPOSICION`. La API está en `apps/api/src/alineacion/` (guarda con `CursosService.guardar`, motivo «alineación»); la vista, en `apps/web/src/vistas/AlineacionVista.tsx`. `validarExportacion` suma `objetivosSinAlinear`. Pruebas: `packages/schema/test/alineacion.test.ts`, `apps/api/test/alineacion.e2e.test.ts` y `apps/web/e2e/alineacion.spec.ts` (con axe).
- RN-05-1: aprobar exige que no haya una observación abierta `bloquea-entrega`. RN-05-2: editar deja la pantalla en `borrador`. Lo que escribe una persona cambia `origen.tipo` a `manual` y conserva el documento y la página.
- Al cambiar la narración se recalcula `hashTexto` (sha256 de texto, voz y velocidad) y el audio `generado` pasa a `desactualizado`. Así la regeneración en cascada (S5) sabe qué rehacer.

### 6.7 TypeScript

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

`ctx.ia` comprueba antes de cada llamada que la etapa siga en curso: si cancelan, lanza `GeneracionCancelada` y el costo gastado se conserva. Las etapas que no llaman a la IA de texto usan `ctx.gastar(usd)` (suma el costo y luego revisa la cancelación) y `ctx.comprobar()`.

Una etapa sin ejecutor ya no frena a las siguientes: si alguna posterior sí tiene ejecutor, queda «En espera» y el bucle sigue (SUP-24).

La etapa 6 (`apps/worker/src/etapas/voz.ts`) es el modelo para etapas de medios. `crearEtapaVoz({ sintetizar, subir, esperaMs })` recibe el sintetizador y la subida al almacenamiento para que las pruebas los reemplacen. Para cada pantalla:

- calcula `hashNarracion(texto, voz, velocidad, términos)` (`@aptio/ai`, RN-07-1) y reutiliza la `Narracion` con audio y el mismo hash (si estaba DESACTUALIZADA, vuelve a ACTUALIZADA);
- aplica `aplicarPronunciacion` y reintenta hasta `INTENTOS_VOZ = 3`;
- mide la duración con `duracionAudio` (WAV y MP3);
- guarda `Recurso` y `Narracion` en una transacción, y un `TrabajoIA` con `costoVoz`.

Al final actualiza el curso con bloqueo optimista y una `CursoVersion` con motivo `voz`. En el worker se registra en `index.ts` con `sintetizadorDesdeEntorno(process.env)`.

**Regenerar (HU-0703).** `POST /cursos/{id}/narraciones/regenerar` (`GeneracionesService.regenerarNarraciones`) no crea otra generación. Bajo el mismo bloqueo de aviso que «Continuar», reabre VOZ_ES y BOCA de la última, guarda `parametros.regenerarVoz = { pantallaIds?, forzar }` (tipo `RegenerarVoz`) y encola. La etapa 6 lee ese pedido:

- una pantalla fuera de `pantallaIds` conserva su audio y su estado;
- dentro del pedido, decide el hash, salvo con `forzar`, que pide una toma nueva;
- toda narración con audio nuevo queda con `bocas: null`, para que la etapa 7 la recalcule.

La etapa 7 acepta narraciones ACTUALIZADA y DESACTUALIZADA con audio. Las marcas a DESACTUALIZADA las ponen la API al guardar el diccionario (`GlosarioService`, RN-02-4) y `CursosService.editar` cuando cambia el texto de la narración.

La etapa 7 (`apps/worker/src/etapas/boca.ts`) sigue el mismo molde: `crearEtapaBoca({ calcular, leer })` recibe un `CalculadorBocas` y la lectura del almacenamiento.
- `calculadorBocasDesdeEntorno(env)` (`src/extraer/rhubarb.ts`) devuelve `calculadorSimulado` en modo simulado o `calculadorRhubarb(RHUBARB_PATH)`, que pasa el audio por ffmpeg a WAV y corre `rhubarb -r phonetic -f json --extendedShapes GHX`.
- Las funciones puras están en `@aptio/ai`: `bocasSimuladas`, `bocasDeRhubarb` y `normalizarBocas`. Toda lista de marcas cierra con `[duraciónMs, 'X']`.
- Una narración con `bocas` no nulas se reutiliza; la etapa 6 las pone en `null` al crear otro audio.

La etapa 8 (`apps/worker/src/etapas/subtitulos.ts`, HU-0801) recibe solo `subir`: `crearEtapaSubtitulos({ subir })`.
- Las funciones puras están en `@aptio/ai` (`src/subtitulos.ts`): `subtitulosDeNarracion(texto, duracionMs)` (una frase por subtítulo, partida si pasa de `MAX_CARACTERES_SUBTITULO = 84`, tiempos por letras), `aVtt` (escapa `& < >`) y `tiempoVtt`.
- Guarda un `Recurso` SUBTITULO (`text/vtt`) y `Narracion.subtituloRecursoId`, y en el curso `porIdioma.es.subtitulosId`, el recurso `tipo: 'subtitulos'` y `estado: 'generado'` si ya hay `duracionMs` y `bocas`. Versión del curso con motivo `subtitulos`.
- Una narración con `subtituloRecursoId` se reutiliza. La etapa 6 lo pone en `null`, borra `subtitulosId` y deja la narración `pendiente` al crear otro audio. Regenerar (HU-0703) reabre VOZ_ES, BOCA y SUBTITULOS.

La regeneración en cascada (HU-0503) es un trabajo aparte, `CASCADA` en la cola `voz`, para una sola pantalla.
- `apps/worker/src/cascada.ts`: `crearCascada({ bd, voz, boca, subtitulos, esperaMs, esperaMaximaMs })` reutiliza las mismas etapas 6, 7 y 8 con un contexto sin generación (`generacionId: ''`, `parametros.regenerarVoz = { pantallaIds: [pantallaId] }`). La voz guarda `TrabajoIA.generacionId = null`. Mientras el proyecto tenga una generación EN_COLA o EN_CURSO, espera (5 s por vuelta, máximo 30 min). Si falla, la narración queda ERROR y el trabajo falla.
- En `DatosTrabajo`, `trabajoId` es el curso y `pantallaId` la pantalla. Las constantes `TAREA_CASCADA`, `ESPERA_CASCADA_MS` y `CASCADA_ES` están en `@aptio/schema/generacion`.
- La API (`CursosService.editar`) encola con `ColasService.encolarConEspera(cola, datos, jobId, esperaMs)`: un trabajo diferido de id `cascada-{curso}-{pantalla}`. Si hay uno pendiente con ese id, lo borra y lo vuelve a crear (CP-051). Si ya está activo, usa `{id}-tras`.
- La web (`RevisionVista.tsx`, `ChipsCascada`) consulta `GET /cursos/{id}/narraciones` y `GET /proyectos/{id}/generaciones` cada 2 s durante 2 min. Voz lista = ACTUALIZADA; boca = hay `bocas`; subtítulos = hay `subtitulosUrl`.

Las propuestas de la IA (HU-0504) son la tarea IA-16 v2 en la cola `ia`.
- `@aptio/schema/patch`: `aplicarPatch(doc, operaciones)` (RFC 6902, puro, lanza `ErrorPatch` con el número de operación).
- `@aptio/schema/propuesta`: `rutaProtegida` y `erroresRutas` (`/id`, `/estado`, `/narracion`), `aplicarEnPantalla` (marca `origen.tipo = ia` en los textos cambiados), `cursoConPropuesta`, `patchDe(cambios, varianteIndice)`, `huellaPantalla` (vencimiento, sin estado ni datos de voz) y `pantallaParaPrompt`.
- La API (`PropuestasService`) crea el `TrabajoIA` y encola `{ trabajoId, tarea: 'IA-16', pantallaId, propuesta: { cursoId, tipo, texto } }`. El worker (`apps/worker/src/propuesta.ts`) usa `tareaRegistrada` con `trabajoId` para no crear otro registro, y `validarExtra = erroresPropuesta`. Guarda en `Propuesta.cambios` `{ patch | variantes, huella }`.
- Aplicar usa `CursosService.guardar` y compara la huella dentro del guardado. Restaurar (`/versiones/{v}/restaurar`) copia la versión vieja pero conserva la narración de cada pantalla y `recursos`.
- En modo simulado, `ajustarAlPedido` elige la salida por `tipoPedido = "…"` de `X-IA-16-propuestas-p05.json`.

El editor (HU-0601, PNT-21) es `apps/web/src/vistas/EditorVista.tsx`, en la ruta `editor` de `menu.ts`.
- Después de `montar()`, recorre la sombra del reproductor: a cada `[data-bloque]` que `esEditable` acepta le pone `data-editable` y `tabindex=0`, e inyecta un `<style>` propio dentro de la sombra.
- Doble clic, o Enter/F2 con foco, activa `contentEditable = 'plaintext-only'`. Enter o `focusout` guardan; Esc restaura los nodos clonados.
- `edicion-texto.ts` (lógica pura, con Vitest) decide el cuerpo con `edicionDe(pantalla, bloqueId, escrito)`: `titulo`, `textos[bloque]`, `vacio` o `sin-cambios`.
- El lienzo se vuelve a montar con cada versión del curso; `guardarRef` evita montarlo de nuevo en cada render.

Los retoques (HU-0602):
- `packages/player/src/ajustes.ts`: `estiloAjuste(ajuste, tipo)` → `{ estilo, clase }` y `aplicarAjuste(el, …)`, llamados desde `dibujarPantalla` en cada elemento con `data-bloque`. Las clases `ap-anim-<animación>` y sus `@keyframes` están en `estilos.ts`. El tipo `AjusteElemento` está en `tipos.ts`.
- La web marca con `data-retocable` los textos, las imágenes y el personaje. Un clic o Espacio llama a `elegir`, que mide el tamaño visible en % del ancho de `.ap-r`, y un segundo efecto pone `data-elegido`.
- `ajustes-elemento.ts` (lógica pura, con Vitest) tiene `controlesDe`, `tamanoSiguiente`, `escalaSiguiente`, `ajusteCon` (quita `auto` y lo vacío; null restablece) y `nombreElemento`.
- `propiedades.tsx` tiene `BarraElemento` y `PanelPropiedades`, que comparten `AccionesRetoque`.
- `CursosService.editar` mezcla `dto.ajustes` en `pantalla.ajustes`, revisa los roles de color y deja el resto a `erroresCurso`.

El modo Libre (HU-0603):
- `estiloAjuste` agrega `--ap-dx`/`--ap-dy` en cqw y la clase `ap-desp`, `ap-desp-escritorio` o `ap-desp-celular`; las reglas `translate` (con `@container`) están en `estilos.ts`.
- En `EditorVista`, `pointerdown`/`pointermove`/`pointerup` en la sombra arrastran, con un umbral de `UMBRAL_ARRASTRE_PX`; durante el arrastre se ve con `el.style.translate`.
- Las flechas acumulan en `flechas` y guardan con un `setTimeout` de 1 s. `modoRef` y `moverRef` evitan montar el lienzo de nuevo.
- `ajustes-elemento.ts` tiene `pxAPorcentaje`, `desplazado` (tope ±100) y `cambioDesplazamiento`.

Deshacer, rehacer y guardado automático (HU-0607):
- `apps/web/src/vistas/historial.ts` (con Vitest) tiene `fotoDe` (título, textos, narración, disposición, ajustes y extras, copiados), `conFoto` (la pantalla como se ve en la foto, con la plantilla de su disposición), `cambioHacia(guardada, foto)` (el `PATCH`: si cambia la disposición manda todos los ajustes; si no, solo los que cambian, con `null` para los que sobran salvo los de extras que se quitan) y la pila `registrar`/`mover` con tope `MAX_HISTORIAL` (60).
- `EditorVista` registra la foto de antes en cada `enviar` correcto. `paso('deshacer' | 'rehacer')` usa refs (`historialRef`, `pendientesRef`, `cursoRef`) porque varias pulsaciones pueden llegar antes de dibujar; deja la foto en `pendientes`, que `documento` (memo) aplica para verla, y arma un temporizador de `ESPERA_GUARDADO_MS`. `guardarPendientes` manda un `PATCH` por pantalla con `motivo`; `enviar` lo llama antes de cada cambio nuevo, y también se llama al salir del editor. `fallo` con 409 recarga y vacía el historial.
- Los atajos van en `document` (`keydown`) y se ignoran si `composedPath()[0]` es un campo o un texto en edición.
- La API acepta `motivo` (`deshacer` o `rehacer`) en `PantallaCambioDto` y lo pasa a `guardar` para la `CursoVersion`.

Línea de tiempo (HU-0608, PR 1):
- `packages/schema/src/tiempos.ts` (exportado como `@aptio/schema/tiempos`, con Vitest): `marcasPalabra(texto, duracionMs)` reparte la voz por letras (SUP-47), `palabraEn`, `imantar(s, marcas, libre)` (palabra a menos de `IMAN_PALABRA_S` 0,25 s o décimas, con `anclaPalabra`), `tiemposElementos` y `duracionPantalla` (RN-06-7).
- `packages/player/src/tiempos.ts` repite esas reglas sin dependencias (el reproductor va solo en el paquete): `tiemposDe` (bloques y luego extras, escalonado de `ESCALONADO_S` 0,3 s sin `retardoS`), `activoEn`, `duracionDe` y `ultimoCambio`. Las dos copias tienen pruebas; si cambia una regla, cambia en las dos.
- El reproductor aplica los tiempos con el reloj del audio (o del sistema si no suena): `ap-fuera` oculta lo que está fuera de su rango y `ap-entra` anima la entrada escalonada. `montar(…, { sinTiempos: true })` desactiva el reloj (lo usa el lienzo del editor). Nuevos métodos: `irA(s)` deja la pantalla quieta en ese segundo (visibilidad, boca y subtítulo), `reproducir(desde, alTiempo)` corre el reloj y llama a `alTiempo(s, terminado)`, `pausar`, `verTodo` y `duracion`.
- En la web, `vistas/linea-tiempo.ts` (lógica pura, con Vitest) tiene el zoom, `tramosBoca`, `tramosSubtitulos`, `arrastrar(x, borde, dS, marcas, duracion, libre)` (devuelve el `CambioTiempo` de cuerpo, inicio o fin), `marcasRegla` y `formatoS`. El componente es `LineaTiempo.tsx` (no `linea-tiempo.tsx`: dos archivos con el mismo nombre rompen la resolución de módulos).
- `EditorVista` guarda la aguja por pantalla (`aguja`), maneja `irTiempo`, `reproducirTiempo`, `pausarTiempo` y `detenerTiempo`, y `cambiarTiempo` manda el ajuste con `enviar`, así que pasa por el historial. Espacio reproduce si el foco está en la página o en la línea de tiempo. `propiedades.tsx` suma Aparece, Sale y el ancla a una palabra.

Línea de tiempo (HU-0608, PR 2):
- `@aptio/schema/tiempos` suma `reanclar(viejo, nuevo, indice)` (alineación por la subsecuencia común más larga de palabras normalizadas con `normalizarPalabra`), `retardoDeAncla`, `reanclarAjustes` y `recalcularAnclas` (cambian los `ajustes` y devuelven los ids sin palabra), `sincronizarConVoz` (SUP-48) y el mensaje de «Revisar tiempo» (`mensajeRevisarTiempo`, `elementoRevisarTiempo`, `ORIGEN_REVISAR_TIEMPO` = `tiempo`).
- `CursosService.editar`, al cambiar la narración en español, llama a `reanclarAjustes`; tras guardar, `revisarTiempo` crea las observaciones de los perdidos y borra las de los elementos cuya entrada o ancla cambió (se compara con el ajuste anterior, porque el editor manda el ajuste entero).
- `etapas/voz.ts` llama a `recalcularAnclas` con `marcasPalabra(texto, duracionMs)` al poner un audio nuevo en el documento, y crea las observaciones en la misma transacción.
- En la web, `EditorVista` guarda la propuesta en `sincro` (por pantalla) y la pasa a `LineaTiempo` (`sincronizacion`, `alSincronizar`, `alAplicarSincronizacion`, `alDescartarSincronizacion`); las barras llevan `propuesta` y `revisar`. `recargar` lee las observaciones con origen `tiempo`. `X-IA-16-sincronizar-p05.json` es la salida de `sincronizarConVoz` y `test/sincronizar.test.ts` las compara.

Agregar elementos y capas (HU-0606):
- El reproductor dibuja `pantalla.extras` en `.ap-extras` con `dibujarExtra` (`pantalla.ts`); cada extra lleva `data-bloque` y `data-extra`, la posición base de `posicionExtra` (`left/top/width` en %) y pasa por `aplicarAjuste`, que ahora suma al estilo en vez de reemplazarlo. `TIPO_AJUSTE` reusa los ajustes de texto o de imagen; `a.oculto` agrega `ap-oculto-el`. El botón usa `accionBoton` y `ContextoPantalla.alSiguiente`; `montar(…, { sinAcciones: true })` lo deja inerte en el editor.
- `CursosService.editar` procesa `dto.extras` entre la disposición y los ajustes: valida ids (422 EXTRA_NO_VALIDO), purga los ajustes de los extras quitados y deja `extras` o lo borra si queda vacío. Los ajustes aceptan ids de extras.
- En la web, `extras.ts` (con Vitest) tiene `TIPOS_EXTRA`, `extraNuevo`, `capasDe` y `sinExtra`; `panel-izquierdo.tsx` dibuja las pestañas. `EditorVista` maneja `agregar`, `alternarOculto`, `quitar` (Supr en un extra) y `cambiarExtra`; `ESTILOS_EDICION` muestra lo oculto con `display: revert` y opacidad 0,35. `edicion-texto.ts` edita el texto de un extra devolviendo la lista `extras` nueva.

Cambiar diseño (HU-0605):
- `@aptio/schema/marca` tiene `DISENOS_CONTENIDO`, `NOMBRE_DISENO`, `disenosPara` (vacío con actividad, video o resultados), `disenoPermitido` (además vuelve a portada, objetivos, sección, resumen o cierre) y `plantillaPara` (cambia el sufijo de la plantilla del kit).
- `CursosService.editar` aplica `dto.disposicion` antes de `dto.ajustes`: cambia disposición y plantilla, borra `ajustes` y deja `extras`. Así Deshacer es un solo `PATCH` con la disposición y los ajustes de antes.
- En la web, `disenos-pantalla.ts` (lógica, con Vitest) tiene `opcionesDiseno`, `nombreDiseno` y `cursoConDiseno`, que arma un curso de una sola pantalla para la miniatura; `disenos.tsx` dibuja `PanelDisenos` con `montar()` por miniatura (`inert`, a 640 px y reducida). `EditorVista` guarda `deshacer` con la disposición y los ajustes previos.
- El reproductor compone por la clase `ap-d-*`: reglas nuevas `.ap-d-lista .ap-parrafo/.ap-dato` (tarjetas) y `.ap-d-dato .ap-dato` (destacado grande).

Retoques separados del contenido (HU-0604):
- `packages/schema/src/retoques.ts` (`@aptio/schema/retoques`) tiene `sinRetoques` y `conservarRetoques(antes, despues)`: copia los extras siempre y los ajustes de los elementos que siguen, solo si la disposición no cambió (RN-06-3).
- En `@aptio/schema/propuesta`, `rutaProtegida` cubre `/ajustes` y `/extras`; `pantallaParaPrompt` y `huellaPantalla` usan `sinRetoques`; `aplicarEnPantalla` pasa por `conservarRetoques`; `cambiaDisposicion(patch)` dice si un patch toca `/disposicion`.
- `PropuestasService.restaurar` y la etapa 4 del worker (`pantallas.ts`, antes de `validarCurso`) llaman a `conservarRetoques` por id de pantalla.
- `FranjaPropuesta` recibe `conAjustes` y muestra el aviso (`role="note"`) si `cambiaDisposicion` es verdadero para la propuesta o la variante elegida. El simulador de e2e acepta `retoquesP05`.

En el reproductor, `packages/player/src/boca.ts` reúne `bocaEn`, `mostrarBoca`, `mostrarPose`, `animarBoca` (un `requestAnimationFrame` sobre un `RelojAudio`), `parpadear` y `svgEnLinea` (SVG en línea, sin comentarios, scripts ni `on*`, y con los colores marcadores reemplazados por el kit). Muestra las capas con `style.display = 'inline' | 'none'`, porque la plantilla trae `display="none"`. `montar()` acepta `cargarSvg` y `cargarSubtitulos`; la vista previa usa `urlsRecursos`, `svgPersonajes` y `subtitulos` de `GET /proyectos/{id}/curso`. `packages/player/src/subtitulos.ts` tiene `leerVtt` (texto plano, sin HTML) y `cueEn(cues, ms)`; mientras suena el audio, un `requestAnimationFrame` actualiza la línea de «CC». La preferencia vive en `localStorage['aptio-subtitulos']`, dentro de un try/catch.

### 7.2 Agregar un proveedor

- **Texto:** implementa `ProveedorTexto` (`nombre`, `modeloPara`, `completar`) y elígelo en `proveedorDesdeEntorno`.
- **Transcripción:** implementa `ProveedorTranscripcion` (`packages/ai/src/transcripcion.ts`) y elígelo en `transcriptorDesdeEntorno`. En modo real sin clave, el proveedor debe fallar con un motivo y no inventar texto.
- Registra la tarifa y la licencia (`docs/19-proveedores-y-licencias.md`, ADR-010). Si no está verificada, déjala como supuesto.
- Todo recurso GENERADO pasa por `conProcedencia` (`apps/worker/src/procedencia.ts`) con el proveedor, el modelo que respondió y la licencia; sin alguno de los tres no se guarda (REQ-062). Lo que hace la plataforma sin IA usa `PROVEEDOR_APTIO` y no sale en los créditos.

### 7.3 Agregar un tipo de material

1. Permite el tipo en `PERMITIDOS` (`packages/almacen/src/tipos.ts`), con su verificación por contenido.
2. Decide la tarea en `MaterialesService.agregar` (`apps/api/src/proyectos/materiales.service.ts`).
3. Procésalo en el worker y guarda el resultado en `MaterialFuente` (`paginas` o `transcripcion`). Marca con `posibleInstruccion` lo que parezca una orden para la IA.

## 8. Pruebas

- **Vitest** usa PostgreSQL y Redis reales. Sin ellos, las pruebas que los necesitan se saltan en local, pero **en CI fallan** para no dar un falso verde.
- **Playwright** usa la API simulada. Corre con `npx playwright test --trace off` desde `apps/web`.
- La lógica pura de la web va en archivos `*.ts` con su `*.test.ts` en `apps/web/src`; `pnpm --filter web test` corre `vitest run --dir src` (los `e2e/*.spec.ts` quedan fuera).
- La transcripción se prueba con ffmpeg real sobre un video generado en la misma prueba (`apps/worker/test/transcribir.test.ts`).
- Accesibilidad: `apps/web/e2e/accesibilidad.spec.ts` recorre el HTML exportado solo con teclado y corre axe (`@axe-core/playwright`, WCAG 2.2 A y AA) en cada pantalla. Antes de axe espera las animaciones, también las del Shadow DOM (`shadowRoot.getAnimations()`), porque a mitad del fundido el contraste baja. El curso con las 8 interacciones está en `packages/player/test/catalogo.ts`. Las pruebas de foco del reproductor usan happy-dom (`// @vitest-environment happy-dom`); ahí `URL` es la del navegador simulado, así que lee archivos con rutas, no con `new URL`.
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
| `RHUBARB_PATH` | worker | Ejecutable de Rhubarb Lip Sync para la boca en modo real (vacío = `rhubarb` del PATH) |
| `GOOGLE_TTS_API_KEY` | api, worker | Muestra de voz (api) y narración de la etapa 6 en modo real (worker) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | api | Ingreso con Google |

Ninguna clave real va al repositorio.

## 11. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Pruebas «skipped» en local | PostgreSQL o Redis apagados | `pnpm dev:infra` (o iniciar los servicios) |
| `PrismaClientInitializationError` | Base no disponible o `DATABASE_URL` sin definir | Revisa `packages/db/.env` |
| El material de video queda en error «No se pudo extraer el audio» | El archivo no tiene pista de sonido, o falta ffmpeg | Instala ffmpeg o revisa el archivo |
| En modo real, la transcripción falla con `GOOGLE_STT_API_KEY` | Falta la clave | Agrégala al `.env` del worker |
| La etapa 6 falla con «La voz de azure todavía no está disponible» | El kit usa una voz que no es de Google | Elige una voz de Google en el kit (SUP-34) |
| La etapa 7 falla con «Rhubarb Lip Sync no está instalado» | Modo real sin Rhubarb en el worker | Instala Rhubarb 1.13 y define `RHUBARB_PATH` |
| En la vista previa se ven todas las bocas encimadas | El SVG se insertó sin `mostrarBoca(svg, 'X')` | Inserta siempre con `svgEnLinea` y deja la boca en reposo |
| `Custom Id cannot contain :` al encolar | Un id de trabajo con «:» | Usa «-» como separador |
| `openapi:lint` con más de 7 avisos | Un componente sin usar o `nullable` sin `type` | Usa el componente o agrega `type` |
| oxlint «solo exportar componentes» | Una función auxiliar en un `.tsx` | Muévela a `formato.ts` |

---

## Historial de este manual

| Versión | Fecha | Cambios |
| --- | --- | --- |
| 0.16 | 2026-11-11 | Modo Libre (HU-0603): `translate` en cqw en el reproductor, arrastre y flechas en `EditorVista`. |
| 0.17 | 2026-11-11 | Retoques separados del contenido (HU-0604): `@aptio/schema/retoques`, rutas protegidas y `cambiaDisposicion`. |
| 0.18 | 2026-11-11 | Cambiar diseño (HU-0605): `disposicion` en el PATCH, catálogo en `@aptio/schema/marca`, `PanelDisenos`. |
| 0.19 | 2026-11-11 | Agregar elementos y capas (HU-0606): `extras` en el reproductor y en el PATCH, `extras.ts`, `panel-izquierdo.tsx`. |
| 0.20 | 2026-11-11 | Deshacer, rehacer y guardado automático (HU-0607): `historial.ts`, `motivo` en el PATCH. |
| 0.21 | 2026-11-11 | Línea de tiempo (HU-0608, PR 1): `@aptio/schema/tiempos`, tiempos e `irA` en el reproductor, `LineaTiempo`. |
| 0.22 | 2026-11-11 | HU-0608, PR 2: `reanclar`, `sincronizarConVoz`, anclas en la API y en la etapa de voz. |
| 0.23 | 2026-11-11 | HU-1202, PR 1: paquete `@aptio/exporters` (`construirScorm12`, manifiesto SCORM 1.2, ZIP determinista) y adaptador `scorm12.ts` con `iniciarPaquete`. |
| 0.24 | 2026-11-11 | HU-1202, PR 2: módulo `exportaciones` de la API, `crearExportador` en la cola `export` (tarea EXPORTAR), columna `motivo` y vista `EntregaVista`. |
| 0.25 | 2026-11-11 | HU-1105: `src/suspend.ts` (v2 con huella e intentos), `src/reanudacion.ts`, opción `reanudar` del reproductor y LMS de prueba compartido `e2e/lms-prueba.ts`. |
| 0.26 | 2026-11-11 | HU-1201: `validarScorm12` en `@aptio/exporters`, `POST /cursos/{id}/validar` y la verificación automática de `EntregaVista`. |
| 0.27 | 2026-11-11 | HU-1204: modo diagnóstico en `@aptio/player`, `incluirDiagnostico`, `FichasController` y `FichasLms.tsx`; el LMS de prueba de Playwright pasa a `https://lms.prueba` (el portapapeles exige página segura). |
| 0.28 | 2026-11-12 | HU-1203: `construirHtml`, `armarContenido`/`comprimir`, `validarExportacion` y `modo: 'html'` del reproductor; prueba CP-093 en `file://` sin red (`e2e/html.spec.ts`). |
| 0.29 | 2026-11-12 | HU-1401: `contraste.ts` y variables legibles, `enfocar`/`inicioDe` en las interacciones, quitar el límite del quiz; pruebas con happy-dom y `accesibilidad.spec.ts` con axe. |
| 0.30 | 2026-11-12 | HU-1406: `conProcedencia` y procedencia `aptio`, `armarCreditos` en el exportador, diálogo `abrirCreditos` en el reproductor, procedencia en la API y «Créditos y licencias» en Entrega. |
| 0.31 | 2026-11-12 | HU-0802: `@aptio/schema/traduccion`, IA-10 v2 con modo simulado, worker `traducir.ts` por lotes, API de traducciones y vista Idiomas. |
| 0.32 | 2026-11-12 | HU-0803: `LIMITE_CARACTERES`, `componenteDe`, `limiteDe`, `desborda`, `erroresLimite`; `Traduccion.propuesta`; versión corta en el worker; contador y «Usar versión corta» en Idiomas. |
| 0.33 | 2026-11-12 | HU-0804 parte 1: `montar` y `montarUno`, botón `.ap-idioma`, `cambiarIdioma` en la conexión SCORM, `bilingue.ts` en el exportador, `traducirLoto` y `cursoTraducido` en las pruebas. |
| 0.34 | 2026-11-12 | HU-0804 parte 2: `idiomaDe` en las etapas 6 a 8, `VOZ_INGLES_PREDETERMINADA`, `VozIngles.tsx`, `sinIngles` y `recursosExtra` en las pruebas. |
| 0.35 | 2026-11-12 | HU-0505: `@aptio/schema/calidad`, `recalcularReglas`, `revisarCurso` y `crearRevisorCalidad`, `CalidadService`, `ControlCalidad.tsx` y sus pruebas. |
| 0.36 | 2026-11-12 | HU-1001: `@aptio/schema/alineacion`, `nivelBloom` opcional en pantalla y pregunta, `AlineacionModule`, `AlineacionVista.tsx` y `objetivosSinAlinear`. |
| 0.15 | 2026-11-10 | Retoques (HU-0602): `ajustes.ts` del reproductor, `ajustes-elemento.ts`, `propiedades.tsx` y `ajustes` en `CursosService.editar`. |
| 0.14 | 2026-11-10 | Editor (HU-0601): `EditorVista`, `edicion-texto.ts` y Vitest en `apps/web`. |
| 0.13 | 2026-11-10 | Propuestas de la IA: `aplicarPatch`, `@aptio/schema/propuesta`, worker IA-16 v2, `PropuestasService` y restaurar versión. |
| 0.12 | 2026-11-10 | Regeneración en cascada: trabajo `CASCADA` (`crearCascada`), `encolarConEspera` en la API y chips en Revisión. |
| 0.11 | 2026-11-10 | Etapa 8 de subtítulos (`crearEtapaSubtitulos`, `subtitulosDeNarracion`, `aVtt`) y `cargarSubtitulos` en el reproductor. |
| 0.10 | 2026-11-10 | Regenerar narraciones (`regenerarVoz`, `intento()`, id de trabajo con «-») y marcas «Por regenerar» desde Revisión. |
| 0.9 | 2026-11-10 | Etapa 7 de boca (`crearEtapaBoca`, Rhubarb), módulo `boca.ts` del reproductor, «Siguiente» tras la narración y `urlsRecursos`/`svgPersonajes`. |
| 0.8 | 2026-11-10 | Etapa 6 de voz (`crearEtapaVoz`), `ctx.gastar` y `ctx.comprobar`, `hashNarracion`, `duracionAudio`, `costoVoz` y `GET /cursos/{id}/narraciones`. |
| 0.7 | 2026-11-10 | Módulo `cursos` (observaciones, editar y aprobar con bloqueo optimista), `@aptio/schema/revision` y la opción `marco` del reproductor. |
| 0.6 | 2026-11-10 | Paquete `@aptio/player` (reproductor único), `GET /proyectos/{id}/curso` y la vista previa. |
| 0.5 | 2026-11-10 | IA-07 dentro de la etapa 4 (datos de las actividades). |
| 0.4 | 2026-11-10 | `ctx.avance` y vistas en vivo; la etapa 4 como ejemplo de etapa en paralelo que guarda el curso. |
| 0.3 | 2026-11-10 | Primera versión, al cierre del S2: entorno, estructura, patrones, cómo agregar etapas, proveedores y materiales, pruebas y CI. |
