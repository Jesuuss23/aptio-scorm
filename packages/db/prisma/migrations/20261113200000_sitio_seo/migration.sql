-- AlterTable
ALTER TABLE "SitioPagina" ADD COLUMN     "canonical" TEXT,
ADD COLUMN     "datosEstructurados" TEXT NOT NULL DEFAULT 'WebPage',
ADD COLUMN     "indexar" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "metaDescripcion" TEXT;

-- CreateTable
CREATE TABLE "SitioRedireccion" (
    "id" UUID NOT NULL,
    "desde" TEXT NOT NULL,
    "hacia" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioRedireccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitioSeo" (
    "id" TEXT NOT NULL DEFAULT 'seo',
    "robotsExtra" TEXT NOT NULL DEFAULT '',
    "actualizadoPorId" UUID,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioSeo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SitioRedireccion_desde_key" ON "SitioRedireccion"("desde");

