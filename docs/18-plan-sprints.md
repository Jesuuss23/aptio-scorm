# Plan de sprints

Orden de construcción. Este plan no incluye tiempos, estimaciones, fechas ni personas asignadas: solo qué se construye, en qué orden y qué se prueba en cada demo.

**Cómo vamos probando:** cada sprint termina con una demo en el entorno de pruebas, usando el caso real (Bloqueo y etiquetado de Minera Andina) y, desde el S6, un proyecto real medido. El responsable del producto prueba la lista de la demo y deja sus observaciones en Jira como *Bug* o *Mejora*, enlazadas a la historia.

**Fase comercial (S11–S14):** sitio comercial, captación, planes y facturación (ADR-011, ADR-012, `23-sitio-comercial-y-facturacion.md`). Va después del S10. El sitio (S11–S12) no toca el generador y se puede adelantar con un equipo aparte; planes y facturación necesitan la multi-organización del S13.

**Hito de piloto:** al cerrar el S6 se puede rehacer un proyecto real con el generador y comparar horas con la medición de `11-medicion-y-piloto.md`. Si no baja al menos 40–50 % el tiempo, se revisa el plan antes de seguir.

| Sprint | Objetivo | Historias |
| --- | --- | --- |
| S0 | Fundaciones y pruebas técnicas | 10 |
| S1 | Clientes, kits y proyectos | 12 |
| S2 | Generador: del material al guion | 8 |
| S3 | Pantallas, reproductor y revisión básica | 6 |
| S4 | Voz, boca y subtítulos | 4 |
| S5 | Editor y regeneración en cascada | 10 |
| S6 | Entrega SCORM y piloto | 7 |
| S7 | Inglés y control de calidad | 4 |
| S8 | Alineación y navegación | 5 |
| S9 | Video, ilustraciones y biblioteca | 6 |
| S10 | Costos, rentabilidad y cierre | 6 |
| S11 | Superadmin y sitio comercial | 10 |
| S12 | SEO, blog y captación | 11 |
| S13 | Organizaciones, planes y suscripciones | 6 |
| S14 | Facturación electrónica y cobranza | 5 |

## S0 · Fundaciones y pruebas técnicas

**Objetivo:** El equipo puede levantar el sistema completo en local y sabe si la boca, la voz y las imágenes funcionan como se espera.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0101 | Entorno local con un comando | E01 | Alta | ____ |
| HU-0102 | Paquete del esquema del curso | E01 | Alta | ____ |
| HU-0103 | Base de datos y migraciones | E01 | Alta | ____ |
| HU-0104 | Sesión y roles | E01 | Alta | ____ |
| HU-0109 | Invitación y cambio de clave | E01 | Alta | ____ |
| HU-0110 | Sistema visual Aptio SCORM | E01 | Alta | ____ |
| HU-0105 | Colas y eventos en vivo | E01 | Alta | ____ |
| HU-0106 | Pruebas técnicas PT-01 a PT-03 | E01 | Alta | ____ |
| HU-0107 | Integración continua | E01 | Media | ____ |
| HU-1405 | Entorno de pruebas en la nube | E14 | Alta | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Levantar el entorno con un comando y entrar con un usuario de cada rol
- [ ] Escuchar 3 frases de Ana con voz de Google y boca automática (PT-01)
- [ ] Ver 10 imágenes generadas con el estilo del kit y decidir el proveedor (PT-02)
- [ ] Ver el resultado de 20 ejecuciones de IA con el esquema (PT-03)

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S1 · Clientes, kits y proyectos

**Objetivo:** Se crean clientes con su kit y proyectos con su material.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0108 | Ingresar con Google | E01 | Media | ____ |
| HU-0201 | Crear cliente | E02 | Alta | ____ |
| HU-0202 | Kit de marca con vista previa | E02 | Alta | ____ |
| HU-0203 | Personaje con bocas | E02 | Alta | ____ |
| HU-0204 | Pantallas modelo del kit | E02 | Alta | ____ |
| HU-0205 | Glosario y pronunciación | E02 | Media | ____ |
| HU-0301 | Lista de proyectos | E03 | Alta | ____ |
| HU-0302 | Nuevo SCORM sin datos obligatorios | E03 | Alta | ____ |
| HU-0303 | Estimación opcional | E03 | Media | ____ |
| HU-0304 | Subir material y extraer texto | E03 | Alta | ____ |
| HU-1402 | Seguridad de archivos y datos | E14 | Alta | ____ |
| HU-1404 | Documentos cifrados y borrado programado | E14 | Alta | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Crear el kit de un cliente y ver las pantallas modelo con sus colores
- [ ] Crear un proyecto solo con nombre y tema
- [ ] Subir el PDF de ejemplo y ver el texto por página

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S2 · Generador: del material al guion

