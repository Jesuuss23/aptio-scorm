# Estado del proyecto

Última actualización: 2026-11-09 · Fase actual: **Sprint S0 en curso** (monorepo inicial levantado; especificación incorporada al repositorio).

## Decisiones aprobadas

Las de `CLAUDE.md` (stack Node.js, Claude como IA de texto, reproductor único, JSON como fuente de verdad, lip sync en navegador, Google TTS por defecto (ADR-008), generador primero (ADR-008), español/inglés como capas, SCORM 1.2 con un solo SCO por defecto, celular primero).

## Supuestos vigentes

| ID | Supuesto | Quién lo valida |
| --- | --- | --- |
| SUP-01 | Tiempo del participante por pantalla: contenido 1.0 min, interactiva 1.5 min, evaluación 1.0 min. | Diseñador instruccional líder con casos reales |
| SUP-02 | Horas de producción por pantalla hoy: 1.3 h (contenido/evaluación) y 3.7 h (interactiva), derivadas de Chapman Alliance 2010. | Diseñador instruccional líder con horas reales |
| SUP-03 | Segundo idioma: +30 % de producción. | Primeros proyectos bilingües |
| SUP-04 | Sin tamaño máximo fijo; el validador advierte según el límite de subida del LMS destino o el que indique el cliente. | Ficha de compatibilidad de cada cliente |
| SUP-05 | La voz de Google en español da una boca aceptable con el reconocedor fonético. | Prueba técnica PT-01 |
| SUP-06 | Rhubarb Lip Sync (reconocedor fonético) da calidad aceptable en español. | Prueba técnica PT-01 |
| SUP-07 | La generación de imágenes mantiene un estilo consistente con el kit del cliente. | Prueba técnica PT-02 |
| SUP-08 | En local, el almacenamiento S3 se emula con LocalStack 3.8.0 en el puerto 9000 en lugar de MinIO (la edición comunitaria de MinIO se archivó). En la nube se usa S3 real. | Ingeniero a cargo, al montar el entorno de pruebas (HU-1405) |

## Cambios recientes

- **Inicio del S0 (2026-11-09):** se incorpora la especificación al repositorio (`CLAUDE.md`, `docs/`, `jira/`, `.claude/commands/`) y `pnpm ia:casos` y `pnpm schema:test` quedan en verde. Decisiones confirmadas por el responsable del producto:
  - La API se migra de Express a **NestJS** (ADR-001) con módulos, DTOs, guardas y OpenAPI (HU-0101).
  - **JSON Schema v0.2 + Ajv** es la única fuente del modelo del curso en `packages/schema`, con tipos TypeScript generados; se retira el esquema Zod provisional (HU-0102).
  - **LocalStack** reemplaza a MinIO en local (SUP-08).
  - DA-01, DA-02 y DA-04 quedan resueltas (ver «Decisiones resueltas»).
  - La multi-organización (`organizacionId`, ADR-012) se adelanta al S0 y se fusiona con el esquema Prisma completo en `packages/db` (HU-0103).
  - Ramas `feat/HU-####-nombre`, un PR por historia contra `main`, Conventional Commits.

- **Fase comercial (2026-11-03):** se suman el sitio comercial y el panel superadmin (ADR-011), y la multi-organización con planes y facturación electrónica (ADR-012, reemplaza la decisión 13). Se revisaron las 21 pantallas de Stitch y se rehicieron con el sistema visual en `docs/diseno/sitio-comercial.html`, con datos ficticios que se pueden ocultar. Nuevos: `docs/23-sitio-comercial-y-facturacion.md`, módulos M16–M18, épicas E15–E17 (32 historias, CP-109 a CP-159), sprints S11–S14, REQ-064 a REQ-092, REQ-109, REQ-110 y PNT-24 a PNT-40. Jira actualizado: 17 épicas, 110 historias y 240 subtareas. El blog vive en WordPress y se muestra como sección al final de las páginas, con filtro por categoría. El panel crea landings por sector (HU-1514, REQ-092).

