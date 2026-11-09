# packages/ai

Capa de proveedores (texto, pantallas, imagen, voz, boca, traducción) con prompts versionados, salidas estructuradas, reintentos y registro de costo. El proveedor de cada tarea se define en `ConfigProveedor`.

| Carpeta | Contenido |
| --- | --- |
| `prompts/` | Prompts v1 de IA-01 a IA-18 y el bloque común `_comun.md` |
| `esquemas/` | Esquema de salida de cada tarea (JSON Schema 2020-12). Reutiliza las definiciones del esquema del curso por `$ref` |
| `casos/loto/` | Caso de referencia: entradas, salida esperada por etapa y curso esperado |
| `scripts/validar-casos.mjs` | Compila los esquemas y valida todas las salidas del caso (`pnpm ia:casos`) |

Al enviar un esquema a la API como herramienta, primero se **empaqueta** (se resuelven los `$ref` al esquema del curso), porque la API no los sigue.
