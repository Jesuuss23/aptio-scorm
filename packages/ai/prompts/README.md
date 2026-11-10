# Prompts de IA · versión 1

Plantillas de las tareas IA-01 a IA-18 (`docs/06-ia.md`). Cada una tiene su esquema de salida en `../esquemas/` y su salida esperada para el caso LOTO en `../casos/loto/salidas/`.

Todas empiezan con el bloque común `_comun.md` (reglas, idioma, datos no confiables).

| Tarea | Nombre | Etapa | Modelo (variable) | Temperatura |
| --- | --- | --- | --- | --- |
| [IA-01](IA-01.v1.md) | Mapa de temas de un documento | 1 · RESUMEN_MATERIAL | `ANTHROPIC_MODEL_TEXTO` | 0.2 |
| [IA-02](IA-02.v1.md) | Propuesta conservar/complementario/omitir | 1 · RESUMEN_MATERIAL | `ANTHROPIC_MODEL_TEXTO` | 0.2 |
| [IA-03](IA-03.v1.md) | Resumen fiel por tema | 1 · RESUMEN_MATERIAL | `ANTHROPIC_MODEL_RAPIDO` | 0.1 |
| [IA-04](IA-04.v2.md) (v2; [v1](IA-04.v1.md)) | Estructura del curso | 2 · OBJETIVOS_ESTRUCTURA | `ANTHROPIC_MODEL_TEXTO` | 0.3 |
| [IA-05](IA-05.v2.md) (v2; [v1](IA-05.v1.md)) | Storyboard de una cápsula | 3 · STORYBOARD_GUION | `ANTHROPIC_MODEL_TEXTO` | 0.5 |
| [IA-06](IA-06.v1.md) | Sugerir interacción | 4 · PANTALLAS (bajo pedido) | `ANTHROPIC_MODEL_RAPIDO` | 0.3 |
| [IA-07](IA-07.v1.md) | Datos de una interacción | 4 · PANTALLAS | `ANTHROPIC_MODEL_RAPIDO` | 0.4 |
| [IA-08](IA-08.v1.md) | Banco de preguntas | 4 · PANTALLAS (reto final) | `ANTHROPIC_MODEL_TEXTO` | 0.4 |
| [IA-09](IA-09.v1.md) | Pausas y preguntas de video | 4 · PANTALLAS (pantalla de video) | `ANTHROPIC_MODEL_RAPIDO` | 0.3 |
| [IA-10](IA-10.v1.md) | Traducción ES↔EN | 9 · VERSION_EN | `ANTHROPIC_MODEL_RAPIDO` | 0.2 |
| [IA-11](IA-11.v1.md) | Prompt de imagen | 5 · ILUSTRACIONES | `ANTHROPIC_MODEL_RAPIDO` | 0.5 |
| [IA-12](IA-12.v1.md) | Revisión de calidad | 10 · CONTROL_CALIDAD | `ANTHROPIC_MODEL_RAPIDO` | 0.1 |
| [IA-13](IA-13.v1.md) | Acta de omitidos | 1 · RESUMEN_MATERIAL (al aprobar el alcance) | `ANTHROPIC_MODEL_RAPIDO` | 0.2 |
| [IA-14](IA-14.v1.md) | Patrón de navegación | Navegación (bajo pedido) | `ANTHROPIC_MODEL_RAPIDO` | 0.4 |
| [IA-15](IA-15.v1.md) | Componer pantalla con componentes del kit | 4 · PANTALLAS | `ANTHROPIC_MODEL_PANTALLAS` | 0.4 |
| [IA-16](IA-16.v1.md) | Propuesta de retoque | Revisión / Editor (bajo pedido) | `ANTHROPIC_MODEL_PANTALLAS` | 0.6 |
| [IA-17](IA-17.v1.md) | Corrección de alineación | Alineación pedagógica (bajo pedido) | `ANTHROPIC_MODEL_TEXTO` | 0.3 |
| [IA-18](IA-18.v1.md) | Extracción de kit | Clientes y kits (bajo pedido) | `ANTHROPIC_MODEL_TEXTO` | 0.2 |

## Cómo se usan

- `ejecutarTarea` (`packages/ai/src/texto.ts`) arma el prompt, pide la respuesta como JSON en texto y la valida con Ajv contra el esquema de la tarea. No se fuerza una herramienta: los modelos actuales no aceptan `tool_choice` forzado y los esquemas usan `$ref` al esquema del curso. La columna Temperatura queda como referencia: la API actual no acepta `temperature`; la profundidad se ajusta con el esfuerzo (`ANTHROPIC_ESFUERZO`).
- Si no valida: reintentar hasta 2 veces agregando al mensaje los errores de Ajv (ruta y mensaje). Si sigue fallando, la etapa queda en ERROR (RN-04-2).
- Registrar en `TrabajoIA`: tarea, versión de este archivo, modelo, tokens de entrada y salida, costo, duración y resultado.
- Variables con `{{ }}`: las llena `packages/ai`. Los textos del cliente siempre dentro de `<material_cliente>`.
- Cambiar este prompt = nueva versión (`.v2.md`) y pasar los casos de referencia (`packages/ai/casos/`) antes de usarla en producción.
