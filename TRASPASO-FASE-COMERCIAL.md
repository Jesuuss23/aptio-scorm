# Traspaso a desarrollo · Fase comercial

Fecha: 03/11/2026. Este paquete suma al proyecto Aptio SCORM la **fase comercial**:
- el sitio público con landings por sector y una sección de blog alimentada por WordPress;
- el panel superadmin, integrado a `apps/web`, desde donde se administra todo el sitio con mostrar/ocultar;
- la captación: popups, chatbot, agendamiento, leads y CRM;
- la venta por suscripción: organizaciones, planes, pago, comprobantes SUNAT y cobranza.

El resto del paquete (generador, editor, entrega SCORM, sprints S0–S10) no cambia. `CLAUDE.md` y `README.md` siguen siendo la entrada general.

## Qué leer y en qué orden

| # | Archivo | Para qué |
| --- | --- | --- |
| 1 | `docs/23-sitio-comercial-y-facturacion.md` | Especificación completa: decisiones, roles, revisión de Stitch, dirección visual del sitio, vistas, reglas (RN-16, RN-17, RN-18), blog en WordPress, landings por sector, modelo de datos propuesto, API y decisiones abiertas |
| 2 | `docs/diseno/sitio-comercial.html` | Prototipo de referencia (doble clic). Sitio público y panel superadmin de 15 vistas, con datos ficticios. Todo lo que se cambia en el panel se ve en el sitio |
| 3 | `docs/adr/README.md` | ADR-011 (sitio comercial y superadmin) y ADR-012 (multi-organización, planes y facturación). Ambos en estado **Propuesta** |
| 4 | `docs/16-historias-y-pruebas.md` | Épicas E15–E17: 32 historias (HU-1501 a HU-1711) con casos de prueba CP-109 a CP-159 |
| 5 | `docs/18-plan-sprints.md` | Sprints S11–S14 con la demo para probar de cada uno |
| 6 | `docs/03-requisitos.md` | REQ-064 a REQ-092, REQ-109 y REQ-110 (prioridad L, fase comercial) |
| 7 | `docs/02-pantallas.md` y `docs/14-modulos.md` | PNT-24 a PNT-40 y módulos M16–M18 |
| 8 | `jira/` | Archivos para importar y su guía |

## Jira

| Archivo | Contenido | Elementos |
| --- | --- | --- |
| `jira/jira-import.csv` | 17 épicas, 110 historias y 240 subtareas | 367 |
| `jira/jira-import-sin-subtareas.csv` | 17 épicas y 110 historias | 127 |

- Si ya importaron la versión anterior (E01–E14), importen solo las filas con la etiqueta `fase-comercial` (E15–E17), sus historias y subtareas. No hay padres rotos ni identificadores repetidos.
- Sin tiempos ni personas: los CSV no traen estimaciones, puntos, fechas ni responsables. Solo épicas, historias, subtareas, prioridad y etiquetas (`sprint-sN` indica el orden, no una fecha).
- `jira/gen_fase_comercial.py` es la fuente única de E15–E17: genera los CSV y las secciones de los documentos 03, 16 y 18. Si cambia una historia, se cambia ahí y se vuelve a ejecutar.

## Orden de construcción

| Sprint | Objetivo | Historias | Depende de |
| --- | --- | --- | --- |
| S11 | Superadmin, sitio comercial y landings por sector | 10 | S0 (sesión y roles) y HU-0110 (sistema visual) |
| S12 | SEO, sección Blog (WordPress) y captación | 11 | S11 |
| S13 | Organizaciones, planes y suscripciones | 6 | HU-1701 antes de cualquier venta |
| S14 | Facturación electrónica y cobranza | 5 | S13 y DA-09 resuelta |

El sitio (S11–S12) no toca el generador y puede adelantarse con un equipo aparte si negocio lo pide.

## Reglas que no se negocian

- El panel superadmin sigue `docs/diseno/DESIGN.md` y la auditoría `docs/22-auditoria-prototipo.md`: 32 px desde la barra lateral, solo los tamaños 11, 12, 14, 16, 20 y 26 px, sin desborde a 390 px.
- El sitio público tiene su propia dirección visual (sección «Dirección visual del sitio público» del documento 23): Schibsted Grotesk y Source Serif 4, bloques de Stitch y juego de azules.
- Todo contenido del sitio tiene orden y mostrar/ocultar; ocultar no borra y lo nuevo nace oculto.
- Los datos marcados «ficticio» bloquean la publicación en producción mientras estén visibles.
- El blog no se edita en Aptio SCORM: se lee de WordPress.
- No se guardan datos de tarjeta; el pago se confirma solo por webhook firmado e idempotente.

## Cómo verificar

```bash
pip install playwright && playwright install chromium
python docs/diseno/pruebas/auditoria_sitio_comercial.py file://$(pwd)/docs/diseno/sitio-comercial.html
```

El prototipo pasa sin fallas a 1280, 1440, 1920 y 390 px. La misma prueba se adapta a `apps/web` cambiando la URL (extensión de HU-0110).

## Pendiente antes de producción

| Tema | Quién | Referencia |
| --- | --- | --- |
| Aprobar ADR-011 y ADR-012 | Responsable del producto e ingeniero a cargo | `docs/adr/README.md` |
| Cómo se sirve el sitio público | Ingeniero a cargo | DA-08 |
| Proveedor OSE/PSE para SUNAT | Finanzas e ingeniero | DA-09 |
| Pasarela principal en soles | Finanzas | DA-10 |
| CRM principal | Ventas | DA-11 |
| Precios definitivos de los planes | Negocio, con el piloto (S6) | DA-12 |
| WordPress en subdominio o en /blog | Marketing e ingeniero | DA-13 |
| Tasa y umbral de detracción | Contador | RN-18-5 |
| Reemplazar cifras, testimonios y logos ficticios por reales, con autorización escrita | Marketing | RN-16-3 |
| Textos definitivos de las landings por sector | Marketing | HU-1514 |

## Qué no incluye

- Código de producción: el prototipo es referencia visual y de comportamiento; se construye en `apps/web`, `apps/api` y `apps/worker` según `docs/17-guia-desarrollo.md`.
- El modelo de datos de la sección 8 del documento 23 es una propuesta; se valida con `prisma validate` en HU-1502 y HU-1701.
- Las operaciones nuevas de la API se agregan a `docs/api/openapi.yaml` dentro de cada historia.
- Las capturas de Stitch (`docs/diseno/stitch/sitio/`) son solo referencia de marca.
