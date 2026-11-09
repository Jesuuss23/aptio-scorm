# Pantallas y opciones

Catálogo de ventanas del software. Es la base del prototipo visual y de las historias del backlog. Columna **Prototipo**: Sí = se construye en el prototipo; Visual = solo diseño; MVP/Posterior = después.

## Estructura general de la aplicación

- **Barra lateral izquierda fija:** Proyectos, Clientes y kits, Biblioteca, Estimador, Exportaciones, Configuración.
- **Barra superior del proyecto abierto:** nombre del proyecto y cliente, pestañas del flujo (Brief · Material · Estructura · Editor · Idiomas · Exportar), selector de idioma ES/EN, botón Vista previa, indicador de costo de IA del proyecto.
- **Panel de IA contextual:** en cada pantalla, un botón "Proponer con IA" abre un panel lateral derecho con la propuesta, el motivo y las acciones Aplicar / Aplicar parcialmente / Descartar.

## Mapa de pantallas

> Vigente: el menú del prototipo unificado y la especificación por módulo de `14-modulos.md`. Las pantallas PNT-04, PNT-05 y PNT-07 quedan absorbidas por el generador (M03, M04) y la Revisión (M05).


| ID | Pantalla | Propósito | Prototipo |
| --- | --- | --- | --- |
| PNT-01 | Proyectos | Ver y abrir proyectos por cliente y estado | Sí |
| PNT-02 | Kit de marca del cliente | Definir la identidad visual y de voz de un cliente | Sí |
| PNT-03 | Nuevo proyecto | Crear un proyecto con solo el nombre y elegir cómo empezar (en blanco, plantilla, tema con IA, documentos, video). Estimación y datos técnicos **opcionales** | Sí |
| PNT-04 | Material del cliente | Subir documento o video; mapa de temas, resumen y acta de omitidos | Sí |
| PNT-05 | Estructura y storyboard | Árbol del curso y tabla de pantallas para aprobar | Sí |
| PNT-06 | Editor de cápsula | Editor visual al estilo Canva/Genially: riel de herramientas con galerías, barra contextual, edición sobre el lienzo, tira de pantallas y barra de IA. Dos modos: automático (guiado) y libre | Sí |
| PNT-06A | Editor avanzado, modo libre | Lienzo libre con capas, alineación, guías, diseño por dispositivo y línea de tiempo | Sí (básico) |
| PNT-06B | Animación, estados y disparadores | Capas de pantalla, estados de elementos, disparadores sin código, variables y animación de entrada/énfasis/salida | Sí (básico) |
| PNT-06C | Insertar y asistente IA | Catálogo de elementos y asistente que propone variantes y cambios revisables | Sí |
| PNT-07 | Galería de interacciones | Elegir interacción; la IA sugiere la más adecuada | Sí |
| PNT-08 | Biblioteca y piezas gráficas | Biblioteca, generar por prompt, subir SVG y animar | Sí |
| PNT-09 | Personaje y voz | Narración, boca sincronizada y subtítulos | Sí |
| PNT-10 | Video interactivo | Insertar preguntas y puntos en la línea de tiempo | Sí |
| PNT-11 | Idiomas y subtítulos | Vista paralela ES/EN, glosario y validación de longitud | Sí |
| PNT-12 | Vista previa | Ver como participante en celular y escritorio | Sí |
| PNT-13 | Exportar | Formato, perfil de LMS, validación e informe | Sí (solo JSON); resto Visual |
| PNT-14 | Estimador | Calculadora de producción independiente | Sí |
| PNT-15 | Revisión del cliente | Comentarios y aprobación por pantalla | Posterior |
| PNT-16 | Kit de gamificación para LMS | Insignias y guía por LMS | MVP |
| PNT-17 | Navegación y experiencia del participante | Elegir el **patrón de navegación** (7 del catálogo, recomendado o creado con IA) y configurar las reglas: modo de navegación, cuándo se habilita Siguiente, elementos visibles, reanudación, objetivos al inicio, atajos | Sí |
| PNT-18 | Alineación pedagógica | Matriz objetivos × contenidos, prácticas y evaluaciones con niveles de Bloom y alertas | Sí |
| PNT-19 | Producción | Avance del generador por etapas, pantallas que van apareciendo, costo de IA | Sí (prototipo unificado) |
| PNT-20 | Revisión | Revisar, ajustar con IA, regenerar en cascada y aprobar pantallas | Sí (prototipo unificado) |
| PNT-21 | Editor de retoque | Editor sobre la pantalla generada (ver PNT-06 y M06) | Sí (prototipo unificado) |
| PNT-22 | Rentabilidad | Horas, días, SCORM al mes, costo por SCORM y margen; mediciones | Sí (prototipo unificado) |
| PNT-23 | Conexiones IA | Proveedor y modelo por tarea, costo estimado por SCORM | Sí (prototipo unificado) |
| PNT-24 a PNT-38 | Panel superadmin: Resumen, Páginas (generales y landings por sector), Editor de página, Contenido, Blog, SEO, SEO para IA, Popups, Chatbot, Agendamiento, Leads y CRM, Planes, Suscripciones, Facturación, Ajustes del sitio | Detalle en `23-sitio-comercial-y-facturacion.md` | Sí (`sitio-comercial.html`) |
| PNT-39 | Sitio público | Inicio, Producto, Precios con pago, landings por sector, sección Blog, Agendar demo, popups, chatbot y cookies | Sí (`sitio-comercial.html`) |
| PNT-40 | Facturación de la organización | Plan, consumo, comprobantes y medio de pago | Posterior |

