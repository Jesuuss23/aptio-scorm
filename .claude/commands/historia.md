---
description: Implementa una historia de usuario de Aptio SCORM (plan primero, luego código y pruebas)
argument-hint: HU-####
---
Implementa la historia $ARGUMENTS de docs/16-historias-y-pruebas.md.

Lee: docs/ESTADO.md, el módulo correspondiente en docs/14-modulos.md, sus operaciones en docs/api/openapi.yaml, el modelo en packages/db/prisma/schema.prisma y, si tiene interfaz, la vista de docs/diseno/prototipo-unificado.html y docs/diseno/DESIGN.md.

1. Plan: archivos a crear o cambiar, una prueba por cada CP de la historia, supuestos y hasta 5 preguntas con tu recomendación. Espera mi aprobación antes de escribir código.
2. Código completo en la rama feat/$ARGUMENTS-<nombre-corto>, con pruebas (Vitest para lógica, Playwright para flujos).
3. Corre lint, tipos y pruebas, e informa el resultado real.
4. Si cambias la API o el esquema del curso, actualiza docs/api/openapi.yaml o el esquema en la misma rama.

No adelantes historias de otros sprints. No completes estimaciones, responsables ni fechas.
