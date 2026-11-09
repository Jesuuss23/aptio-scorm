# Auditoría visual del prototipo

Revisión de las 15 vistas de `docs/diseno/prototipo-unificado.html`, hecha el 01/11/2026. Se midieron con un navegador automatizado a 1280 px, 1440 px, 1920 px y en celular (390 px):
- la distancia entre la barra lateral y el contenido;
- los tamaños de letra fuera de las cápsulas;
- el desborde horizontal;
- los errores de la página.

El prototipo ya incluye las correcciones. Las reglas que salen de aquí están en `docs/diseno/DESIGN.md` y son obligatorias para `apps/web`.

## Resumen

| Tema | Antes | Después |
| --- | --- | --- |
| Distancia barra lateral → contenido a 1920 px | **176 px** a cada lado (contenido centrado) | **32 px** en todas las vistas y anchos |
| Distancia barra lateral → contenido a 1280 px | 16 px | 32 px |
| Tamaños de letra distintos en la interfaz | **16** (9, 10, 10,5, 11, 11,5, 12, 13, 13,5, 14, 15, 16, 17, 18, 22, 24, 26, 28 px) | **6** (11, 12, 14, 16, 20, 26 px) |
| Textos que no son título con más de 16 px | Cifras de 18–28 px, botones de 17 px, nombres de tipografía de 24 px | Ninguno, salvo las cifras de indicadores (20 px) |
| Títulos de página | Mezcla de frases («Revisa y ajusta…», «Paquetes para cualquier LMS») y nombres; uno de 22 px | El `h1` es siempre el nombre de la vista, a 26 px; la frase va como subtítulo |
| Etiquetas encima del título | Repetían la ruta de la barra superior | Eliminadas |
| Barra lateral a 900 px de alto | El usuario del pie quedaba cortado | Entra completa: menú más compacto y medidor de costo en una línea |
| Etiquetas de estado en las miniaturas de Revisión | Cortadas («Apro», «Revis») | Completas; el nombre de la pantalla se recorta con «…» |
| Formato de números | «3,4 días» y «US$ 58,20» junto a «3.4» y «S/ 1,500» | Un solo formato `es-PE`: 3.4 · US$ 58.20 · S/ 1,500 |
| Desborde horizontal en celular | 0 en las 15 vistas | 0 en las 15 vistas |
| Errores de la página | 0 | 0 |

## Detalle de los hallazgos

### 1. Separación entre la barra lateral y el contenido

El contenido tenía un ancho máximo de 1360 px y se **centraba**. En pantallas anchas quedaba un hueco de 176 px junto a la barra lateral y otro igual a la derecha. Por eso algunas vistas se veían «alejadas» y otras no: dependía del ancho de la ventana.

**Corrección:** el contenido se alinea a la izquierda, con 32 px desde la barra, y crece hasta 1600 px. La barra superior usa el mismo margen.

### 2. Armonía tipográfica

Había 16 tamaños distintos, muchos escritos a mano en cada pantalla. Cifras secundarias («3 / 30», «14.8 MB», «0:00») llegaban a 18–28 px, más que los títulos de panel. El botón grande y los textos de muestra de tipografía también se salían de la escala.

**Corrección:** escala única de 6 tamaños (tabla en `DESIGN.md`). Solo el `h1` de la vista llega a 26 px. Las cifras de los indicadores usan 20 px en JetBrains Mono, y ningún otro texto pasa de 16 px.

### 3. Orden de los elementos

- **Cabecera igual en todas las vistas:** título con el nombre del menú, subtítulo explicativo y, a la derecha, como máximo una acción o dos indicadores.
- **Barra superior:** la ruta (cliente / proyecto / vista), el estado y las acciones globales. No se repite en el cuerpo.
- **Producción sin generación:** muestra la misma cabecera que las demás vistas y una tarjeta con las dos acciones posibles.

### 4. Pendiente para desarrollo (no bloquea)

- **Barra contextual del editor a 1440 px:** las últimas acciones quedan dentro de un desplazamiento horizontal. En `apps/web` conviene agruparlas en un menú «Más».
- **Accesibilidad:** el prototipo no pasó por un lector de pantalla. Queda para la historia HU-1401 (S6).

## Cómo repetir la auditoría

El equipo de desarrollo repite la misma medición en Playwright sobre `apps/web` (historia HU-0110). La prueba falla si:
- el contenido de una vista empieza a más de 32 px de la barra lateral;
- aparece un tamaño de letra fuera de la escala;
- hay desborde horizontal en 390 px.
