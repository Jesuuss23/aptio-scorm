# Aptio SCORM · Manual del sistema

**Versión 0.39 · actualizado con la cuarta entrega del Sprint 8 (12 de noviembre de 2026)**

Describe cómo está construido y cómo funciona Aptio SCORM en conjunto: sus componentes, cómo viajan los datos, la seguridad, los proveedores externos, la configuración y la operación. Está pensado para el ingeniero a cargo, el área de infraestructura y quien audite el sistema. El detalle de código está en [`MANUAL-PROGRAMADOR.md`](MANUAL-PROGRAMADOR.md), y el uso de las pantallas, en [`MANUAL-USUARIO.md`](MANUAL-USUARIO.md).

---

## 1. Propósito y alcance

Aptio SCORM es la herramienta interna de AulasEducativas (Grupo de Soluciones Creativas SAC) para producir cápsulas de microaprendizaje con ayuda de IA. Toma el material del cliente y lo convierte en un SCORM revisable. El equipo revisa y ajusta, y nada se publica sin revisión humana.

**Estado al cierre del S2:**

| Área | Estado |
| --- | --- |
| Acceso: correo y clave, Google para invitados, roles, invitaciones y recuperación | Disponible |
| Clientes, kit de marca, personaje, pantallas modelo, glosario y pronunciación | Disponible |
| Proyectos y Nuevo SCORM | Disponible |
| Material del cliente: PDF, Word, PowerPoint (con OCR), video y audio (transcripción) | Disponible |
| Generador: lanzar, ver en vivo, cancelar y continuar | Disponible |
| Etapas 1 a 3: resumen con acta de omitidos, objetivos y estructura, guion por pantalla | Disponible |
| Etapas 4 a 11: pantallas, ilustraciones, voz, boca, subtítulos, inglés, calidad y paquete | Planificadas (S3 en adelante) |
| Revisión pantalla por pantalla, editor, exportación SCORM, fase comercial | Planificadas |

## 2. Arquitectura

```mermaid
flowchart LR
  U[Navegador<br/>apps/web] -- HTTPS /api/v1 + SSE --> A[API NestJS<br/>apps/api]
  U -- PUT firmado --> S3[(Almacenamiento S3<br/>cifrado con KMS)]
  A --> PG[(PostgreSQL)]
  A -- encola --> R[(Redis<br/>BullMQ + eventos)]
  R --> W[Worker<br/>apps/worker]
  W --> PG
  W --> S3
  W -- publica eventos --> R
  R -- eventos --> A
  W --> IA[Anthropic Claude<br/>texto]
  W --> STT[Google Speech-to-Text<br/>transcripción]
  A --> TTS[Google Text-to-Speech<br/>muestra de voz]
  A --> SMTP[Correo SMTP]
```

| Componente | Tecnología | Responsabilidad |
| --- | --- | --- |
| Web | React 19 + Vite, `@aptio/ui` | Interfaz para celular primero. Sube archivos directo al almacenamiento y recibe el avance en vivo por SSE. |
| Reproductor | TypeScript sin dependencias (`@aptio/player`) | Dibuja el curso para el participante. Es el mismo en la vista previa de la web y dentro de cada paquete; corre en un Shadow DOM propio. |
| API | NestJS sobre Node.js | Sesión, roles, alcance por organización, validación, reglas de negocio, contrato OpenAPI y envío de trabajos a las colas. |
| Worker | BullMQ sobre Node.js | Trabajos largos: extracción de texto y OCR, transcripción, generación por etapas y borrado programado. |
| PostgreSQL 16 | Prisma (`@aptio/db`) | Datos de negocio, resultados de cada etapa, costos y auditoría. |
| Redis 7 | BullMQ (`@aptio/colas`) | Colas `ia`, `voz`, `media` y `export`, cola de mantenimiento y canal de eventos `aptio:eventos`. |
| Almacenamiento | S3 compatible con KMS (`@aptio/almacen`); LocalStack en local | Archivos del cliente y recursos, siempre cifrados y accesibles solo con URL firmada. |

Las decisiones de arquitectura están en `docs/adr/` y en `CLAUDE.md` («Decisiones tomadas»).

## 3. Flujos principales

### 3.1 Subir material del cliente

```mermaid
sequenceDiagram
  participant Web
  participant API
  participant S3
  participant Cola as Redis (media)
  participant Worker
  Web->>API: POST /recursos/subidas (nombre, tipo, tamaño)
  API-->>Web: URL de subida firmada (15 min, cifrado obligatorio)
  Web->>S3: PUT del archivo
  Web->>API: POST /recursos/subidas/{id}/confirmar
  API->>S3: verifica cifrado, tipo real por contenido y hash
  Web->>API: POST /proyectos/{id}/materiales (recursoId)
  API->>Cola: EXTRAER_TEXTO (documento) o TRANSCRIBIR (video/audio)
  Worker->>S3: lee el archivo
  Worker->>Worker: texto por página + OCR, o audio con ffmpeg + voz a texto
  Worker->>API: evento de avance (vía Redis)
  Worker-->>Web: material «listo» (la web consulta cada 2 s)
```

- **Documentos:** texto por página. Una página con menos de 25 caracteres se trata como escaneada y pasa por OCR (Tesseract, español e inglés).
- **Video y audio:** ffmpeg extrae el audio en tramos de 55 s (FLAC mono, 16 kHz). Cada tramo se transcribe y los tiempos se ajustan al inicio del tramo. Se guardan los fragmentos `{desde, hasta, texto}` y la duración.
- En ambos casos, el texto que parece una orden para la IA se marca como `posibleInstruccion` (CP-102).

### 3.2 Generar un SCORM

1. `POST /proyectos/{id}/generaciones` exige material leído y una sola generación activa por proyecto (protegida con un cerrojo en PostgreSQL). Crea las 11 etapas «En cola», pasa el proyecto a Producción y encola `GENERAR`.
2. El worker corre las etapas en orden y salta las ya completadas. Cada etapa recibe los resultados de las anteriores.
3. Cada etapa publica su estado. La web lo recibe por SSE (`GET /generaciones/{id}/eventos`) y, como respaldo, consulta cada 2 s.
4. Al final:
   - si las 11 etapas terminaron, el proyecto pasa a Revisión;
   - si faltan etapas por habilitar, vuelve a «Por generar» (SUP-24). Una etapa sin habilitar no frena a las siguientes que sí lo están.
5. **Cancelar** conserva lo terminado. Una etapa a medias deja de llamar a la IA y conserva el costo gastado. **Continuar** retoma desde la etapa con error o cancelada.

