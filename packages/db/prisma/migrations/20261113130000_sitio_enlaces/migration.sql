-- CreateTable
CREATE TABLE "SitioEnlace" (
    "id" UUID NOT NULL,
    "zona" TEXT NOT NULL,
    "padreId" UUID,
    "texto" TEXT NOT NULL,
    "ruta" TEXT,
    "orden" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioEnlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitioEnlace_zona_padreId_orden_idx" ON "SitioEnlace"("zona", "padreId", "orden");

-- AddForeignKey
ALTER TABLE "SitioEnlace" ADD CONSTRAINT "SitioEnlace_padreId_fkey" FOREIGN KEY ("padreId") REFERENCES "SitioEnlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

