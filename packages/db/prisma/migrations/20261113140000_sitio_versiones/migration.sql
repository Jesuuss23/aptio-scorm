-- CreateTable
CREATE TABLE "SitioVersion" (
    "id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "instantanea" JSONB NOT NULL,
    "publicadoPorId" UUID,
    "publicadoPorNombre" TEXT,
    "entorno" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "restauradaDe" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitioVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SitioVersion_numero_key" ON "SitioVersion"("numero");

