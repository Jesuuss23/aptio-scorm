-- HU-0506 · Quién y cuándo resolvió cada comentario, e índice por curso y pantalla. Aditiva.
-- AlterTable
ALTER TABLE "Comentario" ADD COLUMN     "resueltoEn" TIMESTAMP(3),
ADD COLUMN     "resueltoPorId" UUID;

-- CreateIndex
CREATE INDEX "Comentario_cursoId_pantallaId_idx" ON "Comentario"("cursoId", "pantallaId");

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_resueltoPorId_fkey" FOREIGN KEY ("resueltoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

