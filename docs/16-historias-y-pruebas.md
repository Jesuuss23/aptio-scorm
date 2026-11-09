# Historias de usuario y casos de prueba

17 épicas, 110 historias y 159 casos de prueba (CP). Las épicas E15–E17 son la fase comercial (`23-sitio-comercial-y-facturacion.md`). Se generan desde la misma fuente que el archivo de Jira (`jira/`); si se cambia una historia, se cambia en los dos.

- Sin estimaciones, fechas ni responsables.
- Cada caso de prueba está escrito como **Dado / Cuando / Entonces**. Se automatiza con Vitest (lógica), Playwright (flujos) o como prueba manual de la demo del sprint.
- Una historia está **terminada** cuando cumple la Definición de Terminado de `17-guia-desarrollo.md` y sus CP pasan.

## Resumen por épica

| Épica | Nombre | Módulos | Historias |
| --- | --- | --- | --- |
| E01 | Base técnica y acceso | M01, M15 | 10 |
| E02 | Clientes y kits de marca | M02, M14 | 6 |
| E03 | Proyectos y Nuevo SCORM | M03 | 5 |
| E04 | Generador | M04 | 8 |
| E05 | Revisión y calidad | M05 | 6 |
| E06 | Editor de pantalla | M06, M14 | 10 |
| E07 | Personaje y voz | M07 | 4 |
| E08 | Idiomas y subtítulos | M08 | 4 |
| E09 | Video interactivo | M09 | 3 |
| E10 | Alineación pedagógica | M10 | 2 |
| E11 | Navegación y reproductor | M11 | 5 |
| E12 | Entrega y LMS | M12 | 5 |
| E13 | Costos, rentabilidad y conexiones IA | M13 | 4 |
| E14 | Calidad transversal y seguridad | M15 | 6 |
| E15 | Sitio comercial y contenido | M16 | 14 |
| E16 | Captación y CRM | M17 | 7 |
| E17 | Planes, suscripciones y facturación | M18 | 11 |

## E01 · Base técnica y acceso

Monorepo, entorno local, CI, base de datos, almacenamiento, colas, eventos, sesión y roles.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-0101 | Como desarrollador, quiero levantar API, web, worker, PostgreSQL, Redis y MinIO con un comando para trabajar igual que todo el equipo. | S0 | Alta | REQ-108 |
| HU-0102 | Como desarrollador, quiero `packages/schema` con el esquema v0.2, tipos TypeScript y validador para que web, API y worker compartan el modelo. | S0 | Alta | REQ-101 |
| HU-0103 | Como desarrollador, quiero el esquema Prisma con migraciones y datos de ejemplo para empezar con un caso real. | S0 | Alta | — |
| HU-0104 | Como administrador, quiero crear usuarios con rol para que cada persona vea y haga solo lo que le toca. | S0 | Alta | REQ-107 |
| HU-0108 | Como usuario invitado, quiero entrar con mi cuenta de Google para no recordar otra clave. | S1 | Media | REQ-060 |
| HU-0109 | Como administrador, quiero invitar usuarios por correo, y como usuario, quiero recuperar mi clave sin pedir ayuda. | S0 | Alta | REQ-060, REQ-107 |
| HU-0110 | Como desarrollador, quiero los tokens de color, la escala de 6 tamaños de letra, los márgenes y la estructura base (barra lateral cobalto y barra superior con ruta) en packages/ui, para que todas las vistas se vean iguales al prototipo. | S0 | Alta | REQ-063 |
| HU-0105 | Como usuario, quiero ver el avance de los trabajos largos en vivo para no tener que recargar. | S0 | Alta | REQ-103 |
| HU-0106 | Como equipo, quiero ejecutar las pruebas técnicas de boca, imágenes y salidas de IA para confirmar los supuestos antes de construir. | S0 | Alta | — |
| HU-0107 | Como desarrollador, quiero que cada cambio corra lint, tipos y pruebas para no romper lo que ya funciona. | S0 | Media | — |

### HU-0101 · Entorno local con un comando

Como desarrollador, quiero levantar API, web, worker, PostgreSQL, Redis y MinIO con un comando para trabajar igual que todo el equipo.

**CP-001 · Entorno limpio**

```gherkin
Dado un equipo con Docker y Node LTS
Cuando ejecuto `pnpm i && pnpm dev:infra && pnpm dev`
Entonces la web abre en localhost:5173 y `GET /api/v1/salud` responde 200
```

Subtareas sugeridas: Infra, Backend, Documentación.

### HU-0102 · Paquete del esquema del curso

Como desarrollador, quiero `packages/schema` con el esquema v0.2, tipos TypeScript y validador para que web, API y worker compartan el modelo.

**CP-002 · Validación compartida**

```gherkin
Dado el ejemplo de cápsula
Cuando lo valido desde la API y desde el worker
Entonces ambos devuelven los mismos errores; las 17 pruebas del esquema pasan en CI
```

Subtareas sugeridas: Backend, Pruebas.

### HU-0103 · Base de datos y migraciones

Como desarrollador, quiero el esquema Prisma con migraciones y datos de ejemplo para empezar con un caso real.

**CP-003 · Migración inicial**

```gherkin
Dado una base vacía
Cuando ejecuto `pnpm db:migrate && pnpm db:seed`
Entonces existen el cliente Minera Andina con su kit, 5 usuarios de prueba y el proyecto LOTO
```

Subtareas sugeridas: Backend.

### HU-0104 · Sesión y roles

Como administrador, quiero crear usuarios con rol para que cada persona vea y haga solo lo que le toca.

**CP-004 · Ingreso correcto**

```gherkin
Dado un usuario activo
Cuando ingresa con su correo y clave
Entonces ve el menú de su rol
```

**CP-005 · Bloqueo por intentos**

```gherkin
Dado un usuario
Cuando falla la clave 5 veces
Entonces la cuenta queda bloqueada 15 minutos
```

**CP-006 · Permiso en la API**

```gherkin
Dado un PRODUCTOR
Cuando llama a `PUT /conexiones-ia/VOZ`
Entonces recibe 403
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-0108 · Ingresar con Google

Como usuario invitado, quiero entrar con mi cuenta de Google para no recordar otra clave.

**CP-007 · Correo invitado**

```gherkin
Dado un usuario invitado con su correo de Google
Cuando pulsa «Ingresar con Google» y acepta
Entonces entra con su rol y su cuenta queda vinculada
```

**CP-008 · Correo no invitado**

```gherkin
Dado una cuenta de Google que nadie invitó
Cuando intenta ingresar
Entonces ve «Tu correo no tiene acceso» y no se crea ninguna cuenta
```

**CP-009 · Correo no verificado**

```gherkin
Dado Google devuelve email_verified = false
Cuando vuelve al sistema
Entonces no ingresa
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-0109 · Invitación y cambio de clave

Como administrador, quiero invitar usuarios por correo, y como usuario, quiero recuperar mi clave sin pedir ayuda.

**CP-010 · Invitación**

```gherkin
Dado un administrador
Cuando invita a un correo con rol PRODUCTOR
Entonces llega un enlace de un solo uso que vence en 60 minutos para crear la clave
```

**CP-011 · Olvidé mi clave**

```gherkin
Dado un usuario
Cuando pide cambiar su clave
Entonces recibe un enlace; la API responde igual exista o no el correo
```

**CP-012 · Enlace usado**

```gherkin
Dado un enlace ya usado o vencido
Cuando se abre
Entonces muestra «Enlace no válido» y permite pedir otro
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-0110 · Sistema visual Aptio SCORM

Como desarrollador, quiero los tokens de color, la escala de 6 tamaños de letra, los márgenes y la estructura base (barra lateral cobalto y barra superior con ruta) en packages/ui, para que todas las vistas se vean iguales al prototipo.

**CP-013 · Margen**

```gherkin
Dado cualquier vista a 1280, 1440 y 1920 px de ancho
Cuando se mide la distancia entre la barra lateral y el contenido
Entonces es de 32 px en todas
```

**CP-014 · Escala tipográfica**

```gherkin
Dado cualquier vista
Cuando se recorren los tamaños de letra fuera de las cápsulas
Entonces solo aparecen 11, 12, 14, 16, 20 y 26 px, y solo el h1 usa 26 px
```

**CP-015 · Celular**

```gherkin
Dado cualquier vista a 390 px de ancho
Cuando se carga
Entonces no hay desborde horizontal
```

Subtareas sugeridas: Frontend, Pruebas.

### HU-0105 · Colas y eventos en vivo

Como usuario, quiero ver el avance de los trabajos largos en vivo para no tener que recargar.

**CP-016 · Evento recibido**

```gherkin
Dado un trabajo en la cola `ia`
Cuando cambia de estado
Entonces la web recibe el evento por SSE en menos de 2 s
```

Subtareas sugeridas: Backend, Frontend.

### HU-0106 · Pruebas técnicas PT-01 a PT-03

Como equipo, quiero ejecutar las pruebas técnicas de boca, imágenes y salidas de IA para confirmar los supuestos antes de construir.

**CP-017 · Resultado documentado**

```gherkin
Dado las pruebas ejecutadas
Cuando termina el sprint
Entonces existe `docs/pruebas/PT-0X.md` con resultado y decisión, y ESTADO.md está actualizado
```

Subtareas sugeridas: Investigación, Documentación.

### HU-0107 · Integración continua

Como desarrollador, quiero que cada cambio corra lint, tipos y pruebas para no romper lo que ya funciona.

**CP-018 · CI en rojo**

```gherkin
Dado un cambio que rompe una prueba
Cuando abro la solicitud de cambio
Entonces CI falla y no se puede fusionar
```

Subtareas sugeridas: Infra.

## E02 · Clientes y kits de marca

Clientes, kit (paleta, tipografías, personaje, voces), pantallas modelo, glosario y pronunciación.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-0201 | Como diseñador instruccional, quiero registrar un cliente con su LMS habitual e idiomas para asociarle proyectos. | S1 | Alta | REQ-001 |
| HU-0202 | Como diseñador gráfico, quiero definir paleta, estilo, tipografías y logo del cliente y ver sus pantallas actualizarse al instante. | S1 | Alta | REQ-002, REQ-003 |
| HU-0203 | Como diseñador gráfico, quiero subir el personaje SVG y ver qué bocas A–X tiene para saber si falta alguna. | S1 | Alta | REQ-019, REQ-020 |
| HU-0204 | Como diseñador gráfico, quiero crear las pantallas modelo del cliente para que la IA genere con nuestra calidad visual. | S1 | Alta | REQ-050 |
| HU-0205 | Como productor, quiero registrar términos que no se traducen y cómo se pronuncian para que la voz y el inglés sean correctos. | S1 | Media | REQ-028 |
| HU-0206 | Como diseñador gráfico, quiero que la IA proponga el kit desde un curso anterior o un manual de marca para ahorrar tiempo. | S9 | Baja | — |

### HU-0201 · Crear cliente

Como diseñador instruccional, quiero registrar un cliente con su LMS habitual e idiomas para asociarle proyectos.

**CP-019 · Alta mínima**

```gherkin
Dado la lista de clientes
Cuando creo uno solo con el nombre
Entonces aparece en la lista y puedo crearle el kit
```

Subtareas sugeridas: Backend, Frontend.

### HU-0202 · Kit de marca con vista previa

Como diseñador gráfico, quiero definir paleta, estilo, tipografías y logo del cliente y ver sus pantallas actualizarse al instante.

**CP-020 · Cambio en vivo**

```gherkin
Dado el kit de Minera Andina
Cuando cambio el color primario
Entonces las pantallas modelo se actualizan sin recargar
```

**CP-021 · Contraste bajo**

```gherkin
Dado texto #9AA0A6 sobre fondo blanco
Cuando guardo
Entonces veo una advertencia de contraste menor a 4,5:1 y el guardado no se bloquea
```

**CP-022 · Edición simultánea**

```gherkin
Dado dos personas editan el kit
Cuando la segunda guarda con versión vieja
Entonces recibe 409 y opción de recargar
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-0203 · Personaje con bocas

