# API

Especificación completa: `docs/api/openapi.yaml` (OpenAPI 3.0.3, validada con Redocly CLI). Se puede abrir en Swagger UI, Redoc o importar en Postman e Insomnia.

## Convenciones

- Prefijo `/api/v1`. JSON en UTF-8. Fechas en ISO 8601 (UTC).
- Sesión por cookie httpOnly. Permisos por rol, aplicados en la API, no en la interfaz.
- **Tareas largas:** responden `202` con `{ id, estado, eventos }`. El avance llega por SSE (`text/event-stream`) o consultando el recurso.
- **Bloqueo optimista:** el curso tiene `version`; las escrituras envían `If-Match`. Si alguien guardó antes, la API responde `409`.
- **Errores:** `{ codigo, mensaje, detalles[] }`. `422` incluye los errores del esquema del curso con su ruta.
- **IA:** ninguna ruta aplica salidas de IA directamente. Todo pasa por `Propuesta` → `aplicar` (REQ-038).
- **Archivos:** subida directa a S3 con URL firmada, luego confirmación. Descargas con URL firmada temporal.
- **Claves de proveedores:** solo en variables de entorno del servidor; ningún endpoint las devuelve.

## Endpoints


### Acceso

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `POST` | `/auth/ingresar` | Iniciar sesión | Cookie httpOnly; 5 intentos fallidos bloquean 15 min |
| `POST` | `/auth/salir` | Cerrar sesión |  |
| `GET` | `/auth/google` | Ingresar con Google | Redirige a Google (OpenID Connect con PKCE). Solo ingresan correos ya invitados por un administrador; no crea cuentas nuevas. |
| `GET` | `/auth/google/callback` | Retorno de Google | Valida state y nonce, exige email_verified y vincula la cuenta por correo; crea la cookie de sesión y redirige a la web. |
| `POST` | `/auth/clave/olvido` | Pedir cambio de clave | Envía un enlace de un solo uso por correo (vence en 60 min). Límite: 3 pedidos por hora. |
| `POST` | `/auth/clave/restablecer` | Restablecer clave | Invalida el token y cierra las otras sesiones del usuario. |
| `GET` | `/yo` | Usuario actual |  |
| `GET` | `/usuarios` | Listar usuarios | Solo ADMINISTRADOR |
| `POST` | `/usuarios` | Crear usuario | Solo ADMINISTRADOR |
| `PATCH` | `/usuarios/{usuarioId}` | Cambiar rol o desactivar | Solo ADMINISTRADOR |

### Clientes y kits

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `GET` | `/clientes` | Listar clientes |  |
| `POST` | `/clientes` | Crear cliente |  |
| `GET` | `/clientes/{clienteId}` | Ver cliente |  |
| `PATCH` | `/clientes/{clienteId}` | Editar cliente |  |
| `GET` | `/clientes/{clienteId}/kit` | Ver kit de marca | Incluye contraste calculado |
| `PUT` | `/clientes/{clienteId}/kit` | Guardar kit de marca | 409 si la versión cambió; las miniaturas se regeneran en segundo plano |
| `POST` | `/clientes/{clienteId}/kit/extraer` | Extraer kit de un curso o logo (IA) | Devuelve una propuesta de kit para revisar |
| `GET` | `/clientes/{clienteId}/kit/pantallas-modelo` | Listar pantallas modelo |  |
| `POST` | `/clientes/{clienteId}/kit/pantallas-modelo` | Agregar pantalla modelo | Rol DISENADOR_GRAFICO o ADMINISTRADOR |
| `PUT` | `/clientes/{clienteId}/kit/pantallas-modelo/{modeloId}` | Editar pantalla modelo |  |
| `DELETE` | `/clientes/{clienteId}/kit/pantallas-modelo/{modeloId}` | Desactivar pantalla modelo | Borrado lógico (activa = false) |
| `GET` | `/clientes/{clienteId}/glosario` | Ver glosario |  |
| `PUT` | `/clientes/{clienteId}/glosario` | Reemplazar glosario | Marca traducciones afectadas como PENDIENTE |
| `GET` | `/clientes/{clienteId}/pronunciacion` | Ver diccionario de pronunciación |  |
| `PUT` | `/clientes/{clienteId}/pronunciacion` | Reemplazar diccionario de pronunciación | Marca narraciones afectadas como DESACTUALIZADA |
| `GET` | `/clientes/{clienteId}/fichas-lms` | Ver fichas de compatibilidad LMS |  |
| `POST` | `/clientes/{clienteId}/fichas-lms` | Registrar ficha de compatibilidad | Puede incluir el JSON del modo diagnóstico |