## Detalle por pantalla

### PNT-01 Proyectos

- Filtros: cliente, estado (Diseño, Producción, Revisión, Entregado), idioma, formato.
- Tarjetas o tabla: nombre, cliente con su logo, número de cápsulas, pantallas, avance, idiomas, última modificación, costo de IA acumulado.
- Acciones: Nuevo proyecto, Duplicar como base, Abrir.
- Estado vacío: explica cómo crear el primer proyecto y enlaza a crear un kit de marca.

### PNT-02 Kit de marca del cliente

- Columna izquierda, formulario por secciones: Estilo base (5 estilos de catálogo), Paleta (primario, secundario, acento, fondo, texto; extracción desde logo o PDF), Tipografías (titular y cuerpo, solo de licencia libre), Logo, Personaje (elegir de biblioteca o subir SVG con capas; verificación de bocas A–X), Voz por idioma (proveedor, voz, velocidad; botón Escuchar muestra), Glosario (términos que no se traducen) y Diccionario de pronunciación.
- Columna derecha: vista previa en vivo de tres pantallas tipo (portada, contenido, interacción) en celular, con el kit aplicado.
- Validaciones: contraste de texto sobre fondo; tipografía con licencia web.

### PNT-03 Nuevo proyecto (brief opcional)

Muchos clientes no definen horas, LMS ni datos técnicos al inicio, y el equipo quiere empezar a diseñar de inmediato. Por eso el brief **no es obligatorio**.

- **Ventana "Nuevo proyecto"** (un solo paso). Único campo obligatorio: nombre. Opcionales en la misma ventana: cliente y kit (o "Sin cliente, kit genérico"), idiomas.
- **¿Cómo quieres empezar?** (tarjetas):
  - *Lienzo en blanco:* abre el editor con una pantalla y el título prellenado con el nombre del proyecto.
  - *Desde una plantilla:* elige una cápsula armada (por ejemplo, "Seguridad paso a paso", "Bienvenida al equipo", "Repaso rápido", "Video interactivo") con miniatura y lista de pantallas; abre el editor con todas las pantallas creadas.
  - *Desde un tema con IA:* tema y duración; la IA propone objetivos y pantallas como borrador en PNT-05.
  - *Desde documentos:* lleva a PNT-04.
  - *Desde un video:* lleva a PNT-10.
- **Datos técnicos y estimación (opcional, plegado):** LMS destino ("Aún no se sabe" por defecto), formato, horas de capacitación, fecha de entrega y enlace a la calculadora completa (PNT-14).
- Todo lo opcional se completa después desde la pestaña **Estimación (opcional)** del proyecto o al exportar (PNT-13). Ninguna pantalla posterior se bloquea por falta de estos datos. Si al exportar no hay LMS destino, se usa el perfil Genérico.

La calculadora completa (antes "brief de 5 pasos") vive en PNT-14 y en la pestaña Estimación del proyecto, con el aviso "Este paso es opcional" y el botón "Saltar e ir al editor".

### PNT-04 Material del cliente

