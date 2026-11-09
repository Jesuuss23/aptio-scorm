# @aptio/schema

Modelo del curso v0.2 (HU-0102): una sola fuente para la API, el worker, la web y los prompts de IA.

| Qué | Dónde |
| --- | --- |
| Esquema JSON Schema 2020-12 (fuente de verdad) | `esquemas/curso-v0.schema.json` |
| Tipos TypeScript generados | `src/curso.generado.ts` (no editar a mano) |
| Validador Ajv + reglas adicionales | `src/validar.ts` |
| Ejemplo validado | `ejemplos/ejemplo-capsula.json` |

```ts
import { validarCurso, type Curso } from '@aptio/schema';

const { valido, errores, advertencias } = validarCurso(documento);
```

```bash
pnpm --filter @aptio/schema generar     # regenera los tipos tras cambiar el esquema
pnpm --filter @aptio/schema test        # 17 casos, curso LOTO y tipos al día
pnpm --filter @aptio/schema validar [archivo.json]
```

Cambios incompatibles: subir `versionEsquema` y agregar la migración del documento (`docs/17-guia-desarrollo.md`).
