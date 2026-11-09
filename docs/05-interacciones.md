# Catálogo de interacciones

Cada interacción es un componente de `packages/interactions` que recibe datos validados por el esquema (`interaccion.tipo` + `interaccion.datos`), se muestra en el reproductor, calcula su puntaje y guarda un estado mínimo.

## Reglas comunes

- **Entrada:** tacto, ratón y teclado. Toda acción de arrastrar tiene alternativa por teclado (seleccionar con Enter/Espacio, mover con flechas o elegir destino de una lista).
- **Accesibilidad:** roles ARIA, foco visible, anuncios de resultado con `aria-live`, contraste del kit, sin depender solo del color.
- **Retroalimentación:** por respuesta o al final, según configuración; texto + animación + sonido opcional (silenciable).
- **Puntaje:** 0–100 normalizado por interacción. `modo: formativa` no suma a la nota; `modo: sumativa` sí.
- **Estado mínimo:** pensado para el límite de 4096 caracteres de `suspend_data` en SCORM 1.2: solo índices y resultados, nunca textos.
- **Idiomas:** todos los textos son objetos `{es, en}`; los identificadores de opciones son los mismos en ambos idiomas.
- **Animación:** entrada, acierto, error y cierre vienen incluidas; respetan `prefers-reduced-motion`.

## Resumen

| ID | Interacción | Propósito | Prototipo |
| --- | --- | --- | --- |
| INT-01 | Memoria (encontrar parejas) | Asociar término–imagen o causa–efecto | Sí |
| INT-02 | Clasificar arrastrando | Distinguir categorías | Sí |
| INT-03 | Ordenar pasos | Procedimientos | MVP |
| INT-04 | Tarjetas que se voltean | Conceptos y definiciones | MVP |
| INT-05 | Quiz con tiempo, vidas y puntaje | Reto final | Sí |
| INT-06 | Exploración con puntos interactivos | Recorrer una imagen o escenario | MVP |
| INT-07 | Deslizar verdadero/falso | Repaso rápido de mitos y realidades | MVP |
| INT-08 | Decisión con consecuencias | Situaciones de conducta y trabajo | MVP |

## INT-01 Memoria

- **Datos:** `pares[]` (3–8) con `a` y `b`; cada lado es texto `{es,en}` o imagen (`recursoId` + `alt`). `intentosMaximos` opcional.
- **Reglas:** se voltean dos cartas; si forman pareja quedan visibles. Puntaje = 100 × pares / (pares + errores × 0.5), mínimo 0.
- **Celular:** cuadrícula de 3 o 4 columnas según el número de cartas.
- **Estado:** índices de pares encontrados y número de errores.
- **La IA genera:** pares a partir del contenido de la pantalla, con texto breve (máx. 6 palabras por carta).

## INT-02 Clasificar arrastrando

- **Datos:** `grupos[]` (2–4) con `id` y `etiqueta`; `elementos[]` (4–12) con `id`, contenido (texto o imagen) y `grupoCorrecto`; `retroalimentacion` por elemento opcional.
- **Reglas:** se arrastra cada elemento a un grupo; al confirmar se marcan aciertos y errores. Puntaje = % de elementos bien clasificados.
- **Teclado:** seleccionar elemento y elegir grupo de una lista.
- **Estado:** `grupo` asignado por cada elemento.
- **La IA genera:** grupos y elementos equilibrados (diferencia máxima de 1 entre grupos), con al menos un elemento que exija discriminar.

## INT-03 Ordenar pasos

- **Datos:** `pasos[]` (3–8) en el orden correcto, cada uno texto o imagen.
- **Reglas:** se muestran desordenados; puntaje = % de pasos en su posición correcta. Retroalimentación muestra el orden correcto.
- **Estado:** permutación propuesta.
- **La IA genera:** pasos de un procedimiento del contenido, de máximo 12 palabras cada uno.

## INT-04 Tarjetas que se voltean

- **Datos:** `tarjetas[]` (2–8) con `frente` y `reverso`.
- **Reglas:** completada al voltear todas; sin puntaje (siempre formativa).
- **Estado:** índices volteados.
- **La IA genera:** concepto en el frente y definición o ejemplo en el reverso (máx. 30 palabras).

## INT-05 Quiz con tiempo, vidas y puntaje

- **Datos:** `preguntas[]` (3–15), cada una con `id`, `enunciado`, `opciones[]` (`id`, texto o imagen, `correcta`), `retroalimentacion`; `segundosPorPregunta` (opcional), `vidas` (opcional), `preguntasPorIntento` (opcional, selección aleatoria del banco), `barajarOpciones`.
- **Reglas:** se pierde una vida por error; al terminar el tiempo cuenta como error. Puntaje = % de aciertos. Opción múltiple y selección múltiple.
- **Estado:** ids de preguntas mostradas, respuestas elegidas, vidas restantes.
- **Reporte (fase D):** cada pregunta es una interacción SCORM con el mismo `id` en ambos idiomas.
- **La IA genera:** preguntas alineadas a objetivos con su nivel de Bloom, distractores plausibles y retroalimentación explicativa; el banco tiene al menos el doble de preguntas que las mostradas por intento.

## INT-06 Exploración con puntos interactivos

- **Datos:** `imagenId`, `puntos[]` con posición relativa (`x`, `y` en %), título, contenido y `obligatorio`.
- **Reglas:** completada al abrir todos los obligatorios; sin puntaje.
- **Celular:** los puntos tienen área táctil mínima de 44 × 44 px.
- **La IA genera:** títulos y contenidos; la posición la ajusta el diseñador.

## INT-07 Deslizar verdadero/falso

- **Datos:** `afirmaciones[]` (4–12) con texto, `verdadera` y retroalimentación.
- **Reglas:** deslizar a la derecha = verdadero, a la izquierda = falso; botones equivalentes. Puntaje = % de aciertos.
- **Estado:** respuestas por índice.
- **La IA genera:** mitos y realidades del contenido, equilibrados entre verdaderos y falsos.

## INT-08 Decisión con consecuencias

- **Datos:** `situacion`, `opciones[]` (2–3) con texto, `consecuencia` (texto + pieza gráfica opcional), `puntaje` (0–100) y `siguiente` (otra decisión o fin). Profundidad máxima 3.
- **Reglas:** el participante elige y ve la consecuencia; puntaje = promedio del camino recorrido.
- **Estado:** camino recorrido (ids).
- **La IA genera:** situación realista del contexto del cliente, opciones plausibles y consecuencias que expliquen por qué.
