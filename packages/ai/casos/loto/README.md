# Caso de referencia: Bloqueo y etiquetado (LOTO)

Material ficticio de un cliente ficticio (Minera Andina S.A.C.) con **la salida esperada de cada etapa del generador**. Es el mismo caso que muestra el prototipo (30 pantallas).

**Sirve para tres cosas:**
1. **Modo simulado:** el worker responde con estos archivos en lugar de llamar a la IA. Así el desarrollo y la integración continua no gastan ni dependen de la red (`17-guia-desarrollo.md`).
2. **Pruebas de contrato:** cada salida valida contra el esquema de su tarea (`../../esquemas/`).
3. **Comparar calidad:** al cambiar de modelo o de prompt, se corre el caso real y se compara con esta salida (`06-ia.md`, evaluación de calidad).

**Validar todo:**

```bash
node packages/ai/scripts/validar-casos.mjs                                        # 63 salidas contra sus esquemas
node docs/04-modelo-contenido/validar.mjs packages/ai/casos/loto/curso-esperado-es.json   # curso final
```

## Entradas

| Archivo | Qué es |
| --- | --- |
| `entrada/manual-loto.md` | Documento de 30 páginas convertido a texto con marcas `[p. N]`, como lo deja la lectura de PDF |
| `entrada/proyecto.json` | Datos del proyecto: público, meta de 15 minutos, 30 pantallas, ES + EN, celular, gamificación |
| `entrada/glosario.json` | Términos ES → EN que la traducción debe respetar |
| `entrada/kit.json` | Paleta, tipografías, estilo, disposiciones permitidas, personaje y biblioteca de imágenes |

## Salidas por etapa

| Etapa | Archivo | Tarea |
| --- | --- | --- |
| 1 · Leer y resumir | `01-IA-01-mapa-temas.json` | 16 temas con páginas y peso |
| | `01-IA-02-clasificacion.json` | Conservar, complementario u omitir |
| | `01-IA-03-resumenes.json` | Fragmentos con página, uno por tema conservado |
| | `01-IA-13-acta-omitidos.json` | Acta para el cliente |
| 2 · Objetivos y estructura | `02-IA-04-estructura.json` | 3 objetivos (recordar, comprender, aplicar) y 30 pantallas |
| 3 · Storyboard | `03-IA-05-storyboard.json` | Título, texto, narración, visual, actividad y origen |
| 4 · Pantallas | `04-IA-15-pantallas.json` | Disposición y campos de las 30 pantallas |
| | `04-IA-07-interacciones.json` | Datos de las 9 actividades (INT-01, 02, 03, 05, 06, 07, 08) |
| | `04-IA-08-banco-preguntas.json` | 8 preguntas del reto final |
| | `04-IA-09-video-p18.json` | Marcadores del video |
| | `04-IA-06-sugerencia-p10.json`, `04-IA-14-navegacion.json` | Tareas bajo pedido |
| 5 · Ilustraciones | `05-IA-11-imagenes.json` | Reutiliza 3 de la biblioteca y genera 2 |
| 6 a 8 · Voz, boca, subtítulos | `06-voz-es.json`, `07-boca-p03.json`, `08-subtitulos-p03-es.vtt` | **Simulados** (65 ms por letra). Con voz real los calcula el audio y Rhubarb |
| 9 · Inglés | `09-IA-10-traduccion-p01-p06.json` | **Muestra**: pantallas 1 a 6 (34 textos), con límites y glosario |
| 10 · Calidad | `10-IA-12-calidad.json` | 5 observaciones (1 alta) |
| Bajo pedido | `X-IA-16-…`, `X-IA-17-…`, `X-IA-18-…` | Sincronizar con la voz, corregir alineación, extraer kit |
| Resultado | `curso-esperado-es.json` | Curso completo en español (30 pantallas, 68 recursos) que **valida** contra el esquema v0.2 |

La versión en inglés completa no está escrita a mano: el caso cubre las pantallas 1 a 6 para probar el flujo de traducción. En modo simulado, el resto de los textos en inglés se completa con el prefijo `[EN] ` para que el validador bilingüe pueda correr.

## Cómo se arma el curso desde las salidas

Lo hace el worker al cerrar la etapa 4; la referencia ejecutable es `herramientas/construir_caso.py`.

| De | A (esquema del curso) |
| --- | --- |
| `campos.titulo` | bloque `texto` con rol `titulo` |
| `campos.subtitulo`, `campos.numero` | bloque `texto` con rol `subtitulo` («Parte 2») |
| `campos.texto`, `campos.burbuja` | bloque `texto` con rol `cuerpo` |
| `campos.dato`, `campos.datoGrande` | bloque `texto` con rol `destacado` |
| `campos.items[]` | un bloque `cuerpo` por elemento: «título: texto» (o «título texto» si el texto sigue la frase) |
| `personaje` | bloque `personaje` con `recursoId` del kit; la narración apunta a él (`personajeBloqueId`) |
| `pedidosImagen` (principal, icono) | bloque `imagen` con el recurso que resolvió IA-11; icono = decorativa |
| `pedidosImagen` (escena) | `datos.imagenId` de la exploración (INT-06) |
| `actividad` + salida de IA-07 | bloque `interaccion`. En quiz, decisión y V/F la pregunta vive en la interacción y no se repite como texto |
| disposición `video` + IA-09 | bloque `video` con marcadores y reglas (no adelantar, 90 %) |
| narración + etapas 6 a 8 | `narracion.porIdioma.es`: audio, voz, `hashTexto` (sha256 de texto, voz y velocidad), duración, bocas y subtítulos |
| `disposicion`, `fondo` | campos de la pantalla (v0.2). `plantilla` = `<kit>-<disposición>` |
| estado | `propuesta-ia` hasta que el diseñador apruebe |

Ids de bloque: `<pantalla>-<campo>` (`p05-dato`, `p05-imagen`). Son las claves que usan los `ajustes` del editor y la línea de tiempo.

Para regenerar los archivos después de cambiar el caso:

```bash
python3 packages/ai/casos/loto/herramientas/construir_caso.py . packages/ai/casos/loto/herramientas/pantallas-prototipo.json
```