| Etapa | Tareas de IA | Resultado |
| --- | --- | --- |
| 1 · Leer y resumir | IA-01 mapa de temas, IA-02 conservar, complementario u omitir, IA-03 ideas clave por tema, IA-13 acta | Ideas clave con archivo y página, y acta de omitidos (CP-038) |
| 2 · Objetivos y estructura | IA-04 v2 | Objetivos con nivel de Bloom, y pantallas con tipo, objetivo, actividad y página. Número exacto de pantallas y mínimo de actividades (CP-039) |
| 3 · Storyboard y guion | IA-05 v2 (por cápsula) | Título, texto en pantalla, narración, visual, actividad y origen. Advertencia si pasa de 30 palabras en pantalla o 45 de narración (CP-040) |
| 4 · Pantallas con el kit | IA-15 v2 (por pantalla, hasta 4 a la vez) e IA-07 v2 (por actividad) | Disposición del kit, fondo y campos por pantalla, y los datos de cada actividad (CP-044; el reto final es sumativo), guardados como avance mientras corre (CP-043). Al terminar, el documento del curso validado en `Curso` con su versión (CP-042) |
| 6 · Voz en español | Google Text-to-Speech con la voz y la velocidad del kit (hasta 4 a la vez, 3 intentos por pantalla) | Un audio por pantalla con narración, con el diccionario de pronunciación aplicado, guardado como `Recurso` del cliente con su duración, y una `Narracion` ACTUALIZADA por pantalla. El curso enlaza el audio y su duración; la narración queda `pendiente` hasta la boca y los subtítulos (CP-071, SUP-34) |
| 7 · Boca del personaje | Rhubarb Lip Sync 1.13 (reconocedor fonético) sobre cada audio; por letras en modo simulado | Marcas `[ms, boca]` por narración en `Narracion.bocas` y en el curso. Local y sin costo (SUP-35) |
| 8 · Subtítulos | Una frase por subtítulo (máximo 84 caracteres) con tiempos repartidos por letras sobre la duración del audio | Un WebVTT por narración (recurso SUBTITULO) enlazado a la narración y al curso; la narración queda «generado». Local y sin costo (SUP-37) |

### 3.3 Vista previa con el reproductor único

1. La web pide `GET /api/v1/proyectos/{id}/curso` (con la versión en `ETag`) y el kit del cliente.
2. Monta `@aptio/player` sobre el documento del curso: dibuja cada pantalla con su disposición y el kit, y las actividades del catálogo.
3. Las reglas de avance del curso (`navegacion.modo`; sin ella, actividades obligatorias) deciden si se puede seguir. En modo revisión se puede ir a cualquier pantalla.
   - El patrón (`navegacion.patron`) solo cambia el marco: Clásico, Historias, Vertical, Mapa de misiones, Menú de temas, Ramificado o Inmersivo (Personalizado usa su base). Reglas, seguimiento, reanudación y teclado son los mismos en todos (HU-1103, SUP-100, SUP-101). Con `?patron=` y `?modo=` la vista previa prueba otro sin guardar.
   - Navegación (PNT-17): `GET /cursos/{id}/navegacion` (equipo) y `PUT` (administración y diseño instruccional) con la versión leída (409), validación del esquema (422) y motivo «navegación»; `patronPreferidoDelCliente` lo guarda en `KitMarca.patronPreferido` (422 SIN_KIT sin kit). Ver SUP-102 a SUP-104.
   - Patrón con IA (HU-1104, CP-088): `POST /cursos/{id}/propuestas` con `tipo: patron` y `modo` (`recomendar`, o `crear` con `descripcion`) encola IA-14 v2 en la cola `ia` con el contexto del curso (duración, público, dispositivo celular, pantallas, actividades, gamificación y estaciones); la descripción va como material no confiable. El worker normaliza el nombre (60 caracteres), valida con Ajv y `erroresPatron` (3 intentos) y guarda una `Propuesta` del curso entero con la versión base. Aplicarla exige la misma versión (409 PROPUESTA_VENCIDA), cambia solo `patron` y `patronPersonalizado` y crea una versión con motivo «navegación». Solo administración y diseño instruccional (403 al resto). El personalizado aplica `progreso`, `avance`, `menu`, `marcador` y `barra` sobre el marco de su base. Ver SUP-105 a SUP-110.
4. El panel de seguimiento muestra lo que se reportaría al LMS (avance, nota, puntos y `lesson_status`). No se guarda nada: la conexión con el LMS y la reanudación son solo del paquete exportado.

### 3.3.0.1 Validar antes de exportar (HU-1201)

1. La vista Entrega pide `POST /api/v1/cursos/{id}/validar` con el formato y el LMS elegidos, y vuelve a pedirlo al cambiar de LMS.
2. La API lee el curso actual, el peso de sus recursos en `Recurso.bytes` y el límite de subida: `limiteSubidaMb` de la `FichaCompatibilidad` más reciente del cliente o, sin ficha, `LIMITE_SUBIDA_REFERENCIA_MB` (100 por defecto). El reproductor se empaqueta una vez por proceso para medir su peso.
3. `validarScorm12` (`@aptio/exporters`) devuelve `errores` (esquema) y `advertencias`: peso estimado sobre el límite, con 5 alternativas y los 5 recursos más pesados; peor caso de `suspend_data` sobre 4096; archivos que faltan; pantallas sin aprobar. Responde 200 aunque haya errores y nunca bloquea por tamaño (RN-12-2).
4. La web deshabilita Exportar si hay errores y pide confirmación si hay pantallas sin aprobar (RN-12-3). La API de exportar no cambia.

### 3.3.0.2 Modo diagnóstico y fichas de compatibilidad (HU-1204)

1. Al abrirse, el paquete busca la API SCORM 1.2 con el algoritmo de ADL (su ventana y hasta 7 padres, luego la ventana que lo abrió) y anota cada ventana revisada en un `RegistroDiagnostico`, también las de otro origen. El adaptador anota cada llamada al LMS con su respuesta y el código de `LMSGetLastError`; se guardan las últimas 200 y cada valor se recorta a 200 caracteres. `cmi.core.student_id` y `student_name` nunca se leen y, si aparecieran, salen como «[omitido]» (SUP-57).
2. Ctrl+Alt+Shift+D o `?diagnostico=1` abren el panel dentro del Shadow DOM del reproductor; nunca se abre solo. «Copiar informe» entrega un JSON `aptio: diagnostico-scorm12` (versión 1) con la búsqueda, el estado inicial, el navegador resumido, la versión del reproductor, el curso con su huella y las llamadas.
3. `Exportacion.incluirDiagnostico` (por defecto true) llega al paquete; con false el paquete no responde al atajo ni a la consulta.
4. `GET` y `POST /api/v1/clientes/{id}/fichas-lms` guardan en `FichaCompatibilidad` el LMS, la versión, el límite de subida, las notas y el informe tal cual (un objeto de menos de 256 KB, como dato; SUP-58). La lista va de la más nueva a la más vieja; crean administración, diseño instruccional y producción, y cada creación queda en la auditoría como `FICHA_LMS_CREADA`. La ficha más nueva fija el límite de la validación (3.3.0.1).

