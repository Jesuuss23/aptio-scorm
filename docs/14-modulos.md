# Especificación por módulo

Referencia visual: `docs/diseno/prototipo-unificado.html`. Cada módulo corresponde a una opción del menú del prototipo. Cuando este documento y otro anterior se contradigan, vale este (ver ADR-008).

Formato de cada módulo: propósito · quién lo usa · funciones · reglas de negocio (RN) · datos · API · procesos en cola · estados vacíos y errores · requisitos · demo para probar.

## Mapa de módulos

| Módulo | Menú del prototipo | Pantallas (PNT) | Épica Jira |
| --- | --- | --- | --- |
| M01 Acceso y roles | (inicio de sesión) | — | E01 |
| M02 Clientes y kits | Empresa › Clientes y kits | PNT-02 | E02 |
| M03 Proyectos y Nuevo SCORM | Inicio › Proyectos, Nuevo SCORM | PNT-01, PNT-03, PNT-04 | E03 |
| M04 Generador | Proyecto › Producción | PNT-19 | E04 |
| M05 Revisión y calidad | Proyecto › Revisión | PNT-20 | E05 |
| M06 Editor de pantalla | Proyecto › Editor | PNT-06, PNT-21 | E06 |
| M07 Personaje y voz | Proyecto › Personaje y voz | PNT-09 | E07 |
| M08 Idiomas y subtítulos | Proyecto › Idiomas | PNT-11 | E08 |
| M09 Video interactivo | Proyecto › Video interactivo | PNT-10 | E09 |
| M10 Alineación pedagógica | Proyecto › Alineación pedagógica | PNT-18 | E10 |
| M11 Navegación y reproductor | Proyecto › Navegación, Vista previa | PNT-17, PNT-12 | E11 |
| M12 Entrega | Proyecto › Entrega | PNT-13, PNT-16 | E12 |
| M13 Costos, rentabilidad y conexiones IA | Empresa › Rentabilidad, Conexiones IA | PNT-22, PNT-23 | E13 |
| M14 Recursos y biblioteca | (dentro del Editor y Kits) | PNT-08 | E06, E02 |
| M15 Plataforma | — | — | E01, E14 |
| M16 Sitio web y contenido | Sitio web › Resumen, Páginas (generales y landings por sector), Contenido, Blog, SEO, SEO para IA; Configuración › Ajustes del sitio | PNT-24 a PNT-30, PNT-38, PNT-39 | E15 |
| M17 Captación y CRM | Captación › Popups, Chatbot, Agendamiento, Leads y CRM | PNT-31 a PNT-34 | E16 |
| M18 Planes, suscripciones y facturación | Ventas › Planes, Suscripciones, Facturación | PNT-35 a PNT-37, PNT-40 | E17 |

M16–M18 son de la fase comercial: su especificación (reglas RN-16, RN-17 y RN-18, datos, API) está en `23-sitio-comercial-y-facturacion.md`. Solo los usa el rol **superadmin** de plataforma (ADR-011). El administrador de cada organización ve únicamente la facturación de su organización (PNT-40).

## Permisos por rol

| Acción | Administrador | Diseñador instruccional | Diseñador gráfico | Productor | Revisor del cliente |
| --- | --- | --- | --- | --- | --- |
| Usuarios y conexiones IA | ✓ | — | — | — | — |
| Parámetros de rentabilidad | ✓ | ver | — | — | — |
| Clientes y kits | ✓ | ✓ | ✓ | ver | — |
| Pantallas modelo del kit | ✓ | ver | ✓ | ver | — |
| Crear proyecto y generar | ✓ | ✓ | — | ✓ | — |
| Editar pantallas | ✓ | ✓ | ✓ | ✓ | — |
| Aprobar pantallas | ✓ | ✓ | — | — | — |
| Alineación y navegación | ✓ | ✓ | ver | ver | — |
| Exportar | ✓ | ✓ | — | ✓ | — |
| Comentar y ver vista previa | ✓ | ✓ | ✓ | ✓ | solo su cliente |

