-- HU-1605 · Agendamiento de demos (REQ-078, RN-17-5): tipos de reunión, asesores, ajustes y citas. Solo agrega.
-- CreateTable
CREATE TABLE "AgendaTipo" (
    "id" UUID NOT NULL,
    "nombreEs" TEXT NOT NULL,
    "nombreEn" TEXT NOT NULL DEFAULT '',
    "minutos" INTEGER NOT NULL DEFAULT 30,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "ficticio" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaTipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaAsesor" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "enlaceVideollamada" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "ficticio" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaAsesor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaAjustes" (
    "id" TEXT NOT NULL DEFAULT 'agenda',
    "franjas" TEXT[] DEFAULT ARRAY['09:00', '10:00', '11:30', '15:00', '16:30']::TEXT[],
    "anticipacionHoras" INTEGER NOT NULL DEFAULT 4,
    "horizonteDias" INTEGER NOT NULL DEFAULT 30,
    "diasBloqueados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordatoriosCorreo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaAjustes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaCita" (
    "id" UUID NOT NULL,
    "tipoId" UUID NOT NULL,
    "asesorId" UUID NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "empresa" TEXT,
    "lms" TEXT,
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "estado" TEXT NOT NULL DEFAULT 'confirmada',
    "leadId" UUID,
    "tokenCancelacionHash" TEXT NOT NULL,
    "canceladaPor" TEXT,
    "invitacionEnviadaEn" TIMESTAMP(3),
    "recordatorio24hEnviadoEn" TIMESTAMP(3),
    "recordatorio1hEnviadoEn" TIMESTAMP(3),
    "cancelacionEnviadaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaCita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AgendaAsesorToAgendaTipo" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_AgendaAsesorToAgendaTipo_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "AgendaTipo_visible_orden_idx" ON "AgendaTipo"("visible", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaCita_tokenCancelacionHash_key" ON "AgendaCita"("tokenCancelacionHash");

-- CreateIndex
CREATE INDEX "AgendaCita_asesorId_inicio_idx" ON "AgendaCita"("asesorId", "inicio");

-- CreateIndex
CREATE INDEX "AgendaCita_estado_inicio_idx" ON "AgendaCita"("estado", "inicio");

-- CreateIndex
CREATE INDEX "AgendaCita_inicio_idx" ON "AgendaCita"("inicio");

-- CreateIndex
CREATE INDEX "_AgendaAsesorToAgendaTipo_B_index" ON "_AgendaAsesorToAgendaTipo"("B");

-- AddForeignKey
ALTER TABLE "AgendaCita" ADD CONSTRAINT "AgendaCita_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "AgendaTipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaCita" ADD CONSTRAINT "AgendaCita_asesorId_fkey" FOREIGN KEY ("asesorId") REFERENCES "AgendaAsesor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaCita" ADD CONSTRAINT "AgendaCita_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgendaAsesorToAgendaTipo" ADD CONSTRAINT "_AgendaAsesorToAgendaTipo_A_fkey" FOREIGN KEY ("A") REFERENCES "AgendaAsesor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgendaAsesorToAgendaTipo" ADD CONSTRAINT "_AgendaAsesorToAgendaTipo_B_fkey" FOREIGN KEY ("B") REFERENCES "AgendaTipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CP-135 · Nunca dos citas confirmadas del mismo asesor a la misma hora, aunque lleguen a la vez. Prisma no declara
-- índices parciales: vive solo aquí y la API traduce su violación (P2002) en 409 FRANJA_OCUPADA.
CREATE UNIQUE INDEX "AgendaCita_asesor_inicio_confirmada_key" ON "AgendaCita"("asesorId", "inicio") WHERE "estado" = 'confirmada';