### 3.3.0.3 HTML autocontenido (HU-1203)

1. Con `formato: HTML`, la API valida sin límite de subida ni `suspend_data` (`limiteMb`, `origenLimite` y `suspendDataCaracteres` en `null`, SUP-60). Crea la Exportacion con perfil `generico` e `incluirDiagnostico: false`.
2. El worker usa `construirHtml`: la misma carpeta que el SCORM 1.2, sin `imsmanifest.xml`, con `LEEME.txt` y `modo: 'html'` en `datos.js`. El archivo es `<proyecto>-html-v<n>.zip`.
3. Al abrir `index.html` (también desde `file://`), el reproductor no busca la API de SCORM, no avisa y no ofrece el modo diagnóstico. Todo es relativo: los scripts van con `src`, y los SVG del personaje y los WebVTT van dentro de `datos.js`, así que no hace falta `fetch`.
4. No hay seguimiento ni avance guardado en el navegador (SUP-61).

### 3.3.0.4 Accesibilidad de la cápsula (HU-1401)

1. Al montar, el reproductor calcula variantes legibles del kit con `colorLegible` (`src/contraste.ts`, razón de contraste de WCAG 2.2): `--ap-bien-texto` y `--ap-mal-texto` a 4,5:1 sobre el blanco y el fondo, y `--ap-foco` a 3:1. El kit guardado no cambia (SUP-63).
2. Todo control tiene foco visible de 3 px con halo blanco. Cuando una acción quita o desactiva el control enfocado, el foco pasa al resultado (`tabindex=-1`), al texto de la pregunta siguiente o al control vecino; el resultado también se anuncia por `aria-live`.
3. El quiz con tiempo ofrece «Quitar el límite de tiempo» (WCAG 2.2.1); no cambia vidas, puntaje ni lo que se informa al LMS.
4. Verificación: Playwright recorre LOTO y un curso con las 8 interacciones solo con teclado, y axe exige cero violaciones WCAG 2.2 A y AA. El lector de pantalla real queda para la demo (SUP-62).

### 3.3.0.5 Licencias y créditos de IA (HU-1406)

1. Todo recurso GENERADO guarda proveedor, modelo y licencia (REQ-062, ADR-010); `conProcedencia` en el worker no deja guardar uno incompleto. Lo que arma la plataforma sin IA (subtítulos por letras, el paquete) usa el proveedor `aptio`; la migración `20261112060000_recurso_procedencia` completa las filas viejas (SUP-64).
2. Al exportar, el worker toma la procedencia de los recursos del curso en el idioma del paquete y `armarCreditos` (`@aptio/exporters`) arma el aviso con el nombre de la organización y una fila por cada qué, proveedor, modelo y licencia, sin `aptio`. Van en `datos.js`; sin recursos de IA no hay créditos.
3. En el paquete, el botón «Créditos» abre un diálogo modal (`role="dialog"`, `aria-modal`, el resto `inert`); Escape o «Cerrar» devuelven el foco al botón.
4. La API devuelve `proveedor`, `modelo` y `licencia` en `GET /recursos` y `GET /recursos/{id}` con el mismo alcance (el revisor solo ve su cliente), y `POST /cursos/{id}/validar` devuelve `creditos` para la vista previa en Entrega.
5. Verificación: CP-106 con una ilustración sembrada hasta el S9 (SUP-65) y CP-107 con el HTML real de LOTO, teclado y axe en 0 violaciones.

### 3.3.0.6 Traducción con glosario (M08, HU-0802)

1. Cada texto `{ es, en }` del curso tiene una fila `Traduccion` (curso, ruta JSON Pointer, idioma `en`, huella del español y estado: Pendiente, Traducido por IA, Revisado). La API pone las filas al día al listar: crea las nuevas, borra las de rutas que ya no existen y devuelve a Pendiente las que cambiaron en español, aunque estuvieran revisadas (SUP-68).
2. `POST /cursos/{id}/traducciones/traducir` crea un `TrabajoIA` IA-10 y lo deja en la cola `ia` (202). El worker manda solo lo Pendiente (RN-08-2) en lotes de 60, neutralizado dentro de `<material_cliente>` y con el glosario del cliente (RN-08-1). La salida se valida con el esquema, con las rutas pedidas y con el glosario; si falla se reintenta con los errores (3 intentos) y, si no, el trabajo queda en error.
3. Cada lote se guarda en una transacción: versión nueva del curso (motivo «traducción») y sus filas en Traducido por IA. Un texto que alguien revisó o cambió mientras la IA traducía no se toca (SUP-67). El avance sale por SSE con un evento por lote.
4. `PATCH /traducciones/{id}` edita el inglés (queda Revisado) o marca Revisado, con `CursosService.guardar`. Traducen administración, diseño instruccional, diseño gráfico y producción; el revisor del cliente solo lee (403); otra organización recibe 404.
5. Verificación: CP-076 y CP-077 en el worker con PostgreSQL, en la API y en Playwright. IA-10 v2 aún no se probó con un modelo real (SUP-71); la voz en inglés va en la HU-0804 (SUP-70).
6. **Desbordes (HU-0803, RN-08-3):** cada texto en pantalla tiene un límite de caracteres por tipo de componente (`LIMITE_CARACTERES`, SUP-72) y va con él a IA-10. Lo que se guarda y no cabe queda en Desborde con el inglés completo en el curso; una segunda pasada de IA-10 (con `limite` y `actual`) propone la versión corta, valida que quepa y la guarda en `Traduccion.propuesta`. Un inglés a mano que no cabe queda en Desborde; la propuesta o «Marcar revisado» lo dejan Revisado (SUP-73). CP-078 se prueba en el worker, la API y Playwright.
7. **Paquete bilingüe (HU-0804 parte 1, RN-08-4):** con `modoIdioma: mismo-paquete`, `POST /cursos/{id}/validar` y `POST /cursos/{id}/exportaciones` arman SCORM 1.2 o HTML con `idiomas: ['es', 'en']` y los recursos de los dos idiomas. Validar cuenta los textos con inglés (`textosIngles`); si falta alguno es un error («Faltan N textos en inglés: tradúcelos en Idiomas») y exportar responde 422 TRADUCCION_INCOMPLETA. Los desbordes (filas en Desborde) y la falta de voz en inglés solo advierten (SUP-78). `separados` sigue en 422 IDIOMA_NO_DISPONIBLE (SUP-79). En el paquete, el botón EN / ES vuelve a montar la cápsula en la misma pantalla con vistas, resultados y puntos (SUP-76); el idioma va en `cmi.suspend_data` v2 con LMSCommit y el paquete abre en él al volver (SUP-77). CP-079 se prueba en Vitest, en la API, en el worker y en Playwright con el LMS de prueba y axe (WCAG 2.2 A/AA).
8. **Voz, boca y subtítulos en inglés (HU-0804 parte 2, RN-07-1):** `POST /cursos/{id}/narraciones/regenerar` con `idiomas: ['en']` continúa las etapas 6 a 8 de la última generación con `parametros.regenerarVoz.idioma = en` (202 con `pendientes`; 422 SIN_TRADUCCION si ninguna narración tiene inglés; 422 IDIOMA_NO_DISPONIBLE con los dos idiomas a la vez; 403 al revisor del cliente). El worker toma el `.en` de cada narración traducida, la voz `voces.en` del kit o `en-US-Neural2-F` con la velocidad del español (SUP-81) y solo la pronunciación en inglés (SUP-82); guarda `porIdioma.en`, la fila `Narracion` en `en` y los recursos `pNN-en.mp3` y `pNN-en.vtt` con su procedencia (REQ-062). El hash decide qué se vuelve a sintetizar y el español no se toca. La vista Producción muestra esa última corrida (SUP-83); las marcas de palabra siguen la voz en español (SUP-84). El paquete bilingüe lleva esos audios y VTT; el aviso de exportación cuenta las pantallas sin voz en inglés.