- Zona de carga: PDF, Word, PowerPoint, video, audio, imágenes.
- Para documentos: lista de páginas extraídas (marca las escaneadas que pasaron por OCR), **mapa de temas** con peso en el documento y objetivos relacionados, y tres columnas arrastrables: Conservar · Mover a complementario (PDF descargable) · Omitir, cada tarjeta con el motivo propuesto por la IA.
- Selector de tipo de síntesis: ideas clave, paso a paso, preguntas frecuentes, glosario, casos.
- Meta de extensión tomada de la estimación si existe (por ejemplo, "3 cápsulas de 8 min"); si no, la elige el diseñador.
- Botón Generar acta de omitidos (documento para que el cliente apruebe).
- Para video y audio: ver PNT-10 y PNT-09.

### PNT-05 Estructura y storyboard

- Izquierda: árbol Curso → Módulos → Cápsulas → Pantallas, reordenable.
- Centro: tabla storyboard de la cápsula seleccionada. Columnas: N.º, título, objetivo, tipo de pantalla, texto en pantalla, narración, visual sugerido, interacción, retroalimentación, origen (documento y página o "IA"), estado (Borrador, Aprobado).
- Derecha: matriz de alineación objetivo → pantallas → interacciones → preguntas, con alertas (objetivo sin práctica, pregunta sin objetivo).
- Acciones: Proponer estructura con IA, Proponer storyboard, Aprobar pantalla, Aprobar todo, Exportar storyboard (Word/PDF, posterior).

### PNT-06 Editor de cápsula (editor visual amigable)

Referencias de experiencia: Canva, Genially, Articulate Rise. Principio: **lo frecuente a un clic y a la vista; lo avanzado plegado.** El editor ocupa toda la pantalla (se oculta el menú lateral de la aplicación; queda "← Proyectos").

- **Barra superior:** Deshacer/Rehacer, número y nombre editable de la pantalla, modo **Automático** (guiado: la plantilla acomoda) / **Libre**, Escritorio / Celular, cuadrícula (solo en libre), Ayuda, mostrar/ocultar propiedades, Probar (vista previa).
- **Riel de íconos con etiqueta (izquierda)** que abre un panel de galería con buscador. Clic en una miniatura la agrega al centro; también se **arrastra al lienzo** y queda donde se suelta.
  - *Diseños:* plantillas de pantalla con miniatura real (portada, idea + imagen, memoria, clasificar, ordenar, tarjetas, quiz, explorar escena, verdadero/falso, decisión, video con preguntas, cierre). Opción "Cambiar esta pantalla" o "Agregar pantalla".
  - *Elementos:* formas, botones, tarjetas, avisos, punto interactivo, zona de soltar, insignia, contador de puntos.
  - *Texto:* "Agregar un título / subtítulo / párrafo / dato clave" mostrados con la tipografía y colores del kit.
  - *Actividades:* catálogo INT-01..08 y video con preguntas, con miniatura; se agregan como pantalla nueva. Botón "✦ ¿Qué actividad conviene aquí?".
  - *Medios:* ilustraciones del kit (se recolorean), generar imagen con IA (4 variantes), video del cliente, narración.
  - *Personajes:* poses del personaje del kit; enlace a voz y boca.
  - *Subir:* imágenes y SVG propios (también arrastrando archivos al lienzo). Los SVG se sanitizan (REQ-020).
  - *Marca:* colores y tipografías del kit, aplicar colores del kit a la pantalla.
  - *Capas:* orden, visibilidad y bloqueo.
  - *IA:* acciones de un clic y pedido libre.
- **Barra contextual sobre el lienzo:** cambia según lo seleccionado.
  - Sin selección: fondo de la pantalla (colores del kit), cambiar diseño, ver animación, ✦ animar entrada, ✦ otra variante.
  - Texto: editar, A− / A+, colores del kit, animación, ✦ mejorar texto, duplicar, al frente, bloquear, eliminar.
  - Personaje: pose, voz y boca. Imagen: reemplazar, ✦ variantes.
