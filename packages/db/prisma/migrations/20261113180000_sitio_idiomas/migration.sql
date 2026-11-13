-- DropIndex
DROP INDEX "SitioElemento_coleccion_orden_idx";

-- DropIndex
DROP INDEX "SitioEnlace_zona_padreId_orden_idx";

-- AlterTable
ALTER TABLE "SitioElemento" ADD COLUMN     "idioma" TEXT NOT NULL DEFAULT 'es';

-- AlterTable
ALTER TABLE "SitioEnlace" ADD COLUMN     "idioma" TEXT NOT NULL DEFAULT 'es';

-- CreateIndex
CREATE INDEX "SitioElemento_coleccion_idioma_orden_idx" ON "SitioElemento"("coleccion", "idioma", "orden");

-- CreateIndex
CREATE INDEX "SitioEnlace_zona_idioma_padreId_orden_idx" ON "SitioEnlace"("zona", "idioma", "padreId", "orden");

