-- HU-1706 · Cambio de plan y cancelación (REQ-086, CP-147, RN-18-7): las subidas de plan prorrateadas con su pago, la
-- cancelación al fin del período y la bajada programada. Aditiva salvo el CHECK del origen del cobro, que se borra y se
-- vuelve a crear para aceptar el tercer origen (sin tocar filas: antes de crearlo se comprueba que todas cumplen).
-- CreateEnum
CREATE TYPE "EstadoCambioPlan" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- AlterEnum
ALTER TYPE "EstadoSuscripcion" ADD VALUE 'CANCELADA';

-- AlterTable
ALTER TABLE "Cobro" ADD COLUMN     "cambioPlanId" UUID;

-- AlterTable
ALTER TABLE "Suscripcion" ADD COLUMN     "canceladaEn" TIMESTAMP(3),
ADD COLUMN     "cancelarAlFin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planProgramadoId" UUID;

-- CreateTable
CREATE TABLE "CambioPlan" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "suscripcionId" UUID NOT NULL,
    "planOrigenId" UUID NOT NULL,
    "planDestinoId" UUID NOT NULL,
    "ciclo" "CicloSuscripcion" NOT NULL,
    "precioNuevoSinIgv" INTEGER NOT NULL,
    "diasRestantes" INTEGER NOT NULL,
    "diasPeriodo" INTEGER NOT NULL,
    "diferenciaSinIgv" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "moneda" TEXT NOT NULL,
    "pasarela" TEXT NOT NULL,
    "estado" "EstadoCambioPlan" NOT NULL DEFAULT 'PENDIENTE',
    "eventoPagoId" TEXT,
    "motivoRechazo" TEXT,
    "pedidoPorId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CambioPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CambioPlan_eventoPagoId_key" ON "CambioPlan"("eventoPagoId");

-- CreateIndex
CREATE INDEX "CambioPlan_organizacionId_estado_idx" ON "CambioPlan"("organizacionId", "estado");

-- CreateIndex
CREATE INDEX "Cobro_cambioPlanId_idx" ON "Cobro"("cambioPlanId");

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_planProgramadoId_fkey" FOREIGN KEY ("planProgramadoId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_cambioPlanId_fkey" FOREIGN KEY ("cambioPlanId") REFERENCES "CambioPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlan" ADD CONSTRAINT "CambioPlan_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlan" ADD CONSTRAINT "CambioPlan_suscripcionId_fkey" FOREIGN KEY ("suscripcionId") REFERENCES "Suscripcion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlan" ADD CONSTRAINT "CambioPlan_planOrigenId_fkey" FOREIGN KEY ("planOrigenId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlan" ADD CONSTRAINT "CambioPlan_planDestinoId_fkey" FOREIGN KEY ("planDestinoId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Cada cobro tiene exactamente un origen: el alta, una compra de cápsulas o una subida de plan.
ALTER TABLE "Cobro" DROP CONSTRAINT "Cobro_origen_check";
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_origen_check" CHECK (num_nonnulls("solicitudSuscripcionId", "compraCapsulasId", "cambioPlanId") = 1);