- **Lienzo:** clic selecciona, **doble clic en un texto para escribir directamente** (Enter termina, Esc cancela), arrastrar mueve, círculo de la esquina cambia el tamaño, clic en el fondo deselecciona. Estado vacío con indicaciones.
- **Barra de IA bajo el lienzo:** "Pídele algo a la IA…" con sugerencias (acortar textos, animar entrada, otra variante, revisar accesibilidad, traducir). La propuesta aparece como una franja sobre el lienzo con **Aplicar / Descartar** (REQ-038); aplicar se puede deshacer.
- **Panel de propiedades (derecha, se puede ocultar):** controles visuales, no formularios técnicos.
  - Sin selección: fondo, diseño, objetivo de la pantalla (enlace a PNT-18), narración, cuándo se habilita avanzar (enlace a PNT-17) y, plegado, *Avanzado: disparadores y variables*.
  - Con selección: texto, tamaño (deslizador), colores del kit, animación (chips), "empieza a los N s", "Al hacer clic" (lista simple de acciones) y, plegado, *Más opciones* (posición en %, alinear, nombre de capa, texto alternativo, capas y estados).
- **Tira de pantallas (abajo):** miniaturas reales, clic para cambiar, "+ Pantalla", duplicar, eliminar, duración estimada; la **línea de tiempo** se muestra debajo del lienzo (se puede ocultar): narración palabra por palabra, subtítulos, boca y una barra arrastrable por elemento.
- **Ayuda inicial:** tarjeta "Así de fácil" de 4 pasos la primera vez; se vuelve a abrir con "? Ayuda".

### PNT-06A Editor avanzado (modo libre)

Para el diseñador gráfico. Comparte el curso con el modo guiado: se puede pasar de uno a otro en cualquier pantalla.

- **Barra de herramientas:** seleccionar, texto, forma, imagen, ícono, personaje, botón, punto interactivo, interacción del catálogo, video, audio, gráfico; alinear, distribuir, agrupar, orden de capas; cuadrícula, guías, ajuste magnético, zoom.
- **Panel izquierdo:** Pantallas, Capas (árbol con visibilidad y bloqueo; capas de la pantalla como "Retro correcta"), Insertar, Biblioteca.
- **Lienzo:** reglas, guías inteligentes, tiradores de tamaño, medidas; selector de diseño por dispositivo (escritorio, tableta, celular) y de estado mostrado (normal, correcto, incorrecto).
- **Inspector (derecha):** Diseño (posición, tamaño, rotación, opacidad, anclaje por dispositivo, colores del kit, sombra, pose del personaje), Animación, Interacción, Accesibilidad (texto alternativo, orden de lectura, foco).
- **Línea de tiempo:** pistas de narración, bocas, cada elemento y su entrada/énfasis/salida; cabezal; arrastrar para cambiar tiempos.
- **Otros:** comentarios por elemento, historial de versiones, vista previa.

### PNT-06B Animación, estados y disparadores

- **Capas de la pantalla:** base y capas superpuestas (retroalimentación, pista), con opción de atenuar la base.
- **Estados por elemento:** normal, encima, presionado, seleccionado, visitado, deshabilitado, correcto, incorrecto.
- **Disparadores sin código:** "Cuando [evento] → [acción] si [condición]". Eventos: clic, terminar narración o línea de tiempo, cambio de variable, resultado de interacción, entrar a la pantalla. Acciones: mostrar/ocultar capa, cambiar estado, ir a pantalla, reproducir audio, ajustar variable, evaluar interacción, enviar resultado.
- **Variables del curso:** número, texto, sí/no; algunas vienen del LMS (nombre del participante). Se guardan con el avance.
- **Animación:** entrada, énfasis, salida y trayectoria; catálogo de efectos, dirección, duración, retardo, curva; respeta "reducir movimiento".

### PNT-06C Insertar y asistente IA

- **Insertar:** básicos, interacciones, diseño de contenido (línea de tiempo, proceso, dato destacado, antes/después, columnas, gráfico), gamificación (puntos, vidas, temporizador, insignia, barra de progreso, ruleta), plantillas del kit, personajes con poses.
- **Asistente IA contextual:** pedidos en lenguaje natural y acciones rápidas (acortar texto, convertir en interacción, generar imagen, sugerir animación, cambiar tono, traducir, revisar ortografía y accesibilidad).
- **Variantes de diseño:** 3 composiciones del mismo contenido con el kit del cliente, comparación de cambios (antes/propuesta) y verificación de contraste, celular e idioma inglés antes de aplicar.

### PNT-07 Galería de interacciones

Modal con las 8 interacciones del MVP (ver `05-interacciones.md`) en tarjetas animadas, filtro por propósito (recordar, clasificar, secuenciar, decidir, explorar) y una sección "Sugeridas por la IA para este contenido" con el motivo. Al elegir, la IA genera los datos de la interacción a partir del contenido de la pantalla.

### PNT-08 Biblioteca y piezas gráficas