Como diseñador gráfico, quiero subir el personaje SVG y ver qué bocas A–X tiene para saber si falta alguna.

**CP-023 · Boca faltante**

```gherkin
Dado un SVG sin la capa de la boca G
Cuando lo subo
Entonces el kit marca «G falta» y la reemplaza por B
```

**CP-024 · SVG peligroso**

```gherkin
Dado un SVG con `<script>`
Cuando lo subo
Entonces se guarda sin el script y sin atributos `on*`
```

Subtareas sugeridas: Backend, Frontend.

### HU-0204 · Pantallas modelo del kit

Como diseñador gráfico, quiero crear las pantallas modelo del cliente para que la IA genere con nuestra calidad visual.

**CP-025 · Modelo disponible**

```gherkin
Dado una pantalla modelo «Idea + ilustración»
Cuando la activo
Entonces el generador la usa en las próximas generaciones
```

**CP-026 · Sin modelos**

```gherkin
Dado un cliente sin pantallas modelo
Cuando genero
Entonces se usan las del estilo base
```

Subtareas sugeridas: Backend, Frontend.

### HU-0205 · Glosario y pronunciación

Como productor, quiero registrar términos que no se traducen y cómo se pronuncian para que la voz y el inglés sean correctos.

**CP-027 · Pronunciación**

```gherkin
Dado «LOTO» → «lo-to»
Cuando escucho una muestra
Entonces la voz dice «lo-to»
```

Subtareas sugeridas: Backend, Frontend.

### HU-0206 · Extraer kit de un curso anterior

Como diseñador gráfico, quiero que la IA proponga el kit desde un curso anterior o un manual de marca para ahorrar tiempo.

**CP-028 · Propuesta revisable**

```gherkin
Dado un ZIP de un curso anterior
Cuando pido extraer
Entonces recibo una propuesta de paleta y tipografías que puedo aplicar o descartar
```

Subtareas sugeridas: Backend, IA, Frontend.

## E03 · Proyectos y Nuevo SCORM

Crear proyectos con datos técnicos opcionales, subir material y extraer texto o transcripción.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-0301 | Como diseñador instruccional, quiero ver los proyectos con estado, avance y costo de IA para saber qué atender. | S1 | Alta | REQ-001 |
| HU-0302 | Como diseñador instruccional, quiero crear un proyecto solo con cliente y nombre, y dejar los datos técnicos para después. | S1 | Alta | REQ-043, REQ-044 |
| HU-0303 | Como diseñador instruccional, quiero estimar pantallas y SCORM desde las horas que pide el cliente para planificar. | S1 | Media | REQ-004 |
| HU-0304 | Como diseñador instruccional, quiero subir PDF, Word o PowerPoint y ver el texto por página para que la IA trabaje con el contenido real. | S1 | Alta | REQ-006 |
| HU-0305 | Como productor, quiero subir video o audio del cliente y obtener su transcripción con tiempos. | S2 | Media | REQ-026 |

### HU-0301 · Lista de proyectos

Como diseñador instruccional, quiero ver los proyectos con estado, avance y costo de IA para saber qué atender.

**CP-029 · Filtro**

```gherkin
Dado 20 proyectos de 3 clientes
Cuando filtro por un cliente
Entonces solo veo los suyos
```

Subtareas sugeridas: Backend, Frontend.

### HU-0302 · Nuevo SCORM sin datos obligatorios

Como diseñador instruccional, quiero crear un proyecto solo con cliente y nombre, y dejar los datos técnicos para después.

**CP-030 · Mínimo**

```gherkin
Dado el formulario Nuevo SCORM
Cuando lleno solo cliente y nombre
Entonces el proyecto se crea y puedo generar
```

**CP-031 · Datos técnicos vacíos**

```gherkin
Dado un proyecto sin LMS
Cuando llego a Entrega
Entonces el perfil propuesto es Genérico
```

Subtareas sugeridas: Backend, Frontend.

### HU-0303 · Estimación opcional

Como diseñador instruccional, quiero estimar pantallas y SCORM desde las horas que pide el cliente para planificar.

**CP-032 · Cálculo**

```gherkin
Dado 48 horas, 50 % en SCORM, 30 pantallas por SCORM
Cuando escribo los datos
Entonces veo ≈ 1.200 pantallas y 40 SCORM con los supuestos editables
```

Subtareas sugeridas: Frontend, Pruebas.

### HU-0304 · Subir material y extraer texto

Como diseñador instruccional, quiero subir PDF, Word o PowerPoint y ver el texto por página para que la IA trabaje con el contenido real.

**CP-033 · PDF de 84 páginas**

```gherkin
Dado el manual de ejemplo
Cuando lo subo
Entonces veo el texto de cada página; las escaneadas pasan por OCR y se marcan
```

**CP-034 · Archivo no permitido**

```gherkin
Dado un .exe renombrado a .pdf
Cuando lo subo
Entonces se rechaza por tipo real
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-0305 · Video o audio como material

Como productor, quiero subir video o audio del cliente y obtener su transcripción con tiempos.

**CP-035 · Transcripción**

```gherkin
Dado un video de 2:30
Cuando lo subo
Entonces veo la transcripción con marcas de tiempo
```

Subtareas sugeridas: Backend.

## E04 · Generador

Las 11 etapas que convierten el material en un SCORM completo y revisable.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-0401 | Como diseñador instruccional, quiero lanzar la generación y ver cada etapa avanzar con su costo. | S2 | Alta | REQ-049 |
| HU-0402 | Como diseñador instruccional, quiero que la IA resuma el material indicando la página de cada idea y lo que omitió con motivo. | S2 | Alta | REQ-007, REQ-008, REQ-010 |
| HU-0403 | Como diseñador instruccional, quiero objetivos con nivel de Bloom y una estructura de pantallas según la extensión pedida. | S2 | Alta | REQ-009 |
| HU-0404 | Como diseñador instruccional, quiero texto corto en pantalla y narración para cada pantalla. | S2 | Alta | REQ-009 |
| HU-0405 | Como desarrollador, quiero que toda salida de IA valide contra el esquema con hasta 2 reintentos para nunca guardar datos a medias. | S2 | Alta | REQ-101, REQ-038 |
| HU-0406 | Como diseñador instruccional, quiero que cada pantalla salga armada con una disposición y los componentes del kit, sin HTML generado por la IA. | S3 | Alta | REQ-050 |
| HU-0407 | Como productor, quiero que la IA genere los datos de cada actividad (memoria, clasificar, quiz…) desde el contenido. | S3 | Alta | REQ-016 |
| HU-0408 | Como diseñador instruccional, quiero cancelar una generación o reintentar una etapa sin perder lo hecho. | S2 | Media | REQ-049 |

### HU-0401 · Lanzar generación con avance visible

Como diseñador instruccional, quiero lanzar la generación y ver cada etapa avanzar con su costo.

**CP-036 · Avance**

```gherkin
Dado un proyecto con material
Cuando pulso «Generar SCORM»
Entonces veo las 11 etapas con estado, detalle y costo, actualizadas en vivo
```

**CP-037 · Solo una**

```gherkin
Dado una generación en curso
Cuando intento lanzar otra
Entonces recibo un aviso y no se crea
```

Subtareas sugeridas: Backend, Frontend.

### HU-0402 · Resumen e ideas clave con origen

Como diseñador instruccional, quiero que la IA resuma el material indicando la página de cada idea y lo que omitió con motivo.

**CP-038 · Trazabilidad**

```gherkin
Dado el manual de 84 páginas
Cuando termina la etapa 1
Entonces cada idea clave tiene su página y existe un acta de temas omitidos
```

Subtareas sugeridas: IA, Backend.

### HU-0403 · Objetivos y estructura

Como diseñador instruccional, quiero objetivos con nivel de Bloom y una estructura de pantallas según la extensión pedida.

**CP-039 · Extensión**

```gherkin
Dado 30 pantallas y 40 % de actividades
Cuando termina la etapa 2
Entonces hay 30 pantallas, al menos 12 con actividad, cada una ligada a un objetivo
```

Subtareas sugeridas: IA, Backend.

### HU-0404 · Guion por pantalla

Como diseñador instruccional, quiero texto corto en pantalla y narración para cada pantalla.

**CP-040 · Texto corto**

```gherkin
Dado el guion generado
Cuando lo valido
Entonces ninguna pantalla supera 30 palabras en pantalla sin advertencia
```

Subtareas sugeridas: IA, Backend.

### HU-0405 · Salidas validadas y reintentos

Como desarrollador, quiero que toda salida de IA valide contra el esquema con hasta 2 reintentos para nunca guardar datos a medias.

**CP-041 · Salida inválida**

```gherkin
Dado una respuesta de IA sin un campo obligatorio
Cuando se valida
Entonces se reintenta con el error; si falla 3 veces la etapa queda en ERROR con «Reintentar etapa»
```

Subtareas sugeridas: Backend, Pruebas.

### HU-0406 · Componer pantallas con el kit

Como diseñador instruccional, quiero que cada pantalla salga armada con una disposición y los componentes del kit, sin HTML generado por la IA.

**CP-042 · Disposición válida**

```gherkin
Dado el guion de 30 pantallas
Cuando termina la etapa 4
Entonces todas tienen `disposicion` válida y se dibujan en la vista previa
```

**CP-043 · Pantallas en vivo**

```gherkin
Dado la etapa 4 en curso
Cuando una pantalla queda lista
Entonces aparece en Producción sin esperar al resto
```

Subtareas sugeridas: IA, Backend, Frontend.

### HU-0407 · Datos de las actividades

Como productor, quiero que la IA genere los datos de cada actividad (memoria, clasificar, quiz…) desde el contenido.

**CP-044 · Clasificar**

```gherkin
Dado una pantalla de clasificar
Cuando se genera
Entonces tiene 2 grupos y al menos 4 elementos con su grupo correcto y retroalimentación
```

Subtareas sugeridas: IA, Backend.

### HU-0408 · Cancelar y reintentar etapas

Como diseñador instruccional, quiero cancelar una generación o reintentar una etapa sin perder lo hecho.

**CP-045 · Cancelar**

```gherkin
Dado una generación en la etapa 3
Cuando la cancelo
Entonces las etapas 1 y 2 se conservan y puedo continuar después
```

Subtareas sugeridas: Backend, Frontend.

## E05 · Revisión y calidad

Revisar, ajustar con IA, regenerar en cascada, controlar calidad y aprobar.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-0501 | Como diseñador instruccional, quiero revisar cada pantalla animada con filtros y su origen. | S3 | Alta | REQ-010, REQ-030 |
| HU-0502 | Como diseñador instruccional, quiero aprobar pantallas una por una o todas las que no tienen observaciones. | S3 | Alta | REQ-011, REQ-052 |
| HU-0503 | Como revisor interno, quiero cambiar un texto y que voz, boca, subtítulos e inglés se actualicen solos. | S5 | Alta | REQ-051 |
| HU-0504 | Como productor, quiero pedir «más visual», «menos texto», «convertir en actividad», «3 variantes», «otra ilustración» o un pedido libre, y aplicar o descartar. | S5 | Alta | REQ-038, REQ-052 |
| HU-0505 | Como diseñador instruccional, quiero observaciones automáticas de alineación, accesibilidad, longitud y ortografía. | S7 | Alta | REQ-035, REQ-105 |
| HU-0506 | Como revisor del cliente, quiero comentar pantallas sin poder editarlas. | S10 | Media | REQ-058 |

### HU-0501 · Revisar pantallas

Como diseñador instruccional, quiero revisar cada pantalla animada con filtros y su origen.

**CP-046 · Filtro**

```gherkin
Dado 30 pantallas, 3 con observaciones
Cuando filtro «Revisar»
Entonces veo solo las 3
```

**CP-047 · Origen**

```gherkin
Dado una pantalla tomada del manual
Cuando la abro
Entonces veo «Manual p. 12»
```

Subtareas sugeridas: Frontend, Backend.

### HU-0502 · Aprobar una o por lote

Como diseñador instruccional, quiero aprobar pantallas una por una o todas las que no tienen observaciones.

**CP-048 · Lote**

```gherkin
Dado 27 pantallas sin observaciones y 3 con
Cuando pulso «Aprobar todas las que no tienen observaciones»
Entonces quedan 27 aprobadas y 3 pendientes
```

**CP-049 · Aprobada que cambia**

```gherkin
Dado una pantalla aprobada
Cuando edito su texto
Entonces vuelve a borrador
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-0503 · Regeneración en cascada