**Objetivo:** El generador produce objetivos, estructura y guion revisables desde el material.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0305 | Video o audio como material | E03 | Media | ____ |
| HU-0401 | Lanzar generación con avance visible | E04 | Alta | ____ |
| HU-0402 | Resumen e ideas clave con origen | E04 | Alta | ____ |
| HU-0403 | Objetivos y estructura | E04 | Alta | ____ |
| HU-0404 | Guion por pantalla | E04 | Alta | ____ |
| HU-0405 | Salidas validadas y reintentos | E04 | Alta | ____ |
| HU-0408 | Cancelar y reintentar etapas | E04 | Media | ____ |
| HU-1301 | Registrar costo por trabajo | E13 | Alta | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Generar desde el PDF y ver avanzar las etapas 1 a 3 con su costo
- [ ] Ver el guion de las 30 pantallas con su página de origen
- [ ] Cancelar una generación y comprobar que se conserva lo hecho

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S3 · Pantallas, reproductor y revisión básica

**Objetivo:** El guion se convierte en pantallas animadas con el kit y se revisan.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0406 | Componer pantallas con el kit | E04 | Alta | ____ |
| HU-0407 | Datos de las actividades | E04 | Alta | ____ |
| HU-0501 | Revisar pantallas | E05 | Alta | ____ |
| HU-0502 | Aprobar una o por lote | E05 | Alta | ____ |
| HU-1101 | Reproductor único | E11 | Alta | ____ |
| HU-1102 | Vista previa clásica | E11 | Alta | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Ver las 30 pantallas aparecer en Producción
- [ ] Revisar una pantalla, cambiar el título y aprobarla
- [ ] Recorrer la cápsula en la vista previa con el patrón Clásico

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S4 · Voz, boca y subtítulos

**Objetivo:** Cada pantalla tiene narración con la boca de Ana y subtítulos.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0701 | Narración con la voz del kit | E07 | Alta | ____ |
| HU-0702 | Boca sincronizada | E07 | Alta | ____ |
| HU-0703 | Narraciones desactualizadas | E07 | Alta | ____ |
| HU-0801 | Subtítulos | E08 | Alta | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Escuchar la cápsula completa con Ana hablando
- [ ] Cambiar la pronunciación de una palabra y regenerar solo lo afectado
- [ ] Ver los subtítulos sincronizados

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S5 · Editor y regeneración en cascada

**Objetivo:** El equipo retoca pantallas y la IA propone cambios que se aplican o descartan.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0503 | Regeneración en cascada | E05 | Alta | ____ |
| HU-0504 | Propuestas de la IA | E05 | Alta | ____ |
| HU-0601 | Editar texto sobre la pantalla | E06 | Alta | ____ |
| HU-0602 | Barra contextual y propiedades | E06 | Alta | ____ |
| HU-0603 | Modo libre | E06 | Alta | ____ |
| HU-0604 | Retoques separados del contenido | E06 | Alta | ____ |
| HU-0605 | Cambiar diseño de la pantalla | E06 | Media | ____ |
| HU-0606 | Agregar elementos y capas | E06 | Media | ____ |
| HU-0607 | Deshacer, rehacer y guardado automático | E06 | Alta | ____ |
| HU-0608 | Línea de tiempo de la pantalla | E06 | Alta | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Cambiar una narración y ver voz, boca y subtítulos actualizarse solos
- [ ] Pedir «Más visual» y aplicar la propuesta; deshacer
- [ ] Mover una imagen en modo Libre, agregar un botón y recargar la página
- [ ] En la línea de tiempo, arrastrar un elemento hasta la palabra que lo nombra, recortar su salida y reproducir: entra y sale en esos segundos con boca y subtítulos sincronizados

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S6 · Entrega SCORM y piloto