### Proyectos

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `GET` | `/proyectos` | Listar proyectos | El revisor del cliente solo ve los de su cliente |
| `POST` | `/proyectos` | Crear proyecto (Nuevo SCORM) | Datos técnicos opcionales |
| `GET` | `/proyectos/{proyectoId}` | Ver proyecto |  |
| `PATCH` | `/proyectos/{proyectoId}` | Editar proyecto o datos técnicos |  |
| `DELETE` | `/proyectos/{proyectoId}` | Archivar proyecto | Pasa a ARCHIVADO; no borra |

### Recursos

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `POST` | `/recursos/subidas` | Pedir URL de subida firmada | Tipos permitidos por lista; tamaño máximo por tipo configurable |
| `POST` | `/recursos/subidas/{subidaId}/confirmar` | Confirmar subida y crear recurso | Verifica tipo real y hash; sanitiza SVG |
| `GET` | `/recursos` | Buscar recursos |  |
| `GET` | `/recursos/{recursoId}` | Ver recurso con URL firmada |  |
| `POST` | `/recursos/imagenes-ia` | Generar imágenes con el estilo del kit | Las variantes quedan en la biblioteca del cliente con origen GENERADO |

### Proyectos

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `POST` | `/proyectos/{proyectoId}/materiales` | Agregar material o tema | Inicia extracción de texto o transcripción |
| `GET` | `/proyectos/{proyectoId}/materiales` | Listar material |  |
| `PATCH` | `/materiales/{materialId}` | Cambiar decisión del mapa de temas |  |

### Generación

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `POST` | `/proyectos/{proyectoId}/generaciones` | Generar el SCORM | Una generación activa por proyecto (409 si ya hay una) |
| `GET` | `/generaciones/{generacionId}` | Ver avance de la generación |  |
| `POST` | `/generaciones/{generacionId}/cancelar` | Cancelar generación | Conserva lo ya generado |
| `GET` | `/generaciones/{generacionId}/eventos` | Eventos de avance (SSE) | text/event-stream: etapa, pantalla-lista, costo, fin, error |

### Curso

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `GET` | `/proyectos/{proyectoId}/curso` | Ver documento del curso | ETag = versión |
| `PUT` | `/proyectos/{proyectoId}/curso` | Reemplazar documento del curso | Valida contra el esquema; 422 con la lista de errores; 409 si cambió la versión |
| `PATCH` | `/proyectos/{proyectoId}/curso` | Aplicar JSON Patch al curso | Content-Type application/json-patch+json |
| `GET` | `/cursos/{cursoId}/versiones` | Historial de versiones |  |
| `POST` | `/cursos/{cursoId}/versiones/{version}/restaurar` | Restaurar una versión | Crea una versión nueva con motivo «restauración» |
| `PATCH` | `/cursos/{cursoId}/pantallas/{pantallaId}` | Guardar cambios del editor en una pantalla | Dispara regeneración en cascada solo de lo afectado |
| `POST` | `/cursos/{cursoId}/pantallas/{pantallaId}/aprobar` | Aprobar una pantalla | Una pantalla aprobada no cambia por IA sin nueva aprobación |
| `POST` | `/cursos/{cursoId}/pantallas/aprobar` | Aprobar varias pantallas | soloSinObservaciones = aprobar las que no tienen observaciones abiertas |

### Asistente IA

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `POST` | `/cursos/{cursoId}/propuestas` | Pedir una propuesta a la IA | Más visual, menos texto, actividad, variantes, ilustración, pedido libre, alineación, patrón, pausas de video |
| `GET` | `/cursos/{cursoId}/propuestas` | Listar propuestas |  |
| `POST` | `/propuestas/{propuestaId}/aplicar` | Aplicar propuesta | 409 si quedó VENCIDA; se puede deshacer restaurando la versión anterior |
| `POST` | `/propuestas/{propuestaId}/descartar` | Descartar propuesta |  |

