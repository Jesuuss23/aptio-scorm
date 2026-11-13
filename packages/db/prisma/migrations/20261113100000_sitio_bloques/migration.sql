-- CreateTable
CREATE TABLE "SitioBloque" (
    "id" UUID NOT NULL,
    "paginaId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "ajustes" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioBloque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitioBloque_paginaId_orden_idx" ON "SitioBloque"("paginaId", "orden");

-- AddForeignKey
ALTER TABLE "SitioBloque" ADD CONSTRAINT "SitioBloque_paginaId_fkey" FOREIGN KEY ("paginaId") REFERENCES "SitioPagina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