---

## M01 Acceso y roles

- **Propósito:** que solo el equipo y los revisores autorizados entren, cada uno con lo que le corresponde.
- **Funciones:** iniciar y cerrar sesión; crear usuarios con rol; desactivar; cambiar clave; enlace de revisor del cliente limitado a sus proyectos.
- **Reglas:**
  - RN-01-1: 5 intentos fallidos bloquean la cuenta 15 minutos.
  - RN-01-2: los permisos se validan en la API; ocultar botones en la interfaz no basta.
  - RN-01-3: el revisor del cliente solo ve proyectos de su cliente y solo puede comentar.
- **Datos:** Usuario, Auditoria. **API:** `/auth/*`, `/yo`, `/usuarios`.
- **Demo:** entrar con cada rol y comprobar que el menú y las acciones cambian.

## M02 Clientes y kits de marca

- **Propósito:** que todo lo que genera la IA salga con la identidad de cada cliente.
- **Funciones:**
  - lista de clientes y alta rápida;
  - paleta (5 colores) con control de contraste AA;
  - estilo base y tipografías con licencia;
  - logo;
  - personaje con verificación de bocas A–X (avisa cuáles faltan);
  - voz por idioma;
  - glosario y diccionario de pronunciación;
  - **pantallas modelo** que diseña el equipo gráfico;
  - "✦ Extraer de un curso anterior" (propuesta de kit desde un ZIP o PDF).
- **Reglas:**
  - RN-02-1: cambiar la paleta no regenera contenido; el reproductor aplica el kit al mostrar. Las miniaturas se renuevan en segundo plano.
  - RN-02-2: un contraste texto/fondo menor a 4,5:1 muestra advertencia y no bloquea.
  - RN-02-3: el kit tiene `version`; guardar con versión vieja devuelve 409.
  - RN-02-4: cambiar voz, velocidad o pronunciación marca como desactualizadas las narraciones afectadas.
  - RN-02-5: sin pantallas modelo, el generador usa las del estilo base.
- **Datos:** Cliente, KitMarca, PantallaModelo, GlosarioTermino, PronunciacionTermino, FichaCompatibilidad.
- **API:** `/clientes/*`, `/clientes/{id}/kit/*`.
- **Demo:** cambiar el color primario y ver las pantallas modelo actualizadas al instante.

## M03 Proyectos y Nuevo SCORM

- **Propósito:** crear un proyecto en segundos y dejar listo lo que necesita el generador.
- **Funciones:**
  - tarjetas de proyectos con estado, avance y costo de IA;
  - **Nuevo SCORM** con estas entradas:
    - material: PDF, Word, PowerPoint, video, audio o solo el tema;
    - cliente y kit;
    - pantallas (10–60 o más);
    - idiomas, público, tono y % de actividades;
  - sección plegada **Datos técnicos y estimación (opcional)**:
    - LMS destino ("Aún no se sabe"), formato, horas de capacitación y % en SCORM;
    - estimación de pantallas, cantidad de SCORM y meses con el equipo;
  - extracción de texto por página (con OCR si está escaneado) y transcripción de video y audio;
  - mapa de temas con conservar, complementario u omitir, más su motivo, y acta de omitidos.
- **Reglas:**
  - RN-03-1: solo cliente y nombre son obligatorios.
  - RN-03-2: la falta de datos técnicos nunca bloquea; al exportar sin LMS se usa el perfil Genérico.
  - RN-03-3: los documentos del cliente son datos no confiables; en los prompts van delimitados y con la instrucción de no seguir órdenes que contengan.
  - RN-03-4: estimación = horas × 60 × % SCORM / 1,2 min por pantalla. Los supuestos son editables (SUP-01).