Como revisor interno, quiero cambiar un texto y que voz, boca, subtítulos e inglés se actualicen solos.

**CP-050 · Solo lo afectado**

```gherkin
Dado la narración de la pantalla 5
Cuando la cambio
Entonces se crean trabajos solo para la pantalla 5 en ES y EN y los chips pasan a verde al terminar
```

**CP-051 · Sin gasto por tecla**

```gherkin
Dado escribo una frase
Cuando tecleo durante 5 s
Entonces se lanza un solo trabajo, 1 s después de dejar de escribir
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-0504 · Propuestas de la IA

Como productor, quiero pedir «más visual», «menos texto», «convertir en actividad», «3 variantes», «otra ilustración» o un pedido libre, y aplicar o descartar.

**CP-052 · Aplicar y deshacer**

```gherkin
Dado una propuesta «Más visual»
Cuando la aplico
Entonces la pantalla cambia, se crea una versión y Deshacer la revierte
```

**CP-053 · Propuesta vencida**

```gherkin
Dado una propuesta calculada sobre la versión 12
Cuando el curso ya está en la 13
Entonces al aplicar recibo «Recalcular propuesta»
```

Subtareas sugeridas: IA, Backend, Frontend.

### HU-0505 · Control de calidad automático

Como diseñador instruccional, quiero observaciones automáticas de alineación, accesibilidad, longitud y ortografía.

**CP-054 · Imagen sin alternativo**

```gherkin
Dado una imagen no decorativa sin texto alternativo
Cuando corre el control
Entonces aparece una observación de accesibilidad en esa pantalla
```

Subtareas sugeridas: IA, Backend.

### HU-0506 · Comentarios del revisor del cliente

Como revisor del cliente, quiero comentar pantallas sin poder editarlas.

**CP-055 · Solo comentar**

```gherkin
Dado un revisor del cliente
Cuando intenta guardar una pantalla
Entonces recibe 403; sí puede comentar
```

Subtareas sugeridas: Backend, Frontend.

## E06 · Editor de pantalla

Retoques estilo Canva/Genially sobre la pantalla generada.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-0601 | Como productor, quiero hacer doble clic en un texto y escribir ahí mismo. | S5 | Alta | REQ-045 |
| HU-0602 | Como productor, quiero cambiar tamaño, color del kit, alineación y animación del elemento elegido. | S5 | Alta | REQ-045 |
| HU-0603 | Como diseñador gráfico, quiero mover elementos con el mouse o las flechas en modo Libre. | S5 | Alta | REQ-053 |
| HU-0604 | Como productor, quiero que mis retoques se conserven aunque la IA regenere el texto. | S5 | Alta | REQ-053 |
| HU-0605 | Como productor, quiero ver la misma pantalla en otras composiciones y elegir una. | S5 | Media | REQ-052 |
| HU-0606 | Como productor, quiero agregar título, texto, botón, imagen, insignia, forma o personaje, y ocultar o mostrar capas. | S5 | Media | REQ-045 |
| HU-0607 | Como productor, quiero deshacer y que todo se guarde solo. | S5 | Alta | REQ-013, REQ-054 |
| HU-0608 | Como diseñador gráfico, quiero ver bajo la pantalla una línea de tiempo con la narración (palabra por palabra), los subtítulos, la boca de Ana y una barra por elemento, y arrastrar las barras para decidir cuándo aparece y sale cada uno. | S5 | Alta | REQ-045, REQ-059 |
| HU-0610 | Como diseñador gráfico, quiero definir disparadores sin código: cuando termina la voz o llega un segundo de la línea de tiempo, mostrar, ocultar o ir a otra pantalla. | S8 | Baja | REQ-045 |
| HU-0609 | Como diseñador gráfico, quiero subir imágenes o arrastrarlas al lienzo y usar la biblioteca del kit. | S9 | Media | REQ-046, REQ-017 |

### HU-0601 · Editar texto sobre la pantalla

Como productor, quiero hacer doble clic en un texto y escribir ahí mismo.

**CP-056 · Edición en el lugar**

```gherkin
Dado un título
Cuando hago doble clic, escribo y pulso Enter
Entonces el texto queda guardado; Esc cancela
```

Subtareas sugeridas: Frontend.

### HU-0602 · Barra contextual y propiedades

Como productor, quiero cambiar tamaño, color del kit, alineación y animación del elemento elegido.

**CP-057 · Color del kit**

```gherkin
Dado un texto elegido
Cuando elijo el color Acento
Entonces cambia y solo se ofrecen colores del kit
```

Subtareas sugeridas: Frontend.

### HU-0603 · Modo libre

Como diseñador gráfico, quiero mover elementos con el mouse o las flechas en modo Libre.

**CP-058 · Posición relativa**

```gherkin
Dado una imagen
Cuando la arrastro
Entonces se guarda un desplazamiento en % del ancho y se ve igual en otra resolución
```

Subtareas sugeridas: Frontend.

### HU-0604 · Retoques separados del contenido

Como productor, quiero que mis retoques se conserven aunque la IA regenere el texto.

**CP-059 · Regenerar sin perder**

```gherkin
Dado una pantalla con imagen movida y botón agregado
Cuando aplico «Menos texto»
Entonces la imagen sigue movida y el botón sigue ahí
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-0605 · Cambiar diseño de la pantalla

Como productor, quiero ver la misma pantalla en otras composiciones y elegir una.

**CP-060 · Diseño**

```gherkin
Dado una pantalla «Idea + ilustración»
Cuando elijo «Tarjetas con íconos»
Entonces se conserva el contenido y se puede deshacer
```

Subtareas sugeridas: Frontend.

### HU-0606 · Agregar elementos y capas

Como productor, quiero agregar título, texto, botón, imagen, insignia, forma o personaje, y ocultar o mostrar capas.

**CP-061 · Agregar**

```gherkin
Dado el panel Agregar
Cuando elijo «Botón»
Entonces aparece en la pantalla, seleccionado y listo para mover
```

Subtareas sugeridas: Frontend.

### HU-0607 · Deshacer, rehacer y guardado automático

Como productor, quiero deshacer y que todo se guarde solo.

**CP-062 · Recargar**

```gherkin
Dado varios cambios
Cuando recargo la página
Entonces siguen ahí
```

**CP-063 · Deshacer**

```gherkin
Dado 20 cambios
Cuando pulso Ctrl+Z 20 veces
Entonces vuelvo al estado inicial
```

Subtareas sugeridas: Frontend, Backend.

### HU-0608 · Línea de tiempo de la pantalla

