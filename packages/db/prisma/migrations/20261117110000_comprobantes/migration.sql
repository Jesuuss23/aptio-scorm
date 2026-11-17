-- HU-1707 · Comprobantes electrónicos SUNAT (REQ-087, CP-148, CP-149, RN-18-4, RN-18-5, RN-18-9): un comprobante por
-- cobro y tipo, el correlativo de cada serie, los eventos del webhook del OSE y los datos fiscales del emisor.
-- Aditiva: solo crea tablas, tipos y la fila «principal» de los datos fiscales (con los valores por defecto).
-- CreateEnum
CREATE TYPE "TipoCpe" AS ENUM ('FACTURA', 'BOLETA', 'NOTA_CREDITO');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('PENDIENTE', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" UUID NOT NULL,
    "organizacionId" UUID,
    "cobroId" UUID NOT NULL,
    "tipo" "TipoCpe" NOT NULL,
    "serie" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "comprobanteReferenciaId" UUID,
    "ruc" TEXT,
    "razonSocial" TEXT NOT NULL,
    "direccion" TEXT,
    "correoFacturacion" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "baseSinIgv" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "detraccion" DECIMAL(10,2),
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'PENDIENTE',
    "motivo" TEXT,
    "proveedor" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "s3KeyPdf" TEXT,
    "s3KeyXml" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEn" TIMESTAMP(3),
    "correoEnviadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieComprobante" (
    "serie" TEXT NOT NULL,
    "tipo" "TipoCpe" NOT NULL,
    "ultimoNumero" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerieComprobante_pkey" PRIMARY KEY ("serie")
);

-- CreateTable
CREATE TABLE "EventoOse" (
    "id" TEXT NOT NULL,
    "comprobanteId" UUID NOT NULL,
    "estado" "EstadoComprobante" NOT NULL,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoOse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatosFiscales" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "rucEmisor" TEXT,
    "razonSocialEmisor" TEXT NOT NULL DEFAULT '',
    "direccionEmisor" TEXT NOT NULL DEFAULT '',
    "serieFactura" TEXT NOT NULL DEFAULT 'F001',
    "serieBoleta" TEXT NOT NULL DEFAULT 'B001',
    "serieNotaFactura" TEXT NOT NULL DEFAULT 'FC01',
    "serieNotaBoleta" TEXT NOT NULL DEFAULT 'BC01',
    "proveedor" TEXT NOT NULL DEFAULT 'pruebas',
    "ambiente" TEXT NOT NULL DEFAULT 'pruebas',
    "detraccionActiva" BOOLEAN NOT NULL DEFAULT false,
    "detraccionTasa" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "detraccionUmbralPen" DECIMAL(10,2) NOT NULL DEFAULT 700,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatosFiscales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comprobante_estado_idx" ON "Comprobante"("estado");

-- CreateIndex
CREATE INDEX "Comprobante_organizacionId_idx" ON "Comprobante"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_cobroId_tipo_key" ON "Comprobante"("cobroId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_serie_numero_key" ON "Comprobante"("serie", "numero");

-- CreateIndex
CREATE INDEX "EventoOse_comprobanteId_idx" ON "EventoOse"("comprobanteId");

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_comprobanteReferenciaId_fkey" FOREIGN KEY ("comprobanteReferenciaId") REFERENCES "Comprobante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoOse" ADD CONSTRAINT "EventoOse_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Una nota de crédito siempre apunta a su comprobante; una factura o boleta, nunca. El número es positivo.
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_referencia_check" CHECK (("tipo" = 'NOTA_CREDITO') = ("comprobanteReferenciaId" IS NOT NULL));
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_numero_check" CHECK ("numero" > 0);

-- La fila única de los datos fiscales, con las series F001, B001, FC01 y BC01, el OSE de pruebas y la detracción apagada.
INSERT INTO "DatosFiscales" ("id", "actualizadoEn") VALUES ('principal', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
