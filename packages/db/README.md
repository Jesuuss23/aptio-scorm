# @aptio/db

Esquema Prisma (`prisma/schema.prisma`), migraciones y datos de ejemplo de Aptio SCORM (HU-0103).

- 27 modelos: los 26 de `docs/12-modelo-datos.md` más `Organizacion` (ADR-012).
- Exporta un `prisma` compartido para la API y el worker, y `hashearClave` / `verificarClave` (argon2id).

```bash
cp packages/db/.env.example packages/db/.env
pnpm dev:infra
pnpm db:migrate     # aplica las migraciones
pnpm db:seed        # AulasEducativas, Minera Andina con kit, un usuario por rol, superadmin y proyecto LOTO
pnpm db:test        # Vitest; las pruebas de CP-003 corren solo si hay DATABASE_URL
```

Usuarios de ejemplo (clave `Aptio-local-2026` o la de `SEED_CLAVE`):

| Rol | Correo |
| --- | --- |
| SUPERADMIN | superadmin@aptio.test |
| ADMINISTRADOR | admin@aulaseducativas.test |
| DISENADOR_INSTRUCCIONAL | instruccional@aulaseducativas.test |
| DISENADOR_GRAFICO | grafico@aulaseducativas.test |
| PRODUCTOR | productor@aulaseducativas.test |
| REVISOR_CLIENTE | revisor@mineraandina.test |
