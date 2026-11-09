# -*- coding: utf-8 -*-
"""Fuente única de la fase comercial (E15–E17, S11–S14).
Genera: filas de Jira (con y sin subtareas), secciones de docs/16, docs/18 y docs/03."""
import csv, io, re, sys

ROOT = sys.argv[1]

SPRINTS = {
    "S11": ("Superadmin y sitio comercial", "El superadmin publica el sitio comercial desde el panel y decide qué se muestra y qué se oculta.",
            ["Entrar como superadmin y ver el grupo «Sitio web»; entrar como administrador de organización y no verlo",
             "Ocultar un testimonio y un bloque; publicar y comprobar que no aparecen; volver a mostrarlos",
             "Intentar publicar en producción con datos ficticios visibles y ver el bloqueo con la lista",
             "Programar una página y ver que se publica a la hora indicada",
             "Revisar Lighthouse del inicio en celular",
             "Crear una landing de sector, asignarle testimonios y publicarla; verla en el bloque Sectores del inicio"]),
    "S12": ("SEO, blog y captación", "El sitio capta leads por cuatro vías y los entrega al CRM, y se puede encontrar en buscadores y asistentes de IA.",
            ["Publicar un artículo en WordPress, verlo en la sección Blog tras la sincronización y filtrarlo por categoría",
             "Probar el popup de salida y ver el lead con origen «Popup»",
             "Agendar una demo desde el chatbot y desde /agendar-demo; ver ambas citas y leads",
             "Forzar un error del CRM y ver el reintento y el estado",
             "Rechazar cookies y comprobar que no se carga GA4"]),
    "S13": ("Organizaciones, planes y suscripciones", "Una productora puede suscribirse sola desde /precios y usar Aptio SCORM con su cuota de cápsulas.",
            ["Cambiar el precio de un plan y verlo en /precios y en el pago",
             "Suscribirse con tarjeta de prueba y entrar a una organización nueva y vacía",
             "Consumir la cuota de cápsulas y comprar una adicional",
             "Cambiar de plan y revisar el prorrateo",
             "Comprobar que una organización no ve datos de otra"]),
    "S14": ("Facturación electrónica y cobranza", "Cada cobro emite su comprobante electrónico y los pagos fallidos siguen un proceso claro.",
            ["Pagar y recibir la factura con PDF y XML aceptada en el ambiente de pruebas del OSE",
             "Simular un pago rechazado y ver los 3 reintentos, los avisos y la suspensión",
             "Aplicar un cupón y ver el descuento en el comprobante",
             "Ver el ingreso mensual recurrente y la cancelación del mes",
             "Descargar comprobantes desde el portal de la organización"]),
}

EPICS = [
    ("E15", "Sitio comercial y contenido", "Sitio público multipágina administrable por el superadmin: páginas por bloques, contenido con orden y mostrar/ocultar, menú y pie, blog, SEO, SEO para IA, idiomas y ajustes.", "M16"),
    ("E16", "Captación y CRM", "Popups, chatbot, agendamiento de demos, leads con origen y UTM, integración con CRM, consentimiento de cookies y resumen del sitio.", "M17"),
    ("E17", "Planes, suscripciones y facturación", "Organizaciones (multi-tenant), planes administrables, alta de suscripción, pasarelas, cuotas, comprobantes electrónicos SUNAT, cobranza, cupones y panel de ingresos.", "M18"),
]

