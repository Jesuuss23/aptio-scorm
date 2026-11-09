# Prompts para Google Stitch · mejorar la parte gráfica

Versión 3 (marca Aptio SCORM), basada en el prototipo unificado (`prototipo-unificado.html`). Reemplaza a la versión anterior. Las capturas actuales de cada pantalla están en `capturas/`.

## Cómo usarlo

1. En Stitch, crea un proyecto **Web** y usa el modo de mejor calidad que ofrezca (el experimental o «Pro», si está disponible). Ese modo acepta imágenes de referencia.
2. Pega primero el **prompt global** (sección 1). Si Stitch permite cargar reglas de diseño, carga también `DESIGN.md`.
3. Genera **una pantalla por mensaje**, en el orden de la sección 2. En cada una, **adjunta la captura indicada**: así Stitch respeta el contenido y el flujo, y solo mejora lo visual.
4. Corrige con los **ajustes rápidos** (sección 4) o señalando el elemento en Stitch. Cambia una cosa por vez.
5. Para las pantallas que ve el participante (sección 3), usa un proyecto **Móvil** aparte.
6. Exporta a Figma y entrégalo al equipo: el diseñador ajusta, desarrollo toma medidas y componentes, y se actualizan `DESIGN.md` y el prototipo si cambia algo de fondo.

Lo que **no** debe cambiar: los nombres y el orden del menú, los pasos del flujo, los textos de las acciones y los datos de ejemplo. Son los que ya están en la especificación, las historias de Jira y las pruebas.

---

## 1. Prompt global (pegar primero)

```text
Rediseña con calidad de producto profesional la interfaz web de escritorio (1440 × 900) de "Aptio SCORM", una herramienta interna de una productora peruana de e-learning. A partir del material de un cliente (PDF, tema o video), la herramienta genera con IA un curso SCORM completo: pantallas animadas, ilustraciones, voz, personaje que habla, subtítulos, inglés y paquete para Moodle u otro LMS. El equipo lo revisa y retoca. Todo el texto de la interfaz en español.

Objetivo del rediseño: que se vea como un producto SaaS empresarial de primer nivel (referencias: Linear, Notion, Canva para empresas, Articulate Rise). Debe ser claro y ordenado, con mejor jerarquía visual y aire entre bloques, y transmitir confianza a gerentes y clientes corporativos. Es una herramienta de trabajo de densidad media, no una página de marketing.

Sistema visual Aptio SCORM (respétalo):
- Tema claro. Fondo #F4F6F9; tarjetas blancas con borde #E2E8F0, radio 16 px y sombra muy suave; texto #0B1C30; secundario #64748B.
- Cobalto #004ECC: barra lateral en relleno sólido, la acción principal de cada pantalla y la selección. Fondo de selección #EFF6FF.
- Naranja #FF6B35: solo el emblema de la marca y todo lo que hace la IA (botones de contorno con fondo #FFF1EB, texto #AB3500 y el ícono ✦).
- Verde azulado #0F766E sobre #CCFBF1 para aprobado y validado. Aviso #92400E sobre #FEF3C7. Error #BA1A1A sobre #FFDAD6.
- Tipografía Plus Jakarta Sans (títulos 26 px en 700 con espaciado -0,02 em, base 14 px); cifras en JetBrains Mono.
- Íconos de línea de 20 px del mismo set. Botones con radio de 8 px. Espaciado en múltiplos de 4 px.
- El personaje es una ilustración vectorial plana (no fotos ni 3D realista). No inventes datos ni normas.

Estructura común: barra lateral izquierda fija de 240 px, blanca, con el logo "F" azul y "Aptio SCORM". Tres grupos con encabezado en versalitas gris:
- INICIO: Proyectos, Nuevo SCORM.
- PROYECTO · BLOQUEO Y ETIQUETADO: Producción, Revisión, Editor, Alineación pedagógica, Navegación, Personaje y voz, Video interactivo, Idiomas, Vista previa, Entrega.
- EMPRESA: Clientes y kits, Rentabilidad, Conexiones IA.
Los 5 pasos del flujo principal (Nuevo SCORM 1, Producción 2, Revisión 3, Editor 4, Entrega 5) llevan un número en un círculo pequeño. Al pie de la barra: usuario con avatar y rol, y el costo de IA del mes en monoespaciada.

Datos de ejemplo: cliente "Minera Andina", proyecto "Bloqueo y etiquetado", 30 pantallas, español e inglés, personaje "Ana" (supervisora de seguridad con casco amarillo).
```

