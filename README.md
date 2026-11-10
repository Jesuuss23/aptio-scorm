# Aptio SCORM · generador de SCORM con IA

**Aptio SCORM** es el nombre del producto. Paquete de traspaso al área de desarrollo. Contiene la especificación funcional y técnica completa para construir el **generador de SCORM con IA**: modelo de datos, API, módulos, flujos, historias con casos de prueba, guía de desarrollo, plan de sprints S0–S10 (con exportación SCORM 1.2 y piloto en S6) y archivo de Jira. Referencia visual: `docs/diseno/prototipo-unificado.html`. **Fase comercial** (sitio, panel superadmin, captación, planes y facturación): empieza por `TRASPASO-FASE-COMERCIAL.md`. Incluye los prompts de IA listos, un caso de referencia completo y la lista de arranque.

El equipo, los plazos y la estimación los define el ingeniero a cargo; este paquete no fija fechas ni tamaño de equipo.

## Manuales

| Manual | Para quién |
| --- | --- |
| [`MANUAL-USUARIO.md`](MANUAL-USUARIO.md) | El equipo y el cliente: cómo usar cada pantalla, sin términos técnicos. |
| [`MANUAL-PROGRAMADOR.md`](MANUAL-PROGRAMADOR.md) | Desarrollo: entorno, estructura, patrones y cómo extender. |
| [`MANUAL-SISTEMA.md`](MANUAL-SISTEMA.md) | Ingeniería e infraestructura: arquitectura, flujos, seguridad, proveedores y operación. |

Se actualizan al cerrar cada entrega.

## Orden de lectura

| # | Archivo | Para qué sirve |
| --- | --- | --- |
| 1 | `CLAUDE.md` | Contexto, decisiones tomadas y reglas. Claude Code lo lee solo en cada sesión. |
| 2 | `docs/ESTADO.md` | Estado actual del proyecto, supuestos y pendientes. |
| 3 | `docs/00-vision-y-alcance.md` | Problema, usuarios, alcance del prototipo y del MVP, métricas. |
| 4 | `docs/01-arquitectura.md` | Arquitectura en Node.js, módulos del monorepo, flujos de datos. |
| 5 | `docs/02-pantallas.md` | Ventanas y opciones del software (PNT-01 a PNT-14). Base del prototipo visual. |
| 6 | `docs/03-requisitos.md` | Requisitos con identificador, prioridad y criterio de aceptación. |
| 7 | `docs/04-modelo-contenido/` + `packages/schema/` | Decisiones del modelo de contenido; el esquema JSON v0.2, el ejemplo, los tipos y el validador viven en `@aptio/schema`. |
| 8 | `docs/05-interacciones.md` | Catálogo de las 8 interacciones del MVP (INT-01 a INT-08). |
| 9 | `docs/06-ia.md` | Tareas de IA con Claude, salidas estructuradas y revisión humana. |
| 10 | `docs/07-voz-personaje-idiomas.md` | TTS, sincronización labial, subtítulos y bilingüismo. |
| 11 | `docs/08-entregas-y-lms.md` | SCORM, HTML, perfiles por LMS y kit de gamificación. |
| 12 | `docs/09-riesgos-y-pruebas-tecnicas.md` | Riesgos y pruebas cortas antes de construir. |
| 13 | `docs/10-backlog.md` | Remite a las historias (`16`), los sprints (`18`) y Jira. |
| 14 | `docs/adr/` | Decisiones de arquitectura. |
| 15 | `docs/prompts/README.md` + `.claude/commands/` | **Desarrollo con Claude Code:** reglas, flujo de una historia, prompts por momento y comandos `/historia`, `/revisar-ui`, `/corregir`, `/cierre-sprint`. |
| 16 | `docs/diseno/` | Prompt y `DESIGN.md` para Google Stitch; **prototipo unificado** (`prototipo-unificado.html`), el único de referencia. |
| 17 | `docs/11-medicion-y-piloto.md` | Plantilla para medir el proceso actual y criterios del piloto antes de construir. |
| 18 | `docs/12-modelo-datos.md` + `packages/db/prisma/schema.prisma` | Modelo de datos, diagrama entidad-relación y esquema Prisma validado. |
| 19 | `docs/13-api.md` + `docs/api/openapi.yaml` | API REST: 86 operaciones en OpenAPI 3.0.3 validado. |
| 20 | `docs/14-modulos.md` | Especificación por módulo (M01–M15) con reglas de negocio, datos, API y demo. Es la referencia vigente. |
| 21 | `docs/15-flujos.md` | Diagramas de secuencia: generar, regenerar en cascada, propuestas, exportar, paquete en el LMS, cambio de proveedor. |
| 22 | `docs/16-historias-y-pruebas.md` | 78 historias con 108 casos de prueba y trazabilidad a requisitos. |
| 23 | `docs/17-guia-desarrollo.md` | Primer día, estructura, convenciones, patrones obligatorios, pruebas, Definición de terminado. |
| 24 | `docs/18-plan-sprints.md` | Sprints S0–S10 con demo para probar y campos en blanco para estimación y responsables. |
| 25 | `jira/` | Archivos CSV para importar épicas, historias y subtareas a Jira, con su guía. |
| 26 | `docs/19-proveedores-y-licencias.md` | Uso comercial, propiedad, indemnización y datos de cada proveedor de IA, con la recomendación por tarea. |
| 27 | `packages/ai/` | Prompts v1 de las 18 tareas de IA, sus esquemas de salida y el caso de referencia LOTO con la salida esperada de cada etapa. |
| 28 | `docs/20-guia-diseno.md` + `docs/diseno/personaje/` | Guía para el equipo gráfico: personaje en SVG (plantilla y validador), estilos, íconos, pantallas modelo y kit. |
| 29 | `docs/21-arranque-s0.md` | Lista de arranque: personas, cuentas, nube, proveedores, insumos y contratos, con campos para completar. |
| 30 | `docs/22-auditoria-prototipo.md` | Auditoría visual del prototipo: márgenes, escala tipográfica y orden, con el antes y el después y cómo repetirla en `apps/web`. |
| 31 | `docs/23-sitio-comercial-y-facturacion.md` + `docs/diseno/sitio-comercial.html` | **Fase comercial:** sitio público, panel superadmin con todo administrable y mostrar/ocultar, captación y CRM, planes, suscripciones y facturación SUNAT; revisión de las pantallas de Stitch. |

## Cómo trabajar con Claude Code

1. Copia este paquete como raíz del repositorio.
2. Abre Claude Code en la raíz: `CLAUDE.md` se carga automáticamente.
3. Usa el prompt de la iteración en curso de `docs/prompts/`.
4. Al cerrar cada iteración, revisa que `docs/ESTADO.md` quede actualizado.

## Validar el ejemplo del modelo de contenido

```bash
pnpm schema:test                     # 17 casos del esquema + curso LOTO
pnpm --filter @aptio/schema validar   # valida ejemplos/ejemplo-capsula.json
```