- Pestañas: **Biblioteca** (estilos, ilustraciones, íconos, fondos, personajes, recoloreados con el kit), **Generar con IA** (prompt + estilo del kit + relación de aspecto; 4 variantes; quitar fondo; vectorizar si el estilo es plano), **Subir** (SVG, PNG, Lottie; detecta capas con nombre en SVG y muestra el árbol de capas), **Del cliente** (recursos subidos por el cliente).
- Panel de animación: catálogo de movimientos (aparecer, deslizar, rebotar, flotar, latir, señalar, parpadear, hablar) aplicable a la pieza completa o a una capa; vista previa en bucle.
- Cada recurso muestra origen, licencia y en qué cápsulas se usa.

### PNT-09 Personaje y voz

- Personaje del kit con sus bocas A–X visibles (estado de cada boca: presente/falta).
- Tabla de narraciones de la cápsula: pantalla, idioma, texto, voz, duración, estado. Acciones: Generar todo, Regenerar desactualizados, Cambiar voz de toda la cápsula.
- Reproductor con el personaje hablando y una línea de tiempo con las bocas asignadas; edición manual de un tramo.
- Para audio del cliente: Limpiar voz (reducir ruido, normalizar) o Re-locutar (transcribir, corregir, generar con IA).
- Subtítulos: generados del guion; edición de texto y tiempos.

### PNT-10 Video interactivo

- Reproductor grande; debajo, línea de tiempo con marcadores (pregunta, punto interactivo, capítulo).
- Derecha: transcripción sincronizada; clic en una frase lleva al momento del video.
- Botón Proponer pausas y preguntas con IA (usa la transcripción).
- Propiedades del marcador: tipo, pregunta y opciones, retroalimentación, obligatorio o no, posición en pantalla para puntos interactivos.
- Opciones: impedir adelantar, porcentaje mínimo visto, subtítulos ES/EN, doblaje con IA (posterior).

### PNT-11 Idiomas y subtítulos

- Tabla paralela por pantalla: texto ES | texto EN, narración ES | EN, subtítulos ES | EN, estado (Pendiente, Traducido por IA, Revisado).
- Glosario del cliente aplicado y resaltado.
- Alertas de longitud: textos que desbordan la plantilla en cualquiera de los idiomas.
- Acciones: Traducir pendientes con IA, Marcar revisado, Generar voz EN.
- Indicador de completitud: no se puede exportar en modo bilingüe si falta algo.

### PNT-12 Vista previa

- Marcos de dispositivo: celular vertical, tableta, escritorio.
- Selector de idioma de interfaz e idioma de subtítulos.
- Modo participante (navegación real) y modo revisión (saltar a cualquier pantalla, ver identificadores).
- Panel de seguimiento simulado: progreso, puntaje, estado que se reportaría al LMS.

### PNT-13 Exportar

- Formato: JSON (prototipo), HTML autocontenido, SCORM 1.2, SCORM 2004 (posterior), cmi5 (posterior).
- Perfil de LMS: Moodle 4.5+, Blackboard, Chamilo, Canvas, Genérico; cada perfil agrega recomendaciones; el Genérico cumple el estándar sin ajustes. Ficha de compatibilidad para LMS desconocidos (estándar, límite de subida, ventana o incrustado).
- Idiomas: un paquete por idioma o ambos en el mismo.
- Validación previa: esquema, recursos faltantes, textos/audios faltantes por idioma, peso estimado frente al límite de subida del destino (solo advertencia, con alternativas), accesibilidad básica (texto alternativo, subtítulos).
- Resultado: lista de errores y advertencias; botón Descargar; historial de exportaciones con versión del curso.

### PNT-14 Estimador

La calculadora independiente (misma lógica que el paso 3–5 de PNT-03) para cotizar sin crear proyecto. Botón Crear proyecto con esta estimación.

### PNT-15 Revisión del cliente (posterior)

Enlace de revisión sin cuenta; comentarios anclados a pantallas; aprobar o pedir cambios; marca de cambios fuera de alcance.

### PNT-16 Kit de gamificación para LMS (MVP)

- Insignias generadas con el kit del cliente (por cápsula, por módulo, por curso).
- Reglas sugeridas: qué cápsula otorga qué insignia, nota mínima.
- Guía de configuración por LMS destino (insignias y finalización en Moodle; equivalentes en Canvas, Blackboard y Chamilo), descargable.