---

## 2. Pantallas de la herramienta (una por mensaje, con su captura)

### 2.1 Proyectos · adjuntar `capturas/01-proyectos.png`

```text
Mejora la pantalla "Proyectos" de la captura manteniendo su contenido. Encabezado con título, buscador y botón primario "Nuevo SCORM". Fila de 4 indicadores en tarjetas (SCORM en curso, entregados este mes, días promedio por SCORM, costo de IA del mes). Cuadrícula de tarjetas de proyecto: miniatura real de la portada del curso, nombre, cliente con logo pequeño, estado como etiqueta (Generando, En revisión, Listo para entregar, Entregado), barra de avance, idiomas como chips ES/EN y costo de IA. Que se vea como un tablero ejecutivo limpio, no como una tabla densa.
```

### 2.2 Nuevo SCORM · adjuntar `capturas/02-nuevo-scorm.png`

```text
Mejora la pantalla "Nuevo SCORM" de la captura. Es el punto de partida: hacerlo lo más simple posible. Paso único con una gran zona para soltar archivos ("Arrastra el PDF, Word o video del cliente") y, como alternativa, un campo "o escribe solo el tema". Debajo, en una fila: cliente y kit (con muestra de colores), cantidad de pantallas (control deslizante con 30 por defecto), idiomas ES/EN y nivel de interacción. Una sección plegada "Datos técnicos y estimación (opcional)". A la derecha, una tarjeta resumen "Esto es lo que vas a recibir" con la lista de lo que se genera (estructura, pantallas animadas, ilustraciones, voz, boca de Ana, subtítulos, inglés, control de calidad, paquete SCORM), el tiempo estimado ("≈ 14 min") y el costo de IA estimado. Botón primario grande "Generar SCORM".
```

### 2.3 Producción · adjuntar `capturas/03-produccion.png`

```text
Mejora la pantalla "Producción" de la captura: el generador trabajando. Arriba, título "Generando tu SCORM", barra de avance general y dos indicadores (Avance %, Costo de IA). Columna izquierda: las 11 etapas como una línea de pasos vertical elegante. Cada paso muestra ícono de estado (en cola, en curso con animación sutil, listo, error con "Reintentar"), nombre, resumen del resultado, proveedor en gris y tiempo en monoespaciada. Columna derecha: cuadrícula de miniaturas de las 30 pantallas que aparecen a medida que se generan; las pendientes van como esqueleto gris. Transmite "trabajo automático y confiable", con calma y sin ruido visual.
```

### 2.4 Revisión · adjuntar `capturas/04-revision.png`

```text
Mejora la pantalla "Revisión" de la captura manteniendo sus tres columnas:
- Izquierda: miniaturas de las 30 pantallas con filtros (Todas, Por revisar, Actividades) y su estado.
- Centro: la pantalla elegida en grande, con subtítulo, botones "Ver con voz y boca" y "Repetir animación", y debajo los textos editables (título, narración de Ana) con chips verdes de lo que se regenera solo (Voz ES, Boca, Subtítulos, Traducción EN, Voz EN).
- Derecha: "Ajustar con IA" (botones índigo: Más visual, Menos texto, Convertir en actividad, Ver 3 variantes, Otra ilustración, pedido libre), "Control de calidad" con checks y "Origen" del contenido.
Arriba, contadores "Aprobadas 3/30" y "Con observaciones 3". Botones "Aprobar pantalla" (primario) y "Editar en el editor". Mejora la jerarquía y el aire entre bloques, y que la pantalla grande sea el protagonista.
```

### 2.5 Editor con línea de tiempo · adjuntar `capturas/05-editor.png`

