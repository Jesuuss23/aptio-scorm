# DESIGN.md — Aptio SCORM (interfaz de la herramienta)

Guía visual de la interfaz de **Aptio SCORM**. Se refiere a la herramienta, no al aspecto de las cápsulas, que depende del kit de cada cliente. Parte del sistema propuesto en Stitch (`aptio_scorm_system`), ajustado y aplicado en `prototipo-unificado.html`, que es la referencia.

## Personalidad

SaaS empresarial claro y confiable para producir cursos. El protagonista es el contenido del cliente en el lienzo; la interfaz ordena y no compite. Español como idioma de la interfaz.

## Color

| Token | Valor | Uso |
| --- | --- | --- |
| fondo | `#F4F6F9` | Fondo de trabajo |
| superficie | `#FFFFFF` | Tarjetas y paneles, con borde `#E2E8F0` y sombra muy suave |
| texto | `#0B1C30` | Texto principal |
| texto-sec | `#64748B` | Etiquetas y ayudas |
| **cobalto** (primario) | `#004ECC` · activo `#003EA3` · suave `#EFF6FF` | Barra lateral (relleno sólido), acción principal, selección, enlaces |
| **naranja** (marca e IA) | `#FF6B35` · texto `#AB3500` · suave `#FFF1EB` · borde `#FFD3C2` | Logo, indicador del menú activo y **todo lo que hace la IA** (botones de contorno con fondo suave y ✦) |
| **verde azulado** (validado) | `#0F766E` sobre `#CCFBF1` (acento `#0D9488`) | Aprobado, listo, regenerado, validación SCORM |
| aviso | `#92400E` sobre `#FEF3C7` | Revisar, desbordes, faltantes |
| error | `#BA1A1A` sobre `#FFDAD6` | Errores de validación |

Reglas:
- El naranja **no** se usa para acciones normales, solo para la marca y para la IA. Así el usuario sabe siempre qué propone la IA.
- El cobalto sólido aparece en la barra lateral y en una sola acción principal por pantalla.
- Los colores del cliente solo aparecen dentro de las pantallas del curso.

## Tipografía

Interfaz en **Plus Jakarta Sans**; cifras, contadores, tiempos y costos en **JetBrains Mono** con cifras tabulares. Las cápsulas usan las tipografías del kit del cliente.

**Escala única de 6 tamaños** (auditoría de noviembre de 2026). Fuera de las cápsulas no se usa ningún otro tamaño.

| Token | Tamaño | Peso | Uso |
| --- | --- | --- | --- |
| `texto-xs` | 11 px | 700, mayúsculas, espaciado 0,07 em | Etiquetas de grupo y de campo, letras de la regla de tiempo |
| `texto-sm` | 12 px | 400–700 | Ayudas, metadatos, chips, celdas secundarias |
| `texto-base` | 14 px | 400 (600 en botones) | Texto, botones, campos, tablas |
| `titulo-panel` | 16 px | 700 | Títulos de tarjeta y panel, botón grande |
| `dato` | 20 px | 600, JetBrains Mono | Valores de indicadores (KPI) y cifras destacadas |
| `titulo-pagina` | 26 px | 700, espaciado -0,02 em | Solo el `h1` de cada vista |

Reglas:
- Un texto que no es título nunca supera 16 px.
- El `h1` de cada vista es su nombre en el menú (Revisión, Entrega…); la frase explicativa va debajo como subtítulo de 14 px.
- Números con punto decimal y coma de miles (formato `es-PE`): 3.4 días, S/ 1,500, US$ 58.20.

## Forma y elevación

- Radios: tarjetas 16 px, botones y campos 8 px, chips en píldora.
- Sombra base: `0 2px 8px -2px rgba(15,23,42,.06)`. Al pasar el cursor: `0 12px 24px -6px rgba(0,78,204,.10)`.
- Espaciado en múltiplos de 4 px.

## Márgenes y alineación

- El contenido empieza **32 px a la derecha de la barra lateral** en todas las vistas y en cualquier ancho de pantalla. No se centra: en pantallas anchas crece hasta 1600 px y el espacio sobrante queda a la derecha.
- La barra superior usa el mismo margen de 32 px, para que la ruta quede alineada con el título.
- Separación vertical: 24 px entre la barra superior y el título; 20 px entre bloques.
- En celular (menos de 900 px) los márgenes son de 16 px y la barra lateral pasa a una franja horizontal.

## Estructura

- **Barra lateral fija de 240 px en cobalto sólido**, con el logo Aptio SCORM (emblema naranja) arriba y, al pie, el costo de IA del mes con barra y el usuario. Tres grupos:
  - **Inicio:** Proyectos, Nuevo SCORM.
  - **Proyecto:** Producción, Revisión, Editor, Alineación pedagógica, Navegación, Personaje y voz, Video interactivo, Idiomas, Vista previa, Entrega.
  - **Empresa:** Clientes y kits, Rentabilidad, Conexiones IA.
- **Barra superior blanca y fija:** ruta (cliente / proyecto / vista), estado del proyecto como píldora, idiomas y, a la derecha, «Vista previa» y la acción principal «Exportar SCORM».
- **Flujo principal numerado:** Nuevo SCORM 1 → Producción 2 → Revisión 3 → Editor 4 → Entrega 5.
- **Revisión en tres columnas:** miniaturas · pantalla grande con textos editables · ajustes con IA, control de calidad y origen.
- **Editor:**
  - riel de íconos y galería · lienzo con barra contextual flotante · panel de propiedades;
  - debajo, a lo ancho, la **línea de tiempo**: narración por palabras, subtítulos, boca y una barra por elemento;
  - al pie, la tira de pantallas.
- Propuestas de IA: franja con fondo naranja suave (`#FFF1EB`), título con ✦, motivo y botones Aplicar / Descartar.

## Componentes

- Botón primario cobalto relleno; secundario blanco con borde; botón IA de contorno naranja con fondo suave y ✦.
- Estados de contenido como píldoras: Borrador (gris), Propuesta IA (naranja suave), Aprobado (verde azulado), Desactualizado o Revisar (ámbar).
- Origen del contenido: chip "Doc. p. 12" o chip "IA".
- Tarjetas con radio 16 px y sombra base, solo donde agrupan.
- Íconos de línea de 20 px.

## Reglas

- Densidad media: herramienta de trabajo, no página de marketing.
- Toda acción de IA es visible como tal (naranja y ✦) y reversible.
- Medidas siempre con unidad (min, MB, h, US$).
- Diseño de escritorio a 1440 × 900; la vista previa del participante sí debe verse en celular.

## Qué se tomó de Stitch y qué no

| Se tomó | No se tomó (y por qué) |
| --- | --- |
| Nombre y emblema Aptio SCORM, barra lateral cobalto, naranja de marca, Plus Jakarta Sans y JetBrains Mono, tarjetas de 16 px, barra superior con ruta y estado | Personajes y escenas fotorrealistas: el personaje es SVG con bocas animadas (decisión 7) |
| Píldoras de estado y medidor de costo de IA en la barra lateral | Datos inventados (OSHA, SCORM 2004 por defecto, ElevenLabs): el contenido sale del caso de referencia |
| Botones de IA en naranja | Botones cortados en la barra y acciones repetidas en dos barras |
| | Editor sin riel, sin propiedades y sin línea de tiempo: se mantiene el editor completo |
| | Ruta equivocada («Producción (Paso 2)» dentro del Editor) |
