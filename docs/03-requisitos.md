# Requisitos

Prioridad: **P** = prototipo, **M** = MVP, **L** = posterior (la fase comercial, REQ-064 a REQ-092, REQ-109 y REQ-110, es **L**; ver `23-sitio-comercial-y-facturacion.md`). Cada requisito se verifica con su criterio de aceptación.

## Funcionales

| ID | Requisito | Prioridad | Criterio de aceptación | Pantalla |
| --- | --- | --- | --- | --- |
| REQ-001 | Crear, listar, filtrar y abrir proyectos por cliente y estado | P | Con 20 proyectos de ejemplo, filtrar por cliente devuelve solo los suyos | PNT-01 |
| REQ-002 | Crear y editar el kit de marca de un cliente | P | Al cambiar el color primario, la vista previa de las 3 pantallas tipo se actualiza sin recargar | PNT-02 |
| REQ-003 | Validar contraste de texto en el kit | M | Una combinación con contraste menor a 4.5:1 en texto normal muestra advertencia | PNT-02 |
| REQ-004 | Estimación de producción **opcional** (calculadora) | P | Con los valores de la calculadora de referencia, los resultados coinciden con ±1 unidad | PNT-03, PNT-14 |
| REQ-005 | El diseñador puede fijar a mano las pantallas y registrar su decisión | P | El valor fijado reemplaza al calculado y la nota queda guardada en el proyecto | PNT-03 |
| REQ-006 | Cargar PDF, Word y PowerPoint y extraer texto por página | P | Un PDF de 50 páginas muestra el texto de cada página; las páginas escaneadas se marcan | PNT-04 |
| REQ-007 | Mapa de temas y propuesta conservar/complementario/omitir con motivo | P | Cada tema tiene una de las tres categorías y un motivo; el usuario puede moverlo | PNT-04 |
| REQ-008 | Generar acta de lo omitido | M | El acta lista temas omitidos con página de origen | PNT-04 |
| REQ-009 | Proponer estructura y storyboard con IA a partir del brief (si existe), el tema y el material | P | La propuesta valida contra el esquema y se muestra sin aplicarse hasta que el usuario acepta | PNT-05 |
| REQ-010 | Trazabilidad del contenido a documento y página | P | Cada bloque generado desde un documento muestra archivo y página; lo creado por IA se marca | PNT-05, PNT-06 |
| REQ-011 | Aprobar pantallas del storyboard | P | Una pantalla aprobada no se modifica por IA sin una nueva aprobación | PNT-05 |
| REQ-012 | Matriz de alineación con alertas | M | Un objetivo sin interacción ni pregunta asociada aparece como alerta | PNT-05 |
| REQ-013 | Editor de cápsula con bloques, deshacer/rehacer y guardado automático | P | 20 acciones de deshacer funcionan; cerrar y reabrir conserva el último estado | PNT-06 |
| REQ-014 | Interacciones INT-01 memoria, INT-02 clasificar, INT-05 quiz con tiempo | P | Cada una funciona con dedo, ratón y teclado y calcula el puntaje según su ficha | PNT-06, PNT-07 |
| REQ-015 | Resto del catálogo INT-03, 04, 06, 07, 08 | M | Igual criterio que REQ-014 | PNT-07 |
| REQ-016 | La IA sugiere la interacción y genera sus datos desde el contenido de la pantalla | P | La sugerencia incluye motivo; los datos validan contra la ficha de la interacción | PNT-07 |
| REQ-017 | Biblioteca de piezas recoloreables con el kit | P | Una ilustración SVG de biblioteca adopta la paleta del kit al insertarse | PNT-08 |
| REQ-018 | Generar imagen por prompt con el estilo del kit | P | Se obtienen 4 variantes; la elegida queda en la biblioteca del cliente con origen "generada" | PNT-08 |
| REQ-019 | Subir SVG con capas nombradas y aplicar animación por capa | P | Un SVG con capa `brazo_der` permite aplicar "señalar" solo a esa capa | PNT-08 |
| REQ-020 | Sanitizar SVG subidos | P | Un SVG con `<script>` o atributos `on*` se guarda sin ellos | PNT-08 |
| REQ-021 | Narración TTS por bloque e idioma | P | El audio queda ligado al hash del texto; si el texto cambia, se marca desactualizado | PNT-09 |
| REQ-022 | Boca sincronizada del personaje | P | En vista previa, la boca cambia según las marcas de tiempo; desfase perceptible menor a 100 ms en la prueba PT-01 | PNT-09 |
| REQ-023 | Lip sync para audio grabado (Rhubarb) | M | Un audio del cliente en español produce marcas de boca utilizables | PNT-09 |
| REQ-024 | Limpieza de audio del cliente | L | Reducción de ruido y normalización aplicadas con vista previa antes/después | PNT-09 |
| REQ-025 | Subtítulos WebVTT por idioma generados del guion o transcripción | P | El archivo VTT de cada idioma se sincroniza con el audio | PNT-09, PNT-11 |
| REQ-026 | Video del cliente con preguntas en la línea de tiempo | P | Al llegar al marcador, el video se pausa y muestra la pregunta | PNT-10 |
| REQ-027 | Propuesta de pausas y preguntas desde la transcripción | P | La IA propone al menos un marcador por cambio de tema con su tiempo | PNT-10 |
| REQ-028 | Traducción ES↔EN con glosario y revisión | P | Los términos del glosario no se traducen; cada texto tiene estado Pendiente/Traducido/Revisado | PNT-11 |
| REQ-029 | Alertas de desborde por idioma | P | Un texto que excede la plantilla en inglés o español se marca | PNT-11 |
| REQ-030 | Vista previa celular/tableta/escritorio con cambio de idioma | P | Cambiar de idioma conserva la pantalla y el progreso | PNT-12 |
| REQ-031 | Descarga del JSON del curso | P | El JSON descargado valida contra el esquema v0 | PNT-13 |
| REQ-032 | Exportación HTML autocontenida | M | La carpeta abre con doble clic sin conexión y sin LMS | PNT-13 |
| REQ-033 | Exportación SCORM 1.2 (un SCO) con perfiles de LMS | M | Pasa las pruebas de la fase D en Moodle 4.5+ | PNT-13 |
| REQ-034 | Paquete bilingüe con un solo seguimiento | M | Cambiar de idioma no reinicia progreso ni nota; las interacciones tienen el mismo id | PNT-13 |
| REQ-035 | Validador de exportación (peso, faltantes, idioma, accesibilidad) | M | Un audio faltante en EN bloquea la exportación bilingüe | PNT-13 |
| REQ-036 | Kit de gamificación para LMS | M | Se descargan insignias con la marca y la guía del LMS elegido | PNT-16 |
| REQ-037 | Registro de costo de IA por trabajo, proyecto y cliente | P | Cada trabajo registra proveedor, modelo, consumo y costo; el proyecto muestra el total | Todas |
| REQ-038 | Toda propuesta de IA se revisa antes de aplicarse | P | No existe ruta en la API que aplique una salida de IA sin acción del usuario | Todas |
| REQ-039 | Compatibilidad con LMS desconocidos: perfil Genérico sin ajustes propios, ficha de compatibilidad por cliente y modo diagnóstico dentro del paquete | M | Un paquete del perfil Genérico pasa las pruebas en SCORM Cloud; el modo diagnóstico muestra la API encontrada y cada llamada con su respuesta | PNT-13 |
| REQ-040 | Sin tamaño máximo fijo: el validador advierte según el límite de subida del destino y ofrece alternativas (comprimir, dividir, alojar video fuera) | M | Un paquete de 300 MB se exporta con advertencia y no se bloquea | PNT-13 |
| REQ-041 | Reproductor con navegación configurable: modos libre / con actividades obligatorias / secuencial, temario con estados, progreso, contador, glosario, recursos, ayuda, accesibilidad, reanudación | P | Con modo secuencial, el temario bloquea pantallas no alcanzadas y Siguiente muestra el motivo; al volver, ofrece continuar en la última pantalla | PNT-17, PNT-12 |
| REQ-042 | Matriz de alineación pedagógica con niveles de Bloom, alertas y propuestas de la IA | P | Un objetivo de nivel aplicar evaluado solo con preguntas de nivel recordar muestra alerta; aplicar la propuesta la resuelve | PNT-18 |
| REQ-043 | Crear un proyecto solo con el nombre y empezar a editar de inmediato; estimación, LMS y datos técnicos son opcionales y se completan después | P | Se crea un proyecto sin horas ni LMS y se llega al editor en 2 clics; ninguna pantalla posterior se bloquea por esos datos; al exportar sin LMS se usa el perfil Genérico | PNT-03, PNT-14, PNT-13 |
| REQ-044 | Inicio por plantilla de cápsula, tema con IA, documentos o video | P | Elegir una plantilla crea todas sus pantallas con el kit del cliente; "tema con IA" deja la propuesta como borrador por aprobar | PNT-03 |
| REQ-045 | Editor visual amigable: riel con galerías visuales y buscador, clic o arrastrar al lienzo, barra contextual, edición de texto en el lienzo con doble clic, tira de pantallas con miniaturas, barra de IA y opciones avanzadas plegadas | P | Prueba con 5 usuarios nuevos: sin ayuda, crean una pantalla con título, imagen, botón y animación en menos de 5 minutos; la tarea "cambiar el color de un texto" se completa sin abrir opciones avanzadas | PNT-06 |
| REQ-046 | Subir imágenes propias desde el panel o arrastrando archivos al lienzo | P | Una imagen arrastrada desde el escritorio queda en el punto donde se soltó y en la biblioteca del proyecto | PNT-06, PNT-08 |
| REQ-047 | Catálogo de patrones de navegación (clásico, historias, desplazamiento vertical, mapa de misiones, menú de temas, ramificado, inmersivo) independiente de las reglas de navegación, guardable como preferido del cliente | P | Los 7 patrones se combinan con los 3 modos de navegación sin perder bloqueo, reanudación ni registro de avance; cada patrón es operable solo con teclado | PNT-17, PNT-12 |
| REQ-048 | La IA recomienda un patrón con motivo y crea patrones personalizados como configuración validada (sin código) | P | La salida valida contra `navegacion.patronPersonalizado` del esquema; un patrón personalizado exportado funciona en SCORM Cloud igual que uno del catálogo | PNT-17 |
| REQ-049 | Generar un SCORM completo desde el material o el tema en 11 etapas con avance visible y costo por etapa | P | Con el PDF de ejemplo y 30 pantallas ES + EN, la generación termina sin intervención y todas las salidas validan contra el esquema | PNT-19 |
| REQ-050 | Las pantallas se componen con disposiciones y componentes del kit; la IA nunca entrega HTML ni código | P | 100 % de las pantallas generadas tienen `disposicion` válida y se dibujan con el reproductor | PNT-19, PNT-20 |
| REQ-051 | Regeneración en cascada: un cambio de texto rehace solo voz, boca, subtítulos y traducción afectados | P | Cambiar la narración de 1 pantalla genera trabajos solo para esa pantalla e idiomas | PNT-20, PNT-09 |
| REQ-052 | Revisión con propuestas de IA (más visual, menos texto, actividad, 3 variantes, ilustración, libre) y aprobación por lote | P | Aplicar una propuesta crea una versión y se puede deshacer; aprobar por lote excluye pantallas con observaciones | PNT-20 |
| REQ-053 | Retoques del editor guardados aparte del contenido (`ajustes`, `extras`) | P | Regenerar el texto de una pantalla conserva tamaños, posiciones y elementos agregados | PNT-21 |
| REQ-054 | Historial de versiones del curso y restauración | M | Restaurar la versión N deja el documento idéntico a N y crea una versión nueva | PNT-21 |
| REQ-055 | Vista previa del participante con el patrón y las reglas elegidos, en escritorio y celular | P | Con «actividades obligatorias», Siguiente queda bloqueado hasta completar la actividad y muestra el motivo | PNT-12 |
| REQ-056 | Rentabilidad con supuestos o con horas medidas, y registro de mediciones | P | Con mediciones cargadas, el costo por SCORM usa sus promedios; sin mediciones usa los supuestos | PNT-22 |
| REQ-057 | Proveedor y modelo configurables por tarea, con prueba de conexión y límite de gasto | P | Cambiar el proveedor de voz se aplica a la siguiente narración sin reiniciar el sistema; superar el límite pausa y avisa | PNT-23 |
| REQ-058 | Comentarios del revisor del cliente por pantalla, sin permisos de edición | M | Un revisor solo ve proyectos de su cliente y no puede cambiar el curso (403) | PNT-20 |
| REQ-059 | Línea de tiempo por pantalla con narración, subtítulos, boca y una barra por elemento, editable arrastrando | P | Arrastrar la barra de un elemento cambia su entrada o salida; al reproducir, aparece y sale en esos segundos en la vista previa y en el paquete | PNT-21 |
| REQ-060 | Ingreso con correo y clave; ingreso con Google opcional solo para correos invitados; invitación y cambio de clave por correo | P | Un correo no invitado no puede entrar con Google; los enlaces de un solo uso vencen en 60 minutos | — |
| REQ-061 | Documentos del cliente cifrados en tránsito y en reposo, con borrado programado tras la entrega | P | Los objetos del bucket están cifrados con KMS; los documentos fuente se borran al cumplirse la retención del cliente | — |
| REQ-062 | Cada recurso generado registra proveedor, modelo y licencia; la cápsula incluye créditos de IA | M | El 100 % de los recursos con origen «generado» tiene proveedor, modelo y licencia | — |
| REQ-063 | Interfaz consistente con el sistema visual Aptio SCORM: tokens, escala de 6 tamaños de letra y márgenes de 32 px | P | Prueba automática por vista sin tamaños fuera de escala, con margen de 32 px y sin desborde en celular | — |
| REQ-064 | Rol superadmin de plataforma, separado del administrador de cada organización; solo él ve los grupos Sitio web, Captación y Ventas | L | Un administrador de organización recibe 403 en /api/v1/sitio/* | PNT-24 |
| REQ-065 | Páginas del sitio con estados Borrador, Programada y Publicada | L | Una página en borrador responde 404; una programada se publica a la hora indicada con 1 min de tolerancia | PNT-25 |
| REQ-066 | Todo el contenido del sitio tiene orden y mostrar/ocultar: bloques, cifras, testimonios, logos, funcionalidades, pasos, LMS, preguntas, planes y características, menú, pie, popups, respuestas del chatbot, pasarelas y cupones. Ocultar no borra | L | Ocultar un elemento lo quita del sitio en la siguiente publicación sin borrar el registro; mostrarlo lo restituye igual | PNT-25, PNT-26, PNT-27 |
| REQ-067 | Datos marcados como ficticios bloquean la publicación en producción mientras estén visibles | L | Publicar en producción con 1 dato ficticio visible devuelve 409 con la lista | PNT-27 |
| REQ-068 | Vista previa en escritorio y celular, publicación con versiones y restauración | L | Restaurar la versión N deja el sitio igual a N y crea una versión nueva | PNT-26 |
| REQ-069 | Sitio en español e inglés con selector y hreflang | L | hreflang solo enlaza versiones publicadas | PNT-25 |
| REQ-070 | Sección Blog al final de las páginas, alimentada por WordPress (API REST): solo artículos publicados, con filtro por categoría; el panel elige categorías y artículos visibles | L | Un artículo publicado en WordPress aparece en la sección en 15 min como máximo; un borrador nunca aparece | PNT-28 |
| REQ-071 | SEO técnico por página y del sitio: metadatos, canonical, indexación, datos estructurados, sitemap, robots y redirecciones 301 | L | Una página con «Indexar» apagado lleva noindex y no entra al sitemap | PNT-26, PNT-29 |
| REQ-072 | SEO para IA: llms.txt, preguntas objetivo por asistente, control de rastreadores de IA y propuestas revisables | L | Bloquear un rastreador lo agrega a robots.txt; las propuestas de IA llegan como borrador | PNT-30 |
| REQ-073 | Ajustes del sitio: dominio con SSL, marca, analítica, WhatsApp, correo de leads y modo mantenimiento | L | Con mantenimiento activo, los visitantes reciben 503 con página de aviso | PNT-38 |
| REQ-074 | Leads con origen, página de entrada y UTM desde todas las vías de captación | L | El 100 % de los leads tiene origen y página de entrada | PNT-34 |
| REQ-075 | Envío de leads a CRM (HubSpot, Pipedrive, Zoho o webhook firmado) con mapeo de campos y reintentos | L | Con el CRM caído, el lead se reintenta 3 veces y queda con el error visible | PNT-34 |
| REQ-076 | Popups modal, deslizable y barra con disparador, páginas, frecuencia y resultado | L | Un popup no se repite al mismo visitante antes de 7 días | PNT-31 |
| REQ-077 | Chatbot que responde solo con la base de conocimiento aprobada, agenda demos y pasa a una persona | L | Ante una pregunta fuera de la base, no inventa y ofrece agendar o una persona | PNT-32 |
| REQ-078 | Agendamiento de demos en hora de Lima con calendario, videollamada y recordatorios | L | Una franja ocupada en el calendario del asesor no se ofrece | PNT-33 |
| REQ-079 | Consentimiento de cookies por categoría (Ley 29733); analítica solo con consentimiento | L | Al rechazar, no se carga ninguna etiqueta de analítica ni publicidad | PNT-39 |
| REQ-080 | Resumen del sitio con visitas, leads, demos, suscripciones y origen | L | Los indicadores coinciden con las tablas de leads, citas y suscripciones | PNT-24 |
| REQ-081 | Organizaciones (multi-tenant) con datos aislados | L | Un usuario no accede a datos de otra organización (404) y el intento queda auditado | — |
| REQ-082 | Planes administrables que alimentan /precios y el pago | L | Un cambio de precio se ve en /precios y en el pago; las suscripciones vigentes mantienen su precio hasta renovar | PNT-35 |
| REQ-083 | Alta de suscripción en 3 pasos con IGV y comprobante | L | Un pago aprobado crea organización, administrador y suscripción activa | PNT-39 |
| REQ-084 | Pasarelas intercambiables en PEN y USD con confirmación por webhook firmado e idempotente | L | Un evento repetido genera un solo cobro y un solo comprobante | PNT-37 |
| REQ-085 | Cuotas de cápsulas por plan con compra de adicionales | L | Con la cuota agotada, las cápsulas en revisión siguen editables | PNT-36 |
| REQ-086 | Cambio de plan con prorrateo y cancelación al fin del período | L | El prorrateo coincide con el cálculo de referencia al céntimo | PNT-36 |
| REQ-087 | Comprobantes electrónicos (factura, boleta y nota de crédito) por OSE/PSE con estado SUNAT y reenvío | L | Cada cobro aprobado tiene un comprobante aceptado en el ambiente de pruebas | PNT-37 |
| REQ-088 | Cobranza con 3 reintentos, avisos y suspensión a solo lectura | L | Al día 10 sin pago la organización queda en solo lectura y puede exportar lo entregado | PNT-36 |
| REQ-089 | Cupones y convenios con vigencia y límite de usos | L | Un cupón vencido o agotado se rechaza con motivo | PNT-37 |
| REQ-090 | Panel de ingresos: ingreso mensual recurrente, cancelación e ingreso promedio por cliente | L | El ingreso recurrente excluye suscripciones canceladas y suspendidas | PNT-35 |
| REQ-091 | Portal de facturación de cada organización | L | Una organización solo ve sus propios comprobantes | PNT-40 |
| REQ-092 | Landings por sector con portada propia, testimonios del sector, preguntas propias y categoría inicial del blog; listadas en el bloque Sectores y en el pie cuando están publicadas | L | Una landing en borrador no aparece en el inicio ni en el pie y responde 404 | PNT-25, PNT-26 |

## No funcionales

| ID | Requisito | Prioridad | Criterio |
| --- | --- | --- | --- |
| REQ-101 | Las salidas de IA validan contra esquema antes de guardarse | P | 0 documentos inválidos guardados en las pruebas |
| REQ-102 | Respuesta de la interfaz | P | Acciones del editor sin llamada a IA responden en menos de 200 ms percibidos |
| REQ-103 | Trabajos largos asíncronos con progreso visible | P | IA, voz, imágenes y exportación no bloquean la interfaz |
| REQ-104 | Reproductor liviano | M | Reproductor + interacciones del MVP por debajo de 300 KB comprimidos |
| REQ-105 | Accesibilidad de las cápsulas | M | Navegación por teclado, foco visible, texto alternativo, subtítulos; objetivo WCAG 2.2 AA a verificar |
| REQ-106 | Navegadores | P | Últimas versiones de Chrome, Edge, Firefox y Safari; Chrome y Safari en celular |
| REQ-107 | Seguridad de archivos y secretos | P | Ver sección de seguridad de `01-arquitectura.md` |
| REQ-108 | Entorno reproducible | P | `docker compose up` levanta todo el entorno local |
| REQ-109 | Sitio público rápido y encontrable | L | LCP < 2.5 s en celular (4G simulado), Lighthouse SEO ≥ 90 y accesibilidad ≥ 90 en Inicio, Precios y Agendar demo |
| REQ-110 | Pagos sin datos de tarjeta en nuestros servidores | L | Solo se guarda el token y los 4 últimos dígitos que entrega la pasarela; revisión de alcance PCI SAQ A |