- **Cambio de enfoque (ADR-008):** el producto pasa a ser un generador de SCORM completos desde el material del cliente, con revisión pantalla por pantalla y regeneración en cascada. El editor visual queda para retoques. Voz con Google TTS por defecto. Construir depende del piloto (`docs/11-medicion-y-piloto.md`). Referencia de negocio: hoy ~15 días y S/ 4.500 por SCORM; la competencia, S/ 1.500 y más de 5 SCORM en el mismo tiempo. Prototipo de referencia: `docs/diseno/prototipo-unificado.html`. Une el generador, el editor y los módulos del primer prototipo sobre las mismas pantallas. El primer prototipo se retiró; solo existe el unificado.

- El brief deja de ser obligatorio: un proyecto se crea solo con el nombre y se empieza a editar de inmediato (PNT-03, REQ-043, REQ-044).
- El editor se rediseña con criterios de Canva/Genially: riel con galerías, barra contextual, doble clic para escribir, tira de pantallas, barra de IA y opciones avanzadas plegadas (PNT-06, REQ-045, REQ-046). El prototipo HTML lo muestra funcionando.
- **Auditoría visual** (`docs/22-auditoria-prototipo.md`): el contenido queda alineado a 32 px de la barra lateral (antes 176 px en pantallas anchas). La escala baja de 16 a 6 tamaños de letra. Las cabeceras quedan uniformes (el h1 es el nombre de la vista). Nueva historia HU-0110 (sistema visual en `packages/ui`, S0) y REQ-063.
- **Desarrollo con Claude Code:** guía en `docs/prompts/README.md` y comandos del equipo en `.claude/commands/`.
- **Nombre y marca:** el producto se llama **Aptio SCORM**. Sistema visual con cobalto, naranja para la marca y la IA, y verde azulado para lo validado; Plus Jakarta Sans. Se tomó como base la propuesta de Stitch, corregida y aplicada al prototipo (ver `docs/diseno/DESIGN.md`).
- Para el traspaso se agregan:
  - los **prompts v1** de las 18 tareas de IA con sus esquemas de salida (`packages/ai/prompts`, `packages/ai/esquemas`);
  - el **caso de referencia LOTO** con la salida esperada de cada etapa y el curso esperado, todo validado (`packages/ai/casos/loto`);
  - la **guía para diseñadores** (`docs/20-guia-diseno.md`);
  - la **lista de arranque del S0** (`docs/21-arranque-s0.md`);
  - la revisión de **licencias de proveedores** (`docs/19-proveedores-y-licencias.md`).
- Decisiones nuevas: ADR-009 (nube, acceso y cifrado) y ADR-010 (licencias). Se corrige el esquema del curso: la voz acepta el proveedor `google`.
- El editor suma una **línea de tiempo** visible bajo el lienzo, al estilo Storyline. Tiene narración palabra por palabra, subtítulos, boca de Ana y una barra arrastrable por elemento (entrada y salida). Incluye aguja, reproducir, imán a palabras y «✦ Sincronizar con la voz». HU-0608 pasa al S5 con prioridad Alta; los disparadores quedan en HU-0610 (S8). El esquema agrega `finS` y `anclaPalabra` a `ajustes` (REQ-059, RN-06-7 a RN-06-9).

- La navegación del participante pasa de un único patrón a un catálogo de 7 patrones más patrones personalizados por configuración, recomendados o creados con IA; las reglas (libre, obligatorias, secuencial) se mantienen aparte (PNT-17, REQ-047, REQ-048). El esquema agrega `navegacion` (opcional).

## Decisiones resueltas

- **DA-01** (ORM): Prisma, con el esquema completo en `packages/db` y `organizacionId` en todas las tablas de datos (2026-11-09).
- **DA-02** (animación): CSS/Web Animations y SVG para el catálogo y el personaje; Lottie solo para piezas complejas subidas por el diseñador (2026-11-09).
- **DA-04** (reproductor): Preact, por peso reducido en el paquete (2026-11-09).