# (id, epic, sprint, prioridad, texto, reqs, pnt, [(cp, titulo, dado, cuando, entonces)], subtareas)
H = [
 ("HU-1501","E15","S11","High","Como superadmin, quiero un rol de plataforma separado del administrador de cada organización y un menú «Sitio web», «Captación» y «Ventas» solo para mí, para gestionar el sitio sin dar ese acceso a los clientes.","REQ-064","PNT-24",
  [("CP-109","Acceso del administrador de organización","un usuario con rol Administrador de una organización","pide GET /api/v1/sitio/paginas","recibe 403 y no ve el grupo «Sitio web» en la barra lateral")],["Backend","Frontend","Pruebas"]),
 ("HU-1502","E15","S11","High","Como superadmin, quiero crear páginas con ruta, idioma y estado (borrador, programada, publicada) para publicar el sitio por partes.","REQ-065","PNT-25",
  [("CP-110","Borrador no visible","una página en estado Borrador","un visitante abre su ruta","el sitio responde 404 y la página no aparece en el sitemap"),
   ("CP-111","Publicación programada","una página programada para las 09:00","llega la hora","queda publicada antes de las 09:01 y entra al sitemap")],["Backend","Frontend","Pruebas"]),
 ("HU-1503","E15","S11","High","Como superadmin, quiero armar cada página con bloques que puedo ordenar, mostrar u ocultar, para cambiar el sitio sin programar.","REQ-066","PNT-26",
  [("CP-112","Ocultar un bloque","el bloque Testimonios visible en Inicio","lo oculto y publico","Inicio deja de mostrarlo y el bloque sigue guardado con sus datos"),
   ("CP-113","Reordenar","los bloques Cifras y Logos","muevo Logos arriba de Cifras y publico","el sitio los muestra en ese orden")],["Backend","Frontend","Pruebas"]),
 ("HU-1504","E15","S11","High","Como superadmin, quiero administrar las cifras, testimonios, logos, funcionalidades, pasos, LMS y preguntas frecuentes con orden y mostrar/ocultar, para que todos los datos del sitio salgan del panel.","REQ-066","PNT-27",
  [("CP-114","Testimonio oculto","un testimonio oculto","cualquier página que usa Testimonios se publica","ese testimonio no aparece en ninguna página"),
   ("CP-115","Elemento nuevo","una cifra nueva agregada en Contenido","la guardo","queda oculta por defecto hasta que la active")],["Backend","Frontend","Pruebas"]),
 ("HU-1505","E15","S11","High","Como superadmin, quiero marcar datos como ficticios y que la publicación en producción se bloquee mientras haya alguno visible, para no publicar métricas o testimonios inventados.","REQ-067","PNT-27",
  [("CP-116","Bloqueo por ficticios","2 testimonios ficticios visibles","publico en producción","recibo 409 con la lista de los 2 elementos y un botón «Ocultar todos los ficticios»"),
   ("CP-117","Pruebas permitido","los mismos datos","publico en el entorno de pruebas","se publica y el panel muestra el aviso")],["Backend","Frontend","Pruebas"]),
 ("HU-1506","E15","S11","Medium","Como superadmin, quiero el menú principal y el pie de página con enlaces que puedo ordenar, mostrar u ocultar, para controlar la navegación del sitio.","REQ-066","PNT-25",
  [("CP-118","Enlace oculto","el enlace «Casos» oculto","se publica","no aparece en la cabecera ni en el menú de celular")],["Backend","Frontend"]),
 ("HU-1507","E15","S11","High","Como superadmin, quiero vista previa en escritorio y celular con los cambios sin publicar, publicación con versiones y restauración, para revisar antes de que lo vea un cliente.","REQ-068","PNT-26",
  [("CP-119","Restaurar versión","3 publicaciones de Inicio","restauro la versión 1","el sitio queda igual a la versión 1 y se crea la versión 4")],["Backend","Frontend","Pruebas"]),
 ("HU-1508","E15","S11","High","Como visitante, quiero que el sitio cargue rápido en el celular y sea accesible, para no abandonar antes de ver la propuesta.","REQ-109","PNT-39",
  [("CP-120","Rendimiento","el inicio publicado","lo mido con Lighthouse en celular","LCP < 2.5 s, SEO ≥ 90 y accesibilidad ≥ 90")],["Infra","Frontend","Pruebas"]),
 ("HU-1509","E15","S11","Medium","Como superadmin, quiero ajustar dominio con SSL, marca, analítica, WhatsApp, correo de leads y modo mantenimiento, para operar el sitio sin ayuda técnica.","REQ-073","PNT-38",
  [("CP-121","Mantenimiento","el modo mantenimiento activo","un visitante abre cualquier ruta","ve la página de aviso con código 503 y el superadmin sigue viendo el sitio")],["Backend","Frontend"]),
 ("HU-1510","E15","S12","Medium","Como superadmin, quiero el sitio en español e inglés con selector y hreflang, para atender a clientes de la región.","REQ-069","PNT-25",
  [("CP-122","Página sin traducción","Precios publicada en ES y en borrador en EN","un visitante cambia a EN","va a /en y no a una página EN en borrador; hreflang solo enlaza versiones publicadas")],["Backend","Frontend"]),
 ("HU-1511","E15","S12","Medium","Como visitante, quiero ver al final de cada página una sección con los artículos publicados en el WordPress de la empresa y filtrarlos por categoría, y como superadmin, quiero elegir qué categorías y artículos se muestran, para que el contenido se escriba solo en WordPress.","REQ-070","PNT-28",
  [("CP-123","Filtro por categoría","7 artículos visibles, 2 de la categoría Guías","el visitante elige Guías en la sección Blog","ve solo esos 2 y cada filtro muestra su número de artículos"),
   ("CP-154","Sincronización","un artículo recién publicado en WordPress","pasa la siguiente sincronización (15 min como máximo)","aparece en la sección Blog; los borradores y artículos privados nunca aparecen"),
   ("CP-155","Categoría oculta","la categoría Noticias internas oculta en el panel","un visitante abre cualquier página con la sección Blog","no ve ese filtro ni sus artículos, tampoco en «Últimos artículos» del pie"),
   ("CP-156","WordPress sin responder","WordPress caído","un visitante abre una página con la sección Blog","ve la última copia sincronizada y el panel muestra el error de conexión")],["Backend","Frontend","Pruebas"]),
 ("HU-1514","E15","S11","High","Como superadmin, quiero crear landings por sector (minería, banca, retail, educación, sector público…) con su propia portada, testimonios del sector, preguntas y categoría inicial del blog, para hablarle a cada mercado con su lenguaje.","REQ-092","PNT-25, PNT-26",
  [("CP-157","Testimonios del sector","la landing de Minería y energía y 2 testimonios marcados con ese sector","un visitante la abre","ve solo esos 2 testimonios; si el sector no tuviera testimonios, vería todos los visibles"),
   ("CP-158","Landing en borrador","la landing de Sector público en borrador","un visitante abre el inicio","no aparece en el bloque «Sectores» ni en la columna «Sectores» del pie, y su ruta responde 404"),
   ("CP-159","Categoría inicial del blog","la landing de Banca y seguros con categoría inicial Estándares","un visitante la abre","la sección Blog aparece filtrada por Estándares y puede cambiar a «Todas»")],["Backend","Frontend","Pruebas"]),
 ("HU-1512","E15","S12","High","Como superadmin, quiero editar meta título, descripción, URL, canonical, indexación y datos estructurados por página, y gestionar sitemap, robots y redirecciones 301, para posicionar el sitio.","REQ-071","PNT-29",
  [("CP-124","Redirección","la redirección /planes → /precios activa","un visitante abre /planes","recibe 301 a /precios"),
   ("CP-125","No indexar","una página con «Indexar» apagado","se publica","lleva meta robots noindex y no entra al sitemap")],["Backend","Frontend","Pruebas"]),
 ("HU-1513","E15","S12","Medium","Como superadmin, quiero editar llms.txt, seguir preguntas objetivo por asistente de IA, permitir o bloquear rastreadores de IA y recibir propuestas de contenido, para que los asistentes citen el sitio.","REQ-072","PNT-30",
  [("CP-126","Rastreador bloqueado","GPTBot bloqueado","se publica","robots.txt incluye Disallow para GPTBot"),
   ("CP-127","Propuesta revisable","las preguntas objetivo cargadas","pido propuestas a la IA","llegan como borradores de página y nada se publica sin aprobación")],["Backend","Frontend","IA"]),
 ("HU-1601","E16","S12","High","Como superadmin, quiero que cada lead guarde origen, página de entrada y UTM, venga de un formulario, popup, chatbot, agendador o suscripción, para saber qué canal funciona.","REQ-074","PNT-34",
  [("CP-128","Origen y UTM","un visitante que llegó con utm_source=linkedin","deja su correo en el popup","tiene origen Popup, la página de entrada y utm linkedin")],["Backend","Frontend","Pruebas"]),
 ("HU-1602","E16","S12","High","Como superadmin, quiero enviar los leads a HubSpot, Pipedrive, Zoho o a un webhook firmado, con mapeo de campos y reintentos, para que ventas trabaje en su CRM.","REQ-075","PNT-34",
  [("CP-129","Reintento","el CRM caído (responde 500)","se envía un lead","se reintenta 3 veces con espera creciente y queda «Error» con el motivo si no entra"),
   ("CP-130","Webhook firmado","un webhook configurado","se envía un lead","la petición lleva firma HMAC verificable con la clave del panel")],["Backend","Frontend","Pruebas"]),
 ("HU-1603","E16","S12","Medium","Como superadmin, quiero crear popups (modal, deslizable o barra) con disparador, páginas, frecuencia y resultado, para captar contactos sin molestar.","REQ-076","PNT-31",
  [("CP-131","Frecuencia","un popup de salida ya mostrado a un visitante","vuelve en menos de 7 días","no se le muestra otra vez"),
   ("CP-132","Popup inactivo","un popup apagado","un visitante cumple su disparador","no se muestra")],["Backend","Frontend"]),
 ("HU-1604","E16","S12","Medium","Como visitante, quiero un chat que responda con la información del sitio, me ofrezca agendar una demo y me pase a una persona, para resolver dudas sin esperar.","REQ-077","PNT-32",
  [("CP-133","Fuera de la base","una pregunta que no está en la base de conocimiento","el visitante la hace","el chat no inventa: ofrece agendar o pasar a una persona"),
   ("CP-134","Agendar en el chat","un horario elegido en el chat","el visitante confirma con su correo","la cita aparece en Agendamiento y el lead tiene origen Chatbot")],["Backend","Frontend","IA","Pruebas"]),
 ("HU-1605","E16","S12","High","Como visitante, quiero agendar una demo eligiendo día y hora en horario de Lima y recibir la invitación y recordatorios, para no coordinar por correo.","REQ-078","PNT-33",
  [("CP-135","Horario ocupado","una franja ya tomada en el calendario del asesor","otro visitante abre el agendador","esa franja no aparece"),
   ("CP-136","Invitación","una demo confirmada","termina el agendamiento","el visitante recibe invitación con enlace de videollamada y recordatorios a las 24 h y 1 h")],["Backend","Frontend","Pruebas"]),
 ("HU-1606","E16","S12","High","Como visitante, quiero aceptar o rechazar cookies por categoría, y como responsable, quiero que las etiquetas de analítica solo se carguen con consentimiento, para cumplir la Ley 29733.","REQ-079","PNT-39",
  [("CP-137","Rechazo","un visitante que rechazó las cookies de analítica","navega el sitio","no se carga GA4, Tag Manager ni Meta Pixel")],["Frontend","Pruebas"]),
 ("HU-1607","E16","S12","Medium","Como superadmin, quiero un resumen con visitas, leads, demos, suscripciones nuevas y origen de los leads, para decidir dónde invertir.","REQ-080","PNT-24",
  [("CP-138","Cifras consistentes","10 leads del período en la tabla de leads","abro el Resumen","el indicador Leads muestra 10 y el reparto por origen suma 100 %")],["Backend","Frontend"]),
 ("HU-1701","E17","S13","High","Como responsable de la plataforma, quiero organizaciones aisladas entre sí, cada una con sus usuarios, clientes, kits y proyectos, para vender Aptio SCORM a otras productoras.","REQ-081","—",
  [("CP-139","Aislamiento","dos organizaciones con proyectos","un usuario de la primera pide un proyecto de la segunda por su id","recibe 404 y queda registrado en auditoría"),
   ("CP-140","Migración","los datos actuales de AulasEducativas","se aplica la migración","quedan en la organización «AulasEducativas» sin pérdida")],["Backend","Infra","Pruebas"]),
 ("HU-1702","E17","S13","High","Como superadmin, quiero administrar los planes (precio mensual y anual, cuota de cápsulas, usuarios, cápsula adicional, características visibles y plan destacado), para cambiar la oferta sin programar.","REQ-082","PNT-35",
  [("CP-141","Precio en el sitio","el plan Productora con precio nuevo de S/ 1,390","publico el cambio","/precios y el resumen del pago muestran S/ 1,390; las suscripciones vigentes mantienen su precio hasta renovar"),
   ("CP-142","Plan oculto","el plan Inicial oculto","un visitante abre /precios","no lo ve y no puede comprarlo por URL")],["Backend","Frontend","Pruebas"]),
 ("HU-1703","E17","S13","High","Como visitante, quiero suscribirme desde /precios en tres pasos (empresa, resumen con IGV, pago) y entrar a mi organización nueva, para empezar sin hablar con ventas.","REQ-083","PNT-39",
  [("CP-143","Alta completa","un pago aprobado","termina el paso 3","se crea la organización, el usuario administrador y la suscripción activa, y llega el correo de bienvenida")],["Backend","Frontend","Pruebas"]),
 ("HU-1704","E17","S13","High","Como responsable de la plataforma, quiero cobrar con pasarelas intercambiables en soles y dólares, confirmando el pago solo por webhook firmado e idempotente y sin guardar datos de tarjeta, para cobrar con seguridad.","REQ-084, REQ-110","PNT-37",
  [("CP-144","Webhook repetido","un mismo evento de pago enviado dos veces por la pasarela","se procesan","se registra un solo cobro y un solo comprobante"),
   ("CP-145","Firma inválida","un webhook con firma incorrecta","llega","se rechaza con 401 y no cambia ninguna suscripción")],["Backend","Infra","Pruebas"]),
 ("HU-1705","E17","S13","High","Como organización, quiero ver mi cuota de cápsulas del mes y comprar adicionales, sin que se bloquee una cápsula que ya está en revisión, para no frenar entregas.","REQ-085","PNT-36",
  [("CP-146","Cuota agotada","20 de 20 cápsulas usadas","intento crear una cápsula nueva","se ofrece comprar una adicional o subir de plan; las cápsulas en revisión siguen editables")],["Backend","Frontend","Pruebas"]),
 ("HU-1706","E17","S13","Medium","Como organización, quiero cambiar de plan con prorrateo y cancelar al fin del período, para ajustar el gasto.","REQ-086","PNT-36",
  [("CP-147","Prorrateo","un cambio de Inicial a Productora a mitad del mes","se confirma","se cobra la diferencia proporcional y la cuota nueva rige de inmediato")],["Backend","Frontend"]),
 ("HU-1707","E17","S14","High","Como responsable de facturación, quiero que cada cobro emita su factura o boleta electrónica (y notas de crédito) por un OSE/PSE, con estado SUNAT, PDF, XML y reenvío, para cumplir con SUNAT sin trabajo manual.","REQ-087","PNT-37",
  [("CP-148","Factura con RUC","un cobro aprobado a una organización con RUC","se emite","sale una factura de la serie F001 aceptada en el ambiente de pruebas, con PDF y XML enviados al correo de facturación"),
   ("CP-149","Rechazo del OSE","un comprobante observado por el OSE","llega la respuesta","queda «Observado» con el motivo y se puede corregir y reenviar")],["Backend","Frontend","Pruebas","Documentación"]),
 ("HU-1708","E17","S14","High","Como responsable de la plataforma, quiero reintentos de cobro, avisos y suspensión a solo lectura cuando un pago falla, para recuperar ingresos sin cortar el trabajo de golpe.","REQ-088","PNT-36",
  [("CP-150","Suspensión","3 reintentos fallidos","pasa el día 10","la organización queda en solo lectura, puede exportar lo entregado y ve cómo regularizar")],["Backend","Frontend","Pruebas"]),
 ("HU-1709","E17","S14","Low","Como superadmin, quiero crear cupones y convenios con vigencia y límite de usos, para campañas y alianzas con universidades.","REQ-089","PNT-37",
  [("CP-151","Cupón vencido","un cupón vencido","se aplica en el pago","se rechaza con el motivo y el total no cambia")],["Backend","Frontend"]),
 ("HU-1710","E17","S14","Medium","Como gerente, quiero ver el ingreso mensual recurrente, la cancelación y el ingreso promedio por cliente, para seguir el negocio.","REQ-090","PNT-35",
  [("CP-152","Ingreso recurrente","suscripciones activas por S/ 13,834 al mes","abro Planes","el indicador muestra S/ 13,834 y excluye las canceladas y suspendidas")],["Backend","Frontend"]),
 ("HU-1711","E17","S14","Medium","Como administrador de una organización, quiero ver mi plan, consumo, comprobantes y medio de pago, y actualizar mis datos de facturación, para no escribir a soporte.","REQ-091","PNT-40",
  [("CP-153","Descarga de comprobantes","3 comprobantes emitidos","abro Facturación en mi organización","descargo PDF y XML de cada uno y no veo los de otras organizaciones")],["Frontend","Backend"]),
]