- **Datos:** Proyecto, MaterialFuente, Recurso. **API:** `/proyectos/*`, `/recursos/subidas*`.
- **Cola:** `media` (extracción, OCR, transcripción).
- **Estados vacíos:** sin proyectos → botón "Nuevo SCORM" y enlace a crear el primer kit.
- **Demo:** crear un proyecto solo con nombre y tema; crear otro con el PDF de ejemplo y ver sus páginas.

## M04 Generador (Producción)

- **Propósito:** convertir el material en un SCORM completo y revisable sin trabajo manual.
- **Etapas** (cada una registra proveedor, consumo, costo y resultado):

| # | Etapa | Entrada | Salida (valida contra esquema) | Tarea IA |
| --- | --- | --- | --- | --- |
| 1 | Leer y resumir | Páginas o transcripción | Ideas clave con página de origen; temas omitidos con motivo | IA-01, IA-02, IA-03 |
| 2 | Objetivos y estructura | Ideas + público + extensión | Objetivos con nivel de Bloom; módulos; lista de pantallas con tipo y objetivo | IA-04 |
| 3 | Storyboard y guion | Estructura | Por pantalla: título, texto corto en pantalla (≤ 30 palabras), narración, actividad | IA-05 |
| 4 | Pantallas con componentes del kit | Guion + pantallas modelo | Por pantalla: `disposicion` + campos de contenido de esa disposición + datos de la actividad (INT-01..08) | IA-15, IA-07 |
| 5 | Ilustraciones | Pedidos de imagen de la etapa 4 | Recursos GENERADO o reutilizados de la biblioteca (primero reutiliza) | IA-11 |
| 6 | Voz ES | Narraciones + diccionario | Audio por pantalla | — (TTS) |
| 7 | Boca | Audio | Marcas `[ms, boca]` A–X | — (fonético) |
| 8 | Subtítulos | Narración + tiempos | WebVTT por idioma | — |
| 9 | Versión EN | Textos ES + glosario | Textos EN, voz EN, boca EN, subtítulos EN | IA-10 |
| 10 | Control de calidad | Curso completo | Observaciones (alineación, accesibilidad, longitud, ortografía, faltantes) | IA-12 + reglas |
| 11 | Paquete de prueba | Curso | SCORM 1.2 de prueba y vista previa | — |

- **Reglas:**
  - RN-04-1: la IA **nunca devuelve HTML ni código**. Devuelve JSON con la disposición y sus campos; el reproductor dibuja con los componentes del kit.
  - RN-04-2: cada salida se valida (Ajv). Si no valida, se reintenta hasta 2 veces con el error. Si sigue fallando, la etapa queda en ERROR con opción "Reintentar etapa" y no se guarda nada a medias.
  - RN-04-3: una sola generación activa por proyecto.
  - RN-04-4: la generación deja el curso con pantallas en estado `propuesta-ia`. Nada queda aprobado automáticamente.
  - RN-04-5: si el usuario cancela, se conserva lo terminado.
  - RN-04-6: las etapas 6 a 9 se paralelizan por pantalla. Las pantallas aparecen en Producción a medida que están listas (evento `pantalla-lista`).
  - RN-04-7: si se supera el límite de gasto mensual de un proveedor, la etapa se pausa y avisa al administrador.
- **Datos:** Generacion, GeneracionEtapa, TrabajoIA, Curso, CursoVersion, Recurso, Narracion.
- **API:** `/proyectos/{id}/generaciones`, `/generaciones/{id}`, `/generaciones/{id}/eventos`.
- **Colas:** `ia`, `media`, `voz`, `export`.
- **Demo:** generar el SCORM de ejemplo (LOTO, 30 pantallas, ES + EN) y ver las etapas avanzar con su costo.

## M05 Revisión y control de calidad