- **DA-05** (dónde se instala): en la nube, con entornos de pruebas y producción. Recomendado AWS São Paulo; el proveedor se confirma en el S0 (ADR-009).
- **Acceso:** correo y clave, con ingreso por Google opcional solo para correos invitados (ADR-009).
- **Documentos del cliente:** cifrados en tránsito y en reposo, con borrado programado tras la entrega (ADR-009).
- **Proveedores de IA:** solo planes con uso comercial; recomendaciones por tarea en `docs/19-proveedores-y-licencias.md` (ADR-010).
- **DA-07** (modelo del modo libre): resuelta en el esquema v0.2 con `disposicion`, `ajustes` y `extras` por pantalla, en unidades relativas al ancho de la pantalla (ver `docs/04-modelo-contenido/README.md`).

## Decisiones abiertas

| ID | Decisión | Recomendación inicial |
| --- | --- | --- |
| DA-03 | Proveedor de generación de imágenes | Recraft API (SVG nativo, sin entrenamiento con nuestros datos); Adobe Firefly si el cliente exige indemnización. Confirmar con PT-02 (ver `docs/19-proveedores-y-licencias.md`) |
| DA-06 | Versiones exactas de LMS para pruebas | Moodle 4.5 y la última estable; Blackboard, Chamilo y Canvas según cuentas de prueba disponibles |
| DA-08 | Cómo se sirve el sitio público | HTML pre-renderizado con React en el worker, en el bucket detrás de CDN |
| DA-09 | Proveedor OSE/PSE para comprobantes SUNAT | Comparar al menos 3 con API REST y ambiente de pruebas antes del S14 |
| DA-10 | Pasarela principal en soles | Con tokenización, cobros recurrentes y Yape; Stripe para USD |
| DA-11 | CRM principal del equipo comercial | El que usa hoy ventas; webhook firmado para los demás |
| DA-12 | Precios definitivos de los planes | Validar con el piloto (S6) y la medición de costos (S10) |
| DA-13 | WordPress del blog en subdominio o en subcarpeta /blog | Subcarpeta /blog con proxy inverso, para sumar la autoridad del dominio principal |

## Pendientes

- El ingeniero a cargo define equipo, plazos y estimación del backlog.
- Reunir 3–5 proyectos reales con horas por pantalla para calibrar SUP-01 a SUP-03.
- Diseño gráfico: 2 estilos base, 1 personaje con capas nombradas y bocas, y el kit del primer cliente (ver `docs/20-guia-diseno.md`).
- Ejecutar las pruebas técnicas PT-01 a PT-04.
- Cuentas, accesos y límites de gasto: lista completa en `docs/21-arranque-s0.md`.
- Confirmar con cada proveedor lo marcado como pendiente en `docs/19-proveedores-y-licencias.md`.
- Fase comercial: aprobar ADR-011 y ADR-012; validar precios de los planes (DA-12) y la detracción con el contador; reemplazar cada cifra y testimonio ficticio por uno real con autorización escrita del cliente.

## Siguiente paso

1. El responsable del producto y el ingeniero completan la lista de arranque (`docs/21-arranque-s0.md`): cuentas, accesos, límites de gasto y quién aprueba.
2. El ingeniero a cargo revisa el paquete, importa `jira/jira-import.csv` y completa estimaciones, responsables y fechas.
3. En paralelo, el equipo gráfico prepara a Ana y los estilos según `docs/20-guia-diseno.md` (los necesita la prueba PT-01 del S0 y el S4).
4. Sprint S0 (`docs/18-plan-sprints.md`): entorno, esquema, base de datos, sesión y pruebas técnicas PT-01 a PT-03.
5. En paralelo, el responsable del producto mide 2 proyectos con la tabla de `docs/11-medicion-y-piloto.md` (campos en blanco).
6. Al cerrar cada sprint, demo en el entorno de pruebas y observaciones en Jira. Piloto al cerrar S6.
