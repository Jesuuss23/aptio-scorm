# Riesgos y pruebas técnicas

Pruebas cortas para ejecutar antes o al inicio del prototipo. Cada una produce un resultado documentado en `docs/pruebas/PT-##.md` y actualiza los supuestos de `ESTADO.md`.

| ID | Riesgo | Prueba | Criterio de éxito | Si falla |
| --- | --- | --- | --- | --- |
| PT-01 | La boca sincronizada no se ve natural en español | Personaje SVG con bocas A–X + 3 frases en español con voz de Google + Rhubarb (fonético) y, como comparación, Azure (visemas); reproducir en navegador | El equipo y un cliente valoran la sincronía como aceptable; desfase menor a 100 ms | Ajuste manual por tramos; o reducir a 4 bocas (cerrada, media, abierta, redonda) |
| PT-02 | Las imágenes generadas no mantienen el estilo del cliente | 10 imágenes con 2 proveedores (Recraft y Adobe Firefly; ver `19-proveedores-y-licencias.md`) usando los 2 estilos base de `20-guia-diseno.md` como referencia | 7 de 10 utilizables sin retoque según el diseñador | Priorizar biblioteca recoloreable; la generación queda para fondos |
| PT-03 | La IA no respeta el esquema o los límites de texto | 20 ejecuciones de IA-05 e IA-07 con un caso real | 100 % válidas tras máx. 2 reintentos; límites respetados en 95 % | Ajustar plantillas y dividir tareas |
| PT-04 | Arrastrar en celular es poco usable | INT-02 en 3 celulares (Android gama media, iPhone, tableta) | Completa sin errores de toque; área táctil ≥ 44 px | Alternativa de tocar elemento y luego grupo |
| PT-05 | Costos de IA y voz por cápsula superan lo previsto | Producir 1 cápsula completa bilingüe | Costo registrado por tarea y total | Cambiar modelo por tarea, caché de resultados |
| PT-06 | La transcripción y lip sync de audio del cliente es pobre con ruido | 2 audios reales del cliente | Transcripción corregible en menos de 10 min por 5 min de audio | Ofrecer re-locución con IA por defecto |

## Otros riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambios de precios o retiro de modelos de los proveedores | Capa de proveedores; registro de versión; evaluación con casos de referencia antes de cambiar |
| Datos de clientes enviados a proveedores externos | Política de retención; informar al cliente; no enviar datos personales; revisar términos de cada proveedor |
| Licencias de tipografías, ilustraciones y voces | Solo recursos con licencia registrada; autorización escrita para voces reales |
| Alcance del prototipo crece | Backlog por iteraciones; todo lo nuevo pasa a "posterior" salvo aprobación del responsable |
| Compatibilidad real con cada LMS | Declarar compatibilidad solo tras pruebas (fase D) |
