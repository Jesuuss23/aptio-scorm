-- CreateTable
CREATE TABLE "SitioElemento" (
    "id" UUID NOT NULL,
    "coleccion" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "datos" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioElemento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitioElemento_coleccion_orden_idx" ON "SitioElemento"("coleccion", "orden");