REQS = [
 ("REQ-064","Rol superadmin de plataforma, separado del administrador de cada organización; solo él ve los grupos Sitio web, Captación y Ventas","L","Un administrador de organización recibe 403 en /api/v1/sitio/*","PNT-24"),
 ("REQ-065","Páginas del sitio con estados Borrador, Programada y Publicada","L","Una página en borrador responde 404; una programada se publica a la hora indicada con 1 min de tolerancia","PNT-25"),
 ("REQ-066","Todo el contenido del sitio tiene orden y mostrar/ocultar: bloques, cifras, testimonios, logos, funcionalidades, pasos, LMS, preguntas, planes y características, menú, pie, popups, respuestas del chatbot, pasarelas y cupones. Ocultar no borra","L","Ocultar un elemento lo quita del sitio en la siguiente publicación sin borrar el registro; mostrarlo lo restituye igual","PNT-25, PNT-26, PNT-27"),
 ("REQ-067","Datos marcados como ficticios bloquean la publicación en producción mientras estén visibles","L","Publicar en producción con 1 dato ficticio visible devuelve 409 con la lista","PNT-27"),
 ("REQ-068","Vista previa en escritorio y celular, publicación con versiones y restauración","L","Restaurar la versión N deja el sitio igual a N y crea una versión nueva","PNT-26"),
 ("REQ-069","Sitio en español e inglés con selector y hreflang","L","hreflang solo enlaza versiones publicadas","PNT-25"),
 ("REQ-070","Sección Blog al final de las páginas, alimentada por WordPress (API REST): solo artículos publicados, con filtro por categoría; el panel elige categorías y artículos visibles","L","Un artículo publicado en WordPress aparece en la sección en 15 min como máximo; un borrador nunca aparece","PNT-28"),
 ("REQ-071","SEO técnico por página y del sitio: metadatos, canonical, indexación, datos estructurados, sitemap, robots y redirecciones 301","L","Una página con «Indexar» apagado lleva noindex y no entra al sitemap","PNT-26, PNT-29"),
 ("REQ-072","SEO para IA: llms.txt, preguntas objetivo por asistente, control de rastreadores de IA y propuestas revisables","L","Bloquear un rastreador lo agrega a robots.txt; las propuestas de IA llegan como borrador","PNT-30"),
 ("REQ-073","Ajustes del sitio: dominio con SSL, marca, analítica, WhatsApp, correo de leads y modo mantenimiento","L","Con mantenimiento activo, los visitantes reciben 503 con página de aviso","PNT-38"),
 ("REQ-074","Leads con origen, página de entrada y UTM desde todas las vías de captación","L","El 100 % de los leads tiene origen y página de entrada","PNT-34"),
 ("REQ-075","Envío de leads a CRM (HubSpot, Pipedrive, Zoho o webhook firmado) con mapeo de campos y reintentos","L","Con el CRM caído, el lead se reintenta 3 veces y queda con el error visible","PNT-34"),
 ("REQ-076","Popups modal, deslizable y barra con disparador, páginas, frecuencia y resultado","L","Un popup no se repite al mismo visitante antes de 7 días","PNT-31"),
 ("REQ-077","Chatbot que responde solo con la base de conocimiento aprobada, agenda demos y pasa a una persona","L","Ante una pregunta fuera de la base, no inventa y ofrece agendar o una persona","PNT-32"),
 ("REQ-078","Agendamiento de demos en hora de Lima con calendario, videollamada y recordatorios","L","Una franja ocupada en el calendario del asesor no se ofrece","PNT-33"),
 ("REQ-079","Consentimiento de cookies por categoría (Ley 29733); analítica solo con consentimiento","L","Al rechazar, no se carga ninguna etiqueta de analítica ni publicidad","PNT-39"),
 ("REQ-080","Resumen del sitio con visitas, leads, demos, suscripciones y origen","L","Los indicadores coinciden con las tablas de leads, citas y suscripciones","PNT-24"),
 ("REQ-081","Organizaciones (multi-tenant) con datos aislados","L","Un usuario no accede a datos de otra organización (404) y el intento queda auditado","—"),
 ("REQ-082","Planes administrables que alimentan /precios y el pago","L","Un cambio de precio se ve en /precios y en el pago; las suscripciones vigentes mantienen su precio hasta renovar","PNT-35"),
 ("REQ-083","Alta de suscripción en 3 pasos con IGV y comprobante","L","Un pago aprobado crea organización, administrador y suscripción activa","PNT-39"),
 ("REQ-084","Pasarelas intercambiables en PEN y USD con confirmación por webhook firmado e idempotente","L","Un evento repetido genera un solo cobro y un solo comprobante","PNT-37"),
 ("REQ-085","Cuotas de cápsulas por plan con compra de adicionales","L","Con la cuota agotada, las cápsulas en revisión siguen editables","PNT-36"),
 ("REQ-086","Cambio de plan con prorrateo y cancelación al fin del período","L","El prorrateo coincide con el cálculo de referencia al céntimo","PNT-36"),
 ("REQ-087","Comprobantes electrónicos (factura, boleta y nota de crédito) por OSE/PSE con estado SUNAT y reenvío","L","Cada cobro aprobado tiene un comprobante aceptado en el ambiente de pruebas","PNT-37"),
 ("REQ-088","Cobranza con 3 reintentos, avisos y suspensión a solo lectura","L","Al día 10 sin pago la organización queda en solo lectura y puede exportar lo entregado","PNT-36"),
 ("REQ-089","Cupones y convenios con vigencia y límite de usos","L","Un cupón vencido o agotado se rechaza con motivo","PNT-37"),
 ("REQ-090","Panel de ingresos: ingreso mensual recurrente, cancelación e ingreso promedio por cliente","L","El ingreso recurrente excluye suscripciones canceladas y suspendidas","PNT-35"),
 ("REQ-091","Portal de facturación de cada organización","L","Una organización solo ve sus propios comprobantes","PNT-40"),
 ("REQ-092","Landings por sector con portada propia, testimonios del sector, preguntas propias y categoría inicial del blog; listadas en el bloque Sectores y en el pie cuando están publicadas","L","Una landing en borrador no aparece en el inicio ni en el pie y responde 404","PNT-25, PNT-26"),
]
REQS_NF = [
 ("REQ-109","Sitio público rápido y encontrable","L","LCP < 2.5 s en celular (4G simulado), Lighthouse SEO ≥ 90 y accesibilidad ≥ 90 en Inicio, Precios y Agendar demo"),
 ("REQ-110","Pagos sin datos de tarjeta en nuestros servidores","L","Solo se guarda el token y los 4 últimos dígitos que entrega la pasarela; revisión de alcance PCI SAQ A"),
]