**Objetivo:** Se exporta un SCORM 1.2 que funciona en LMS reales. Con esto empieza el piloto con un proyecto real.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-1105 | Reanudación | E11 | Alta | ____ |
| HU-1201 | Validar antes de exportar | E12 | Alta | ____ |
| HU-1202 | Exportar SCORM 1.2 | E12 | Alta | ____ |
| HU-1203 | Exportar HTML | E12 | Media | ____ |
| HU-1204 | Modo diagnóstico | E12 | Alta | ____ |
| HU-1401 | Accesibilidad de las cápsulas | E14 | Alta | ____ |
| HU-1406 | Licencias y créditos de IA | E14 | Media | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Exportar SCORM 1.2 y subirlo a SCORM Cloud y a Moodle de pruebas
- [ ] Ver avance, nota y reanudación en el LMS
- [ ] Rehacer un proyecto medido con el generador y registrar las horas (piloto)

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S7 · Inglés y control de calidad

**Objetivo:** La cápsula sale bilingüe y con control de calidad automático.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0505 | Control de calidad automático | E05 | Alta | ____ |
| HU-0802 | Traducir con glosario | E08 | Alta | ____ |
| HU-0803 | Desbordes por idioma | E08 | Alta | ____ |
| HU-0804 | Bilingüe en un paquete | E08 | Alta | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Traducir al inglés con el glosario y revisar
- [ ] Exportar ES + EN en un mismo paquete
- [ ] Ver las observaciones de calidad y aprobar por lote

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S8 · Alineación y navegación

**Objetivo:** Se verifica la alineación pedagógica y se elige el patrón de navegación.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0610 | Disparadores simples | E06 | Baja | ____ |
| HU-1001 | Matriz de alineación | E10 | Alta | ____ |
| HU-1002 | Corregir con IA | E10 | Media | ____ |
| HU-1103 | Patrones de navegación | E11 | Media | ____ |
| HU-1104 | Patrón recomendado o creado por IA | E11 | Baja | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Ver las alertas de alineación del ejemplo y corregirlas con la propuesta
- [ ] Probar Clásico, Historias y Mapa en escritorio y celular
- [ ] Comprobar que una actividad obligatoria bloquea el avance

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S9 · Video, ilustraciones y biblioteca

**Objetivo:** Videos del cliente interactivos e ilustraciones generadas con el estilo del kit.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0206 | Extraer kit de un curso anterior | E02 | Baja | ____ |
| HU-0609 | Imágenes propias y biblioteca | E06 | Media | ____ |
| HU-0704 | Audio del cliente | E07 | Media | ____ |
| HU-0901 | Preguntas en el video | E09 | Media | ____ |
| HU-0902 | Impedir adelantar | E09 | Media | ____ |
| HU-0903 | Pausas propuestas por IA | E09 | Baja | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Agregar pausas con preguntas a un video y probar «impedir adelantar»
- [ ] Generar 4 variantes de una ilustración y usar una
- [ ] Subir una imagen propia arrastrándola al lienzo

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S10 · Costos, rentabilidad y cierre

**Objetivo:** El negocio se mide con datos reales y el sistema queda listo para uso diario.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-0506 | Comentarios del revisor del cliente | E05 | Media | ____ |
| HU-1205 | Kit de gamificación para el LMS | E12 | Baja | ____ |
| HU-1302 | Resumen de costos | E13 | Media | ____ |
| HU-1303 | Rentabilidad y mediciones | E13 | Alta | ____ |
| HU-1304 | Proveedor por tarea | E13 | Media | ____ |
| HU-1403 | Observabilidad y respaldo | E14 | Media | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Ver el costo de IA por proyecto y por proveedor
- [ ] Cargar las horas medidas y ver la rentabilidad real
- [ ] Cambiar el proveedor de voz y probar la conexión
- [ ] Invitar a un revisor del cliente y recibir comentarios

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S11 · Superadmin y sitio comercial

