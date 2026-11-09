# Flujos principales

Diagramas de secuencia de los procesos que cruzan varios módulos. Participantes: **Web** (`apps/web`), **API** (`apps/api`), **Cola** (BullMQ en Redis), **Worker** (`apps/worker`), **BD** (PostgreSQL), **S3**, proveedores externos.

## F1 · Generar un SCORM

```mermaid
sequenceDiagram
  autonumber
  actor U as Diseñador
  participant W as Web
  participant A as API
  participant Q as Cola
  participant K as Worker
  participant C as Claude
  participant T as Voz (Google TTS)
  participant D as BD / S3
  U->>W: Nuevo SCORM (material, kit, pantallas, idiomas)
  W->>A: POST /proyectos
  W->>A: POST /proyectos/{id}/generaciones
  A->>D: crea Generacion + 11 etapas (EN_COLA)
  A->>Q: encola etapa 1
  A-->>W: 202 {id, eventos}
  W->>A: GET /generaciones/{id}/eventos (SSE)
  loop etapas 1 a 4 (texto y pantallas)
    Q->>K: procesa etapa
    K->>C: prompt + esquema de salida
    C-->>K: JSON
    K->>K: valida (Ajv) · reintenta hasta 2 veces
    K->>D: guarda resultado + TrabajoIA (costo)
    K-->>W: evento etapa / pantalla-lista
  end
  par por pantalla
    K->>T: narración ES
    T-->>K: audio
    K->>K: boca fonética + WebVTT
    K->>D: Narracion + Recursos en S3
  and
    K->>C: traducción EN con glosario
    K->>T: narración EN
  end
  K->>K: control de calidad (reglas + IA-12)
  K->>D: Observaciones, Curso v1, CursoVersion
  K-->>W: evento fin
  W->>U: Producción completa → Revisar
```

Si una etapa falla tras 2 reintentos, queda en `ERROR` con "Reintentar etapa". No se guarda nada a medias y lo anterior se conserva.

## F2 · Cambiar un texto y regenerar en cascada

```mermaid
sequenceDiagram
  autonumber
  actor U as Revisor interno
  participant W as Web
  participant A as API
  participant D as BD
  participant Q as Cola
  participant K as Worker
  U->>W: edita la narración de la pantalla 05
  W->>W: espera 1 s sin escribir
  W->>A: PATCH /cursos/{c}/pantallas/p05 (If-Match v12)
  A->>D: valida, guarda v13 + CursoVersion
  A->>A: calcula textoHash y rutas afectadas
  A->>D: Narracion ES/EN p05 = DESACTUALIZADA · Traduccion EN = PENDIENTE
  A->>Q: encola voz-es, traduccion-en (solo p05)
  A-->>W: 200 {version 13, regenerando[...]}
  Q->>K: voz ES → boca → subtítulos ES
  Q->>K: traducción EN → voz EN → boca → subtítulos EN
  K-->>W: eventos narracion (ACTUALIZADA)
  W->>U: chips en verde: Voz ES, Boca, Subtítulos, Traducción EN, Voz EN
```

Si otra persona guardó antes (versión distinta), la API responde `409` y la web ofrece recargar o comparar.

## F3 · Propuesta de la IA y aplicación

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant W as Web
  participant A as API
  participant Q as Cola
  participant K as Worker
  participant C as Claude
  participant D as BD
  U->>W: ✦ Más visual (pantalla 05)
  W->>A: POST /cursos/{c}/propuestas {tipo, pantallaId}
  A->>Q: encola IA-16 con versionBase = 13
  A-->>W: 202
  Q->>K: procesa
  K->>C: pantalla + disposiciones del kit + pedido
  C-->>K: JSON (nueva disposición y campos)
  K->>K: valida y arma JSON Patch
  K->>D: Propuesta PENDIENTE
  K-->>W: evento propuesta-lista
  W->>U: franja con Aplicar / Descartar
  U->>W: Aplicar
  W->>A: POST /propuestas/{p}/aplicar
  alt curso sigue en v13
    A->>D: aplica patch → v14 + CursoVersion "propuesta IA aplicada"
    A-->>W: 200 + regeneración en cascada si cambió texto
  else curso cambió
    A->>D: Propuesta VENCIDA
    A-->>W: 409 → "Recalcular propuesta"
  end
```

## F4 · Exportar SCORM 1.2

```mermaid
sequenceDiagram
  autonumber
  actor U as Diseñador
  participant W as Web
  participant A as API
  participant Q as Cola export
  participant K as Worker
  participant S as S3
  U->>W: Entrega → SCORM 1.2, perfil Genérico, ES+EN
  W->>A: POST /cursos/{c}/validar
  A-->>W: errores / advertencias (tamaño solo advierte)
  U->>W: Exportar
  W->>A: POST /cursos/{c}/exportaciones
  A->>Q: encola con versión del curso
  A-->>W: 202
  Q->>K: arma paquete
  K->>K: copia reproductor + JSON del curso + recursos usados
  K->>K: imsmanifest.xml + adaptador SCORM 1.2 + modo diagnóstico
  K->>K: valida manifiesto y prueba de carga (headless)
  K->>S: ZIP
  K-->>W: evento exportacion COMPLETADO
  W->>A: GET /exportaciones/{id}
  A-->>W: descargaUrl firmada (15 min)
```

## F5 · El paquete dentro del LMS

```mermaid
sequenceDiagram
  autonumber
  actor P as Participante
  participant L as LMS
  participant R as Reproductor (en el paquete)
  P->>L: abre el curso
  L->>R: carga index.html (SCO)
  R->>L: busca API (window.parent / opener)
  R->>L: LMSInitialize("")
  R->>L: LMSGetValue cmi.core.lesson_location y cmi.suspend_data
  alt hay avance guardado
    R->>P: "¿Continuar donde lo dejaste?"
  end
  loop cada pantalla
    P->>R: avanza o responde
    R->>L: LMSSetValue lesson_location, suspend_data, score
    R->>L: LMSCommit("")
  end
  R->>L: LMSSetValue cmi.core.lesson_status = passed / failed / completed
  R->>L: LMSFinish("")
```

Si no encuentra la API, el reproductor muestra el modo diagnóstico con lo que encontró. Sirve para LMS desconocidos y alimenta la ficha de compatibilidad del cliente.

## F6 · Cambio de proveedor de IA

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Administrador
  participant W as Web
  participant A as API
  participant D as BD
  participant K as Worker
  Ad->>W: Conexiones IA → Voz: ElevenLabs
  W->>A: PUT /conexiones-ia/VOZ
  A->>D: ConfigProveedor (sin claves)
  W->>A: POST /conexiones-ia/VOZ/probar
  A->>K: llamada mínima de prueba
  K-->>A: ok, latencia
  A-->>W: Conexión correcta
  Note over K: las próximas narraciones usan ElevenLabs · lo ya generado no cambia
```