Como diseñador gráfico, quiero ver bajo la pantalla una línea de tiempo con la narración (palabra por palabra), los subtítulos, la boca de Ana y una barra por elemento, y arrastrar las barras para decidir cuándo aparece y sale cada uno.

**CP-064 · Arrastrar entrada**

```gherkin
Dado un elemento que aparece a los 0,3 s
Cuando arrastro su barra hasta la palabra «residual»
Entonces la barra se imanta a esa palabra, se guarda `retardoS` y `anclaPalabra`, y la vista previa lo respeta
```

**CP-065 · Salida**

```gherkin
Dado un elemento sin salida
Cuando arrastro el borde derecho de su barra a los 4 s
Entonces se guarda `finS` = 4 y el elemento desaparece a los 4 s en la vista previa y en el paquete
```

**CP-066 · Reproducir y recorrer**

```gherkin
Dado la pantalla 05
Cuando pulso Reproducir o hago clic en la regla a los 2 s
Entonces la aguja avanza, la palabra actual se resalta, la boca y los subtítulos coinciden, y solo se ven los elementos activos en ese segundo
```

**CP-067 · Cambiar la narración**

```gherkin
Dado un elemento anclado a una palabra
Cuando edito la narración y se regenera la voz
Entonces el elemento sigue apareciendo con su palabra con las marcas de la nueva voz; si la palabra ya no existe, conserva el segundo y se marca para revisar
```

**CP-068 · Sincronizar con la voz**

```gherkin
Dado una pantalla con 4 elementos
Cuando pulso «✦ Sincronizar con la voz»
Entonces llega una propuesta que hace aparecer cada elemento cuando Ana lo nombra; al aplicarla se puede deshacer
```

Subtareas sugeridas: Frontend, Backend, Pruebas.

### HU-0610 · Disparadores simples

Como diseñador gráfico, quiero definir disparadores sin código: cuando termina la voz o llega un segundo de la línea de tiempo, mostrar, ocultar o ir a otra pantalla.

**CP-069 · Disparador por tiempo**

```gherkin
Dado un botón oculto
Cuando defino «a los 3 s → mostrar botón»
Entonces en la vista previa el botón aparece a los 3 s
```

Subtareas sugeridas: Frontend.

### HU-0609 · Imágenes propias y biblioteca

Como diseñador gráfico, quiero subir imágenes o arrastrarlas al lienzo y usar la biblioteca del kit.

**CP-070 · Arrastrar archivo**

```gherkin
Dado una imagen del escritorio
Cuando la suelto en la pantalla
Entonces queda donde la solté y en la biblioteca del proyecto
```

Subtareas sugeridas: Frontend, Backend.

## E07 · Personaje y voz

Narración, boca sincronizada desde el audio y audio del cliente.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-0701 | Como productor, quiero que cada pantalla tenga narración con la voz del cliente. | S4 | Alta | REQ-021 |
| HU-0702 | Como productor, quiero ver a Ana hablar con la boca sincronizada sin usar video. | S4 | Alta | REQ-022 |
| HU-0703 | Como productor, quiero saber qué narraciones están desactualizadas y regenerar solo esas. | S4 | Alta | REQ-021 |
| HU-0704 | Como productor, quiero limpiar, re-locutar o usar el audio del cliente con boca automática. | S9 | Media | REQ-023, REQ-024 |

### HU-0701 · Narración con la voz del kit

Como productor, quiero que cada pantalla tenga narración con la voz del cliente.

**CP-071 · Narración completa**

```gherkin
Dado un curso generado
Cuando termina la etapa 6
Entonces todas las pantallas con narración tienen audio y estado «Lista»
```

Subtareas sugeridas: Backend, IA.

### HU-0702 · Boca sincronizada

Como productor, quiero ver a Ana hablar con la boca sincronizada sin usar video.

**CP-072 · Sincronía**

```gherkin
Dado una narración de 10 s
Cuando la reproduzco
Entonces la boca cambia según las marcas; desfase perceptible menor a 100 ms (PT-01)
```

Subtareas sugeridas: Backend, Frontend.

### HU-0703 · Narraciones desactualizadas

Como productor, quiero saber qué narraciones están desactualizadas y regenerar solo esas.

**CP-073 · Cambio de pronunciación**

```gherkin
Dado «LOTO» en 4 pantallas
Cuando cambio su pronunciación
Entonces solo esas 4 quedan «Por regenerar»
```

Subtareas sugeridas: Backend, Frontend.

### HU-0704 · Audio del cliente

Como productor, quiero limpiar, re-locutar o usar el audio del cliente con boca automática.

**CP-074 · Boca desde grabación**

```gherkin
Dado un audio del gerente
Cuando elijo «Usar con boca automática»
Entonces Ana mueve la boca con esa grabación
```

Subtareas sugeridas: Backend.

## E08 · Idiomas y subtítulos

Traducción con glosario, revisión, desbordes y subtítulos ES/EN.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-0801 | Como productor, quiero subtítulos WebVTT sincronizados en cada idioma. | S4 | Alta | REQ-025 |
| HU-0802 | Como productor, quiero traducir al inglés respetando el glosario y sin tocar lo revisado. | S7 | Alta | REQ-028 |
| HU-0803 | Como productor, quiero saber qué textos no caben en su espacio en algún idioma. | S7 | Alta | REQ-029 |
| HU-0804 | Como participante, quiero cambiar de idioma sin perder mi avance. | S7 | Alta | REQ-034 |

### HU-0801 · Subtítulos

Como productor, quiero subtítulos WebVTT sincronizados en cada idioma.

**CP-075 · Sincronía**

```gherkin
Dado una narración
Cuando se genera
Entonces existe su archivo VTT y se muestra en la vista previa
```

Subtareas sugeridas: Backend.

### HU-0802 · Traducir con glosario

Como productor, quiero traducir al inglés respetando el glosario y sin tocar lo revisado.

**CP-076 · Glosario**

```gherkin
Dado «LOTO» marcado como no traducir
Cuando traduzco
Entonces sigue como «LOTO»
```

**CP-077 · Revisado intacto**

```gherkin
Dado un texto marcado Revisado
Cuando pulso «Traducir pendientes»
Entonces no cambia
```

Subtareas sugeridas: IA, Backend, Frontend.

### HU-0803 · Desbordes por idioma

Como productor, quiero saber qué textos no caben en su espacio en algún idioma.

**CP-078 · Desborde**

```gherkin
Dado una tarjeta que en inglés excede su espacio
Cuando corre la validación
Entonces queda «Desborde» con propuesta de versión corta
```

Subtareas sugeridas: Backend, Frontend.

### HU-0804 · Bilingüe en un paquete

Como participante, quiero cambiar de idioma sin perder mi avance.

**CP-079 · Cambio de idioma**

```gherkin
Dado voy en la pantalla 8
Cuando cambio a inglés
Entonces sigo en la 8 con mis puntos
```

Subtareas sugeridas: Frontend, Pruebas.

## E09 · Video interactivo

Pausas con preguntas en el video del cliente.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-0901 | Como productor, quiero marcar tiempos del video donde se pausa y aparece una pregunta. | S9 | Media | REQ-026 |
| HU-0902 | Como diseñador instruccional, quiero impedir que salten preguntas no respondidas. | S9 | Media | REQ-026 |
| HU-0903 | Como productor, quiero que la IA proponga pausas desde la transcripción. | S9 | Baja | REQ-027 |

### HU-0901 · Preguntas en el video

Como productor, quiero marcar tiempos del video donde se pausa y aparece una pregunta.

**CP-080 · Pausa**

```gherkin
Dado una pregunta en 0:45
Cuando reproduzco
Entonces el video se detiene en 0:45 y muestra la pregunta
```

Subtareas sugeridas: Frontend, Backend.

### HU-0902 · Impedir adelantar

Como diseñador instruccional, quiero impedir que salten preguntas no respondidas.

**CP-081 · Bloqueo**

```gherkin
Dado una pregunta pendiente en 1:20
Cuando intento ir a 2:00
Entonces no se permite y se explica por qué
```

Subtareas sugeridas: Frontend.

### HU-0903 · Pausas propuestas por IA

Como productor, quiero que la IA proponga pausas desde la transcripción.

**CP-082 · Propuesta**

```gherkin
Dado una transcripción con 4 cambios de tema
Cuando pido proponer
Entonces recibo al menos un marcador por cambio de tema para aplicar o descartar
```

Subtareas sugeridas: IA, Backend.

## E10 · Alineación pedagógica

Matriz objetivos × presentar/practicar/evaluar con Bloom y propuestas.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-1001 | Como diseñador instruccional, quiero ver por objetivo qué pantallas presentan, practican y evalúan, con su nivel de Bloom. | S8 | Alta | REQ-042 |
| HU-1002 | Como diseñador instruccional, quiero que la IA proponga cómo corregir las alertas. | S8 | Media | REQ-042 |

### HU-1001 · Matriz de alineación

Como diseñador instruccional, quiero ver por objetivo qué pantallas presentan, practican y evalúan, con su nivel de Bloom.

**CP-083 · Alerta de nivel**

```gherkin
Dado un objetivo «aplicar» evaluado solo con preguntas «recordar»
Cuando abro Alineación
Entonces veo la alerta en ese objetivo
```

Subtareas sugeridas: Backend, Frontend.

### HU-1002 · Corregir con IA

Como diseñador instruccional, quiero que la IA proponga cómo corregir las alertas.

**CP-084 · Corrección**

```gherkin
Dado 2 alertas
Cuando aplico la propuesta
Entonces quedan 0 alertas y las pantallas nuevas quedan por revisar
```

Subtareas sugeridas: IA, Backend, Frontend.

## E11 · Navegación y reproductor

Reproductor único, patrones de navegación, reglas y vista previa.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-1101 | Como desarrollador, quiero que la vista previa y el paquete usen el mismo reproductor para que lo que se ve sea lo que se entrega. | S3 | Alta | Decisión 3, REQ-104 |
| HU-1102 | Como diseñador instruccional, quiero recorrer la cápsula como el participante en escritorio y celular. | S3 | Alta | REQ-030, REQ-055 |
| HU-1103 | Como diseñador instruccional, quiero elegir entre 7 patrones y combinarlos con cualquier regla. | S8 | Media | REQ-047 |
| HU-1104 | Como diseñador instruccional, quiero que la IA recomiende un patrón o cree uno desde mi descripción. | S8 | Baja | REQ-048 |
| HU-1105 | Como participante, quiero continuar donde lo dejé. | S6 | Alta | REQ-041 |