### PNT-17 Navegación y experiencia del participante

Configura el reproductor que ve el participante; la misma configuración se aplica en vista previa, SCORM y HTML. Separa dos decisiones independientes: el **patrón** (cómo se ve y cómo se avanza) y las **reglas** (qué se puede saltar y cuándo). Cualquier patrón se combina con cualquier regla.

- **Patrón de navegación** (galería con miniatura, descripción y "cuándo conviene"):

  | Patrón | Cómo se ve | Progreso por defecto | Cuándo conviene |
  | --- | --- | --- | --- |
  | Clásico | Barra superior, temario, Anterior/Siguiente | Barra con % | Cursos formales, escritorio |
  | Historias | Pantalla completa; tocar los lados o deslizar; barras segmentadas | Segmentos | Cápsulas cortas en celular |
  | Desplazamiento vertical | Una página; las secciones se desbloquean al completar; "Continuar ↓" | Barra | Lectura con actividades intercaladas |
  | Mapa de misiones | Ruta de estaciones; se avanza desbloqueando; "← Mapa" en cada pantalla | Puntos | Gamificación, varias actividades |
  | Menú de temas | Portada con tarjetas en cualquier orden (según las reglas) | Porcentaje | Consulta, onboarding |
  | Ramificado | El camino depende de decisiones; ramas visibles en el mapa de navegación | Barra | Escenarios y casos |
  | Inmersivo / juego | Sin barras; marcador flotante de puntos y vidas; botón redondo para avanzar | Puntos | Retos, quiz gamificado |

  - **✦ Recomendar:** la IA sugiere el patrón según duración, dispositivo, público, cantidad de actividades y gamificación, con el motivo y una alternativa (IA-14).
  - **✦ Crear con IA:** el usuario describe el patrón ("que parezca un tablero de misiones de seguridad") y la IA devuelve un **patrón personalizado como configuración** (base, tipo de progreso, forma de avanzar, menú, marcador, posición de barra), con nombre y miniatura, para Aplicar o Descartar. Nunca genera código.
  - **Patrón preferido del cliente:** se guarda en el kit y se aplica a las cápsulas nuevas; cada cápsula puede cambiarlo.
  - **Garantías en todos los patrones:** registro de avance y nota en el LMS, reanudación, operación con teclado y lector de pantalla, botones como alternativa a deslizar, funcionamiento en celular y respeto de las reglas de bloqueo.
- **Reglas, modo de navegación:** libre; libre con actividades obligatorias; secuencial.
- **Siguiente se habilita:** siempre; al terminar la narración; al completar la actividad. Si está deshabilitado, el pie muestra el motivo ("Completa la actividad para continuar").
- **Elementos del reproductor (activables):** temario con estado por pantalla (completada, actual, disponible, bloqueada con motivo), barra de progreso con %, "Pantalla X de Y", botones Anterior/Siguiente, glosario, recursos descargables, ayuda de navegación, panel de accesibilidad (tamaño de texto, alto contraste, subtítulos), puntos y vidas, cambio de idioma.
- **Reanudación:** preguntar ("¿Continuar donde lo dejaste?"), automática o desde el inicio. El avance, los puntos y las respuestas se guardan en `suspend_data`.
- **Otros:** objetivos en la pantalla de inicio, atajos de teclado ← →, Escape cierra paneles, pantalla de resultados con nota, insignia y opción de repasar y reintentar.
- **Mapa de navegación:** muestra el recorrido y la condición de paso entre pantallas, incluidas ramas (por ejemplo, vidas = 0 → repaso).

### PNT-18 Alineación pedagógica

- Matriz con objetivos en filas (con su nivel de Bloom editable) y pantallas, actividades y preguntas en columnas, cada una marcada como **Presenta**, **Practica** o **Evalúa** y con su nivel de Bloom.
- Reglas: cada objetivo necesita al menos una presentación, una práctica y una evaluación; la práctica y la evaluación deben alcanzar el nivel del objetivo. Las alertas lo indican ("Se evalúa en recordar, menor que aplicar").
- Indicadores: objetivos alineados, elementos sin objetivo, equilibrio presentar/practicar/evaluar.
- La IA propone correcciones (nuevas pantallas o preguntas del nivel adecuado) que el diseñador instruccional aplica o descarta; al aplicarlas se agregan al storyboard como "Propuesta IA".
- La exportación advierte si hay objetivos sin alinear.
