# Modelo de contenido v0 (versión 0.2.0)

> v0.2 agrega a cada pantalla `disposicion` (composición generada), `fondo`, `ajustes` (retoques del editor por elemento) y `extras` (elementos agregados a mano). Resuelve DA-07. El ejemplo está en 0.2.0 y valida; los 17 casos de prueba pasan.

El curso es un documento JSON que valida contra el esquema JSON Schema 2020-12 del paquete `@aptio/schema` (HU-0102). Es la fuente de verdad que comparten el editor, la vista previa, la IA y los exportadores. Este documento conserva las decisiones del modelo; los archivos viven en el paquete.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `packages/schema/esquemas/curso-v0.schema.json` | Esquema: metadatos, idiomas, objetivos, módulos, cápsulas, pantallas, bloques, interacciones INT-01 a INT-08, narración con bocas, video con marcadores, seguimiento, gamificación y recursos |
| `packages/schema/ejemplos/ejemplo-capsula.json` | Cápsula bilingüe "Bloqueo y etiquetado" (7 pantallas): portada, contenido con personaje y narración, memoria, clasificar, video del cliente con pregunta, quiz sumativo y cierre |
| `packages/schema/src/validar.ts` | `validarCurso()`: esquema + reglas adicionales (ids únicos, referencias a recursos y objetivos, traducciones completas en cursos bilingües, grupos de clasificar, banco del quiz, nodos de decisión, personaje de la narración) y advertencias para exportar |
| `packages/schema/src/curso.generado.ts` | Tipos TypeScript generados desde el esquema (`pnpm --filter @aptio/schema generar`) |
| `packages/schema/test/curso.test.ts` | Los 17 casos (1 válido y 16 inválidos), el curso esperado LOTO y la comprobación de que los tipos están al día |

## Ejecutar

```bash
pnpm schema:test                                  # pruebas del esquema
pnpm --filter @aptio/schema validar               # valida el ejemplo
pnpm --filter @aptio/schema validar otro.json     # valida otro curso
```

## Decisiones del modelo

- **Textos por idioma:** todo texto visible es `{ "es": ..., "en": ... }`. En cursos bilingües, la validación exige ambos.
- **Recursos por id:** el curso nunca guarda rutas; `recursos[]` declara cada archivo con origen (biblioteca, generado, subido, cliente), tipo y licencia.
- **Trazabilidad:** `origen` indica si un texto viene de un documento (con páginas), de la IA o es manual, y si fue revisado.
- **Estado de pantalla:** `borrador`, `propuesta-ia`, `aprobado`. Exportar con pantallas no aprobadas genera advertencia.
- **Narración:** por idioma, con hash del texto (para detectar desactualización), voz, duración, marcas de boca `[tiempoMs, boca]` y subtítulos.
- **Interacciones:** `tipo` (INT-##) + `modo` (formativa/sumativa) + `datos` según la ficha de `05-interacciones.md`. INT-04 e INT-06 solo admiten modo formativo.
- **Seguimiento:** se define desde ahora, aunque el prototipo no exporte SCORM, para que la fase D no cambie el modelo.

## Evolución

`versionEsquema` es `0.2.0`. Cada cambio incompatible sube la versión e incluye una función de migración en `packages/schema/migraciones/`.