**Objetivo:** El superadmin publica el sitio comercial desde el panel y decide qué se muestra y qué se oculta.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-1501 | Rol superadmin y menú del sitio | E15 | Alta | ____ |
| HU-1502 | Páginas con estados y programación | E15 | Alta | ____ |
| HU-1503 | Editor de página por bloques | E15 | Alta | ____ |
| HU-1504 | Contenido administrable con mostrar/ocultar | E15 | Alta | ____ |
| HU-1505 | Datos ficticios y bloqueo de publicación | E15 | Alta | ____ |
| HU-1506 | Menú y pie administrables | E15 | Media | ____ |
| HU-1507 | Vista previa, versiones y restauración | E15 | Alta | ____ |
| HU-1508 | Sitio público rápido y accesible | E15 | Alta | ____ |
| HU-1509 | Ajustes del sitio | E15 | Media | ____ |
| HU-1514 | Landings por sector | E15 | Alta | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Entrar como superadmin y ver el grupo «Sitio web»; entrar como administrador de organización y no verlo
- [ ] Ocultar un testimonio y un bloque; publicar y comprobar que no aparecen; volver a mostrarlos
- [ ] Intentar publicar en producción con datos ficticios visibles y ver el bloqueo con la lista
- [ ] Programar una página y ver que se publica a la hora indicada
- [ ] Revisar Lighthouse del inicio en celular
- [ ] Crear una landing de sector, asignarle testimonios y publicarla; verla en el bloque Sectores del inicio

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S12 · SEO, blog y captación

**Objetivo:** El sitio capta leads por cuatro vías y los entrega al CRM, y se puede encontrar en buscadores y asistentes de IA.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-1510 | Sitio en español e inglés | E15 | Media | ____ |
| HU-1511 | Sección Blog desde WordPress con filtro por categoría | E15 | Media | ____ |
| HU-1512 | SEO técnico | E15 | Alta | ____ |
| HU-1513 | SEO para IA | E15 | Media | ____ |
| HU-1601 | Leads con origen y UTM | E16 | Alta | ____ |
| HU-1602 | Integración con CRM | E16 | Alta | ____ |
| HU-1603 | Popups | E16 | Media | ____ |
| HU-1604 | Chatbot del sitio | E16 | Media | ____ |
| HU-1605 | Agendamiento de demos | E16 | Alta | ____ |
| HU-1606 | Consentimiento de cookies | E16 | Alta | ____ |
| HU-1607 | Resumen del sitio | E16 | Media | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Publicar un artículo en WordPress, verlo en la sección Blog tras la sincronización y filtrarlo por categoría
- [ ] Probar el popup de salida y ver el lead con origen «Popup»
- [ ] Agendar una demo desde el chatbot y desde /agendar-demo; ver ambas citas y leads
- [ ] Forzar un error del CRM y ver el reintento y el estado
- [ ] Rechazar cookies y comprobar que no se carga GA4

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S13 · Organizaciones, planes y suscripciones

**Objetivo:** Una productora puede suscribirse sola desde /precios y usar Aptio SCORM con su cuota de cápsulas.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-1701 | Organizaciones (multi-tenant) | E17 | Alta | ____ |
| HU-1702 | Planes administrables | E17 | Alta | ____ |
| HU-1703 | Alta de suscripción desde /precios | E17 | Alta | ____ |
| HU-1704 | Pasarelas de pago y webhooks | E17 | Alta | ____ |
| HU-1705 | Cuotas de cápsulas | E17 | Alta | ____ |
| HU-1706 | Cambio de plan y cancelación | E17 | Media | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Cambiar el precio de un plan y verlo en /precios y en el pago
- [ ] Suscribirse con tarjeta de prueba y entrar a una organización nueva y vacía
- [ ] Consumir la cuota de cápsulas y comprar una adicional
- [ ] Cambiar de plan y revisar el prorrateo
- [ ] Comprobar que una organización no ve datos de otra

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |

## S14 · Facturación electrónica y cobranza

**Objetivo:** Cada cobro emite su comprobante electrónico y los pagos fallidos siguen un proceso claro.

| ID | Historia | Épica | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| HU-1707 | Comprobantes electrónicos SUNAT | E17 | Alta | ____ |
| HU-1708 | Cobranza y suspensión | E17 | Alta | ____ |
| HU-1709 | Cupones y convenios | E17 | Baja | ____ |
| HU-1710 | Panel de ingresos | E17 | Media | ____ |
| HU-1711 | Portal de facturación de la organización | E17 | Media | ____ |

**Demo para probar** (la hace el responsable del producto):

- [ ] Pagar y recibir la factura con PDF y XML aceptada en el ambiente de pruebas del OSE
- [ ] Simular un pago rechazado y ver los 3 reintentos, los avisos y la suspensión
- [ ] Aplicar un cupón y ver el descuento en el comprobante
- [ ] Ver el ingreso mensual recurrente y la cancelación del mes
- [ ] Descargar comprobantes desde el portal de la organización

| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |
| --- | --- | --- |
| ____ | ____ | ____ |
