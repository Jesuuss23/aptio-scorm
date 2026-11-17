-- HU-1701 · Organización base (ADR-012, CP-140). Los datos de antes de la multi-organización pasan a
-- «AulasEducativas». Desde el S0 todas las tablas raíz exigen `organizacionId`, así que aquí solo se asegura que
-- exista la organización base. Es aditiva e idempotente: si ya existe (entornos sembrados), no cambia nada.
INSERT INTO "Organizacion" ("id", "nombre", "slug", "estado", "creadoEn", "actualizadoEn")
VALUES (gen_random_uuid(), 'AulasEducativas', 'aulas-educativas', 'ACTIVA', now(), now())
ON CONFLICT ("slug") DO NOTHING;