### HU-1101 · Reproductor único

Como desarrollador, quiero que la vista previa y el paquete usen el mismo reproductor para que lo que se ve sea lo que se entrega.

**CP-085 · Mismo código**

```gherkin
Dado la vista previa y el SCORM exportado
Cuando comparo una pantalla
Entonces se ven iguales; el reproductor pesa menos de 300 KB comprimido
```

Subtareas sugeridas: Frontend.

### HU-1102 · Vista previa clásica

Como diseñador instruccional, quiero recorrer la cápsula como el participante en escritorio y celular.

**CP-086 · Bloqueo por actividad**

```gherkin
Dado regla «actividades obligatorias»
Cuando intento pasar una actividad sin hacerla
Entonces Siguiente está deshabilitado y dice por qué
```

Subtareas sugeridas: Frontend, Pruebas.

### HU-1103 · Patrones de navegación

Como diseñador instruccional, quiero elegir entre 7 patrones y combinarlos con cualquier regla.

**CP-087 · Combinación**

```gherkin
Dado patrón Historias y regla Secuencial
Cuando pruebo la vista previa
Entonces se avanza tocando los lados, con teclado y con botones, y respeta el orden
```

Subtareas sugeridas: Frontend.

### HU-1104 · Patrón recomendado o creado por IA

Como diseñador instruccional, quiero que la IA recomiende un patrón o cree uno desde mi descripción.

**CP-088 · Personalizado**

```gherkin
Dado «tablero de misiones de seguridad»
Cuando pido crear
Entonces recibo una configuración válida con miniatura para aplicar
```

Subtareas sugeridas: IA, Frontend.

### HU-1105 · Reanudación

Como participante, quiero continuar donde lo dejé.

**CP-089 · Volver**

```gherkin
Dado salgo en la pantalla 12
Cuando vuelvo a entrar
Entonces me pregunta si continúo y vuelvo a la 12 con mis puntos
```

Subtareas sugeridas: Frontend, Pruebas.

## E12 · Entrega y LMS

Validación y exportación SCORM 1.2, HTML, bilingüe, modo diagnóstico y kit de gamificación.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-1201 | Como diseñador instruccional, quiero ver errores y advertencias antes de exportar. | S6 | Alta | REQ-035, REQ-040 |
| HU-1202 | Como diseñador instruccional, quiero exportar un SCORM 1.2 que funcione en cualquier LMS. | S6 | Alta | REQ-033, REQ-039 |
| HU-1203 | Como productor, quiero una versión HTML que abra sin LMS ni conexión. | S6 | Media | REQ-032 |
| HU-1204 | Como soporte, quiero un modo diagnóstico dentro del paquete para LMS desconocidos. | S6 | Alta | REQ-039 |
| HU-1205 | Como diseñador instruccional, quiero descargar insignias con la marca y la guía para configurarlas en el LMS del cliente. | S10 | Baja | REQ-036 |

### HU-1201 · Validar antes de exportar

Como diseñador instruccional, quiero ver errores y advertencias antes de exportar.

**CP-090 · Tamaño**

```gherkin
Dado un paquete de 300 MB
Cuando valido
Entonces veo una advertencia con alternativas y puedo exportar igual
```

Subtareas sugeridas: Backend, Frontend.

### HU-1202 · Exportar SCORM 1.2

Como diseñador instruccional, quiero exportar un SCORM 1.2 que funcione en cualquier LMS.

**CP-091 · SCORM Cloud**

```gherkin
Dado el curso LOTO
Cuando exporto y lo subo a SCORM Cloud
Entonces registra avance, nota y estado
```

**CP-092 · Moodle**

```gherkin
Dado el mismo paquete
Cuando lo subo a Moodle 4.5 de pruebas
Entonces reanuda donde quedé
```

Subtareas sugeridas: Backend, Pruebas.

### HU-1203 · Exportar HTML

Como productor, quiero una versión HTML que abra sin LMS ni conexión.

**CP-093 · Sin conexión**

```gherkin
Dado la carpeta exportada
Cuando abro index.html sin internet
Entonces funciona completa
```

Subtareas sugeridas: Backend.

### HU-1204 · Modo diagnóstico

Como soporte, quiero un modo diagnóstico dentro del paquete para LMS desconocidos.

**CP-094 · API no encontrada**

```gherkin
Dado un LMS que no expone la API
Cuando abro el paquete
Entonces el modo diagnóstico muestra qué encontró y se puede copiar a la ficha del cliente
```

Subtareas sugeridas: Frontend.

### HU-1205 · Kit de gamificación para el LMS

Como diseñador instruccional, quiero descargar insignias con la marca y la guía para configurarlas en el LMS del cliente.

**CP-095 · Descarga**

```gherkin
Dado el kit de Minera Andina
Cuando exporto el kit
Entonces obtengo las insignias y la guía del LMS elegido
```

Subtareas sugeridas: Backend.

## E13 · Costos, rentabilidad y conexiones IA

Registro de costos, calculadora, mediciones y proveedor por tarea.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-1301 | Como administrador, quiero que cada llamada a un proveedor registre consumo y costo. | S2 | Alta | REQ-037 |
| HU-1302 | Como administrador, quiero ver el costo de IA por proyecto, cliente y proveedor. | S10 | Media | REQ-037 |
| HU-1303 | Como gerente, quiero comparar el costo por SCORM hoy y con el generador usando horas medidas. | S10 | Alta | REQ-056 |
| HU-1304 | Como administrador, quiero cambiar el proveedor o modelo de cada tarea y probar la conexión. | S10 | Media | REQ-057 |

### HU-1301 · Registrar costo por trabajo

Como administrador, quiero que cada llamada a un proveedor registre consumo y costo.

**CP-096 · Registro**

```gherkin
Dado una etapa del generador
Cuando termina
Entonces existe un TrabajoIA con proveedor, modelo, consumo y costo
```

Subtareas sugeridas: Backend.

### HU-1302 · Resumen de costos

Como administrador, quiero ver el costo de IA por proyecto, cliente y proveedor.

**CP-097 · Por proyecto**

```gherkin
Dado 3 proyectos con generaciones
Cuando abro Costos
Entonces veo el total de cada uno y el promedio por SCORM
```

Subtareas sugeridas: Backend, Frontend.

### HU-1303 · Rentabilidad y mediciones

Como gerente, quiero comparar el costo por SCORM hoy y con el generador usando horas medidas.

**CP-098 · Con mediciones**

```gherkin
Dado las horas reales de 2 proyectos
Cuando elijo fuente «mediciones»
Entonces el costo por SCORM y el margen usan esos promedios
```

Subtareas sugeridas: Backend, Frontend.

### HU-1304 · Proveedor por tarea

Como administrador, quiero cambiar el proveedor o modelo de cada tarea y probar la conexión.

**CP-099 · Cambio en caliente**

```gherkin
Dado voz en Google
Cuando cambio a ElevenLabs y pruebo
Entonces la siguiente narración usa ElevenLabs sin reiniciar
```

**CP-100 · Límite de gasto**

```gherkin
Dado un límite mensual alcanzado
Cuando llega un trabajo nuevo
Entonces se pausa y se avisa al administrador
```

Subtareas sugeridas: Backend, Frontend.

## E14 · Calidad transversal y seguridad

Accesibilidad, seguridad de archivos y datos, observabilidad y respaldo.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-1401 | Como participante con discapacidad, quiero usar la cápsula con teclado y lector de pantalla. | S6 | Alta | REQ-105 |
| HU-1402 | Como responsable, quiero que los archivos se verifiquen y que los textos del cliente no puedan cambiar las instrucciones de la IA. | S1 | Alta | REQ-107 |
| HU-1404 | Como responsable, quiero que los documentos del cliente estén cifrados y se borren solos después de la entrega, según el contrato. | S1 | Alta | REQ-061 |
| HU-1405 | Como responsable del producto, quiero un enlace estable de pruebas para revisar la demo de cada sprint. | S0 | Alta | REQ-061 |
| HU-1406 | Como gerente, quiero saber con qué proveedor y licencia se generó cada recurso y que la cápsula lo indique en los créditos. | S6 | Media | REQ-062 |
| HU-1403 | Como administrador, quiero ver errores por proveedor, colas pendientes y tener copias de seguridad diarias. | S10 | Media | — |

### HU-1401 · Accesibilidad de las cápsulas

Como participante con discapacidad, quiero usar la cápsula con teclado y lector de pantalla.

**CP-101 · Teclado**

```gherkin
Dado cualquier actividad
Cuando la hago solo con teclado
Entonces se puede completar con foco visible
```

Subtareas sugeridas: Frontend, Pruebas.

### HU-1402 · Seguridad de archivos y datos

Como responsable, quiero que los archivos se verifiquen y que los textos del cliente no puedan cambiar las instrucciones de la IA.

**CP-102 · Inyección en documento**

```gherkin
Dado un PDF con «ignora tus instrucciones»
Cuando se genera
Entonces la salida sigue el esquema y no obedece ese texto
```

Subtareas sugeridas: Backend, Pruebas.

### HU-1404 · Documentos cifrados y borrado programado

Como responsable, quiero que los documentos del cliente estén cifrados y se borren solos después de la entrega, según el contrato.

**CP-103 · Cifrado**

```gherkin
Dado un PDF subido
Cuando reviso el objeto en el almacenamiento
Entonces está cifrado con la clave KMS y solo se descarga con URL firmada de 15 minutos
```

**CP-104 · Borrado programado**

```gherkin
Dado un proyecto entregado de un cliente con retención de 180 días
Cuando pasan 180 días
Entonces se borran los documentos fuente, se conserva el curso y queda registro en Auditoría
```

Subtareas sugeridas: Backend, Infra, Pruebas.

### HU-1405 · Entorno de pruebas en la nube

Como responsable del producto, quiero un enlace estable de pruebas para revisar la demo de cada sprint.

**CP-105 · Despliegue**

```gherkin
Dado un cambio aprobado en main
Cuando termina la integración continua
Entonces se despliega en pruebas con HTTPS y sin secretos en el repositorio
```

Subtareas sugeridas: Infra.

### HU-1406 · Licencias y créditos de IA

Como gerente, quiero saber con qué proveedor y licencia se generó cada recurso y que la cápsula lo indique en los créditos.

**CP-106 · Registro**

```gherkin
Dado una ilustración generada
Cuando abro el recurso
Entonces veo proveedor, modelo y licencia
```