### 3.3.1 Reanudación en el paquete (HU-1105)

1. Al abrir, el paquete hace `LMSInitialize` y lee `cmi.core.entry`, `lesson_location`, `suspend_data`, `lesson_status` y `score.raw`. Ya no hace `LMSCommit` al entrar.
2. Si `entry` no es `ab-initio`, el `suspend_data` es válido (v1, o v2 con la huella de este curso) y la pantalla guardada existe y no es la primera, pregunta «¿Continuar donde lo dejaste?» según `navegacion.reanudar` del curso (preguntar, automatica o no). Lo inválido se descarta y el curso empieza en p01 (SUP-53).
3. Mientras pregunta no escribe `lesson_location` ni `suspend_data` ni hace commit. Continuar restaura vistas, resultados, puntos e intentos; Empezar de nuevo vuelve a p01 sin avance (SUP-54).
4. Lo informado no baja: un `lesson_status` cerrado nunca pasa a uno menor y, con «mejor nota», `score.raw` no baja.

### 3.3.0 Regeneración en cascada desde Revisión

Al corregir la narración en español de una pantalla que ya tiene voz, se regeneran solas su voz, su boca y sus subtítulos, sin pasar por una generación (HU-0503, SUP-38).

```mermaid
sequenceDiagram
  participant W as Web (Revisión)
  participant A as API
  participant Q as Cola voz
  participant K as Worker
  W->>A: PATCH /cursos/{id}/pantallas/{p}
  A->>A: guarda la versión · narración DESACTUALIZADA
  A->>Q: CASCADA cascada-{curso}-{p}, diferido 1 s (reemplaza el pendiente)
  A-->>W: 200 {regenerando: [voz-es, boca, subtitulos-es]}
  Q->>K: espera si hay una generación en curso
  K->>K: etapas 6, 7 y 8 solo de esa pantalla
  W->>A: GET /cursos/{id}/narraciones cada 2 s
  A-->>W: estado, bocas y subtitulosUrl → chips en verde
```

Varios guardados seguidos dejan un solo trabajo, que corre 1 s después del último (CP-051). El costo de la voz queda en `TrabajoIA` con el proyecto y sin generación. Si la voz falla, la narración queda en ERROR y los chips en rojo.

### 3.3.0b Propuestas de la IA

```mermaid
sequenceDiagram
  participant W as Web (Revisión)
  participant A as API
  participant Q as Cola ia
  participant K as Worker
  W->>A: POST /cursos/{id}/propuestas {tipo, pantallaId}
  A->>Q: IA-16 con el TrabajoIA
  A-->>W: 202 {id del trabajo}
  Q->>K: IA-16 v2 → JSON Patch sobre la pantalla
  K->>K: Ajv + rutas protegidas + curso válido (3 intentos)
  K->>K: Propuesta {cambios, huella, versionBase}
  W->>A: GET /trabajos/{id} cada 2 s, luego GET /propuestas
  W->>A: POST /propuestas/{id}/aplicar
  A-->>W: 200 nueva versión · 409 PROPUESTA_VENCIDA si cambió la pantalla
```

La IA nunca cambia el curso por su cuenta: solo la acción Aplicar crea una versión. Deshacer restaura la anterior conservando la narración y su audio (SUP-39).

### 3.3.0.1 Edición en el lugar (Editor, PNT-21)

El editor (`/proyectos/{id}/editor?pantalla=pXX`) dibuja la pantalla con el mismo reproductor que Revisión y vuelve editables los textos (`data-bloque` de tipo texto). Al terminar con Enter o al salir del texto, la web envía `PATCH /cursos/{id}/pantallas/{pantallaId}` con `titulo` (el primer texto con rol título) o `textos[bloque]`, y la versión que conoce. La API crea una versión, deja la pantalla en borrador y marca el texto como `origen.tipo = manual`. Esc no envía nada. Si la versión cambió, responde 409 y la web recarga el curso. No hay cambios en la API ni en el esquema; el alcance del esqueleto está en SUP-40.

Los retoques (HU-0602) viajan en el mismo `PATCH` como `ajustes: { [bloque]: AjusteElemento | null }` y se guardan en `ajustes` de la pantalla, aparte del contenido (RN-06-1). La API rechaza un elemento que no existe (422 BLOQUE_NO_EXISTE), un color que no es un rol del kit (422 COLOR_FUERA_DEL_KIT, RN-06-4) y un valor fuera del esquema (422 CURSO_NO_VALIDO). El reproductor los aplica en el editor, la vista previa y el paquete: tamaño en `cqw`, color por variable del kit, alineación, escala y 4 animaciones de entrada que se quitan con «reducir movimiento» (SUP-41).

El modo Libre (HU-0603) guarda `ajustes[bloque].desplazamiento {x, y, dispositivo: 'todos'}` en % del ancho, con el mismo `PATCH`. El reproductor lo aplica con `translate` en cqw según el dispositivo (escritorio desde 640 px de ancho del reproductor), así que la posición se mantiene en cualquier resolución (CP-058). El modo en sí no se guarda (SUP-42).

Cambiar el diseño (HU-0605) va en el mismo `PATCH` con `disposicion`: una de las 4 composiciones de contenido (idea, personaje, dato, lista), o volver a portada, objetivos, sección, resumen o cierre. Cambia la plantilla sin tocar los bloques, reinicia los ajustes y conserva los extras (RN-06-3); si vienen `ajustes` en el mismo cambio, se aplican después, y así se deshace. Una pantalla con actividad o video, o la de resultados, responde 422 DISENO_NO_PERMITIDO (SUP-44). Las observaciones por reglas se recalculan, por ejemplo la de tres disposiciones iguales seguidas.