```text
Mejora el "Editor" de la captura, con la facilidad de Canva o Genially y la línea de tiempo de Articulate Storyline. Mantén todas sus partes:
- Barra superior delgada: volver a Revisión, Deshacer, Rehacer, número y título editable de la pantalla, estado, conmutador Automático/Libre y botón "Aprobar".
- Riel vertical de íconos con etiqueta: Diseños, Agregar, Imágenes, Capas, IA (índigo). Junto al riel, un panel con galería de miniaturas.
- Centro sobre fondo gris: barra contextual flotante con el elemento elegido (Editar texto, A− A+, círculos de color del kit, alineación, Animación, ✦ Mejorar texto, Ocultar). Debajo, el lienzo 16:9 con el elemento seleccionado (contorno azul y tiradores), el subtítulo y una barra "Pídele algo a la IA…" con botón "Generar".
- Derecha: panel de propiedades con texto, tamaño, colores, animación de entrada y tiempos ("Aparece", "Sale", "Que aparezca cuando Ana dice…").
- Abajo, a lo ancho: línea de tiempo profesional con Reproducir/Pausa, tiempo "1,2 s / 6,5 s", zoom y "✦ Sincronizar con la voz". Regla en segundos con aguja roja. Pistas: Narración ES con cada palabra como pastilla, Subtítulos, Boca de Ana (franja de segmentos con letras A–X) y una barra arrastrable por elemento (Título, Texto, Dato clave, Imagen) con tiradores en los bordes. Una línea punteada marca "Termina la voz".
- Al pie: tira de miniaturas de pantallas.
Que se sienta como una herramienta creativa moderna y amigable, con mucho orden.
```

### 2.6 Personaje y voz · adjuntar `capturas/08-personaje-voz.png`

```text
Mejora "Personaje y voz" de la captura. Izquierda: Ana grande (ilustración plana con casco amarillo) hablando, con controles de reproducción, y debajo la forma de onda del audio con la franja de bocas A–X y la de subtítulos. Derecha: tabla de narraciones (pantalla, idioma, texto, voz, duración, estado Lista / Por regenerar) y acciones "Regenerar desactualizadas" y "Cambiar voz". Un bloque "Audio del cliente" con las opciones "Limpiar voz", "Re-locutar con IA" y "Usar con boca automática". Debe verse claro que la boca se calcula sola, sin video.
```

### 2.7 Vista previa · adjuntar `capturas/11-vista-previa.png`

```text
Mejora "Vista previa" de la captura: cómo lo verá el participante. Al centro, la cápsula dentro de un marco de laptop o de celular (conmutador Escritorio/Celular), con su barra de progreso, puntos, botón de temario y botones Anterior/Siguiente. Alrededor, en tarjetas discretas: patrón de navegación elegido, reglas de avance ("Siguiente se habilita al completar la actividad") y un aviso cuando algo bloquea el avance. El marco debe ser realista y elegante; la interfaz de la herramienta queda en segundo plano.
```

### 2.8 Entrega · adjuntar `capturas/12-entrega.png`

```text
Mejora "Entrega" de la captura. Izquierda, tarjetas seleccionables: formato (SCORM 1.2 recomendado, HTML autocontenido, SCORM 2004 con etiqueta "Próximamente"), perfil de LMS (Genérico, Moodle 4.5+, Blackboard, Chamilo, Canvas) e idiomas (un paquete por idioma o ambos con selector). Derecha, validación como lista de verificación con éxitos, advertencias y errores (peso del paquete frente al límite de subida del LMS, con barra y la nota "solo advertencia"). Botón primario "Descargar paquete" e historial de exportaciones con versión, fecha, formato y peso.
```

### 2.9 Clientes y kits · adjuntar `capturas/13-clientes-kits.png`

```text
Mejora "Clientes y kits" de la captura. Lista de clientes a la izquierda. A la derecha, el kit de marca del cliente elegido:
- paleta de 5 roles (primario, secundario, acento, texto, fondo) con verificación de contraste AA;
- tipografías;
- logo;
- personaje Ana con sus 9 bocas en miniatura y un check por cada una;
- voz por idioma con botón "Escuchar";
- glosario;
- pantallas modelo.
Al lado, una vista previa en vivo de 3 pantallas del curso dentro de marcos de celular con los colores del cliente. Botón índigo "✦ Extraer de un curso anterior".
```

Si quieres más pantallas, las restantes siguen el mismo patrón: «Mejora la pantalla X de la captura manteniendo su contenido» más lo que debe destacar. Son Alineación pedagógica (`06`), Navegación (`07`), Video interactivo (`09`), Idiomas (`10`), Rentabilidad (`14`) y Conexiones IA (`15`).

---

## 3. Pantallas del curso que ve el participante (proyecto Móvil aparte)

Estas son las **pantallas modelo** del kit (`docs/20-guia-diseno.md`, sección 4). Aquí sí se quiere un acabado visual llamativo.

