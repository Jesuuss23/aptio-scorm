-- HU-1705 · Cuotas de cápsulas (REQ-085, CP-146, RN-18-6): un consumo por proyecto (al lanzar su primera generación),
-- las compras de cápsulas adicionales y el cobro que las paga. Aditiva: tipos y tablas nuevas, una columna opcional en
-- "Cobro" y "solicitudSuscripcionId" pasa a opcional (un cobro es de un alta o de una compra, nunca de ninguno).
-- CreateEnum
CREATE TYPE "OrigenConsumo" AS ENUM ('CUOTA', 'ADICIONAL');

-- CreateEnum
CREATE TYPE "EstadoCompraCapsulas" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- AlterTable
ALTER TABLE "Cobro" ADD COLUMN     "compraCapsulasId" UUID,
ALTER COLUMN "solicitudSuscripcionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ConsumoCapsula" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "suscripcionId" UUID,
    "proyectoId" UUID NOT NULL,
    "ventanaInicio" TIMESTAMP(3) NOT NULL,
    "ventanaFin" TIMESTAMP(3) NOT NULL,
    "origen" "OrigenConsumo" NOT NULL DEFAULT 'CUOTA',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumoCapsula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraCapsulas" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "suscripcionId" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "montoSinIgv" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL,
    "montoTotalConIgv" DECIMAL(10,2) NOT NULL,
    "moneda" TEXT NOT NULL,
    "pasarela" TEXT NOT NULL,
    "estado" "EstadoCompraCapsulas" NOT NULL DEFAULT 'PENDIENTE',
    "eventoPagoId" TEXT,
    "motivoRechazo" TEXT,
    "ventanaInicio" TIMESTAMP(3),
    "ventanaFin" TIMESTAMP(3),
    "pedidoPorId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompraCapsulas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsumoCapsula_proyectoId_key" ON "ConsumoCapsula"("proyectoId");

-- CreateIndex
CREATE INDEX "ConsumoCapsula_organizacionId_ventanaInicio_idx" ON "ConsumoCapsula"("organizacionId", "ventanaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "CompraCapsulas_eventoPagoId_key" ON "CompraCapsulas"("eventoPagoId");

-- CreateIndex
CREATE INDEX "CompraCapsulas_organizacionId_estado_idx" ON "CompraCapsulas"("organizacionId", "estado");

-- CreateIndex
CREATE INDEX "Cobro_compraCapsulasId_idx" ON "Cobro"("compraCapsulasId");

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_compraCapsulasId_fkey" FOREIGN KEY ("compraCapsulasId") REFERENCES "CompraCapsulas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoCapsula" ADD CONSTRAINT "ConsumoCapsula_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoCapsula" ADD CONSTRAINT "ConsumoCapsula_suscripcionId_fkey" FOREIGN KEY ("suscripcionId") REFERENCES "Suscripcion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoCapsula" ADD CONSTRAINT "ConsumoCapsula_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraCapsulas" ADD CONSTRAINT "CompraCapsulas_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraCapsulas" ADD CONSTRAINT "CompraCapsulas_suscripcionId_fkey" FOREIGN KEY ("suscripcionId") REFERENCES "Suscripcion"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reglas que Prisma no expresa: de 1 a 10 cápsulas por compra y cada cobro con su origen.
ALTER TABLE "CompraCapsulas" ADD CONSTRAINT "CompraCapsulas_cantidad_check" CHECK ("cantidad" BETWEEN 1 AND 10);
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_origen_check" CHECK ("solicitudSuscripcionId" IS NOT NULL OR "compraCapsulasId" IS NOT NULL);
