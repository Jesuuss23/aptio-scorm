-- HU-1303 · Parámetros de rentabilidad por organización y proyecto opcional en las mediciones. Aditiva: no borra ni cambia filas;
-- el registro antiguo «unico» queda con organizacionId NULL. El id deja de tener valor por defecto (lo genera Prisma).
-- AlterTable
ALTER TABLE "MedicionProceso" ADD COLUMN     "proyectoId" UUID;

-- AlterTable
ALTER TABLE "ParametrosNegocio" ADD COLUMN     "organizacionId" UUID,
ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "MedicionProceso_organizacionId_idx" ON "MedicionProceso"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "ParametrosNegocio_organizacionId_key" ON "ParametrosNegocio"("organizacionId");

-- AddForeignKey
ALTER TABLE "ParametrosNegocio" ADD CONSTRAINT "ParametrosNegocio_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicionProceso" ADD CONSTRAINT "MedicionProceso_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

