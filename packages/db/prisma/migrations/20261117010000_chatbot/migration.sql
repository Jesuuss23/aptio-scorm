-- HU-1604 · Chatbot del sitio (REQ-077, RN-17-4): ajustes, respuestas rápidas, fuentes manuales y conversaciones sin datos personales. Solo agrega.
-- CreateTable
CREATE TABLE "SitioChatbot" (
    "id" TEXT NOT NULL DEFAULT 'chatbot',
    "nombre" TEXT NOT NULL DEFAULT 'Ana',
    "saludoEs" TEXT NOT NULL DEFAULT '',
    "saludoEn" TEXT NOT NULL DEFAULT '',
    "tono" TEXT NOT NULL DEFAULT 'cercano',
    "objetivo" TEXT NOT NULL DEFAULT 'agendar_demo',
    "horarioInicio" TEXT NOT NULL DEFAULT '09:00',
    "horarioFin" TEXT NOT NULL DEFAULT '18:00',
    "diasAtencion" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioChatbot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitioChatRapida" (
    "id" UUID NOT NULL,
    "textoEs" TEXT NOT NULL,
    "textoEn" TEXT NOT NULL DEFAULT '',
    "accion" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "ficticio" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioChatRapida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitioChatFuente" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioChatFuente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitioConversacion" (
    "id" UUID NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "mensajes" JSONB NOT NULL DEFAULT '[]',
    "resultado" TEXT NOT NULL DEFAULT 'sin_conversion',
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioConversacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitioChatRapida_visible_orden_idx" ON "SitioChatRapida"("visible", "orden");

-- CreateIndex
CREATE INDEX "SitioChatFuente_visible_idioma_idx" ON "SitioChatFuente"("visible", "idioma");

-- CreateIndex
CREATE INDEX "SitioConversacion_creadoEn_idx" ON "SitioConversacion"("creadoEn");

-- CreateIndex
CREATE INDEX "SitioConversacion_expiraEn_idx" ON "SitioConversacion"("expiraEn");