- **Propósito:** que el diseñador instruccional revise y apruebe rápido, sin rehacer.
- **Funciones:**
  - filtros: todas, con observaciones, actividades;
  - pantalla animada con "▶ Ver con voz y boca" y subtítulos;
  - edición de título y narración con **regeneración en cascada** visible (Voz ES, Boca, Subtítulos ES, Traducción EN, Voz EN, Subtítulos EN);
  - **Ajustar con IA:**
    - más visual;
    - menos texto;
    - convertir en actividad;
    - ver 3 variantes;
    - otra ilustración;
    - pedido libre;
  - control de calidad por pantalla, con el origen (página del manual o IA);
  - aprobar una por una o "aprobar todas las que no tienen observaciones";
  - comentarios del revisor del cliente.
- **Reglas:**
  - RN-05-1: aprobar exige que no haya observaciones de severidad `bloquea-entrega` en esa pantalla.
  - RN-05-2: una pantalla aprobada que se modifica vuelve a `borrador` y pide nueva aprobación.
  - RN-05-3: las propuestas de IA se muestran como franja con Aplicar o Descartar. Aplicar crea una `CursoVersion` y se puede deshacer.
  - RN-05-4: una propuesta calculada sobre una versión vieja queda VENCIDA y se ofrece recalcular.
  - RN-05-5: la regeneración en cascada espera 1 segundo sin escribir antes de lanzar trabajos, para no gastar en cada tecla.
- **Datos:** Curso, Propuesta, Observacion, Comentario, Narracion, Traduccion.
- **API:** `/cursos/{id}/pantallas/*`, `/cursos/{id}/propuestas`, `/propuestas/*`, `/cursos/{id}/observaciones`, `/cursos/{id}/comentarios`.
- **Demo:** cambiar la narración de una pantalla, ver que voz, boca e inglés se actualizan solos, y aprobar las 27 sin observaciones de una vez.

## M06 Editor de pantalla (retoque)

- **Propósito:** retocar lo generado con la facilidad de Canva o Genially.
- **Funciones:**
  - riel con:
    - Diseños: la misma pantalla en otras composiciones;
    - Agregar: título, texto, dato clave, botón, imagen, insignia, forma, personaje;
    - Imágenes: kit, subir o generar;
    - Capas;
    - IA;
  - barra contextual: tamaño A−/A+, colores del kit, alineación, animación, ✦ mejorar texto, ocultar, restablecer, eliminar;
  - doble clic para escribir sobre la pantalla;
  - modo Automático o Libre: arrastrar y flechas de 0,5 % (Libre);
  - panel de propiedades: texto, tamaño, color, animación y retardo, imagen y texto alternativo, pose del personaje, respuesta correcta y retroalimentación;
  - "Avanzado: disparadores y variables";
  - **línea de tiempo** (visible por defecto bajo el lienzo, se puede ocultar):
    - pistas fijas: regla en segundos, narración ES palabra por palabra, subtítulos (WebVTT) y boca de Ana (visemas);
    - una barra por elemento: arrastrar el cuerpo cambia cuándo aparece, el borde izquierdo la entrada y el derecho la salida; se imanta a las palabras de la narración y a décimas de segundo;
    - aguja roja: Reproducir/Pausa (barra espaciadora), ■ para volver al inicio y ver todo, clic o arrastre en la regla o en una palabra para ir a ese momento; el lienzo muestra solo lo activo en ese segundo, con la boca y el subtítulo de ese instante;
    - ojo por elemento (ocultar o mostrar), zoom −/+ y Ajustar;
    - "Termina la voz → se habilita Siguiente" marcado en la regla;
    - ✦ Sincronizar con la voz: propuesta de IA que hace aparecer cada elemento cuando Ana lo nombra;
    - en propiedades: Aparece (s), Sale (s) y "Que aparezca cuando Ana dice…" (lista de palabras);
  - deshacer y rehacer (Ctrl+Z);
  - tira de pantallas.