PRIO_ES = {"High": "Alta", "Medium": "Media", "Low": "Baja"}
SUB_ORDER = ["Infra", "Backend", "Frontend", "IA", "Pruebas", "Documentación"]
SUB_CODE = {"Infra": "INF", "Backend": "BAC", "Frontend": "FRO", "IA": "IA", "Pruebas": "PRU", "Documentación": "DOC"}

def short(h):
    t = h[4]
    m = re.search(r"quiero (.*?)(,| para)", t)
    return None

TITLES = {
 "HU-1501":"Rol superadmin y menú del sitio","HU-1502":"Páginas con estados y programación","HU-1503":"Editor de página por bloques",
 "HU-1504":"Contenido administrable con mostrar/ocultar","HU-1505":"Datos ficticios y bloqueo de publicación","HU-1506":"Menú y pie administrables",
 "HU-1507":"Vista previa, versiones y restauración","HU-1508":"Sitio público rápido y accesible","HU-1509":"Ajustes del sitio",
 "HU-1510":"Sitio en español e inglés","HU-1511":"Sección Blog desde WordPress con filtro por categoría","HU-1514":"Landings por sector","HU-1512":"SEO técnico","HU-1513":"SEO para IA",
 "HU-1601":"Leads con origen y UTM","HU-1602":"Integración con CRM","HU-1603":"Popups","HU-1604":"Chatbot del sitio",
 "HU-1605":"Agendamiento de demos","HU-1606":"Consentimiento de cookies","HU-1607":"Resumen del sitio",
 "HU-1701":"Organizaciones (multi-tenant)","HU-1702":"Planes administrables","HU-1703":"Alta de suscripción desde /precios",
 "HU-1704":"Pasarelas de pago y webhooks","HU-1705":"Cuotas de cápsulas","HU-1706":"Cambio de plan y cancelación",
 "HU-1707":"Comprobantes electrónicos SUNAT","HU-1708":"Cobranza y suspensión","HU-1709":"Cupones y convenios",
 "HU-1710":"Panel de ingresos","HU-1711":"Portal de facturación de la organización",
}
MOD = {"E15": "M16", "E16": "M17", "E17": "M18"}