**CP-107 · Créditos**

```gherkin
Dado una cápsula exportada
Cuando abro los créditos
Entonces dice «Voz e ilustraciones generadas con IA y revisadas por AulasEducativas»
```

Subtareas sugeridas: Backend, Frontend.

### HU-1403 · Observabilidad y respaldo

Como administrador, quiero ver errores por proveedor, colas pendientes y tener copias de seguridad diarias.

**CP-108 · Restauración**

```gherkin
Dado una copia de la noche anterior
Cuando la restauro en un entorno de prueba
Entonces el sistema funciona con los datos de esa copia
```

Subtareas sugeridas: Infra.

## E15 · Sitio comercial y contenido

Sitio público multipágina administrable por el superadmin: páginas por bloques, contenido con orden y mostrar/ocultar, menú y pie, blog, SEO, SEO para IA, idiomas y ajustes.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-1501 | Como superadmin, quiero un rol de plataforma separado del administrador de cada organización y un menú «Sitio web», «Captación» y «Ventas» solo para mí, para gestionar el sitio sin dar ese acceso a los clientes. | S11 | Alta | REQ-064 |
| HU-1502 | Como superadmin, quiero crear páginas con ruta, idioma y estado (borrador, programada, publicada) para publicar el sitio por partes. | S11 | Alta | REQ-065 |
| HU-1503 | Como superadmin, quiero armar cada página con bloques que puedo ordenar, mostrar u ocultar, para cambiar el sitio sin programar. | S11 | Alta | REQ-066 |
| HU-1504 | Como superadmin, quiero administrar las cifras, testimonios, logos, funcionalidades, pasos, LMS y preguntas frecuentes con orden y mostrar/ocultar, para que todos los datos del sitio salgan del panel. | S11 | Alta | REQ-066 |
| HU-1505 | Como superadmin, quiero marcar datos como ficticios y que la publicación en producción se bloquee mientras haya alguno visible, para no publicar métricas o testimonios inventados. | S11 | Alta | REQ-067 |
| HU-1506 | Como superadmin, quiero el menú principal y el pie de página con enlaces que puedo ordenar, mostrar u ocultar, para controlar la navegación del sitio. | S11 | Media | REQ-066 |
| HU-1507 | Como superadmin, quiero vista previa en escritorio y celular con los cambios sin publicar, publicación con versiones y restauración, para revisar antes de que lo vea un cliente. | S11 | Alta | REQ-068 |
| HU-1508 | Como visitante, quiero que el sitio cargue rápido en el celular y sea accesible, para no abandonar antes de ver la propuesta. | S11 | Alta | REQ-109 |
| HU-1509 | Como superadmin, quiero ajustar dominio con SSL, marca, analítica, WhatsApp, correo de leads y modo mantenimiento, para operar el sitio sin ayuda técnica. | S11 | Media | REQ-073 |
| HU-1510 | Como superadmin, quiero el sitio en español e inglés con selector y hreflang, para atender a clientes de la región. | S12 | Media | REQ-069 |
| HU-1511 | Como visitante, quiero ver al final de cada página una sección con los artículos publicados en el WordPress de la empresa y filtrarlos por categoría, y como superadmin, quiero elegir qué categorías y artículos se muestran, para que el contenido se escriba solo en WordPress. | S12 | Media | REQ-070 |
| HU-1514 | Como superadmin, quiero crear landings por sector (minería, banca, retail, educación, sector público…) con su propia portada, testimonios del sector, preguntas y categoría inicial del blog, para hablarle a cada mercado con su lenguaje. | S11 | Alta | REQ-092 |
| HU-1512 | Como superadmin, quiero editar meta título, descripción, URL, canonical, indexación y datos estructurados por página, y gestionar sitemap, robots y redirecciones 301, para posicionar el sitio. | S12 | Alta | REQ-071 |
| HU-1513 | Como superadmin, quiero editar llms.txt, seguir preguntas objetivo por asistente de IA, permitir o bloquear rastreadores de IA y recibir propuestas de contenido, para que los asistentes citen el sitio. | S12 | Media | REQ-072 |

### HU-1501 · Rol superadmin y menú del sitio

Como superadmin, quiero un rol de plataforma separado del administrador de cada organización y un menú «Sitio web», «Captación» y «Ventas» solo para mí, para gestionar el sitio sin dar ese acceso a los clientes.

**CP-109 · Acceso del administrador de organización**

```gherkin
Dado un usuario con rol Administrador de una organización
Cuando pide GET /api/v1/sitio/paginas
Entonces recibe 403 y no ve el grupo «Sitio web» en la barra lateral
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1502 · Páginas con estados y programación

Como superadmin, quiero crear páginas con ruta, idioma y estado (borrador, programada, publicada) para publicar el sitio por partes.

**CP-110 · Borrador no visible**

```gherkin
Dado una página en estado Borrador
Cuando un visitante abre su ruta
Entonces el sitio responde 404 y la página no aparece en el sitemap
```

**CP-111 · Publicación programada**

```gherkin
Dado una página programada para las 09:00
Cuando llega la hora
Entonces queda publicada antes de las 09:01 y entra al sitemap
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1503 · Editor de página por bloques

Como superadmin, quiero armar cada página con bloques que puedo ordenar, mostrar u ocultar, para cambiar el sitio sin programar.

**CP-112 · Ocultar un bloque**

```gherkin
Dado el bloque Testimonios visible en Inicio
Cuando lo oculto y publico
Entonces Inicio deja de mostrarlo y el bloque sigue guardado con sus datos
```

**CP-113 · Reordenar**

```gherkin
Dado los bloques Cifras y Logos
Cuando muevo Logos arriba de Cifras y publico
Entonces el sitio los muestra en ese orden
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1504 · Contenido administrable con mostrar/ocultar

Como superadmin, quiero administrar las cifras, testimonios, logos, funcionalidades, pasos, LMS y preguntas frecuentes con orden y mostrar/ocultar, para que todos los datos del sitio salgan del panel.

**CP-114 · Testimonio oculto**

```gherkin
Dado un testimonio oculto
Cuando cualquier página que usa Testimonios se publica
Entonces ese testimonio no aparece en ninguna página
```

**CP-115 · Elemento nuevo**

```gherkin
Dado una cifra nueva agregada en Contenido
Cuando la guardo
Entonces queda oculta por defecto hasta que la active
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1505 · Datos ficticios y bloqueo de publicación

Como superadmin, quiero marcar datos como ficticios y que la publicación en producción se bloquee mientras haya alguno visible, para no publicar métricas o testimonios inventados.

**CP-116 · Bloqueo por ficticios**

```gherkin
Dado 2 testimonios ficticios visibles
Cuando publico en producción
Entonces recibo 409 con la lista de los 2 elementos y un botón «Ocultar todos los ficticios»
```

**CP-117 · Pruebas permitido**

```gherkin
Dado los mismos datos
Cuando publico en el entorno de pruebas
Entonces se publica y el panel muestra el aviso
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1506 · Menú y pie administrables

Como superadmin, quiero el menú principal y el pie de página con enlaces que puedo ordenar, mostrar u ocultar, para controlar la navegación del sitio.

**CP-118 · Enlace oculto**

```gherkin
Dado el enlace «Casos» oculto
Cuando se publica
Entonces no aparece en la cabecera ni en el menú de celular
```

Subtareas sugeridas: Backend, Frontend.

### HU-1507 · Vista previa, versiones y restauración

Como superadmin, quiero vista previa en escritorio y celular con los cambios sin publicar, publicación con versiones y restauración, para revisar antes de que lo vea un cliente.

**CP-119 · Restaurar versión**

```gherkin
Dado 3 publicaciones de Inicio
Cuando restauro la versión 1
Entonces el sitio queda igual a la versión 1 y se crea la versión 4
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1508 · Sitio público rápido y accesible

Como visitante, quiero que el sitio cargue rápido en el celular y sea accesible, para no abandonar antes de ver la propuesta.

**CP-120 · Rendimiento**

```gherkin
Dado el inicio publicado
Cuando lo mido con Lighthouse en celular
Entonces LCP < 2.5 s, SEO ≥ 90 y accesibilidad ≥ 90
```

Subtareas sugeridas: Infra, Frontend, Pruebas.

### HU-1509 · Ajustes del sitio

Como superadmin, quiero ajustar dominio con SSL, marca, analítica, WhatsApp, correo de leads y modo mantenimiento, para operar el sitio sin ayuda técnica.

**CP-121 · Mantenimiento**

```gherkin
Dado el modo mantenimiento activo
Cuando un visitante abre cualquier ruta
Entonces ve la página de aviso con código 503 y el superadmin sigue viendo el sitio
```

Subtareas sugeridas: Backend, Frontend.

### HU-1510 · Sitio en español e inglés

Como superadmin, quiero el sitio en español e inglés con selector y hreflang, para atender a clientes de la región.

**CP-122 · Página sin traducción**

```gherkin
Dado Precios publicada en ES y en borrador en EN
Cuando un visitante cambia a EN
Entonces va a /en y no a una página EN en borrador; hreflang solo enlaza versiones publicadas
```

Subtareas sugeridas: Backend, Frontend.

### HU-1511 · Sección Blog desde WordPress con filtro por categoría

Como visitante, quiero ver al final de cada página una sección con los artículos publicados en el WordPress de la empresa y filtrarlos por categoría, y como superadmin, quiero elegir qué categorías y artículos se muestran, para que el contenido se escriba solo en WordPress.

**CP-123 · Filtro por categoría**

```gherkin
Dado 7 artículos visibles, 2 de la categoría Guías
Cuando el visitante elige Guías en la sección Blog
Entonces ve solo esos 2 y cada filtro muestra su número de artículos
```

**CP-154 · Sincronización**

```gherkin
Dado un artículo recién publicado en WordPress
Cuando pasa la siguiente sincronización (15 min como máximo)
Entonces aparece en la sección Blog; los borradores y artículos privados nunca aparecen
```

**CP-155 · Categoría oculta**

```gherkin
Dado la categoría Noticias internas oculta en el panel
Cuando un visitante abre cualquier página con la sección Blog
Entonces no ve ese filtro ni sus artículos, tampoco en «Últimos artículos» del pie
```

**CP-156 · WordPress sin responder**