Los elementos agregados (HU-0606) van en el mismo `PATCH` con `extras`: la lista completa de la pantalla, cada uno con `id`, `tipo` (título, texto, dato, botón, imagen, insignia, forma o personaje), posición base `x`, `y`, `ancho` en % y, según el tipo, `texto`, `recursoId` o `alClic` (`siguiente` o `nada`). Un id que falta, repetido o igual al de un bloque responde 422 EXTRA_NO_VALIDO; una posición fuera de 0 a 100 o un tipo desconocido, CURSO_NO_VALIDO. Quitar un extra borra sus ajustes. Ocultar es `oculto: true` en los ajustes del elemento; los bloques de la IA solo se ocultan (SUP-45). Lo oculto no se ve en la vista previa ni en el paquete.

Deshacer y rehacer en el editor (HU-0607) mandan el mismo `PATCH` con `motivo` `deshacer` o `rehacer`, que queda como motivo de la `CursoVersion` (sin él dice «edición»; otro valor responde 422). El historial vive en el navegador, para la sesión del editor, con hasta 60 cambios, y se guarda 1 s después de la última pulsación (RN-06-5, SUP-46). Con 409 el editor recarga el curso y vacía el historial.

Los tiempos de la línea de tiempo (HU-0608) van en los mismos `ajustes`: `retardoS` (cuándo aparece), `finS` (cuándo sale) y `anclaPalabra` (el índice de la palabra de la narración a la que quedó pegada la entrada). Las marcas de palabra no se guardan: se calculan repartiendo la duración del audio en español por letras (SUP-47). La pantalla dura lo mayor entre la voz + 1 s y la última salida (RN-06-7); sin tiempo, los elementos entran escalonados de a 0,3 s (RN-06-9). El reproductor del paquete y de la vista previa aplica los tiempos con el reloj del audio. Al corregir la narración, la API pasa cada ancla a la misma palabra del texto nuevo; con la voz nueva, el worker le da el segundo de esa palabra (RN-06-8). Si la palabra ya no está, el elemento conserva su segundo y queda una observación con origen `tiempo` («Revisar tiempo», aviso, no bloquea), que se borra al cambiar su entrada o su ancla. «Sincronizar con la voz» se calcula en el editor, sin IA ni costo (SUP-48), y se guarda como cualquier retoque.

Los retoques (`ajustes` y `extras`) nunca van a la IA (HU-0604, SUP-43): IA-16 recibe la pantalla sin ellos, un patch que los toque se rechaza y la huella que vence una propuesta no los cuenta. Al aplicar una propuesta, al restaurar una versión y al generar el curso de nuevo, cada pantalla conserva sus extras y los ajustes de los elementos que siguen; si cambia la disposición, los ajustes se reinician (RN-06-3) y Revisión lo avisa antes de aplicar (CP-059).

### 3.3.1 Narración con boca sincronizada

La vista previa pide `GET /proyectos/{id}/curso`, que trae las URL firmadas de los audios (15 minutos) y el SVG del personaje. El reproductor dibuja el SVG en línea y, mientras suena el audio, muestra en cada cuadro la boca que marca `audio.currentTime` (CP-072: desfase máximo medido de 16 ms). Con «Siguiente se habilita al terminar la narración», no se avanza hasta el evento `ended` del audio.

La vista previa recibe también el texto de cada WebVTT en `subtitulos` (mismo motivo: sin CORS). Con «CC», el reproductor muestra la frase del momento según `audio.currentTime`, y el texto completo en pausa. Dentro de un paquete exportado, los VTT se leerán de la carpeta del paquete cuando la exportación los incluya (HU-1202, S6).

### 3.3.2 Regenerar narraciones desactualizadas

Una narración pasa a DESACTUALIZADA («Por regenerar») en dos casos: cuando se guarda un cambio del diccionario de pronunciación que afecta a una palabra suya (RN-02-4), y cuando se corrige su texto en Revisión. Sigue sonando su audio anterior hasta que se regenera.

```mermaid
sequenceDiagram
  participant W as Web (Producción)
  participant A as API
  participant Q as Cola ia
  participant K as Worker
  W->>A: POST /cursos/{id}/narraciones/regenerar
  A->>A: bloqueo por proyecto · 409 si hay generación activa
  A->>A: reabre VOZ_ES y BOCA · parametros.regenerarVoz
  A->>Q: GENERAR {generación}-{intento}
  A-->>W: 202 {id, eventos, pendientes}
  Q->>K: etapa 6: compara el hash RN-07-1
  K->>K: sin cambio → ACTUALIZADA sin costo · con cambio → audio nuevo, bocas null
  K->>K: etapa 7: marcas solo para audios sin boca
  K->>K: etapa 8: WebVTT solo para audios sin subtítulos
```

Solo se paga voz por lo que de verdad cambió. Con `pantallaIds` el pedido se limita a esas pantallas, y con `soloDesactualizadas: false` se fuerza una toma nueva. Inglés responde 422 hasta la HU-0901.

### 3.4 Revisión y aprobación de pantallas

