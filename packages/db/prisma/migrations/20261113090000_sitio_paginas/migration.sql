-- CreateEnum
CREATE TYPE "EstadoPagina" AS ENUM ('BORRADOR', 'PROGRAMADA', 'PUBLICADA');

-- CreateTable
CREATE TABLE "SitioPagina" (
    "id" UUID NOT NULL,
    "ruta" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "titulo" TEXT NOT NULL,
    "estado" "EstadoPagina" NOT NULL DEFAULT 'BORRADOR',
    "publicarEn" TIMESTAMP(3),
    "publicadaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioPagina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitioPagina_estado_publicarEn_idx" ON "SitioPagina"("estado", "publicarEn");

-- CreateIndex
CREATE UNIQUE INDEX "SitioPagina_ruta_idioma_key" ON "SitioPagina"("ruta", "idioma");

