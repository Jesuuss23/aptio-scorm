# Voz, personaje e idiomas

> Por defecto: voz de Google y boca calculada desde el audio con reconocedor fonético (ADR-008). Azure y ElevenLabs quedan como alternativas configurables.

## Personaje animado sin video

### Guía para el diseñador gráfico

Entregar el personaje como **SVG con capas (grupos `<g>`) con `id` fijo**:

| Capa | id | Obligatoria |
| --- | --- | --- |
| Cuerpo completo | `personaje` | Sí |
| Cabeza | `cabeza` | Sí |
| Ojos abiertos / cerrados | `ojos_abiertos`, `ojos_cerrados` | Sí (para parpadeo) |
| Bocas | `boca_A`, `boca_B`, `boca_C`, `boca_D`, `boca_E`, `boca_F`, `boca_G`, `boca_H`, `boca_X` | A–F y X sí; G y H recomendadas |
| Poses | `pose_neutral`, `pose_explicando` (obligatorias); `pose_celebrando`, `pose_advirtiendo`, `pose_pensando` | Cada pose agrupa cuerpo y brazos; la cabeza es común a todas |
| Cejas | `cejas` | Opcional (expresiones) |

La guía completa para el equipo gráfico (lienzo 3:4, exportación, colores marcadores del kit, bocas con ejemplos en español, validador y plantilla) está en `docs/20-guia-diseno.md` y `docs/diseno/personaje/`.

Formas de boca (convención de Rhubarb Lip Sync): A = labios cerrados (P, B, M); B = ligeramente abierta con dientes (K, S, T, la mayoría de consonantes); C = abierta (E); D = muy abierta (A); E = redondeada (O); F = labios fruncidos (U, W); G = dientes superiores sobre labio inferior (F, V); H = lengua visible (L); X = reposo.

Todas las bocas en la misma posición y tamaño de lienzo; el reproductor muestra una y oculta las demás.

### Fuentes de las marcas de tiempo

| Origen del audio | Método | Notas |
| --- | --- | --- |
| Voz de IA con Azure Speech (alternativa) | Eventos de visemas que Azure entrega junto con el audio (22 visemas con su desfase) | Mapear los 22 visemas a A–X con una tabla en `packages/ai/voice/visemas.ts`. Verificar disponibilidad para las voces en español (PT-01) |
| Voz de IA de otro proveedor | Rhubarb sobre el audio generado | O marcas de tiempo por carácter si el proveedor las entrega |
| Audio grabado por el cliente | Rhubarb Lip Sync con reconocedor fonético | Menos preciso que con texto; permitir ajuste manual |

Formato guardado en el curso: lista de `[tiempoMs, boca]` por narración e idioma.

### Comportamiento en el reproductor

- Cambia la boca según el tiempo del audio (`requestAnimationFrame` sobre `audio.currentTime`).
- Parpadeo automático aleatorio cada 2–6 s; gesto de brazo opcional al iniciar cada frase.
- Pausa del audio = boca X.

## Narración

- Texto de narración separado del texto en pantalla (puede ser más extenso).
- Antes de enviar a TTS se aplica el diccionario de pronunciación del cliente (siglas, nombres) mediante SSML.
- Cada audio guarda: idioma, voz, velocidad, hash del texto, duración, marcas de boca y subtítulos. Si cambia el texto o la voz, se marca desactualizado.
- Formato: MP3 mono 64 kbps (≈0.5 MB por minuto).
- Cambio de voz masivo: regenerar todos los audios de una cápsula o curso con otra voz como un único trabajo en cola.

## Audio y video del cliente

| El cliente trae | Opciones |
| --- | --- |
| Audio final | Usar tal cual; transcribir para subtítulos; dividir por pantalla según guion |
| Audio con su voz para mejorar | Limpiar (reducir ruido, normalizar) conservando la voz, o re-locutar con IA desde la transcripción corregida |
| Video | Transcribir, subtitular, insertar interacciones (PNT-10); comprimir a 720p H.264 ≈1.2 Mbps |

Clonar o reemplazar la voz de una persona real requiere autorización escrita registrada en el sistema.

## Idiomas

- Todo texto del curso es `{es, en}`; el curso declara `idiomas` y `modoIdioma` (`separados` o `mismo-paquete`).
- La traducción la propone la IA (IA-10) respetando el glosario del cliente y el límite de caracteres de cada campo; un revisor la marca como revisada.
- Narración y bocas se generan por idioma con la voz definida en el kit.
- No se admite texto incrustado en imágenes para cursos bilingües; el validador lo advierte.

### Ambos idiomas en el mismo paquete

- Selector de idioma al inicio y botón para cambiar en cualquier momento sin perder avance.
- Un solo seguimiento: progreso, nota e interacciones pertenecen al participante; las interacciones tienen el mismo id en ambos idiomas.
- El idioma elegido se guarda en el estado para reanudar.
- La narración se duplica; el validador calcula el peso con ambos idiomas.
- No se exporta si falta un texto, audio o subtítulo en algún idioma.

## Subtítulos

- WebVTT por idioma, generados del guion (narración de IA) o de la transcripción (audio o video del cliente).
- Independientes de la voz: audio en español con subtítulos en inglés, o al revés.
- El participante activa/desactiva y elige idioma; la preferencia se recuerda.
- El productor corrige texto y tiempos; si cambia el guion, se regeneran.