- **Reglas:**
  - RN-06-1: los retoques se guardan en `ajustes` y `extras` de la pantalla, separados del contenido. La IA puede regenerar textos sin perder retoques.
  - RN-06-2: posiciones y tamaños en % del ancho de la pantalla (unidades relativas), nunca píxeles. Los desplazamientos pueden ser por dispositivo.
  - RN-06-3: cambiar la disposición reinicia los `ajustes` de esa pantalla, conserva el contenido y se puede deshacer.
  - RN-06-4: colores solo del kit (roles), para mantener la marca.
  - RN-06-5: guardado automático 1 segundo después del último cambio, con bloqueo optimista.
  - RN-06-6: el editor usa el mismo reproductor que el paquete exportado (decisión 3).
  - RN-06-7: los tiempos se guardan en `ajustes` (`retardoS`, `finS`, `anclaPalabra`). La duración de la pantalla es la mayor entre la voz + 1 s y la salida del último elemento.
  - RN-06-8: si el elemento está anclado a una palabra y la narración cambia, el tiempo se recalcula con las marcas de palabra de la nueva voz (las da el proveedor de voz o el reconocedor fonético). Si la palabra ya no está, conserva el segundo y genera una observación "revisar tiempo".
  - RN-06-9: sin tiempos definidos, los elementos entran escalonados (0,3 s entre uno y otro) en el orden de la disposición.
- **Datos:** Curso (`pantalla.disposicion`, `ajustes`, `extras`), Recurso.
- **API:** `PATCH /cursos/{id}/pantallas/{pantallaId}`, `/recursos/*`.
- **Demo:** cambiar la disposición, mover una imagen en modo Libre, agregar un botón, deshacer y recargar la página: los cambios siguen ahí. En la línea de tiempo, arrastrar el «Dato clave» hasta la palabra que lo nombra, recortar su salida y reproducir: aparece y sale en esos segundos, con la boca y los subtítulos sincronizados.

## M07 Personaje y voz

- **Propósito:** narración y boca sincronizada sin pasar por video ni Premiere.
- **Funciones:**
  - lista de narraciones con duración y estado (Lista o Por regenerar);
  - escuchar con boca sincronizada;
  - voz por idioma y velocidad;
  - diccionario de pronunciación;
  - audio del cliente: limpiar ruido, re-locutar con IA o usar con boca automática.
- **Reglas:**
  - RN-07-1: `textoHash` decide si una narración está desactualizada (ver `12-modelo-datos.md`).
  - RN-07-2: la boca se calcula desde el audio con reconocedor fonético. Sirve igual para TTS y grabaciones; con Azure se pueden usar sus visemas.
  - RN-07-3: si al personaje le falta una boca (por ejemplo la G), se usa la más cercana (B) y se avisa en el kit.
  - RN-07-4: una voz real de persona solo con autorización registrada.
- **Datos:** Narracion, Recurso, KitMarca. **API:** `/cursos/{id}/narraciones*`, `/voz/muestra`. **Cola:** `voz`.
- **Demo:** escuchar a Ana en 3 pantallas; cambiar la pronunciación de "LOTO" y regenerar solo las afectadas.

## M08 Idiomas y subtítulos

- **Propósito:** español e inglés en el mismo curso, con traducción revisable.
- **Funciones:**
  - tabla ES/EN por pantalla con estado: Pendiente, Traducido por IA, Revisado o Desborde;
  - "✦ Traducir pendientes";
  - glosario del cliente;
  - ambos idiomas en un SCORM o en paquetes separados;
  - subtítulos WebVTT;
  - voz y boca en inglés.
- **Reglas:**
  - RN-08-1: los términos del glosario se respetan; "no traducir" se mantiene igual.
  - RN-08-2: "Traducir pendientes" no cambia lo marcado como Revisado.
  - RN-08-3: un texto que excede el espacio de su componente queda como Desborde, con propuesta de versión corta.
  - RN-08-4: en el mismo paquete, cambiar de idioma conserva la pantalla, el avance y la nota.
- **Datos:** Traduccion, Narracion, GlosarioTermino. **API:** `/cursos/{id}/traducciones*`, `/traducciones/{id}`.
- **Demo:** traducir, corregir un texto en inglés y verlo en la vista previa con subtítulos EN.

