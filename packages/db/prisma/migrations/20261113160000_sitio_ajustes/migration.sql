-- HU-1509 · Ajustes del sitio (REQ-073): una sola fila. Aditiva.
-- CreateTable
CREATE TABLE "SitioAjustes" (
    "id" TEXT NOT NULL DEFAULT 'sitio',
    "datos" JSONB NOT NULL,
    "actualizadoPorId" UUID,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioAjustes_pkey" PRIMARY KEY ("id")
);

