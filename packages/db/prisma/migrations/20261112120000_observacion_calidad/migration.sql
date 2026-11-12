-- HU-0505 · Control de calidad: categoría, sugerencia de IA-12 y ruta del texto en cada observación.
ALTER TABLE "Observacion" ADD COLUMN "categoria" TEXT,
ADD COLUMN "sugerencia" TEXT,
ADD COLUMN "ruta" TEXT;
