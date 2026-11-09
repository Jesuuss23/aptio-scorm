# Guía para el equipo gráfico

Qué entrega el equipo gráfico para que el generador produzca cápsulas con su estilo, y cómo se entrega. Con el generador, el diseñador deja de rehacer cada pantalla: diseña **una vez** el personaje, los estilos y las pantallas modelo de cada cliente, y luego revisa y retoca lo generado en el editor.

| Entregable | Cuándo se necesita | Quién lo usa |
| --- | --- | --- |
| 1. Personaje (Ana) en SVG con capas | S0 (prueba de la boca PT-01) y S4 | Reproductor: boca, poses y parpadeo |
| 2. Dos estilos de ilustración base | S0 (prueba de imágenes PT-02) y S3 | Generador de imágenes (IA-11) y biblioteca |
| 3. Íconos del kit | S3 | Disposición «lista» y actividades |
| 4. Pantallas modelo por disposición | S3 (estilo base) y S1 (por cliente) | Generador de pantallas (IA-15) |
| 5. Kit del primer cliente | S1 | Clientes y kits (M02) |

Archivos de apoyo en `docs/diseno/personaje/`:
- `plantilla-ana.svg`: capas e id correctos. Es una plantilla técnica, no el arte final.
- `hoja-referencia-ana.png`: poses, bocas y colores del kit.
- `validar-personaje.mjs`: revisa un SVG antes de cargarlo.

## 1. Personaje

### Lienzo y exportación

- Proporción **3:4**, por ejemplo `viewBox="0 0 300 400"`. Personaje de cuerpo entero o medio cuerpo, centrado, con los pies (o la cintura) en el borde inferior.
- Exportar desde Illustrator: *Exportar como → SVG*.
  - Estilo: atributos de presentación.
  - Fuente: convertir a contornos.
  - Imágenes: ninguna.
  - ID de objeto: **nombres de capa**.
  - Decimales: 2.
  - Adaptable: sí.
- Peso ideal **menos de 120 KB**; máximo 200 KB.
- **No usar:**
  - textos;
  - imágenes PNG o JPG incrustadas;
  - filtros (desenfoque, sombra paralela, brillo): ralentizan el celular;
  - degradados de malla;
  - efectos de Illustrator no convertidos.
- Degradados lineales simples y trazados de recorte: sí, con moderación.

### Capas (el nombre de la capa es el id)

| Capa | id | Obligatoria | Notas |
| --- | --- | --- | --- |
| Personaje completo | `personaje` | Sí | Grupo raíz |
| Poses | `pose_neutral`, `pose_explicando` | Sí | Cada pose es un grupo con el cuerpo y los brazos de esa pose. Solo `pose_neutral` visible al abrir |
| | `pose_celebrando`, `pose_advirtiendo`, `pose_pensando` | Recomendadas | Son las poses que pide el generador (`explicando` para explicar, `advirtiendo` para riesgos, `celebrando` para cierres y aciertos) |
| Cabeza | `cabeza` | Sí | **Una sola cabeza para todas las poses**, fuera de los grupos de pose, para que la boca funcione en cualquier pose |
| Ojos | `ojos_abiertos`, `ojos_cerrados` | Sí | Para el parpadeo. `ojos_cerrados` oculto al abrir |
| Cejas | `cejas` | Recomendada | Para expresiones |
| Bocas | `boca_A` … `boca_F`, `boca_X` | Sí | Dentro de un grupo `bocas`. Todas en el **mismo punto y tamaño**. Solo `boca_X` visible al abrir |
| | `boca_G`, `boca_H` | Recomendadas | Si faltan, el reproductor usa B y C |

### Las 9 bocas

| id | Forma | Sonidos (ejemplo en español) |
| --- | --- | --- |
| `boca_A` | Labios cerrados | m, b, p («mamá», «papá») |
| `boca_B` | Apenas abierta, dientes visibles | s, t, k, d, n y casi todas las consonantes |
| `boca_C` | Abierta | e («mesa») |
| `boca_D` | Muy abierta | a («casa») |
| `boca_E` | Redondeada | o («lobo») |
| `boca_F` | Labios fruncidos | u, w («luz») |
| `boca_G` | Dientes de arriba sobre el labio de abajo | f, v («foco») |
| `boca_H` | Lengua visible | l («la») |
| `boca_X` | Reposo, boca cerrada relajada | silencio |

Consejo: dibujar primero D (la más abierta) y X (reposo), y derivar las demás. Probar leyendo en voz alta «Hola, soy Ana» frente a la hoja de referencia.

### Colores que cambian con la marca

El mismo personaje sirve para todos los clientes: el uniforme toma los colores del kit. Para eso, pinta las piezas de uniforme con estos **colores marcadores** y el sistema los reemplaza por los del cliente.

| Marcador | Se reemplaza por | Uso típico |
| --- | --- | --- |
| `#0000FE` | primario del kit | Uniforme, chaqueta |
| `#00FE00` | secundario del kit | Franjas, detalles |
| `#FE0000` | acento del kit | Casco, chaleco, accesorios |

Piel, cabello, ojos y boca van con sus colores reales (no cambian).

### Revisar antes de entregar

```bash
node docs/diseno/personaje/validar-personaje.mjs ruta/ana.svg
```

Revisa las capas obligatorias, la proporción, los elementos prohibidos, el peso, los colores del kit y que al abrir se vea solo `boca_X`. Además, el sistema revisa las bocas al cargar el personaje en el kit (M02) y avisa cuáles faltan.

## 2. Estilos de ilustración base

Se necesitan **dos estilos** con los que el generador cree y reutilice imágenes. Por cada estilo se entrega:

| Pieza | Cantidad | Formato |
| --- | --- | --- |
| Hoja de estilo (reglas de abajo, con ejemplos correctos e incorrectos) | 1 | PDF |
| Escenas de ejemplo (planta, oficina, aula, exterior, primer plano de manos y herramienta) | 5 | SVG (o PNG 1920 × 1080 si llevan textura) |
| Objetos sueltos (equipo, herramienta, documento, señal, persona de espalda o silueta) | 10 | SVG |

Las escenas y objetos sirven de **referencia de estilo** para el generador de imágenes, si el proveedor permite estilo por imágenes de referencia (se confirma en la prueba PT-02), y entran a la biblioteca para reutilizarse.

| Regla | Estilo 1 · Plano corporativo | Estilo 2 · Lineal con acentos |
| --- | --- | --- |
| Formas | Geométricas, esquinas suaves (radio 4–8 px a 1920 px) | Trazo de grosor uniforme (3 px a 1920 px), extremos redondeados |
| Relleno | Colores planos del kit, sin contorno | Mayormente sin relleno; acentos con el color acento del kit |
| Color | 60 % fondo y neutros · 30 % primario · 10 % acento | 80 % trazo oscuro (texto del kit) · 20 % acento |
| Sombras | Una sombra plana opcional, sin desenfoque | Ninguna |
| Personas | Siluetas o figuras sin rasgos detallados; nunca personas reales ni famosas | Igual |
| Perspectiva | Frontal o 3/4 suave, sin puntos de fuga marcados | Frontal |
| Texto en la imagen | Nunca: el texto lo pone la pantalla | Nunca |

Los dos estilos usan **los mismos colores marcadores** del personaje, así las ilustraciones también cambian con el kit.

## 3. Íconos

Cuadrícula de 24 × 24 px, trazo de 2 px, en el estilo 2 (sirven para los dos estilos). SVG con un solo color (`currentColor`) para que el reproductor los pinte.

Íconos que el generador ya usa (sus nombres son los que pide IA-15):

`rayo` · `engranaje` · `gota` · `aire` · `llama` · `quimica` · `candado` · `llave` · `lupa` · `grupo` · `aviso` · `power` · `alerta` · `check`

Se agregan más según los temas de los clientes. El nombre del archivo es el nombre del ícono.

## 4. Pantallas modelo

Una pantalla modelo es el diseño base de una **disposición** con el estilo de un cliente. El generador elige la disposición y llena sus zonas; el diseño lo pone el modelo.

| Disposición | Zonas a diseñar |
| --- | --- |
| portada | título, subtítulo, personaje, fondo |
| objetivos | título, lista (3–4) con ícono |
| personaje | personaje grande, globo de diálogo, título |
| dato | dato grande (≤ 6 palabras), texto corto, ícono |
| idea | título, texto, dato clave destacado, imagen principal |
| lista | título, 2–6 tarjetas con ícono, título y texto |
| memoria · clasificar · ordenar | título, zona de juego (tarjetas, columnas o pasos) |
| decision | situación, 2–3 opciones, retroalimentación |
| quiz | pregunta, 3–4 opciones, tiempo, vidas, puntos |
| vf | afirmación, botones Mito / Realidad |
| hotspot | escena, puntos numerados, panel de detalle |
| video | video, barra con marcadores |
| resumen | título, 3–5 ideas con check |
| seccion | número grande, título |
| resultados | puntaje, estrellas, insignia |
| cierre | título, personaje celebrando, botón final |

**Cómo se entrega:**
- Un archivo de Figma (o Illustrator) con un marco por disposición en **escritorio 16:9 (1920 × 1080)** y **celular 9:16 (1080 × 1920)**.
- Cada zona como capa con el nombre de la tabla. Medidas y márgenes pensados en **porcentaje del ancho**: el reproductor no usa píxeles fijos.
- Desarrollo convierte cada marco en la `definicion` de `PantallaModelo`.

**Para el estilo base,** las 18 disposiciones. **Para un cliente nuevo,** basta con cambiar el kit (colores, tipografías, logo). Solo si el cliente lo pide se rediseñan 4 o 5 pantallas clave (portada, idea, lista, quiz, cierre).

## 5. Kit de un cliente

| Campo | Ejemplo (caso de referencia) |
| --- | --- |
| Paleta de 5 roles | primario `#0F2A44` · secundario `#1F7A5C` · acento `#F2A900` · texto `#102033` · fondo `#F5F7FA` |
| Tipografías (con licencia de uso web) | Títulos: Archivo · Texto: Source Sans 3 |
| Logo | SVG horizontal y versión en blanco |
| Estilo de ilustración | Plano corporativo |
| Personaje | Ana con los colores del kit |
| Voz | Español: voz de Google GA · Inglés: voz de Google GA |

**Contraste mínimo:** texto sobre fondo y blanco sobre primario de **4,5:1**. El sistema avisa si no se cumple.

Un ejemplo completo está en `packages/ai/casos/loto/entrada/kit.json`.

## Cómo cambia el trabajo del diseñador

| Antes | Con el generador |
| --- | --- |
| Diseñar cada pantalla en Illustrator o Photoshop | Diseñar una vez el kit y las pantallas modelo; el generador las llena |
| Animar la boca en Premiere y exportar video | Dibujar las 9 bocas una vez; la boca se calcula sola desde el audio |
| Rehacer gráficos cuando cambia un texto | Cambiar el texto; voz, boca, subtítulos e inglés se regeneran |
| Ajustar a mano cada versión en inglés | Revisar los avisos de desborde y retocar en el editor |
| — | Revisar la calidad visual de lo generado y retocar en el editor (línea de tiempo, modo libre) |