### 3.1 Prompt base del curso

```text
Diseña pantallas de un curso corto de microaprendizaje para celular (390 × 844), que también se adaptará a 16:9 en computadora. Tema: seguridad industrial, "Bloqueo y etiquetado", para operarios de una empresa minera. Todo el texto en español.

Estilo "plano corporativo" (ilustración vectorial plana, formas geométricas, esquinas suaves, sin degradados fuertes ni sombras difusas, sin fotos). Paleta del cliente: primario azul marino #0F2A44, secundario verde #1F7A5C, acento amarillo de seguridad #F2A900, texto #102033, fondo #F5F7FA. Tipografías: Archivo para títulos y Source Sans 3 para texto.

Personaje: Ana, supervisora de seguridad, ilustración plana con casco amarillo y uniforme azul marino. Aparece en varias pantallas hablando, con un globo de diálogo.

Cada pantalla tiene poco texto (máximo 30 palabras), una idea por pantalla, áreas táctiles grandes (mínimo 44 px) y contraste AA. Arriba, una barra de progreso por segmentos y un contador de puntos. Abajo, la barra de subtítulos (franja oscura semitransparente) y el botón "Siguiente". Animaciones sugeridas solo con entradas suaves.
```

### 3.2 Pantallas (una por mensaje)

| # | Prompt |
| --- | --- |
| 1 | `Portada: fondo azul marino con formas geométricas sutiles, título grande "Bloqueo y etiquetado", subtítulo "Cápsula de seguridad · 15 min · 3 retos", Ana saludando y botón amarillo "Comenzar".` |
| 2 | `Idea con ilustración: título "¿Qué es la energía peligrosa?", texto corto, ilustración de un tablero eléctrico con un rayo de advertencia y una tarjeta destacada con borde amarillo: "Si puede moverse, calentarse o descargarse, se bloquea."` |
| 3 | `Lista con íconos: "Seis tipos de energía" en 6 tarjetas de 2 columnas con ícono de línea (rayo, engranaje, gota, aire, llama, matraz), nombre y ejemplo corto.` |
| 4 | `Actividad de clasificar: "¿Seguro o riesgoso?", tarjetas arrastrables con prácticas ("Usar solo mi candado", "Bloquear solo el pulsador de parada"…) y dos zonas de destino "Seguro" (verde) y "Riesgoso" (rojo), botón "Comprobar".` |
| 5 | `Decisión con consecuencias: Ana en primer plano, situación "Tu compañero olvidó su candado y te pide el tuyo", dos opciones grandes y, tras elegir, una tarjeta de retroalimentación que explica por qué.` |
| 6 | `Reto final tipo juego: pregunta "¿Quién puede retirar tu candado?", 3 opciones, temporizador circular de 30 s, 3 vidas como corazones y puntaje; animación de acierto con confeti discreto.` |
| 7 | `Cierre: Ana celebrando, insignia "Experto en bloqueo", puntaje final con estrellas y botón "Finalizar".` |

---

## 4. Ajustes rápidos (mensajes de seguimiento)

```text
Más aire: aumenta los márgenes internos de las tarjetas a 20 px y el espacio entre secciones a 24 px.
```

```text
Reduce la cantidad de bordes: separa las zonas con fondo y espacio en lugar de líneas.
```

```text
La IA debe distinguirse: todos los botones y avisos de IA en naranja #FF6B35 de contorno, con fondo #FFF1EB, texto #AB3500 y el ícono ✦; las acciones normales nunca usan naranja.
```

```text
Mantén exactamente los textos, el menú lateral y el orden de los pasos de la captura; cambia solo el estilo visual.
```

```text
Haz una variante con la barra lateral contraída a 64 px (solo íconos), para dar más espacio al lienzo del editor.
```

```text
Genera el estado vacío de esta pantalla (sin proyectos) con una ilustración lineal simple y un único botón de acción.
```

## 5. Qué devolver al equipo

- El archivo de Figma exportado desde Stitch, con las pantallas aprobadas.
- Los cambios al sistema visual (colores, tipografía, espaciado, componentes), que se pasan a `DESIGN.md`.
- Las pantallas modelo del curso, que el diseñador termina según `docs/20-guia-diseno.md` y desarrollo convierte en `PantallaModelo`.
