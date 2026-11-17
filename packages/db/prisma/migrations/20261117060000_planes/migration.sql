-- HU-1702 · Planes administrables (REQ-082, PNT-35): planes de suscripción y ajustes de la página de precios. Solo agrega.
-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "precioMes" INTEGER,
    "precioAnual" INTEGER,
    "capsulasMes" INTEGER,
    "usuarios" INTEGER,
    "capsulaAdicional" INTEGER,
    "textoBoton" TEXT NOT NULL DEFAULT 'Suscribirme',
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "caracteristicas" JSONB NOT NULL DEFAULT '[]',
    "ficticio" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanesAjustes" (
    "id" TEXT NOT NULL DEFAULT 'planes',
    "mostrarAnual" BOOLEAN NOT NULL DEFAULT true,
    "descuentoAnual" INTEGER NOT NULL DEFAULT 20,
    "conIgv" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanesAjustes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE INDEX "Plan_orden_idx" ON "Plan"("orden");

