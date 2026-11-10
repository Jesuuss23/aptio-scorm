# Guía de desarrollo

## Primer día

```bash
# Requisitos: Node 24 (ver .nvmrc), pnpm 9, Docker
cp .env.example .env              # completar claves (nunca subir .env)
pnpm i
pnpm dev:infra                    # PostgreSQL, Redis y LocalStack (S3)
pnpm db:migrate && pnpm db:seed   # esquema + datos de ejemplo (Minera Andina, proyecto LOTO)
pnpm dev                          # api :3000, web :5173, worker
```

Antes de crear el primer `package.json` de cada app, verifica las versiones vigentes de las imágenes Docker (`infra/docker-compose.yml`) y de las dependencias, y fíjalas.

## Estructura del repositorio

```text
CLAUDE.md                 contexto y reglas (lo lee Claude Code)
apps/
  api/                    NestJS · REST /api/v1 (docs/api/openapi.yaml)
  web/                    React + Vite · interfaz del prototipo unificado
  worker/                 BullMQ · colas ia, voz, media, export
packages/
  db/                     Prisma: schema, migraciones, datos de ejemplo
  schema/                 esquema JSON del curso v0.2 + tipos + validador
  player/                 reproductor único (vista previa = paquete exportado)
  interactions/           INT-01 a INT-08
  ai/                     proveedores, prompts versionados, costos
  estimator/              estimación y rentabilidad
  exporters/              json, html, scorm12, scorm2004, kit de gamificación
  ui/                     componentes con los tokens de DESIGN.md
infra/                    docker-compose
docs/                     esta documentación
jira/                     archivos de importación
```

Cada módulo de `14-modulos.md` es un módulo de NestJS en `apps/api/src/<modulo>` y una carpeta de funcionalidad en `apps/web/src/features/<modulo>`.

## Convenciones

| Tema | Regla |
| --- | --- |
| Idioma del código | Identificadores en inglés o español, pero uno solo por paquete; textos de interfaz en español con archivo de traducciones (`es`, `en`) |
| TypeScript | `strict`, sin `any` salvo justificado con comentario |
| Formato | oxlint (reglas compatibles con ESLint) con `--deny-warnings`; el CI falla con errores o avisos. Prettier queda pendiente (SUP-12) |
| Ramas | `main` protegida; ramas `feat/HU-0406-componer-pantallas`, `fix/...` |
| Commits | Conventional Commits con el id de la historia: `feat(generador): componer pantallas HU-0406` |
| Solicitudes de cambio | Una historia por PR cuando sea posible; enlazar el issue de Jira; captura o video si cambia la interfaz |
| Migraciones | Una por PR; nunca editar una migración ya fusionada |
| Esquema del curso | Cambios compatibles hacia atrás; si no, subir `versionEsquema` y escribir la migración del documento |
| Prompts | Versionados en `packages/ai/prompts/IA-##.v{n}.md` (ver `06-ia.md`); cada TrabajoIA guarda la versión usada |
| Secretos | Solo en variables de entorno; nunca en código, logs ni respuestas de la API |

## Variables de entorno

Todas están documentadas en `.env.example`. Los modelos de Claude se configuran por variable (`ANTHROPIC_MODEL_*`) para poder cambiarlos sin tocar código. La configuración de negocio se guarda en `ConfigProveedor` (proveedor y modelo por tarea).

## Patrones obligatorios

1. **Salida de IA:** prompt → respuesta estructurada → validación Ajv → hasta 2 reintentos con el error → guardar como `Propuesta` o resultado de etapa. Nunca HTML ni código generado por la IA (RN-04-1).
2. **Texto del cliente en prompts:** siempre delimitado y precedido de la instrucción de tratarlo como datos y no seguir instrucciones que contenga.
3. **Trabajo largo:** la API responde `202` y encola; el worker emite eventos; la web escucha SSE.
4. **Escritura del curso:** con `If-Match` (versión); cada escritura crea `CursoVersion`.
5. **Regeneración en cascada:** calcular `textoHash` y marcar solo lo afectado (ver `12-modelo-datos.md`).
6. **Costos:** todo llamado a proveedor pasa por `packages/ai`, que registra el `TrabajoIA` con consumo y costo.
7. **Permisos:** con guardas por rol en la API; la interfaz solo oculta.

## Pruebas

| Nivel | Herramienta | Qué cubre | Cuándo corre |
| --- | --- | --- | --- |
| Unitarias | Vitest | Estimación, rentabilidad, alineación, `textoHash`, validador, adaptador SCORM | Cada PR |
| Contrato | Redocly + pruebas de respuesta | Que la API cumpla `openapi.yaml` | Cada PR |
| Esquema | `pnpm schema:test` | 17 casos del esquema del curso | Cada PR |
| Salidas de IA | `pnpm ia:casos` | Los 18 esquemas de salida compilan y las 63 salidas del caso LOTO validan; el curso esperado valida | Cada PR |
| Personaje | `node docs/diseno/personaje/validar-personaje.mjs` | Capas, bocas, peso y colores del kit del SVG entregado | Al recibir un personaje |
| Flujos | Playwright | Nuevo SCORM → generar (con proveedores simulados) → revisar → editar → exportar | Cada PR (simulado) y nocturno |
| IA real | Casos de referencia | 20 ejecuciones por tarea con el material de ejemplo; tasa de validación y costo | Semanal y al cambiar modelo o prompt |
| LMS | SCORM Cloud + Moodle de pruebas | Avance, nota, reanudación, bilingüe | Al tocar el reproductor o los exportadores |
| Accesibilidad | axe + teclado manual | Cápsula exportada | Cada sprint |

Los proveedores de IA, voz e imágenes tienen un **modo simulado** (respuestas grabadas del caso LOTO en `packages/ai/casos/loto/salidas/`) para que CI y desarrollo no gasten ni dependan de la red.

## Definición de terminado

Una historia está terminada cuando:
- cumple sus casos de prueba (CP) de `16-historias-y-pruebas.md`;
- tiene pruebas automáticas;
- respeta la API documentada (o la actualiza en el mismo PR);
- no deja errores de lint ni de tipos;
- funciona en Chrome, Edge y Safari, y en celular si tiene interfaz;
- está desplegada en el entorno de pruebas;
- y quedó registrada en `ESTADO.md` si cambió una decisión o supuesto.

## Cómo prueba el responsable del producto

1. Al cerrar cada sprint, el equipo despliega en el **entorno de pruebas** y comparte el enlace.
2. El responsable recorre la lista **Demo para probar** del sprint (`18-plan-sprints.md`) con el caso LOTO o un proyecto real.
3. Registra lo encontrado en Jira como *Bug* o *Mejora*, enlazado a la historia, y completa la tabla de la demo (fecha, resultado, observaciones).
4. Desde el S6, rehace un proyecto medido con el generador y registra las horas en Rentabilidad → Mediciones (piloto).

## Trabajar con Claude Code

`CLAUDE.md` tiene el contexto y las reglas. La guía completa está en `docs/prompts/README.md`, y los comandos del equipo en `.claude/commands/`:

| Comando | Para qué |
| --- | --- |
| `/historia HU-####` | Plan, código y pruebas de una historia |
| `/revisar-ui <vista>` | Comparar una vista con el prototipo y las reglas visuales |
| `/corregir <clave Jira>` | Corregir un error con una prueba que lo reproduzca primero |
| `/cierre-sprint S#` | Estado real, guion de demo y actualización de `ESTADO.md` |

- Una historia por sesión y por rama; primero el plan, después el código.
- No le pidas cambiar decisiones tomadas sin un ADR nuevo.