1. Al terminar la etapa 4, el worker guarda con el curso las observaciones por reglas: longitud del texto, del dato destacado y de la narración, imagen sin texto alternativo y tres disposiciones iguales seguidas.
2. La web pide el curso y `GET /api/v1/cursos/{id}/observaciones?resuelta=false`. Muestra cada pantalla con el reproductor, sus observaciones y su origen (documento y página, IA o equipo).
3. `PATCH /cursos/{id}/pantallas/{pantallaId}` guarda el título, los textos o la narración con la versión leída. Si la versión no coincide, responde 409. La pantalla vuelve a borrador, se guarda una versión en el historial y se recalculan las observaciones por reglas.
4. `POST /cursos/{id}/pantallas/{pantallaId}/aprobar` aprueba una pantalla, salvo que tenga una observación que bloquea la entrega (409). `POST /cursos/{id}/pantallas/aprobar` con `soloSinObservaciones` aprueba todas las que no tienen observaciones abiertas y devuelve las aprobadas y las pendientes.
5. Editan todos los del equipo y aprueban administración y diseño instruccional. El revisor del cliente solo lee los cursos de su cliente.
6. Control de calidad (HU-0505, IA-12 v2). `recalcularReglas` (`@aptio/db`) recalcula las observaciones por reglas con la paleta del kit y las filas de Traduccion en Desborde, al guardar, al cambiar una traducción, en cada lote de la traducción y en la etapa 4. `POST /cursos/{id}/control-calidad` crea un TrabajoIA `IA-12` y lo encola en `ia` (202; 409 CALIDAD_EN_CURSO si el proyecto ya tiene uno en cola o en curso; 403 al revisor). El worker manda la cápsula a IA-12 en lotes de 10 pantallas, con los textos dentro de `<material_cliente>` y las reglas del lote, valida con Ajv (3 intentos) y, en una transacción, borra las de IA abiertas y crea como mucho 120 nuevas, sin las descartadas (pantalla y mensaje). El avance va por SSE. La etapa 10 del generador hace lo mismo. `PATCH /observaciones/{id}` con `resuelta: true` descarta una de IA; una de reglas responde 422 OBSERVACION_DE_REGLA. Las observaciones de IA nunca bloquean (alta y media → aviso, baja → info). Observacion guarda `categoria`, `sugerencia` y `ruta`. SUP-85 a SUP-90.
7. Alineación pedagógica (HU-1001, M10, PNT-18). `GET /cursos/{id}/alineacion` calcula sin IA, desde el documento, el informe por objetivo con `informeAlineacion` (`@aptio/schema/alineacion`): rol de cada pantalla o pregunta (P contenido y video, A actividad formativa, E actividad sumativa por pregunta), su nivel de Bloom (`nivelBloom` opcional o el de su disposición), las alertas de RN-10-2 y los indicadores. `PATCH /cursos/{id}/alineacion` cambia niveles de objetivos y elementos con la versión leída (409 VERSION_CAMBIO, 422 NIVEL_NO_APLICA) y guarda una versión con motivo «alineación»; lo usan administración y diseño instruccional (gráfico y producción solo leen; el revisor del cliente, 403). La validación de exportación suma `objetivosSinAlinear` y advierte sin bloquear. SUP-91 a SUP-95. Corrección con IA (HU-1002, CP-084): `POST /cursos/{id}/propuestas` con `tipo: alineacion` encola IA-17 v2 en la cola `ia` (422 SIN_ALERTAS sin alertas); el worker valida la salida con Ajv y `erroresCorreccion` (rutas permitidas, curso válido y 0 alertas en los objetivos tratados, 3 intentos) y guarda una `Propuesta` del curso entero con la versión base. Aplicarla exige la misma versión (si no, 409 PROPUESTA_VENCIDA), crea una versión con motivo «alineación» y devuelve `pantallasPorRevisar` (en borrador, con preguntas `origen` IA sin revisar). Solo administración y diseño instruccional piden, aplican y descartan. SUP-96 a SUP-99.

### 3.5 Toda salida de IA se valida

Cada respuesta se valida contra el esquema JSON de su tarea y contra las reglas propias de la etapa. Si no valida, se reintenta con los errores, hasta 3 intentos. Si sigue fallando, la etapa queda en ERROR y **nada se guarda a medias** (RN-04-2). Cada intento queda registrado con su consumo y costo.

## 4. Datos

El modelo completo está en `docs/12-modelo-datos.md` y en `packages/db/prisma/schema.prisma`. Las entidades usadas hasta el S2:

| Entidad | Contenido |
| --- | --- |
| `Organizacion` | Inquilino: todo dato raíz lleva `organizacionId` (ADR-012) |
| `Usuario`, `TokenAcceso` | Personas, rol, clave (argon2id), versión de sesión, y tokens de invitación y recuperación (guardados como hash) |
| `Cliente`, `KitMarca`, `PantallaModelo`, `GlosarioTermino`, `PronunciacionTermino` | Clientes y su identidad visual y de voz |
| `Proyecto` | Un SCORM: cliente, estado, parámetros y datos técnicos opcionales |
| `Recurso` | Archivo en el almacenamiento: tipo, origen, clave S3, hash, metadatos (por ejemplo, la duración) y fecha de borrado |
| `MaterialFuente` | Material del proyecto: `paginas`, `transcripcion` y `mapaTemas` |
| `Generacion`, `GeneracionEtapa` | Cada generación y sus 11 etapas, con estado, detalle (`{texto, datos}`) y costo. Una etapa en curso puede guardar su avance en el detalle |
| `Curso`, `CursoVersion` | El documento del curso (lo crea la etapa 4) con su versión para el bloqueo optimista, y su historial: generar de nuevo, editar o aprobar guarda una versión con su motivo |
| `Narracion` | Una por curso, pantalla e idioma: hash del texto, voz y velocidad (RN-07-1), audio, origen (`tts` o `grabacion`) y estado (ACTUALIZADA, que se muestra como «Lista», DESACTUALIZADA, GENERANDO o ERROR) |
| `Observacion` | Observaciones por pantalla con tipo, severidad (`info`, `aviso`, `bloquea-entrega`), origen (`regla`, `ia`, `usuario`) y si está resuelta |
| `TrabajoIA` | Cada llamada a un proveedor: tarea, tipo, proveedor, modelo, versión del prompt, consumo, segundos de audio, intentos y costo |
| `Auditoria` | Acciones relevantes: subidas, materiales, ingresos con Google, borrados |

El documento del curso es un JSON que valida contra `packages/schema/esquemas/curso-v0.schema.json`. Es la fuente de verdad del curso. Desde la etapa 4 contiene módulos, cápsulas y pantallas con bloques de texto, personaje, video e interacción, narraciones pendientes de voz y los documentos del cliente como recursos, para la trazabilidad por página.

## 5. Seguridad

| Tema | Cómo se resuelve |
| --- | --- |
| **Sesión** | Cookie `httpOnly` firmada con HMAC-SHA256 (`SESSION_SECRET`), de 12 h. Se invalida al cambiar la clave, el rol o desactivar al usuario. |
| **Fuerza bruta** | 5 intentos fallidos bloquean la cuenta 15 minutos. Se permiten hasta 3 pedidos de recuperación por hora. |
| **Google** | OpenID Connect con PKCE, `state` y `nonce`, y firma del id_token verificada. Solo entran correos invitados y nunca se crean cuentas. |
| **Roles y alcance** | Una guarda global por rol. Toda consulta se limita a la organización de la sesión, y el revisor del cliente, a su cliente. |
| **Archivos** | Cifrados con KMS y bucket no público. Solo se accede con URLs firmadas de 15 minutos. El tipo real se verifica por contenido (un .exe renombrado se rechaza) y el SVG se sanea con una lista cerrada. |
| **Retención** | Los documentos del cliente se borran a la fecha de entrega más los días de retención del cliente (180 por defecto). El worker los borra cada día a las 3:00 (Lima), incluido el texto extraído y las transcripciones, y lo registra en auditoría. |
| **Inyección en la IA** | El material del cliente va escapado y delimitado en `<material_cliente>`. Lo que parece una orden se marca y nunca se obedece (HU-1402). |
| **Secretos** | Solo en variables de entorno. Ninguna clave real va al repositorio. |

## 6. Proveedores externos