```gherkin
Dado WordPress caído
Cuando un visitante abre una página con la sección Blog
Entonces ve la última copia sincronizada y el panel muestra el error de conexión
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1514 · Landings por sector

Como superadmin, quiero crear landings por sector (minería, banca, retail, educación, sector público…) con su propia portada, testimonios del sector, preguntas y categoría inicial del blog, para hablarle a cada mercado con su lenguaje.

**CP-157 · Testimonios del sector**

```gherkin
Dado la landing de Minería y energía y 2 testimonios marcados con ese sector
Cuando un visitante la abre
Entonces ve solo esos 2 testimonios; si el sector no tuviera testimonios, vería todos los visibles
```

**CP-158 · Landing en borrador**

```gherkin
Dado la landing de Sector público en borrador
Cuando un visitante abre el inicio
Entonces no aparece en el bloque «Sectores» ni en la columna «Sectores» del pie, y su ruta responde 404
```

**CP-159 · Categoría inicial del blog**

```gherkin
Dado la landing de Banca y seguros con categoría inicial Estándares
Cuando un visitante la abre
Entonces la sección Blog aparece filtrada por Estándares y puede cambiar a «Todas»
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1512 · SEO técnico

Como superadmin, quiero editar meta título, descripción, URL, canonical, indexación y datos estructurados por página, y gestionar sitemap, robots y redirecciones 301, para posicionar el sitio.

**CP-124 · Redirección**

```gherkin
Dado la redirección /planes → /precios activa
Cuando un visitante abre /planes
Entonces recibe 301 a /precios
```

**CP-125 · No indexar**

```gherkin
Dado una página con «Indexar» apagado
Cuando se publica
Entonces lleva meta robots noindex y no entra al sitemap
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1513 · SEO para IA

Como superadmin, quiero editar llms.txt, seguir preguntas objetivo por asistente de IA, permitir o bloquear rastreadores de IA y recibir propuestas de contenido, para que los asistentes citen el sitio.

**CP-126 · Rastreador bloqueado**

```gherkin
Dado GPTBot bloqueado
Cuando se publica
Entonces robots.txt incluye Disallow para GPTBot
```

**CP-127 · Propuesta revisable**

```gherkin
Dado las preguntas objetivo cargadas
Cuando pido propuestas a la IA
Entonces llegan como borradores de página y nada se publica sin aprobación
```

Subtareas sugeridas: Backend, Frontend, IA.

## E16 · Captación y CRM

Popups, chatbot, agendamiento de demos, leads con origen y UTM, integración con CRM, consentimiento de cookies y resumen del sitio.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-1601 | Como superadmin, quiero que cada lead guarde origen, página de entrada y UTM, venga de un formulario, popup, chatbot, agendador o suscripción, para saber qué canal funciona. | S12 | Alta | REQ-074 |
| HU-1602 | Como superadmin, quiero enviar los leads a HubSpot, Pipedrive, Zoho o a un webhook firmado, con mapeo de campos y reintentos, para que ventas trabaje en su CRM. | S12 | Alta | REQ-075 |
| HU-1603 | Como superadmin, quiero crear popups (modal, deslizable o barra) con disparador, páginas, frecuencia y resultado, para captar contactos sin molestar. | S12 | Media | REQ-076 |
| HU-1604 | Como visitante, quiero un chat que responda con la información del sitio, me ofrezca agendar una demo y me pase a una persona, para resolver dudas sin esperar. | S12 | Media | REQ-077 |
| HU-1605 | Como visitante, quiero agendar una demo eligiendo día y hora en horario de Lima y recibir la invitación y recordatorios, para no coordinar por correo. | S12 | Alta | REQ-078 |
| HU-1606 | Como visitante, quiero aceptar o rechazar cookies por categoría, y como responsable, quiero que las etiquetas de analítica solo se carguen con consentimiento, para cumplir la Ley 29733. | S12 | Alta | REQ-079 |
| HU-1607 | Como superadmin, quiero un resumen con visitas, leads, demos, suscripciones nuevas y origen de los leads, para decidir dónde invertir. | S12 | Media | REQ-080 |

### HU-1601 · Leads con origen y UTM

Como superadmin, quiero que cada lead guarde origen, página de entrada y UTM, venga de un formulario, popup, chatbot, agendador o suscripción, para saber qué canal funciona.

**CP-128 · Origen y UTM**

```gherkin
Dado un visitante que llegó con utm_source=linkedin
Cuando deja su correo en el popup
Entonces tiene origen Popup, la página de entrada y utm linkedin
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1602 · Integración con CRM

Como superadmin, quiero enviar los leads a HubSpot, Pipedrive, Zoho o a un webhook firmado, con mapeo de campos y reintentos, para que ventas trabaje en su CRM.

**CP-129 · Reintento**

```gherkin
Dado el CRM caído (responde 500)
Cuando se envía un lead
Entonces se reintenta 3 veces con espera creciente y queda «Error» con el motivo si no entra
```

**CP-130 · Webhook firmado**

```gherkin
Dado un webhook configurado
Cuando se envía un lead
Entonces la petición lleva firma HMAC verificable con la clave del panel
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1603 · Popups

Como superadmin, quiero crear popups (modal, deslizable o barra) con disparador, páginas, frecuencia y resultado, para captar contactos sin molestar.

**CP-131 · Frecuencia**

```gherkin
Dado un popup de salida ya mostrado a un visitante
Cuando vuelve en menos de 7 días
Entonces no se le muestra otra vez
```

**CP-132 · Popup inactivo**

```gherkin
Dado un popup apagado
Cuando un visitante cumple su disparador
Entonces no se muestra
```

Subtareas sugeridas: Backend, Frontend.

### HU-1604 · Chatbot del sitio

Como visitante, quiero un chat que responda con la información del sitio, me ofrezca agendar una demo y me pase a una persona, para resolver dudas sin esperar.

**CP-133 · Fuera de la base**

```gherkin
Dado una pregunta que no está en la base de conocimiento
Cuando el visitante la hace
Entonces el chat no inventa: ofrece agendar o pasar a una persona
```

**CP-134 · Agendar en el chat**

```gherkin
Dado un horario elegido en el chat
Cuando el visitante confirma con su correo
Entonces la cita aparece en Agendamiento y el lead tiene origen Chatbot
```

Subtareas sugeridas: Backend, Frontend, IA, Pruebas.

### HU-1605 · Agendamiento de demos

Como visitante, quiero agendar una demo eligiendo día y hora en horario de Lima y recibir la invitación y recordatorios, para no coordinar por correo.

**CP-135 · Horario ocupado**

```gherkin
Dado una franja ya tomada en el calendario del asesor
Cuando otro visitante abre el agendador
Entonces esa franja no aparece
```

**CP-136 · Invitación**

```gherkin
Dado una demo confirmada
Cuando termina el agendamiento
Entonces el visitante recibe invitación con enlace de videollamada y recordatorios a las 24 h y 1 h
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1606 · Consentimiento de cookies

Como visitante, quiero aceptar o rechazar cookies por categoría, y como responsable, quiero que las etiquetas de analítica solo se carguen con consentimiento, para cumplir la Ley 29733.

**CP-137 · Rechazo**

```gherkin
Dado un visitante que rechazó las cookies de analítica
Cuando navega el sitio
Entonces no se carga GA4, Tag Manager ni Meta Pixel
```

Subtareas sugeridas: Frontend, Pruebas.

### HU-1607 · Resumen del sitio

Como superadmin, quiero un resumen con visitas, leads, demos, suscripciones nuevas y origen de los leads, para decidir dónde invertir.

**CP-138 · Cifras consistentes**

```gherkin
Dado 10 leads del período en la tabla de leads
Cuando abro el Resumen
Entonces el indicador Leads muestra 10 y el reparto por origen suma 100 %
```

Subtareas sugeridas: Backend, Frontend.

## E17 · Planes, suscripciones y facturación

Organizaciones (multi-tenant), planes administrables, alta de suscripción, pasarelas, cuotas, comprobantes electrónicos SUNAT, cobranza, cupones y panel de ingresos.

| ID | Historia | Sprint | Prioridad | Requisitos |
| --- | --- | --- | --- | --- |
| HU-1701 | Como responsable de la plataforma, quiero organizaciones aisladas entre sí, cada una con sus usuarios, clientes, kits y proyectos, para vender Aptio SCORM a otras productoras. | S13 | Alta | REQ-081 |
| HU-1702 | Como superadmin, quiero administrar los planes (precio mensual y anual, cuota de cápsulas, usuarios, cápsula adicional, características visibles y plan destacado), para cambiar la oferta sin programar. | S13 | Alta | REQ-082 |
| HU-1703 | Como visitante, quiero suscribirme desde /precios en tres pasos (empresa, resumen con IGV, pago) y entrar a mi organización nueva, para empezar sin hablar con ventas. | S13 | Alta | REQ-083 |
| HU-1704 | Como responsable de la plataforma, quiero cobrar con pasarelas intercambiables en soles y dólares, confirmando el pago solo por webhook firmado e idempotente y sin guardar datos de tarjeta, para cobrar con seguridad. | S13 | Alta | REQ-084, REQ-110 |
| HU-1705 | Como organización, quiero ver mi cuota de cápsulas del mes y comprar adicionales, sin que se bloquee una cápsula que ya está en revisión, para no frenar entregas. | S13 | Alta | REQ-085 |
| HU-1706 | Como organización, quiero cambiar de plan con prorrateo y cancelar al fin del período, para ajustar el gasto. | S13 | Media | REQ-086 |
| HU-1707 | Como responsable de facturación, quiero que cada cobro emita su factura o boleta electrónica (y notas de crédito) por un OSE/PSE, con estado SUNAT, PDF, XML y reenvío, para cumplir con SUNAT sin trabajo manual. | S14 | Alta | REQ-087 |
| HU-1708 | Como responsable de la plataforma, quiero reintentos de cobro, avisos y suspensión a solo lectura cuando un pago falla, para recuperar ingresos sin cortar el trabajo de golpe. | S14 | Alta | REQ-088 |
| HU-1709 | Como superadmin, quiero crear cupones y convenios con vigencia y límite de usos, para campañas y alianzas con universidades. | S14 | Baja | REQ-089 |
| HU-1710 | Como gerente, quiero ver el ingreso mensual recurrente, la cancelación y el ingreso promedio por cliente, para seguir el negocio. | S14 | Media | REQ-090 |
| HU-1711 | Como administrador de una organización, quiero ver mi plan, consumo, comprobantes y medio de pago, y actualizar mis datos de facturación, para no escribir a soporte. | S14 | Media | REQ-091 |