def desc(h):
    hid, ep, sp, pr, txt, reqs, pnt, cps, subs = h
    out = [txt, "", f"Requisitos: {reqs}", f"Módulo: {MOD[ep]}", f"Pantalla: {pnt}", f"Sprint sugerido: {sp} · {SPRINTS[sp][0]}", "", "Criterios de aceptación:"]
    for cp, ti, d, c, e in cps:
        out += [f"{cp} · {ti}", f"  Dado {d}", f"  Cuando {c}", f"  Entonces {e}"]
    out += ["", "Referencias: docs/23-sitio-comercial-y-facturacion.md, docs/16-historias-y-pruebas.md, prototipo docs/diseno/sitio-comercial.html"]
    return "\n".join(out)

def rows(with_subs):
    R = []
    for e, n, d, m in EPICS:
        R.append([e, "", "Epic", f"{e} · {n}", f"{d}\n\nMódulos: {m}\nFase comercial (ADR-011, ADR-012)", "High", "fabrica-capsulas", e.lower(), "fase-comercial", f"{e} · {n}", "", "", "", "", ""])
    stories = []
    for h in H:
        hid, ep, sp, pr = h[0], h[1], h[2], h[3]
        stories.append([hid, ep, "Story", f"{hid} · {TITLES[hid]}", desc(h), pr, "fabrica-capsulas", ep.lower(), f"sprint-{sp.lower()}", "", "", "", "", "", ""])
        if with_subs:
            for s in sorted(h[8], key=SUB_ORDER.index):
                stories.append([f"{hid}-{SUB_CODE[s]}", hid, "Sub-task", f"{hid} · {s}", f"{s} de la historia {hid}: {TITLES[hid]}.", pr, "fabrica-capsulas", ep.lower(), f"sprint-{sp.lower()}", "", "", "", "", "", ""])
    return R, stories

