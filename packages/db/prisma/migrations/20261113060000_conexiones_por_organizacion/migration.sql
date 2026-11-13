-- HU-1304 · Conexiones IA por organización: aditiva. Las filas antiguas quedan sin organización y no se usan.
-- DropIndex
DROP INDEX "ConfigProveedor_tarea_key";

-- AlterTable
ALTER TABLE "ConfigProveedor" ADD COLUMN     "organizacionId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "ConfigProveedor_organizacionId_tarea_key" ON "ConfigProveedor"("organizacionId", "tarea");

-- AddForeignKey
ALTER TABLE "ConfigProveedor" ADD CONSTRAINT "ConfigProveedor_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

