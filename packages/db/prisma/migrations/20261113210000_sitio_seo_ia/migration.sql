-- HU-1513 · SEO para IA (REQ-072, PNT-30, CP-126, CP-127). Migración aditiva: llms.txt y rastreadores bloqueados en
-- SitioSeo, las preguntas objetivo, las propuestas de la IA y TrabajoIA sin organización para el gasto de la plataforma.

-- AlterTable
ALTER TABLE "SitioSeo" ADD COLUMN     "llmsTxt" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rastreadoresBloqueados" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "TrabajoIA" ALTER COLUMN "organizacionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SitioPreguntaIa" (
    "id" UUID NOT NULL,
    "pregunta" TEXT NOT NULL,
    "menciones" JSONB NOT NULL DEFAULT '{}',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioPreguntaIa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitioPropuestaIa" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "creadoId" UUID,
    "trabajoId" UUID,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioPropuestaIa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitioPropuestaIa_estado_creadoEn_idx" ON "SitioPropuestaIa"("estado", "creadoEn");

