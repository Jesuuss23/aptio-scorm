# Modelo de contenido v0 (versión 0.2.0)

> v0.2 agrega a cada pantalla `disposicion` (composición generada), `fondo`, `ajustes` (retoques del editor por elemento) y `extras` (elementos agregados a mano). Resuelve DA-07. El ejemplo está en 0.2.0 y valida; los 17 casos de prueba pasan.

El curso es un documento JSON que valida contra `esquema-curso-v0.schema.json` (JSON Schema 2020-12). Es la fuente de verdad que comparten el editor, la vista previa, la IA y los exportadores.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `esquema-curso-v0.schema.json` | Esquema: metadatos, idiomas, objetivos, módulos, cápsulas, pantallas, bloques, interacciones INT-01 a INT-08, narración con bocas, video con marcadores, seguimiento, gamificación y recursos |
| `ejemplo-capsula.json` | Cápsula bilingüe "Bloqueo y etiquetado" (7 pantallas): portada, contenido con personaje y narración, memoria, clasificar, video del cliente con pregunta, quiz sumativo y cierre |
| `validar.mjs` | Validación del esquema + reglas adicionales: ids únicos, referencias a recursos y objetivos, traducciones completas en cursos bilingües, grupos de clasificar, banco del quiz, nodos de decisión, personaje de la narración |
| `pruebas.mjs` | 17 casos (1 válido y 16 inválidos) que deben comportarse como se espera |

## Ejecutar

```bash
npm install
npm run validar            # valida ejemplo-capsula.json
node validar.mjs otro.json # valida otro curso
npm test                   # casos negativos
```

Resultado verificado al entregar este paquete: el ejemplo es válido, con 6 advertencias de exportación (pantallas sin aprobar y narración en inglés pendiente), y los 14 casos de prueba se comportan como se espera.

## Decisiones del modelo

- **Textos por idioma:** todo texto visible es `{ "es": ..., "en": ... }`. En cursos bilingües, la validación exige ambos.
- **Recursos por id:** el curso nunca guarda rutas; `recursos[]` declara cada archivo con origen (biblioteca, generado, subido, cliente), tipo y licencia.
- **Trazabilidad:** `origen` indica si un texto viene de un documento (con páginas), de la IA o es manual, y si fue revisado.
- **Estado de pantalla:** `borrador`, `propuesta-ia`, `aprobado`. Exportar con pantallas no aprobadas genera advertencia.
- **Narración:** por idioma, con hash del texto (para detectar desactualización), voz, duración, marcas de boca `[tiempoMs, boca]` y subtítulos.
- **Interacciones:** `tipo` (INT-##) + `modo` (formativa/sumativa) + `datos` según la ficha de `05-interacciones.md`. INT-04 e INT-06 solo admiten modo formativo.
- **Seguimiento:** se define desde ahora, aunque el prototipo no exporte SCORM, para que la fase D no cambie el modelo.

## Evolución

`versionEsquema` es `0.1.0`. Cada cambio incompatible sube la versión e incluye una función de migración en `packages/schema/migraciones/`.