### HU-1701 · Organizaciones (multi-tenant)

Como responsable de la plataforma, quiero organizaciones aisladas entre sí, cada una con sus usuarios, clientes, kits y proyectos, para vender Aptio SCORM a otras productoras.

**CP-139 · Aislamiento**

```gherkin
Dado dos organizaciones con proyectos
Cuando un usuario de la primera pide un proyecto de la segunda por su id
Entonces recibe 404 y queda registrado en auditoría
```

**CP-140 · Migración**

```gherkin
Dado los datos actuales de AulasEducativas
Cuando se aplica la migración
Entonces quedan en la organización «AulasEducativas» sin pérdida
```

Subtareas sugeridas: Infra, Backend, Pruebas.

### HU-1702 · Planes administrables

Como superadmin, quiero administrar los planes (precio mensual y anual, cuota de cápsulas, usuarios, cápsula adicional, características visibles y plan destacado), para cambiar la oferta sin programar.

**CP-141 · Precio en el sitio**

```gherkin
Dado el plan Productora con precio nuevo de S/ 1,390
Cuando publico el cambio
Entonces /precios y el resumen del pago muestran S/ 1,390; las suscripciones vigentes mantienen su precio hasta renovar
```

**CP-142 · Plan oculto**

```gherkin
Dado el plan Inicial oculto
Cuando un visitante abre /precios
Entonces no lo ve y no puede comprarlo por URL
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1703 · Alta de suscripción desde /precios

Como visitante, quiero suscribirme desde /precios en tres pasos (empresa, resumen con IGV, pago) y entrar a mi organización nueva, para empezar sin hablar con ventas.

**CP-143 · Alta completa**

```gherkin
Dado un pago aprobado
Cuando termina el paso 3
Entonces se crea la organización, el usuario administrador y la suscripción activa, y llega el correo de bienvenida
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1704 · Pasarelas de pago y webhooks

Como responsable de la plataforma, quiero cobrar con pasarelas intercambiables en soles y dólares, confirmando el pago solo por webhook firmado e idempotente y sin guardar datos de tarjeta, para cobrar con seguridad.

**CP-144 · Webhook repetido**

```gherkin
Dado un mismo evento de pago enviado dos veces por la pasarela
Cuando se procesan
Entonces se registra un solo cobro y un solo comprobante
```

**CP-145 · Firma inválida**

```gherkin
Dado un webhook con firma incorrecta
Cuando llega
Entonces se rechaza con 401 y no cambia ninguna suscripción
```

Subtareas sugeridas: Infra, Backend, Pruebas.

### HU-1705 · Cuotas de cápsulas

Como organización, quiero ver mi cuota de cápsulas del mes y comprar adicionales, sin que se bloquee una cápsula que ya está en revisión, para no frenar entregas.

**CP-146 · Cuota agotada**

```gherkin
Dado 20 de 20 cápsulas usadas
Cuando intento crear una cápsula nueva
Entonces se ofrece comprar una adicional o subir de plan; las cápsulas en revisión siguen editables
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1706 · Cambio de plan y cancelación

Como organización, quiero cambiar de plan con prorrateo y cancelar al fin del período, para ajustar el gasto.

**CP-147 · Prorrateo**

```gherkin
Dado un cambio de Inicial a Productora a mitad del mes
Cuando se confirma
Entonces se cobra la diferencia proporcional y la cuota nueva rige de inmediato
```

Subtareas sugeridas: Backend, Frontend.

### HU-1707 · Comprobantes electrónicos SUNAT

Como responsable de facturación, quiero que cada cobro emita su factura o boleta electrónica (y notas de crédito) por un OSE/PSE, con estado SUNAT, PDF, XML y reenvío, para cumplir con SUNAT sin trabajo manual.

**CP-148 · Factura con RUC**

```gherkin
Dado un cobro aprobado a una organización con RUC
Cuando se emite
Entonces sale una factura de la serie F001 aceptada en el ambiente de pruebas, con PDF y XML enviados al correo de facturación
```

**CP-149 · Rechazo del OSE**

```gherkin
Dado un comprobante observado por el OSE
Cuando llega la respuesta
Entonces queda «Observado» con el motivo y se puede corregir y reenviar
```

Subtareas sugeridas: Backend, Frontend, Pruebas, Documentación.

### HU-1708 · Cobranza y suspensión

Como responsable de la plataforma, quiero reintentos de cobro, avisos y suspensión a solo lectura cuando un pago falla, para recuperar ingresos sin cortar el trabajo de golpe.

**CP-150 · Suspensión**

```gherkin
Dado 3 reintentos fallidos
Cuando pasa el día 10
Entonces la organización queda en solo lectura, puede exportar lo entregado y ve cómo regularizar
```

Subtareas sugeridas: Backend, Frontend, Pruebas.

### HU-1709 · Cupones y convenios

Como superadmin, quiero crear cupones y convenios con vigencia y límite de usos, para campañas y alianzas con universidades.

**CP-151 · Cupón vencido**

```gherkin
Dado un cupón vencido
Cuando se aplica en el pago
Entonces se rechaza con el motivo y el total no cambia
```

Subtareas sugeridas: Backend, Frontend.

### HU-1710 · Panel de ingresos

Como gerente, quiero ver el ingreso mensual recurrente, la cancelación y el ingreso promedio por cliente, para seguir el negocio.

**CP-152 · Ingreso recurrente**

```gherkin
Dado suscripciones activas por S/ 13,834 al mes
Cuando abro Planes
Entonces el indicador muestra S/ 13,834 y excluye las canceladas y suspendidas
```

Subtareas sugeridas: Backend, Frontend.

### HU-1711 · Portal de facturación de la organización

Como administrador de una organización, quiero ver mi plan, consumo, comprobantes y medio de pago, y actualizar mis datos de facturación, para no escribir a soporte.

**CP-153 · Descarga de comprobantes**

```gherkin
Dado 3 comprobantes emitidos
Cuando abro Facturación en mi organización
Entonces descargo PDF y XML de cada uno y no veo los de otras organizaciones
```

Subtareas sugeridas: Backend, Frontend.

## Trazabilidad requisito → historia

| Requisito | Historias |
| --- | --- |
| REQ-001 | HU-0201, HU-0301 |
| REQ-002 | HU-0202 |
| REQ-003 | HU-0202 |
| REQ-004 | HU-0303 |
| REQ-006 | HU-0304 |
| REQ-007 | HU-0402 |
| REQ-008 | HU-0402 |
| REQ-009 | HU-0403, HU-0404 |
| REQ-010 | HU-0402, HU-0501 |
| REQ-011 | HU-0502 |
| REQ-013 | HU-0607 |
| REQ-016 | HU-0407 |
| REQ-017 | HU-0609 |
| REQ-019 | HU-0203 |
| REQ-020 | HU-0203 |
| REQ-021 | HU-0701, HU-0703 |
| REQ-022 | HU-0702 |
| REQ-023 | HU-0704 |
| REQ-024 | HU-0704 |
| REQ-025 | HU-0801 |
| REQ-026 | HU-0305, HU-0901, HU-0902 |
| REQ-027 | HU-0903 |
| REQ-028 | HU-0205, HU-0802 |
| REQ-029 | HU-0803 |
| REQ-030 | HU-0501, HU-1102 |
| REQ-032 | HU-1203 |
| REQ-033 | HU-1202 |
| REQ-034 | HU-0804 |
| REQ-035 | HU-0505, HU-1201 |
| REQ-036 | HU-1205 |
| REQ-037 | HU-1301, HU-1302 |
| REQ-038 | HU-0405, HU-0504 |
| REQ-039 | HU-1202, HU-1204 |
| REQ-040 | HU-1201 |
| REQ-041 | HU-1105 |
| REQ-042 | HU-1001, HU-1002 |
| REQ-043 | HU-0302 |
| REQ-044 | HU-0302 |
| REQ-045 | HU-0601, HU-0602, HU-0606, HU-0608, HU-0610 |
| REQ-046 | HU-0609 |
| REQ-047 | HU-1103 |
| REQ-048 | HU-1104 |
| REQ-049 | HU-0401, HU-0408 |
| REQ-050 | HU-0204, HU-0406 |
| REQ-051 | HU-0503 |
| REQ-052 | HU-0502, HU-0504, HU-0605 |
| REQ-053 | HU-0603, HU-0604 |
| REQ-054 | HU-0607 |
| REQ-055 | HU-1102 |
| REQ-056 | HU-1303 |
| REQ-057 | HU-1304 |
| REQ-058 | HU-0506 |
| REQ-059 | HU-0608 |
| REQ-060 | HU-0108, HU-0109 |
| REQ-061 | HU-1404, HU-1405 |
| REQ-062 | HU-1406 |
| REQ-063 | HU-0110 |
| REQ-101 | HU-0102, HU-0405 |
| REQ-103 | HU-0105 |
| REQ-104 | HU-1101 |
| REQ-105 | HU-0505, HU-1401 |
| REQ-107 | HU-0104, HU-0109, HU-1402 |
| REQ-108 | HU-0101 |
| REQ-064 | HU-1501 |
| REQ-065 | HU-1502 |
| REQ-066 | HU-1503, HU-1504, HU-1506 |
| REQ-067 | HU-1505 |
| REQ-068 | HU-1507 |
| REQ-069 | HU-1510 |
| REQ-070 | HU-1511 |
| REQ-071 | HU-1512 |
| REQ-072 | HU-1513 |
| REQ-073 | HU-1509 |
| REQ-074 | HU-1601 |
| REQ-075 | HU-1602 |
| REQ-076 | HU-1603 |
| REQ-077 | HU-1604 |
| REQ-078 | HU-1605 |
| REQ-079 | HU-1606 |
| REQ-080 | HU-1607 |
| REQ-081 | HU-1701 |
| REQ-082 | HU-1702 |
| REQ-083 | HU-1703 |
| REQ-084 | HU-1704 |
| REQ-085 | HU-1705 |
| REQ-086 | HU-1706 |
| REQ-087 | HU-1707 |
| REQ-088 | HU-1708 |
| REQ-089 | HU-1709 |
| REQ-090 | HU-1710 |
| REQ-091 | HU-1711 |
| REQ-092 | HU-1514 |
| REQ-109 | HU-1508 |
| REQ-110 | HU-1704 |
