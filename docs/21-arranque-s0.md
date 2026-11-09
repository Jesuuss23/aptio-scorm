# Lista de arranque del sprint S0

Lo que debe estar listo para que el equipo empiece. Los campos con `____` los completa el responsable del producto o el ingeniero a cargo. Marca cada casilla cuando esté hecho.

**Regla para todas las cuentas:**
- Correo de la empresa, nunca uno personal.
- Doble factor activado.
- Claves en el gestor de secretos, nunca en el repositorio ni en el chat.
- Plan de pago con **uso comercial** (ver `19-proveedores-y-licencias.md`).

## 1. Personas y decisiones

| Rol | Nombre | Correo |
| --- | --- | --- |
| Responsable del producto (aprueba demos) | ____ | ____ |
| Ingeniero a cargo | ____ | ____ |
| Administrador de cuentas y pagos | ____ | ____ |
| Diseñador gráfico (personaje y estilos) | ____ | ____ |
| Diseñador instruccional (revisa la calidad de la IA) | ____ | ____ |

- [ ] Día fijo de demo al cerrar cada sprint: ____
- [ ] Duración del sprint: ____ semanas
- [ ] Decisiones abiertas confirmadas: DA-01 (Prisma), DA-02 (animación), DA-04 (Preact), DA-06 (LMS de prueba). Ver `ESTADO.md`.

## 2. Repositorio y gestión

| Hecho | Qué | Detalle | Responsable |
| --- | --- | --- | --- |
| [ ] | Repositorio privado (GitHub o GitLab) | Rama `main` protegida; revisión obligatoria antes de fusionar | ____ |
| [ ] | Proyecto en Jira | Importar `jira/jira-import.csv` (`jira/README.md`) | ____ |
| [ ] | Integración continua | Lint, tipos, pruebas, `pnpm schema:test` y `pnpm ia:casos` | ____ |
| [ ] | Claude Code para el equipo | Plan con acceso para cada programador | ____ |

## 3. Nube (ADR-009)

| Hecho | Qué | Detalle | Responsable |
| --- | --- | --- | --- |
| [ ] | Cuenta de nube de la empresa | Recomendado AWS, región São Paulo (`sa-east-1`). Proveedor elegido: ____ | ____ |
| [ ] | Alertas de presupuesto | Aviso al ____ % de USD ____ al mes | ____ |
| [ ] | Entorno de **pruebas** | Contenedores (API, web, worker), PostgreSQL y Redis administrados, bucket S3 **cifrado con KMS**, HTTPS | ____ |
| [ ] | Entorno de **producción** | Igual que pruebas, con copias de seguridad diarias cifradas. Puede crearse después del S6 | ____ |
| [ ] | Dominio y certificados | Pruebas: ____ · Producción: ____ | ____ |
| [ ] | Gestor de secretos | Claves de API solo ahí | ____ |
| [ ] | Correo saliente | Amazon SES u otro SMTP para invitaciones y cambio de clave; dominio verificado | ____ |
| [ ] | Retención de documentos | Días por defecto tras la entrega: ____ (recomendado 180) | ____ |

## 4. Ingreso de usuarios

| Hecho | Qué | Detalle | Responsable |
| --- | --- | --- | --- |
| [ ] | Proyecto en Google Cloud para el ingreso con Google | Pantalla de consentimiento (nombre de la app, logo, dominio) y credenciales OAuth tipo «Aplicación web» | ____ |
| [ ] | URL de retorno autorizada | `https://<dominio-pruebas>/api/v1/auth/google/callback` y la de producción | ____ |
| [ ] | Primer administrador | Correo: ____ (los demás se invitan desde el sistema) | ____ |

## 5. Proveedores de IA (ADR-010)

| Hecho | Proveedor | Para qué | Configuración obligatoria | Límite mensual | Responsable |
| --- | --- | --- | --- | --- | --- |
| [ ] | Anthropic (Claude API) | Texto, guion, pantallas, traducción, calidad | Cuenta de organización; límite de gasto; firmar el DPA; pedir retención cero si habrá datos personales | USD ____ | ____ |
| [ ] | Google Cloud Text-to-Speech | Voz ES/EN | Mismo proyecto de Google Cloud; cuenta de servicio solo con permiso de TTS; usar voces GA | USD ____ | ____ |
| [ ] | Recraft API | Ilustraciones SVG | Plan de API de pago (no el plan web gratuito) | USD ____ | ____ |
| [ ] | Adobe Firefly Services (opcional) | Clientes que exigen indemnización | Contrato empresarial | USD ____ | ____ |
| [ ] | Azure Speech (opcional) | Voz alternativa | Voces prebuilt; aviso de voz sintética en créditos | USD ____ | ____ |

- [ ] Límite general en el sistema: `LIMITE_GASTO_MENSUAL_USD` = ____
- [ ] Confirmar con cada proveedor lo marcado como pendiente en `19-proveedores-y-licencias.md`.

## 6. Pruebas en LMS

| Hecho | Qué | Detalle | Responsable |
| --- | --- | --- | --- |
| [ ] | SCORM Cloud | Cuenta gratuita de pruebas (referencia del estándar) | ____ |
| [ ] | Moodle de pruebas | Moodle 4.5 en Docker (lo arma el S6) o uno existente: ____ | ____ |
| [ ] | Otros LMS de clientes | Blackboard, Chamilo, Canvas: accesos de prueba disponibles: ____ | ____ |

## 7. Insumos del equipo gráfico y de contenido

| Hecho | Qué | Para cuándo | Responsable |
| --- | --- | --- | --- |
| [ ] | Ana en SVG con capas (pasa `validar-personaje.mjs`) | Prueba PT-01 del S0 | ____ |
| [ ] | 2 estilos base: hoja de estilo, 5 escenas y 10 objetos | Prueba PT-02 del S0 | ____ |
| [ ] | 14 íconos del kit | S3 | ____ |
| [ ] | Pantallas modelo del estilo base (18 disposiciones) | S3 | ____ |
| [ ] | 1 documento real de un cliente (sin datos personales) para probar el generador | S2 | ____ |
| [ ] | Medición de 2 proyectos actuales (`11-medicion-y-piloto.md`) | Antes del S6 | ____ |

Guía de los insumos gráficos: `20-guia-diseno.md`.

## 8. Contratos y datos

| Hecho | Qué | Responsable |
| --- | --- | --- |
| [ ] | Cláusula en contratos con clientes: rol de encargado de tratamiento de datos, uso de proveedores de IA en el extranjero, plazo de borrado de documentos y créditos de IA en las cápsulas | ____ |
| [ ] | Cláusula de que las imágenes generadas no se garantizan como exclusivas | ____ |
| [ ] | Revisión por un abogado (Ley 29733 y Reglamento D.S. 016-2024-JUS) | ____ |

## Listo para empezar

- [ ] Secciones 1 a 5 completas (las demás pueden avanzar durante los primeros sprints).
- Fecha de inicio del S0: ____
