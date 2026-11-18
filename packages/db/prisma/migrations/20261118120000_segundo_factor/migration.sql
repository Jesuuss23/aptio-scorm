-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "totpActivoDesde" TIMESTAMP(3),
ADD COLUMN     "totpPendienteCifrado" TEXT,
ADD COLUMN     "totpSecretoCifrado" TEXT,
ADD COLUMN     "totpUltimoPaso" INTEGER;

-- CreateTable
CREATE TABLE "CodigoRecuperacion" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodigoRecuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodigoRecuperacion_hash_key" ON "CodigoRecuperacion"("hash");

-- CreateIndex
CREATE INDEX "CodigoRecuperacion_usuarioId_idx" ON "CodigoRecuperacion"("usuarioId");

-- AddForeignKey
ALTER TABLE "CodigoRecuperacion" ADD CONSTRAINT "CodigoRecuperacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