| Uso | Proveedor | Modo simulado | Estado |
| --- | --- | --- | --- |
| Texto (etapas 1 a 3) | Anthropic Claude (`claude-opus-5-5` por defecto, SUP-23) | Salidas grabadas del caso LOTO | Integrado. Los prompts v2 de IA-04 e IA-05 todavía no se han evaluado con la clave real. |
| Transcripción | Google Speech-to-Text v1 (`latest_long`) | Fragmentos de relleno cada 10 s, sin costo | Integrado. Sin probar con una clave real, y tarifa por minuto sin verificar (SUP-28). |
| Boca (etapa 7) | Rhubarb Lip Sync 1.13 (MIT), local en el worker, con ffmpeg | Marcas por letras, sin costo | Integrado y probado en local con un MP3. Falta PT-01 con voz real e instalarlo en la imagen del worker (HU-1405). |
| Voz (muestra y etapa 6) | Google Text-to-Speech (voces GA) | Silencio WAV de 65 ms por carácter, sin costo | Integrado. Sin probar con una clave real; tarifa supuesta de 16 USD por millón de caracteres (Neural2) y 30 USD (Chirp 3 HD), por confirmar (SUP-34). Azure y ElevenLabs todavía no. |
| Correo | SMTP (Mailpit en local) | — | Integrado. |

Las licencias, el uso comercial y el tratamiento de datos de cada proveedor están en `docs/19-proveedores-y-licencias.md` (ADR-010). `PROVEEDORES_MODO` (`simulado` o `real`) elige el modo. En modo real sin clave, la transcripción falla con un motivo en vez de inventar texto.

## 7. Configuración y despliegue

- **Entornos:** desarrollo local (docker compose), pruebas y producción en la nube (ADR-009). La infraestructura de la nube (clave KMS, bucket con bloqueo público y CORS solo para la web) es un pendiente de HU-1405.
- **Requisitos de la imagen del worker:** Node.js 24, ffmpeg y ffprobe (transcripción) y los datos de idioma de Tesseract (vienen por npm, sin red).
- **Variables:** la lista completa está en el manual del programador, §10, y en los `.env.example` de `apps/api`, `apps/worker` y `packages/db`.
- **Escalado:** API y worker no guardan estado propio. El worker se escala con más instancias o con `WORKER_CONCURRENCIA`, y los eventos llegan a todas las instancias de la API por Redis.

## 8. Operación

| Tarea | Cómo |
| --- | --- |
| Salud | `GET /api/v1/salud` responde 200, o 503 si la base no responde. |
| Contrato | OpenAPI generado en `/api/v1/docs`. El contrato de referencia es `docs/api/openapi.yaml`. |
| Seguimiento de trabajos | Estado y avance en `GeneracionEtapa`, `MaterialFuente.estado` y `TrabajoIA`. El worker registra en consola los trabajos fallidos con su motivo. |
| Costos | La suma de `TrabajoIA.costoUsd` por proyecto aparece en la lista de proyectos y en cada generación. |
| Borrado programado | Cola de mantenimiento con un trabajo diario a las 3:00 (America/Lima). |
| Errores visibles al usuario | Siempre con un motivo legible: material en error, etapa en error con «Continuar». |

## 9. Supuestos y limitaciones vigentes

