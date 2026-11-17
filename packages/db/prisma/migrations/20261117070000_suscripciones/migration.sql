-- HU-1703 · Alta de suscripción desde /precios (REQ-083, CP-143, RN-18-3): la suscripción de cada organización y el
-- checkout pendiente con su evento de pago (idempotencia). Aditiva: solo tipos y tablas nuevas.
-- CreateEnum
CREATE TYPE "CicloSuscripcion" AS ENUM ('MENSUAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "EstadoSuscripcion" AS ENUM ('ACTIVA');

-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('FACTURA', 'BOLETA');

-- CreateEnum
CREATE TYPE "EstadoSolicitudSuscripcion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "Suscripcion" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "ciclo" "CicloSuscripcion" NOT NULL,
    "precioPactadoSinIgv" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "estado" "EstadoSuscripcion" NOT NULL DEFAULT 'ACTIVA',
    "inicioPeriodo" TIMESTAMP(3) NOT NULL,
    "finPeriodo" TIMESTAMP(3) NOT NULL,
    "pasarela" TEXT NOT NULL,
    "ultimos4Digitos" TEXT,
    "solicitudId" UUID,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudSuscripcion" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "ciclo" "CicloSuscripcion" NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "ruc" TEXT,
    "tipoComprobante" "TipoComprobante" NOT NULL,
    "nombreAdmin" TEXT NOT NULL,
    "correoAdmin" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "estado" "EstadoSolicitudSuscripcion" NOT NULL DEFAULT 'PENDIENTE',
    "pasarela" TEXT NOT NULL,
    "eventoPagoId" TEXT,
    "motivoRechazo" TEXT,
    "atribucion" JSONB NOT NULL DEFAULT '{}',
    "organizacionId" UUID,
    "resueltaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitudSuscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Suscripcion_organizacionId_key" ON "Suscripcion"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Suscripcion_solicitudId_key" ON "Suscripcion"("solicitudId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudSuscripcion_eventoPagoId_key" ON "SolicitudSuscripcion"("eventoPagoId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudSuscripcion_organizacionId_key" ON "SolicitudSuscripcion"("organizacionId");

-- CreateIndex
CREATE INDEX "SolicitudSuscripcion_correoAdmin_idx" ON "SolicitudSuscripcion"("correoAdmin");

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudSuscripcion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudSuscripcion" ADD CONSTRAINT "SolicitudSuscripcion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudSuscripcion" ADD CONSTRAINT "SolicitudSuscripcion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