## M09 Video interactivo

- **Propósito:** volver interactivo el video del cliente.
- **Funciones:**
  - reproductor con línea de tiempo y marcadores;
  - pregunta que pausa el video;
  - "Impedir adelantar hasta responder";
  - agregar pregunta en el tiempo actual;
  - "✦ Proponer pausas desde la transcripción";
  - transcripción sincronizada.
- **Reglas:**
  - RN-09-1: los marcadores viven en el bloque de video del curso (`marcadores`), con tiempo y pregunta.
  - RN-09-2: con impedir adelantar, saltar más allá de una pregunta no respondida no se permite y se explica por qué.
  - RN-09-3: video sin subtítulos en un idioma del curso queda como observación.
  - RN-09-4: videos pesados se transcodifican; si el tamaño supera el límite del LMS se ofrece alojar el video fuera del paquete.
- **Datos:** Curso, Recurso, MaterialFuente (transcripción). **API:** `/cursos/{id}/propuestas` (tipo `pausas-video`). **Cola:** `media`.
- **Demo:** reproducir, responder la pregunta del minuto 0:45 y comprobar que no deja adelantar.

## M10 Alineación pedagógica

- **Propósito:** asegurar que cada objetivo se presenta, se practica y se evalúa a su nivel de Bloom.
- **Funciones:**
  - matriz objetivos × pantallas con roles P (presenta), A (practica) y E (evalúa) y su nivel;
  - nivel de Bloom editable por objetivo;
  - alertas;
  - "✦ Proponer correcciones";
  - clic en una pantalla para revisarla.
- **Reglas:**
  - RN-10-1: rol de cada pantalla: actividad sumativa = E; actividad formativa = A; contenido = P. Portada, objetivos, separadores, resultados y cierre no cuentan.
  - RN-10-2: alerta si un objetivo no tiene P, A o E, o si ninguna A o E alcanza su nivel de Bloom.
  - RN-10-3: el informe se calcula sin IA; la IA solo propone correcciones (propuesta revisable).
- **Datos:** Curso (objetivos, `objetivoIds`, nivel por pantalla). **API:** `/cursos/{id}/alineacion`, `/cursos/{id}/propuestas` (tipo `alineacion`).
- **Demo:** ver las 2 alertas del ejemplo, aplicar la propuesta y ver 0 alertas.

## M11 Navegación y reproductor

- **Propósito:** definir cómo recorre el participante la cápsula y probarlo tal como se verá en el LMS.
- **Funciones:**
  - 7 patrones: clásico, historias, desplazamiento vertical, mapa de misiones, menú de temas, ramificado e inmersivo;
  - patrón personalizado creado con IA;
  - "✦ Recomendar";
  - reglas: libre, con actividades obligatorias o secuencial;
  - reanudación;
  - elementos visibles;
  - patrón preferido del cliente;
  - **Vista previa** en escritorio y celular con temario, glosario, ayuda, accesibilidad, subtítulos, puntos y narración.
- **Reglas:**
  - RN-11-1: cualquier patrón se combina con cualquier regla.
  - RN-11-2: todos los patrones mantienen registro SCORM, reanudación, teclado, lector de pantalla y botones como alternativa a deslizar.
  - RN-11-3: el patrón personalizado es configuración validada (`patronPersonalizado`), nunca código.
  - RN-11-4: con "actividades obligatorias", Siguiente se deshabilita y muestra el motivo ("Completa la actividad para continuar").
  - RN-11-5: el avance, los puntos y las respuestas caben en `suspend_data` (4.096 caracteres en SCORM 1.2). Si no caben, se comprime y se avisa en el validador.
- **Datos:** Curso (`navegacion`), KitMarca (patrón preferido). **API:** `/cursos/{id}/navegacion`, `/cursos/{id}/vista-previa`.
- **Paquete:** `packages/player`.
- **Demo:** probar el mismo curso con Clásico, Historias y Mapa; comprobar que la actividad bloquea el avance.