def write_csv(path, with_subs):
    raw = open(path, "rb").read().decode("utf-8-sig")
    rdr = list(csv.reader(io.StringIO(raw)))
    header, body = rdr[0][:10], [r[:10] for r in rdr[1:]]
    # quitar filas previas de la fase comercial si se vuelve a ejecutar
    body = [r for r in body if not re.match(r"^(E1[5-7]|HU-1[5-7]\d\d)", r[0])]
    epics, stories = rows(with_subs)
    last_epic = max(i for i, r in enumerate(body) if r[2] == "Epic")
    epics = [r[:10] for r in epics]; stories = [r[:10] for r in stories]
    body = body[:last_epic + 1] + epics + body[last_epic + 1:] + stories
    buf = io.StringIO()
    w = csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    w.writerow(header)
    w.writerows(body)
    open(path, "wb").write(("\ufeff" + buf.getvalue()).encode("utf-8"))
    types = [r[2] for r in body]
    return types.count("Epic"), types.count("Story"), types.count("Sub-task")

def md16():
    out = []
    for e, n, d, m in EPICS:
        hs = [h for h in H if h[1] == e]
        out += [f"## {e} · {n}", "", d, "", "| ID | Historia | Sprint | Prioridad | Requisitos |", "| --- | --- | --- | --- | --- |"]
        out += [f"| {h[0]} | {h[4]} | {h[2]} | {PRIO_ES[h[3]]} | {h[5]} |" for h in hs]
        out.append("")
        for h in hs:
            out += [f"### {h[0]} · {TITLES[h[0]]}", "", h[4], ""]
            for cp, ti, d_, c, en in h[7]:
                out += [f"**{cp} · {ti}**", "", "```gherkin", f"Dado {d_}", f"Cuando {c}", f"Entonces {en}", "```", ""]
            out += [f"Subtareas sugeridas: {', '.join(sorted(h[8], key=SUB_ORDER.index))}.", ""]
    return "\n".join(out)

