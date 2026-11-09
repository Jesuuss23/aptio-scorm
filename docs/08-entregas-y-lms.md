# Entregas y LMS

El prototipo solo descarga el JSON. Este documento fija lo que debe soportar la arquitectura desde ahora para las fases siguientes.

## Formatos de entrega

| Formato | Fase | Uso |
| --- | --- | --- |
| JSON del curso | Prototipo | Respaldo, intercambio, entrada de los exportadores |
| HTML autocontenido | MVP | Presentar a alumnos sin LMS; abre con doble clic y sin conexión |
| SCORM 1.2, un solo SCO | MVP (fase D) | Formato por defecto para todos los LMS |
| SCORM 2004 (3.ª/4.ª ed.) | Posterior | Cuando el cliente necesite separar completado y aprobado |
| cmi5 / xAPI | Posterior | Analítica detallada |
| Kit de gamificación | MVP | Insignias y guía de configuración en el LMS del cliente |

## Perfiles de LMS

Cada exportación elige un perfil que agrega el límite de subida conocido (solo para advertir) y recomendaciones de configuración; el perfil Genérico es el que se usa con LMS desconocidos. La compatibilidad se declara **solo después de probar**.

| Perfil | Soporte SCORM esperado | Notas para el perfil | Estado |
| --- | --- | --- | --- |
| Moodle 4.5 o superior | SCORM 1.2 nativo; 2004 parcial | Prueba automatizada con Moodle en Docker (fase D); recomendar método de calificación y número de intentos | Por probar |
| Blackboard Learn | SCORM 1.2 y 2004 mediante su reproductor integrado | Prueba manual con cuenta de prueba | Por probar |
| Chamilo | SCORM 1.2 (no implementa todo el estándar) | Mantener el paquete simple: un SCO, sin secuenciación | Por probar |
| Canvas | SCORM mediante una herramienta LTI que la institución debe habilitar | Confirmar con cada cliente que la tenga activa; puede importarse como tarea calificada | Por probar |
| Genérico | SCORM 1.2 | Para LMS no listados; recomendar prueba en SCORM Cloud | — |

## Compatibilidad con LMS desconocidos

Algunos clientes usan LMS que el equipo no conoce. La compatibilidad no se basa en una lista de plataformas, sino en cumplir el estándar y en probar contra una referencia neutral.

1. **Implementación estricta y defensiva del estándar:** búsqueda de la API en ventanas padre y `opener` según el algoritmo de ADL; uso solo de elementos obligatorios u opcionales bien soportados; tolerancia a errores del LMS sin romper la navegación; respeto de los límites de longitud del estándar (por ejemplo, 4096 caracteres en `suspend_data` para SCORM 1.2).
2. **Perfil Genérico por defecto:** sin ajustes específicos de ningún LMS. Los perfiles con nombre solo agregan recomendaciones de configuración.
3. **Varias versiones del estándar desde un mismo curso:** SCORM 1.2 (la más aceptada), SCORM 2004 y cmi5 cuando se implementen, y HTML sin seguimiento. Si un LMS no acepta una versión, se exporta la otra sin rehacer el curso.
4. **Prueba de referencia:** cada versión del exportador se valida en SCORM Cloud y con los paquetes de prueba de conformidad de ADL. Un paquete que funciona ahí tiene alta probabilidad de funcionar en un LMS que cumpla el estándar.
5. **Modo diagnóstico en el paquete:** una opción oculta (por ejemplo, un parámetro en la URL o una combinación de teclas) que muestra qué API encontró, qué datos envió y qué respondió el LMS. Sirve para resolver problemas con el soporte de un LMS desconocido sin acceso a la plataforma.
6. **Ficha de compatibilidad para el cliente:** cuestionario corto antes de exportar (qué estándar soporta su LMS, límite de subida, si abre en ventana nueva o incrustado, si califica por nota o por finalización). Las respuestas ajustan la exportación y quedan guardadas por cliente.
7. **Registro de LMS probados:** cada LMS nuevo en que se entregue queda registrado con versión, estándar usado y resultado, y pasa a la matriz de compatibilidad.

Opción posterior: **paquete de distribución (dispatch).** El curso queda alojado en un servidor nuestro y al LMS se sube un SCORM liviano que lo carga y reenvía el seguimiento. Resuelve LMS con límites de subida bajos y permite actualizar el curso sin volver a subirlo. A cambio exige alojamiento, conexión a internet y una gestión de licencias por cliente.

## Tamaño del paquete

No hay un tamaño máximo fijo: hay clientes que piden paquetes grandes.

- El límite lo define el **destino**: el límite de subida del LMS del cliente (lo configura su administrador) o el que indique el cliente en la ficha de compatibilidad. Si no se conoce, el validador usa un valor de referencia configurable solo para advertir.
- El validador **advierte, no bloquea**: muestra el peso, qué recursos pesan más y alternativas.
- Alternativas que ofrece cuando el paquete supera el límite del destino:
  1. Exportar igual, con la recomendación de que el administrador amplíe el límite de subida.
  2. Comprimir más el video y las imágenes (con vista previa de calidad).
  3. Dividir el curso en varios paquetes (por módulo o cápsula).
  4. Alojar el video fuera del paquete (servidor del cliente, plataforma de video o almacenamiento propio).
  5. Usar el paquete de distribución (dispatch), cuando exista.

## Reglas de seguimiento (fase D)

- Sin evaluación sumativa: `completed` al ver todas las pantallas obligatorias.
- Con sumativa: `passed`/`failed` según nota mínima (por defecto 70, también como `masteryscore`), `incomplete` mientras tanto.
- Nota: `cmi.core.score.raw` 0–100; mejor intento o último, configurable.
- `cmi.interactions` por pregunta sumativa, con el mismo id en ambos idiomas.
- `cmi.suspend_data` compacto (límite de diseño 4096 caracteres) e idioma elegido.
- `LMSCommit` en cada avance; no depender de `LMSFinish` al cerrar la pestaña.

## Peso del paquete

| Componente | Formato | Peso aproximado |
| --- | --- | --- |
| Narración | MP3 mono 64 kbps | ~0.5 MB/min por idioma |
| Imágenes | WebP (máx. 1920 px) o SVG | 50–300 KB |
| Video | MP4 H.264 720p ~1.2 Mbps | ~9 MB/min |
| Reproductor e interacciones | JS/CSS minificados | Objetivo < 300 KB comprimidos |

Sin tamaño máximo fijo: ver la sección "Tamaño del paquete".

## Kit de gamificación para el LMS del cliente

Cuando el cliente pide gamificar en su plataforma, la herramienta entrega:

1. **Insignias** generadas con el kit de marca (por cápsula, módulo y curso) en PNG y SVG.
2. **Plan de gamificación:** qué cápsula otorga qué insignia, nota mínima, niveles sugeridos y orden de desbloqueo.
3. **Guía de configuración por LMS** con los pasos en la plataforma del cliente (finalización de actividad, condiciones de acceso e insignias en Moodle; los equivalentes disponibles en Canvas, Blackboard y Chamilo, a verificar con cada versión).

La gamificación dentro de la cápsula (puntos, insignias internas, misiones) va en el reproductor y no depende del LMS.

## Informe del material

Cada exportación genera un informe para el cliente: ficha general, objetivos, inventario de pantallas e interacciones, evaluación, ficha técnica (formato, peso, datos que reporta), accesibilidad, fuentes y derechos, uso de IA y validaciones realizadas. (MVP)