Registrados en `docs/ESTADO.md` (SUP-##). Los que más afectan al sistema hoy:

- **SUP-81 a SUP-84:** la voz en inglés por defecto (`en-US-Neural2-F`) aún no se probó con una clave real de Google; en inglés solo se aplica la pronunciación en inglés; se regenera un idioma por vez sobre la última generación; las marcas de palabra siguen el español.
- **SUP-72 a SUP-74:** el espacio de un texto es un límite de caracteres por componente, no una medición del texto dibujado; solo se marca el inglés. Un Desborde puede aceptarse largo con «Marcar revisado». El modo simulado deja en Desborde la tarjeta «Cilindros y mangueras» de LOTO.
- **SUP-66 a SUP-71:** el glosario se exige como palabra completa («no traducir» con sus mayúsculas); editar el inglés lo deja Revisado y un español cambiado vuelve a Pendiente; no hay «Marcar todo como revisado»; IA-10 v2 aún no se corrió con un modelo real y la voz en inglés llega con la HU-0804.
- **SUP-62 y SUP-63:** la accesibilidad (HU-1401) se verificó con axe y con el teclado en Chromium, no con un lector de pantalla real. El reproductor oscurece los colores del kit solo donde los usa como texto o foco; el kit no cambia.
- **SUP-24:** las etapas sin ejecutor quedan «En espera» sin frenar a las siguientes. El proyecto no pasa a Revisión hasta que estén las 11.
- **SUP-39:** las propuestas no tocan la narración; vencen solo si cambió su pantalla. «Otra ilustración» llega en el S9 e IA-16 v2 aún no se probó con un modelo real.
- **SUP-38:** la regeneración en cascada solo cubre el español hasta el S7 y no muestra el motivo de un error de voz. Espera hasta 30 min a una generación en curso.
- **SUP-37:** los subtítulos se generan por letras sobre la duración del audio, no con marcas de tiempo del proveedor de voz (pendiente de probar con Google). Muestran el texto escrito. La preferencia de «CC» queda en el navegador del participante. Inglés en el S7.
- **SUP-36:** regenerar continúa la última generación, sin crear otra. El hash RN-07-1 decide qué se vuelve a narrar; el revisor del cliente no puede regenerar. CP-073 usa «pasos» (p02, p12, p15 y p27 del caso LOTO).
- **SUP-35:** la boca se calcula con Rhubarb (o por letras en simulado) y no se registra como tarea de IA. El reproductor reemplaza las bocas que faltan (G→B, H→C) y pinta el uniforme con el kit.
- **SUP-34:** la voz solo usa Google. Si un audio falla 3 veces, la etapa queda en error y se conserva lo hecho; al continuar se reutilizan los audios con el mismo hash.
- **SUP-26 y SUP-27:** las reglas estrictas de estructura y guion se aplican solo con proveedor real. El caso LOTO grabado tiene 10 de 30 actividades.
- **SUP-31 y SUP-32:** el reproductor solo tiene el patrón Clásico; si el curso pide otro se avisa. Clasificar y ordenar se hacen con botones (arrastrar llega después) y las imágenes se ven como un marco con su descripción hasta la etapa de ilustraciones.
- **SUP-33:** las observaciones de hoy son solo por reglas; el control de calidad con IA llega en el S7. Al editar la narración, su voz, su boca y sus subtítulos en español se regeneran solos (SUP-38). Por ahora, en la revisión solo se editan el título, los textos y la narración.
- **SUP-30:** el reto sumativo sale de IA-07 con sus propias preguntas; todavía no se exige un banco del doble de preguntas por intento ni se usa el banco de IA-08.
- **SUP-29:** la etapa 4 se compone en paralelo: un tramo de 3 pantallas con la misma disposición puede colarse y queda como advertencia. El curso sale en español, sin imágenes ni datos de actividades (llegan en la etapa 5 y en HU-0407). Al continuar una etapa 4 cancelada, las pantallas se piden de nuevo.
- **SUP-28:** la transcripción usa tramos de 55 s, y una palabra justo en el borde puede quedar partida. La etapa 1 todavía no lee transcripciones.
- **Protección de `main`:** exigir los dos controles de CI es una configuración del repositorio que hace su administrador.

---

## Historial de este manual

| Versión | Fecha | Cambios |
| --- | --- | --- |
| 0.16 | 2026-11-11 | Modo Libre: desplazamiento en % del ancho y SUP-42. |
| 0.17 | 2026-11-11 | Retoques fuera de la IA, conservados en propuestas, Deshacer y Generar de nuevo; SUP-43. |
| 0.18 | 2026-11-11 | Cambiar diseño de la pantalla: 4 composiciones de contenido, DISENO_NO_PERMITIDO y SUP-44. |
| 0.19 | 2026-11-11 | Elementos agregados y capas: `extras` en el PATCH, EXTRA_NO_VALIDO y SUP-45. |
| 0.20 | 2026-11-11 | Deshacer y rehacer: `motivo` en el PATCH y SUP-46. |
| 0.21 | 2026-11-11 | Línea de tiempo: `retardoS`, `finS` y `anclaPalabra` en los ajustes, SUP-47. |
| 0.22 | 2026-11-11 | Anclas que siguen a la narración, observaciones con origen `tiempo`, SUP-48. |
| 0.23 | 2026-11-11 | Paquete SCORM 1.2 de un solo SCO, búsqueda de la API de ADL, `suspend_data` compacto; SUP-49 a SUP-52. |
| 0.24 | 2026-11-11 | Exportación asíncrona: Exportacion ligada a la versión del curso, ZIP cifrado como recurso PAQUETE, descarga firmada por 15 minutos. |
| 0.25 | 2026-11-11 | Reanudación del paquete: `suspend_data` v2 con huella del curso e intentos, sin commit al entrar ni hasta que se elige, sin degradar el estado ni la nota; SUP-53 y SUP-54. |
| 0.26 | 2026-11-11 | Validación antes de exportar: `POST /cursos/{id}/validar`, límite por ficha del cliente o `LIMITE_SUBIDA_REFERENCIA_MB`, peso estimado; SUP-55 y SUP-56. |
| 0.27 | 2026-11-11 | Modo diagnóstico del paquete, `Exportacion.incluirDiagnostico` y `GET`/`POST /clientes/{id}/fichas-lms`; SUP-57 a SUP-59. |
| 0.28 | 2026-11-12 | HTML autocontenido: `formato: HTML` en validar y exportar, `construirHtml` en el worker y `modo: 'html'` del reproductor; SUP-60 y SUP-61. |
| 0.29 | 2026-11-12 | Accesibilidad de la cápsula (3.3.0.4): contraste legible del kit, foco que no se pierde, quitar el límite de tiempo del quiz; SUP-62 y SUP-63. |
| 0.30 | 2026-11-12 | Licencias y créditos de IA (3.3.0.5): procedencia `aptio`, créditos en `datos.js`, diálogo «Créditos», procedencia en la API; SUP-64 y SUP-65. |
| 0.31 | 2026-11-12 | Traducción con glosario (3.3.0.6): filas `Traduccion` por huella del español, IA-10 v2 en lotes de 60 con reintento por glosario, guardado por lote y edición con versión; SUP-66 a SUP-71. |
| 0.32 | 2026-11-12 | Desbordes por idioma (3.3.0.6, punto 6): límite por componente, Desborde con el inglés completo, versión corta en `Traduccion.propuesta`; SUP-72 a SUP-74. |
| 0.33 | 2026-11-12 | Paquete bilingüe (punto 7): `modoIdioma: mismo-paquete`, `textosIngles`, 422 TRADUCCION_INCOMPLETA, idioma en suspend_data; SUP-75 a SUP-80. |
| 0.34 | 2026-11-12 | Voz en inglés (punto 8): `regenerar` con `idiomas: [en]`, 422 SIN_TRADUCCION, `porIdioma.en` y recursos `pNN-en`; SUP-81 a SUP-84. |
| 0.35 | 2026-11-12 | Control de calidad (punto 6 de 3.4): `recalcularReglas`, `POST /control-calidad`, `PATCH /observaciones/{id}`, IA-12 v2 por lotes y etapa 10; SUP-85 a SUP-90. |
| 0.36 | 2026-11-12 | Alineación pedagógica (punto 7 de 3.4): informe sin IA, `PATCH /alineacion` con versión, permisos y aviso en la exportación; SUP-91 a SUP-95. |
| 0.37 | 2026-11-12 | Corrección de la alineación con IA (punto 7 de 3.4): IA-17 v2, propuesta del curso entero, vencimiento por versión, permisos y pantallas por revisar; SUP-96 a SUP-99. |
| 0.38 | 2026-11-12 | Patrones de navegación (3.3, punto 3): 7 marcos sobre el mismo núcleo, estaciones del mapa, API de navegación con versión, permisos y preferido del cliente en el kit; SUP-100 a SUP-104. |
| 0.39 | 2026-11-12 | Patrón con IA (3.3, punto 3): IA-14 v2 en modos recomendar y crear, validación extra, propuesta del curso que solo cambia el patrón, 5 opciones del personalizado sobre su base; SUP-105 a SUP-110. |
| 0.15 | 2026-11-10 | Retoques del elemento en `ajustes` (PATCH de pantalla, reproductor) y SUP-41. |
| 0.14 | 2026-11-10 | Editor (PNT-21): edición en el lugar con el PATCH de pantalla y SUP-40. |
| 0.13 | 2026-11-10 | Propuestas de la IA (IA-16 v2, aplicar, vencer y deshacer) y SUP-39. |
| 0.12 | 2026-11-10 | Regeneración en cascada desde Revisión (trabajo CASCADA en la cola voz) y SUP-38. |
| 0.11 | 2026-11-10 | Etapa 8 de subtítulos, WebVTT en la vista previa y SUP-37. |
| 0.10 | 2026-11-10 | Flujo para regenerar narraciones desactualizadas, id de trabajo en la cola y SUP-36. |
| 0.9 | 2026-11-10 | Etapa 7 de boca, flujo de la narración con boca sincronizada, Rhubarb como componente y SUP-35. |
| 0.8 | 2026-11-10 | Etapa 6 de voz en el flujo de generación, entidad `Narracion`, proveedor de voz y SUP-34. |
| 0.7 | 2026-11-10 | Flujo de revisión y aprobación (RN-05-1, RN-05-2), entidad `Observacion` y SUP-33. |
| 0.6 | 2026-11-10 | Reproductor único en la arquitectura, flujo de la vista previa y `GET /proyectos/{id}/curso`. |
| 0.5 | 2026-11-10 | IA-07 en la etapa 4 y seguimiento por nota con reto sumativo. |
| 0.4 | 2026-11-10 | Etapa 4: pantallas con el kit, avance en vivo y documento del curso. |
| 0.3 | 2026-11-10 | Primera versión, al cierre del S2: arquitectura, flujos de material y generación, datos, seguridad, proveedores, configuración y operación. |
