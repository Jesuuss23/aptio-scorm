-- HU-1704 · Pasarelas de pago y webhooks (REQ-084, REQ-110, CP-144, CP-145, RN-18-9): un cobro por evento aprobado
-- (idempotencia por eventoPagoId, sin datos de tarjeta), la configuración de cada pasarela sin secretos y los precios
-- opcionales en USD del plan. Aditiva: solo tipos, columnas opcionales y tablas nuevas.
-- CreateEnum
CREATE TYPE "EstadoCobro" AS ENUM ('APROBADO', 'REEMBOLSADO');

-- CreateEnum
CREATE TYPE "ModoPasarela" AS ENUM ('pruebas', 'produccion');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "precioAnualUsd" INTEGER,
ADD COLUMN     "precioMesUsd" INTEGER;

-- CreateTable
CREATE TABLE "Cobro" (
    "id" UUID NOT NULL,
    "solicitudSuscripcionId" UUID NOT NULL,
    "suscripcionId" UUID,
    "eventoPagoId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "moneda" TEXT NOT NULL,
    "pasarela" TEXT NOT NULL,
    "tokenPago" TEXT,
    "ultimos4Digitos" TEXT,
    "estado" "EstadoCobro" NOT NULL DEFAULT 'APROBADO',
    "reembolsoId" TEXT,
    "reembolsadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasarelaConfig" (
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "modo" "ModoPasarela" NOT NULL DEFAULT 'pruebas',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasarelaConfig_pkey" PRIMARY KEY ("codigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cobro_eventoPagoId_key" ON "Cobro"("eventoPagoId");

-- CreateIndex
CREATE INDEX "Cobro_solicitudSuscripcionId_idx" ON "Cobro"("solicitudSuscripcionId");

-- CreateIndex
CREATE INDEX "Cobro_suscripcionId_idx" ON "Cobro"("suscripcionId");

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_solicitudSuscripcionId_fkey" FOREIGN KEY ("solicitudSuscripcionId") REFERENCES "SolicitudSuscripcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_suscripcionId_fkey" FOREIGN KEY ("suscripcionId") REFERENCES "Suscripcion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

