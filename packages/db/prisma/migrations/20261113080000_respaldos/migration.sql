-- CreateEnum
CREATE TYPE "EstadoRespaldo" AS ENUM ('EN_CURSO', 'EXITOSO', 'FALLIDO', 'EXPIRADO');

-- CreateTable
CREATE TABLE "Respaldo" (
    "id" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoRespaldo" NOT NULL DEFAULT 'EN_CURSO',
    "origen" TEXT NOT NULL DEFAULT 'programado',
    "solicitadoPorId" UUID,
    "bucket" TEXT,
    "ubicacion" TEXT,
    "claveVolcado" TEXT,
    "objetos" INTEGER,
    "tamanoBytes" BIGINT,
    "duracionMs" INTEGER,
    "error" TEXT,
    "expiradoEn" TIMESTAMP(3),

    CONSTRAINT "Respaldo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Respaldo_fecha_idx" ON "Respaldo"("fecha");

