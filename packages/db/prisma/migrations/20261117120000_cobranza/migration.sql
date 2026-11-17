-- HU-1708 · Cobranza y suspensión (REQ-088, CP-150, RN-18-8). Aditiva: los estados PAGO_PENDIENTE y SUSPENDIDA de la
-- suscripción, la renovación de cada período con sus intentos y el cobro que la paga.

-- CreateEnum
CREATE TYPE "EstadoRenovacion" AS ENUM ('PENDIENTE', 'APROBADA', 'VENCIDA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoSuscripcion" ADD VALUE 'PAGO_PENDIENTE';
ALTER TYPE "EstadoSuscripcion" ADD VALUE 'SUSPENDIDA';

-- AlterTable
ALTER TABLE "Cobro" ADD COLUMN     "renovacionId" UUID;

-- CreateTable
CREATE TABLE "Renovacion" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "suscripcionId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFin" TIMESTAMP(3) NOT NULL,
    "montoSinIgv" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "moneda" TEXT NOT NULL,
    "pasarela" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3),
    "estado" "EstadoRenovacion" NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" TEXT,
    "eventoPagoId" TEXT,
    "suspendidaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Renovacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Renovacion_eventoPagoId_key" ON "Renovacion"("eventoPagoId");

-- CreateIndex
CREATE INDEX "Renovacion_estado_proximoIntento_idx" ON "Renovacion"("estado", "proximoIntento");

-- CreateIndex
CREATE UNIQUE INDEX "Renovacion_suscripcionId_periodoInicio_key" ON "Renovacion"("suscripcionId", "periodoInicio");

-- CreateIndex
CREATE INDEX "Cobro_renovacionId_idx" ON "Cobro"("renovacionId");

-- AddForeignKey
ALTER TABLE "Renovacion" ADD CONSTRAINT "Renovacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renovacion" ADD CONSTRAINT "Renovacion_suscripcionId_fkey" FOREIGN KEY ("suscripcionId") REFERENCES "Suscripcion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renovacion" ADD CONSTRAINT "Renovacion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_renovacionId_fkey" FOREIGN KEY ("renovacionId") REFERENCES "Renovacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un cobro paga exactamente una cosa: el alta, cápsulas adicionales, una subida de plan o una renovación.
ALTER TABLE "Cobro" DROP CONSTRAINT "Cobro_origen_check";
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_origen_check" CHECK (num_nonnulls("solicitudSuscripcionId", "compraCapsulasId", "cambioPlanId", "renovacionId") = 1);
ALTER TABLE "Renovacion" ADD CONSTRAINT "Renovacion_periodo_check" CHECK ("periodoFin" > "periodoInicio");
ALTER TABLE "Renovacion" ADD CONSTRAINT "Renovacion_intentos_check" CHECK ("intentos" BETWEEN 0 AND 4);