## M12 Entrega

- **Propósito:** paquetes que funcionen en cualquier LMS, incluso en los que no conocemos.
- **Funciones:**
  - formatos: SCORM 1.2 (por defecto), SCORM 2004, HTML, ES + EN en el mismo paquete, informe para el cliente y kit de gamificación; H5P más adelante;
  - perfil de LMS: Genérico, Moodle, Blackboard, Chamilo, Canvas u otro con ficha de compatibilidad;
  - verificación automática;
  - modo diagnóstico dentro del paquete;
  - descarga.
- **Reglas:**
  - RN-12-1: el perfil Genérico cumple el estándar de forma estricta; los perfiles solo agregan recomendaciones.
  - RN-12-2: nunca se bloquea por tamaño; se advierte con alternativas (comprimir, dividir, video externo).
  - RN-12-3: pantallas sin aprobar → advertencia (no bloquea en el prototipo; en MVP requiere confirmación del diseñador instruccional).
  - RN-12-4: una exportación queda ligada a la versión del curso; volver a exportar no cambia la anterior.
- **Datos:** Exportacion, FichaCompatibilidad, Recurso. **API:** `/cursos/{id}/validar`, `/cursos/{id}/exportaciones`, `/exportaciones/{id}`.
- **Paquete:** `packages/exporters`. **Cola:** `export`.
- **Demo:** exportar SCORM 1.2 y subirlo a SCORM Cloud y a Moodle de pruebas; ver avance, nota y reanudación.

## M13 Costos, rentabilidad y conexiones IA

- **Propósito:** saber cuánto cuesta cada SCORM y si se puede competir en precio.
- **Funciones:**
  - **Rentabilidad:**
    - horas por etapa, hoy frente al generador;
    - días por SCORM, SCORM al mes, costo por SCORM y margen al precio de la competencia;
    - datos editables;
    - fuente "supuestos" o "mediciones".
  - **Mediciones:** registrar horas reales por etapa de proyectos medidos (campos vacíos para llenar).
  - **Conexiones IA:**
    - proveedor y modelo por tarea;
    - prueba de conexión;
    - costo estimado por SCORM;
    - límite de gasto mensual.
- **Reglas:**
  - RN-13-1: costo por SCORM = horas × tarifa + IA por API × tipo de cambio + licencias del mes ÷ SCORM al mes.
  - RN-13-2: cambiar de proveedor no rehace nada ya generado; aplica a lo próximo.
  - RN-13-3: las claves nunca se muestran; solo "configurada sí o no".
- **Datos:** TrabajoIA, ConfigProveedor, ParametrosNegocio, MedicionProceso.
- **API:** `/costos`, `/negocio/*`, `/conexiones-ia/*`.
- **Demo:** cargar las horas medidas de un proyecto y ver la rentabilidad con datos reales.

## M14 Recursos y biblioteca

- **Funciones:**
  - subida directa a S3 con URL firmada;
  - ilustraciones del kit recoloreables;
  - imágenes generadas (4 variantes con el estilo del kit);
  - SVG con capas;
  - texto alternativo.
- **Reglas:**
  - RN-14-1: se verifica el tipo real del archivo.
  - RN-14-2: los SVG se limpian de `<script>`, `on*` y referencias externas.
  - RN-14-3: imagen no decorativa sin texto alternativo = observación de accesibilidad.
  - RN-14-4: cada recurso guarda origen y licencia.

## M15 Plataforma

- Monorepo, colas BullMQ (`ia`, `voz`, `media`, `export`) y eventos SSE.
- Registro estructurado con id de trabajo, auditoría, límites de gasto, copias de seguridad de PostgreSQL y S3.
- Variables de entorno: ver `17-guia-desarrollo.md`.
- Observabilidad mínima:
  - tiempo y costo por etapa;
  - errores por proveedor;
  - cola pendiente.
