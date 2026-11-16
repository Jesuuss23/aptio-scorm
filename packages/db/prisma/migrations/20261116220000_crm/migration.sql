-- HU-1602 · Integración con CRM (REQ-075, RN-17-2). Aditiva: crea CrmConexion y LeadEnvio.
-- CreateTable
CREATE TABLE "CrmConexion" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "mapeo" JSONB NOT NULL DEFAULT '{}',
    "url" TEXT,
    "secreto" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmConexion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEnvio" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "conexionId" UUID NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "motivo" TEXT,
    "idExterno" TEXT,
    "enviadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmConexion_tipo_key" ON "CrmConexion"("tipo");

-- CreateIndex
CREATE INDEX "LeadEnvio_estado_idx" ON "LeadEnvio"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "LeadEnvio_leadId_conexionId_key" ON "LeadEnvio"("leadId", "conexionId");

-- AddForeignKey
ALTER TABLE "LeadEnvio" ADD CONSTRAINT "LeadEnvio_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEnvio" ADD CONSTRAINT "LeadEnvio_conexionId_fkey" FOREIGN KEY ("conexionId") REFERENCES "CrmConexion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

