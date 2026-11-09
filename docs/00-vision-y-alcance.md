# Visión y alcance

## Problema

| Situación actual | Consecuencia |
| --- | --- |
| Cada cápsula se diseña a mano: vectores, animación, maquetación | El diseñador tarda y el presupuesto del cliente no alcanza |
| La boca del personaje se anima en video | Paquetes pesados; cambiar una frase o la voz obliga a re-editar |
| El cliente entrega solo temas, documentos extensos o video propio | El diseñador instruccional parte de cero cada vez |
| Se piden versiones en español e inglés | Se duplica casi todo el trabajo |
| Cada cliente usa un LMS distinto | Se prueba a mano en cada plataforma |

## Producto

Herramienta web interna para producir **cápsulas de microaprendizaje** y series de cápsulas con la identidad visual de cada cliente:

- La IA propone estructura, guion, interacciones, preguntas, resúmenes y traducciones; el diseñador instruccional decide.
- Interacciones terminadas y animadas de un catálogo; el diseñador ajusta en lugar de construir.
- Personaje que habla con boca sincronizada, sin video.
- Español e inglés en el mismo curso.
- Entrega como SCORM, HTML o kit de gamificación para el LMS del cliente.

Storyline sigue para cursos de formación largos. Competidores de referencia en este segmento: Genially, H5P.

## Usuarios y roles

| Rol | Qué hace en la herramienta |
| --- | --- |
| Diseñador instruccional | Brief, estimación, estructura, storyboard, aprobaciones, decisión final |
| Diseñador gráfico | Estilos, kit de marca, personajes, piezas, animaciones |
| Productor | Arma pantallas, voz, video interactivo, idiomas, exportación |
| Revisor del cliente | Comenta pantallas y aprueba (fase posterior) |
| Administrador | Usuarios, clientes, claves de proveedores, costos |

## Modalidades de entrega a clientes

| Modalidad | Frecuencia | Qué entregamos |
| --- | --- | --- |
| Paquete SCORM que el cliente sube a su LMS | La más común | ZIP SCORM 1.2 (o 2004 cuando se implemente) + informe del material |
| HTML para presentar a alumnos | Ocasional | Carpeta HTML autocontenida que abre sin LMS ni conexión |
| Gamificación en la plataforma del cliente | Ocasional | Paquetes + kit de gamificación (insignias con la marca, reglas de finalización y guía de configuración por LMS) |

LMS de los clientes: Moodle 4.5 o superior, Blackboard, Chamilo y Canvas.

## Alcance del prototipo (esta etapa)

Incluido: nuevo proyecto sin datos obligatorios y calculadora opcional, kit de marca, entrada de material (temas, documento con resumen, video), estructura y storyboard con IA, editor de cápsula con 3 interacciones (memoria, clasificar, quiz con tiempo), piezas gráficas (biblioteca, por prompt, SVG con capas), personaje con voz y boca sincronizada, video con preguntas, español/inglés con subtítulos, vista previa celular/escritorio y **descarga del JSON**.

Excluido: SCORM y pruebas en LMS (fase D), usuarios y permisos completos, multi-tenant, versionado, revisión del cliente, reporte de entrega, facturación.

## Alcance del MVP (después del prototipo)

Prototipo + 8 interacciones, exportación SCORM 1.2 y HTML, perfiles de LMS, validador de peso y faltantes, reporte del material, biblioteca reutilizable por referencia, roles básicos, versionado simple.

## Métricas de éxito

| Métrica | Cómo se mide |
| --- | --- |
| Horas de producción por cápsula y por minuto de cápsula | Comparar un caso real producido con la herramienta contra su registro original |
| Horas por serie de cápsulas | Mismo cliente y kit, 5 o más cápsulas |
| Costo de IA por cápsula | Registro de la capa de proveedores |
| Retrabajo | Número de cambios pedidos por el cliente después de aprobar el storyboard |
| Calidad percibida | Valoración de 2–3 clientes sobre el prototipo |