def trace16():
    m = {}
    for h in H:
        for r in [x.strip() for x in h[5].split(",")]:
            m.setdefault(r, []).append(h[0])
    return "\n".join(f"| {r} | {', '.join(v)} |" for r, v in sorted(m.items()))

def md18():
    out = []
    for sp, (name, obj, demo) in SPRINTS.items():
        hs = [h for h in H if h[2] == sp]
        out += [f"## {sp} · {name}", "", f"**Objetivo:** {obj}", "", "| ID | Historia | Épica | Prioridad | Estado |", "| --- | --- | --- | --- | --- |"]
        out += [f"| {h[0]} | {TITLES[h[0]]} | {h[1]} | {PRIO_ES[h[3]]} | ____ |" for h in hs]
        out += ["", "**Demo para probar** (la hace el responsable del producto):", ""] + [f"- [ ] {d}" for d in demo]
        out += ["", "| Resultado (aprobado / con observaciones) | Observaciones del usuario | Enlace a Jira |", "| --- | --- | --- |", "| ____ | ____ | ____ |", ""]
    return "\n".join(out)

def table18():
    return "\n".join(f"| {sp} | {v[0]} | {sum(1 for h in H if h[2]==sp)} |" for sp, v in SPRINTS.items())

if __name__ == "__main__":
    import json
    a = write_csv(f"{ROOT}/jira/jira-import.csv", True)
    b = write_csv(f"{ROOT}/jira/jira-import-sin-subtareas.csv", False)
    print("con subtareas", a, "sin subtareas", b)
    open("/tmp/a/md16.md", "w").write(md16())
    open("/tmp/a/trace16.md", "w").write(trace16())
    open("/tmp/a/md18.md", "w").write(md18())
    open("/tmp/a/table18.md", "w").write(table18())
    open("/tmp/a/req.md", "w").write("\n".join(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} |" for r in REQS))
    open("/tmp/a/reqnf.md", "w").write("\n".join(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} |" for r in REQS_NF))
    print(json.dumps({"historias": len(H), "cp": sum(len(h[7]) for h in H), "subtareas": sum(len(h[8]) for h in H)}))