### Revisión

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `GET` | `/cursos/{cursoId}/observaciones` | Listar observaciones |  |
| `POST` | `/cursos/{cursoId}/control-calidad` | Ejecutar control de calidad | Reglas + IA: alineación, accesibilidad, ortografía, longitud por idioma, faltantes |
| `PATCH` | `/observaciones/{observacionId}` | Marcar observación como resuelta |  |
| `GET` | `/cursos/{cursoId}/comentarios` | Listar comentarios |  |
| `POST` | `/cursos/{cursoId}/comentarios` | Comentar una pantalla | REVISOR_CLIENTE puede comentar, no editar |
| `PATCH` | `/comentarios/{comentarioId}` | Resolver comentario |  |

### Personaje y voz

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `GET` | `/cursos/{cursoId}/narraciones` | Listar narraciones |  |
| `POST` | `/cursos/{cursoId}/narraciones/regenerar` | Regenerar narraciones | Por defecto solo las DESACTUALIZADA |
| `POST` | `/cursos/{cursoId}/narraciones/{pantallaId}/{idioma}/audio-cliente` | Usar audio del cliente | Limpia ruido, re-locuta o calcula la boca desde la grabación |
| `POST` | `/voz/muestra` | Escuchar una muestra con boca | Para probar voz y pronunciación; no se guarda en el curso |

### Idiomas

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `GET` | `/cursos/{cursoId}/traducciones` | Listar textos y su traducción |  |
| `POST` | `/cursos/{cursoId}/traducciones/traducir` | Traducir pendientes con el glosario | No toca lo REVISADA |
| `PATCH` | `/traducciones/{traduccionId}` | Editar o marcar como revisada |  |

### Alineación y navegación

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `GET` | `/cursos/{cursoId}/alineacion` | Informe de alineación pedagógica | Calculado desde el documento; sin costo de IA |
| `GET` | `/cursos/{cursoId}/navegacion` | Ver patrón y reglas |  |
| `PUT` | `/cursos/{cursoId}/navegacion` | Guardar patrón y reglas | patronPreferidoDelCliente = true lo guarda en el kit |
| `POST` | `/cursos/{cursoId}/vista-previa` | Crear enlace de vista previa | Enlace temporal para el participante o el revisor |

### Entrega

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `POST` | `/cursos/{cursoId}/validar` | Validar antes de exportar | Nunca bloquea por tamaño |
| `POST` | `/cursos/{cursoId}/exportaciones` | Exportar | SCORM 1.2 por defecto, perfil Genérico |
| `GET` | `/cursos/{cursoId}/exportaciones` | Listar exportaciones |  |
| `GET` | `/exportaciones/{exportacionId}` | Ver exportación y descargar | descargaUrl firmada por 15 min |

### Costos y rentabilidad

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `GET` | `/costos` | Resumen de costos de IA |  |
| `GET` | `/negocio/parametros` | Ver parámetros de rentabilidad |  |
| `PUT` | `/negocio/parametros` | Guardar parámetros de rentabilidad | Solo ADMINISTRADOR |
| `GET` | `/negocio/rentabilidad` | Calcular rentabilidad | Con «mediciones» usa los promedios de MedicionProceso |
| `GET` | `/negocio/mediciones` | Listar mediciones de horas |  |
| `POST` | `/negocio/mediciones` | Registrar horas medidas |  |

### Conexiones IA

| Método | Ruta | Qué hace | Notas |
| --- | --- | --- | --- |
| `GET` | `/conexiones-ia` | Ver proveedor por tarea | Nunca devuelve claves |
| `PUT` | `/conexiones-ia/{tarea}` | Cambiar proveedor o modelo de una tarea | Solo ADMINISTRADOR |
| `POST` | `/conexiones-ia/{tarea}/probar` | Probar conexión |  |

## Eventos (SSE)

| Evento | Datos | Cuándo |
| --- | --- | --- |
| `etapa` | `{ etapa, estado, detalle, costoUsd }` | Empieza o termina una etapa de la generación |
| `pantalla-lista` | `{ pantallaId, indice }` | Una pantalla quedó armada (para mostrarla en Producción) |
| `propuesta-lista` | `{ propuestaId, tipo, pantallaId }` | La IA terminó una propuesta |
| `narracion` | `{ pantallaId, idioma, estado }` | Cambió el estado de una narración |
| `exportacion` | `{ exportacionId, estado }` | Cambió el estado de una exportación |
| `costo` | `{ totalUsd }` | Se registró un costo de IA |
| `error` | `{ codigo, mensaje, reintentable }` | Falló un trabajo |
