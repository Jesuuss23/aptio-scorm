# Importar a Jira

| Archivo | Contenido | Úsalo cuando |
| --- | --- | --- |
| `jira-import.csv` | 17 épicas, 110 historias y 240 subtareas (Backend, Frontend, IA, Pruebas…) | El equipo trabaja con subtareas |
| `jira-import-sin-subtareas.csv` | 17 épicas y 110 historias | Prefieren crear las subtareas ellos mismos |

Ambos archivos están en UTF-8 con BOM (las tildes se ven bien) y se generan desde la misma fuente que `docs/16-historias-y-pruebas.md` y `docs/18-plan-sprints.md`.

## Sin tiempos ni personas

Los archivos no traen estimaciones, puntos, fechas, sprints de tablero ni personas asignadas: solo épicas, historias, subtareas, prioridad y etiquetas.

El orden sugerido va como etiqueta (`sprint-s0` … `sprint-s14`). Las épicas de la fase comercial (E15–E17) llevan además la etiqueta `fase-comercial`. Así se puede filtrar el backlog por etapa.

## Pasos (Jira Cloud)

1. Crea el proyecto, por ejemplo con la clave `FAB`. Si es *company-managed*, verifica que existan los tipos Epic, Story y Sub-task.
2. Ve a **Configuración del sistema → Sistema externo → CSV**, o en el proyecto a **Importar problemas desde CSV**.
3. Sube `jira-import.csv`, con delimitador coma y codificación UTF-8.
4. Asigna las columnas:

| Columna del CSV | Campo de Jira |
| --- | --- |
| Issue Id | Issue Id (sirve para enlazar padre e hijo; no queda como campo) |
| Parent Id | Parent Id (une historia → épica y subtarea → historia) |
| Issue Type | Issue Type |
| Summary | Summary |
| Description | Description |
| Priority | Priority (High, Medium, Low; si tu Jira está en español, asigna Alta, Media y Baja) |
| Labels (3 columnas) | Labels |
| Epic Name | Epic Name (solo en proyectos company-managed; en team-managed se ignora) |

5. Revisa la vista previa (deben aparecer 367 elementos con subtareas o 127 sin ellas) e importa.
6. Comprueba que cada historia cuelga de su épica (`E01` … `E17`) y cada subtarea de su historia.

Si tu Jira no acepta `Parent Id`, importa primero solo las épicas, luego las historias asignando `Parent Id` a **Epic Link**, y al final las subtareas.

## Convención de nombres

- Épicas: `E04 · Generador`
- Historias: `HU-0406 · Componer pantallas con el kit`
- Subtareas: `HU-0406 · Frontend`
- Casos de prueba: `CP-###` dentro de la descripción de cada historia (Dado / Cuando / Entonces)

## Para registrar lo que se prueba en cada demo

Crea las observaciones de cada demo como **Bug** (algo no funciona como dice el criterio) o **Mejora** (funciona, pero se quiere distinto), enlazadas a la historia con «se relaciona con».
