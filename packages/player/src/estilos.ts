// Estilos del reproductor. Viven dentro de su Shadow DOM: los colores y las letras salen del kit (--ap-*). Celular
// primero: las disposiciones se reacomodan con consultas de contenedor, así se ven igual en el marco de la vista previa
// y en la ventana del LMS.
export const ESTILOS = `
:host{display:block}
*,*::before,*::after{box-sizing:border-box}
.ap-r{container-type:inline-size;display:flex;flex-direction:column;height:100%;min-height:420px;background:var(--ap-fondo);color:var(--ap-texto);font-family:var(--ap-f-textos),system-ui,sans-serif;font-size:16px;line-height:1.45;overflow:hidden}
button{font:inherit;cursor:pointer}
button:disabled{cursor:not-allowed}
/* HU-1401 · Foco visible en todo control: 3 px del acento legible (3:1) con un halo blanco que lo separa de fondos oscuros. */
:focus-visible{outline:3px solid var(--ap-foco,var(--ap-acento));outline-offset:2px;box-shadow:0 0 0 2px var(--ap-blanco)}
.ap-sin-marco .ap-barra,.ap-sin-marco .ap-pie,.ap-sin-marco .ap-subtitulos,.ap-sin-marco .ap-zona,.ap-sin-marco .ap-fab,.ap-sin-marco .ap-hud,.ap-sin-marco .ap-motivo-flotante{display:none}
.ap-sin-marco{min-height:0}
.ap-oculto{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.ap-barra{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--ap-primario);color:var(--ap-blanco);flex:0 0 auto}
.ap-titulo-curso{font-family:var(--ap-f-titulos),system-ui,sans-serif;font-weight:700;font-size:16px;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-avance{flex:1 1 60px;min-width:48px;height:6px;border-radius:3px;background:rgba(255,255,255,.25)}
.ap-avance i{display:block;height:6px;border-radius:3px;background:var(--ap-acento);width:0;transition:width .3s}
.ap-porcentaje{font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.ap-espacio{flex:1}
.ap-boton-barra{min-height:36px;background:transparent;color:inherit;border:1px solid rgba(255,255,255,.55);border-radius:8px;padding:4px 10px;font-size:13px;white-space:nowrap}
.ap-boton-barra[aria-pressed=true]{background:rgba(255,255,255,.2)}
.ap-cuerpo{position:relative;flex:1 1 auto;display:flex;min-height:0}
.ap-escena{flex:1;min-width:0;overflow:auto;display:flex}
.ap-temario{position:absolute;inset:0 auto 0 0;z-index:5;width:min(320px,88%);overflow:auto;background:var(--ap-blanco);color:var(--ap-texto);padding:12px;box-shadow:4px 0 18px rgba(0,0,0,.2);font-size:14px}
.ap-temario[hidden]{display:none}
.ap-temario-cabeza{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.ap-temario ol{list-style:none;margin:0 0 8px;padding:0}
.ap-modulo-titulo{margin:8px 0 4px;font-size:12px;opacity:.75;text-transform:uppercase;letter-spacing:.04em}
.ap-entrada{display:flex;gap:8px;align-items:center;width:100%;min-height:40px;text-align:left;border:0;background:transparent;color:inherit;border-radius:6px;padding:6px}
.ap-entrada:hover:not(:disabled){background:rgba(0,0,0,.05)}
.ap-entrada.ap-actual{background:color-mix(in srgb,var(--ap-acento) 22%,transparent);font-weight:700}
.ap-entrada:disabled{opacity:.5}
.ap-estado{flex:0 0 26px;font-variant-numeric:tabular-nums;font-size:12px}
.ap-subtitulos{margin:0;padding:8px 16px;background:rgba(16,32,51,.92);color:#fff;font-size:15px;text-align:center}
.ap-subtitulos[hidden]{display:none}
.ap-pie{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--ap-blanco);border-top:1px solid rgba(0,0,0,.1);flex:0 0 auto}
.ap-centro{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;text-align:center;font-size:13px}
.ap-motivo{color:var(--ap-mal-texto,var(--ap-alerta));font-weight:700;font-size:13px}
.ap-motivo:empty{display:none}
.ap-r:has(>.ap-diagnostico){position:relative}
.ap-diagnostico{position:absolute;inset:0;z-index:30;display:grid;place-items:center;padding:12px;background:rgba(16,32,51,.6);font-size:13px}
.ap-diag-caja{width:min(860px,100%);max-height:100%;overflow:auto;background:#fff;color:#102033;border-radius:12px;padding:16px;box-shadow:0 12px 32px rgba(0,0,0,.3)}
.ap-diag-titulo{margin:0 0 8px;font-size:20px}
.ap-diag-caja h3{margin:14px 0 6px;font-size:15px}
.ap-diag-caja p{margin:0 0 6px}
.ap-diag-hallazgo{padding:8px 10px;border-radius:8px;background:#e7f5ee;color:#14532d;font-weight:700}
.ap-diag-sin-api{background:#fde8e6;color:#8a1c12}
.ap-diag-busqueda{margin:0;padding-left:20px}
.ap-diag-datos{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:0}
.ap-diag-datos dd{margin:0;word-break:break-all}
.ap-diag-tabla{max-height:240px;overflow:auto;border:1px solid #d0d7e2;border-radius:8px}
.ap-diag-tabla table{border-collapse:collapse;width:100%;font-family:ui-monospace,Menlo,monospace;font-size:12px}
.ap-diag-tabla th,.ap-diag-tabla td{padding:3px 6px;text-align:left;border-bottom:1px solid #e5e9f0;vertical-align:top;word-break:break-all}
.ap-diag-tabla th{position:sticky;top:0;background:#f5f7fa}
.ap-diag-error td{color:#8a1c12;font-weight:700}
.ap-diag-respaldo{width:100%;min-height:120px;font-family:ui-monospace,Menlo,monospace;font-size:12px}
.ap-diag-botones{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.ap-r:has(>.ap-reanudar){position:relative}
.ap-reanudar{position:absolute;inset:0;z-index:20;display:grid;place-items:center;padding:16px;background:rgba(16,32,51,.55)}
.ap-reanudar-caja{width:min(420px,100%);background:var(--ap-blanco);color:var(--ap-texto);border-radius:14px;padding:20px;box-shadow:0 12px 32px rgba(0,0,0,.25)}
.ap-reanudar-titulo{margin:0 0 6px;font-family:var(--ap-f-titulos),system-ui,sans-serif;font-size:22px;line-height:1.2;color:var(--ap-primario)}
.ap-reanudar-caja p{margin:0 0 16px}
/* HU-1406 · Créditos de IA: diálogo modal sobre el curso. */
.ap-r:has(>.ap-creditos){position:relative}
.ap-creditos{position:absolute;inset:0;z-index:25;display:grid;place-items:center;padding:16px;background:rgba(16,32,51,.55)}
.ap-creditos-caja{width:min(640px,100%);max-height:100%;overflow:auto;background:var(--ap-blanco);color:var(--ap-texto);border-radius:14px;padding:20px;box-shadow:0 12px 32px rgba(0,0,0,.25);font-size:14px}
.ap-creditos-titulo{margin:0 0 8px;font-family:var(--ap-f-titulos),system-ui,sans-serif;font-size:22px;line-height:1.2;color:var(--ap-primario)}
.ap-creditos-aviso{margin:0 0 12px;font-size:16px;font-weight:700}
.ap-creditos-tabla{width:100%;border-collapse:collapse;margin:0 0 16px}
.ap-creditos-tabla caption{text-align:left;font-weight:700;margin-bottom:4px}
.ap-creditos-tabla th,.ap-creditos-tabla td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid rgba(0,0,0,.12);overflow-wrap:anywhere}
.ap-reanudar-nombre{display:block;font-weight:700}
.ap-reanudar-botones{display:flex;flex-wrap:wrap;gap:8px}
.ap-nav{min-height:44px;border:2px solid var(--ap-primario);background:var(--ap-blanco);color:var(--ap-primario);border-radius:10px;padding:6px 14px;font-weight:700;white-space:nowrap}
.ap-nav.ap-primario{background:var(--ap-primario);color:var(--ap-blanco)}
.ap-nav:disabled{opacity:.4}
.ap-pantalla{position:relative;flex:1;display:flex;flex-direction:column;gap:16px;padding:20px 16px;background:var(--ap-bg);min-width:0}
.ap-pantalla.ap-oscuro{color:var(--ap-blanco)}
.ap-contenido{display:flex;flex-direction:column;gap:16px}
.ap-texto{display:flex;flex-direction:column;gap:10px;min-width:0}
.ap-titulo-pantalla{margin:0;font-family:var(--ap-f-titulos),system-ui,sans-serif;font-weight:700;font-size:clamp(24px,6cqi,40px);line-height:1.1;color:var(--ap-primario);text-wrap:balance}
.ap-oscuro .ap-titulo-pantalla{color:inherit}
.ap-titulo-pantalla:focus{outline:none;box-shadow:none}
.ap-subtitulo,.ap-numero-seccion{margin:0;font-size:17px;opacity:.9}
.ap-parrafo{margin:0;max-width:68ch}
.ap-dato{margin:0;background:var(--ap-blanco);color:var(--ap-texto);border-left:6px solid var(--ap-acento);border-radius:8px;padding:10px 14px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.ap-dato-grande{margin:0;font-family:var(--ap-f-titulos),system-ui,sans-serif;font-weight:700;font-size:clamp(36px,11cqi,72px);line-height:1;color:var(--ap-primario)}
.ap-oscuro .ap-dato-grande{color:var(--ap-acento)}
.ap-burbuja{margin:0;background:var(--ap-blanco);color:var(--ap-texto);border-radius:16px;padding:14px 16px;font-size:17px;box-shadow:0 4px 14px rgba(0,0,0,.12)}
.ap-items{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ap-items li{background:var(--ap-blanco);color:var(--ap-texto);border-radius:10px;padding:10px 12px;box-shadow:0 2px 8px rgba(0,0,0,.07)}
.ap-d-objetivos .ap-items{counter-reset:obj}
.ap-d-objetivos .ap-items li{counter-increment:obj;display:flex;gap:10px;align-items:flex-start}
.ap-d-objetivos .ap-items li::before{content:counter(obj);flex:0 0 28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--ap-secundario);color:var(--ap-blanco);font-weight:700}
.ap-d-resumen .ap-items li::before{content:"✓ ";color:var(--ap-bien-texto,var(--ap-secundario));font-weight:700}
.ap-d-portada,.ap-d-seccion,.ap-d-cierre,.ap-d-dato,.ap-d-resultados{justify-content:center}
.ap-d-portada .ap-titulo-pantalla,.ap-d-seccion .ap-titulo-pantalla,.ap-d-cierre .ap-titulo-pantalla{font-size:clamp(30px,8cqi,56px)}
.ap-d-dato .ap-texto,.ap-d-cierre .ap-texto,.ap-d-vf .ap-texto{align-items:center;text-align:center}
.ap-d-seccion .ap-numero-seccion{font-family:var(--ap-f-titulos),system-ui,sans-serif;font-weight:700;font-size:20px;opacity:.7;order:-1}
/* HU-0605 · Cambiar diseño con los mismos bloques: en «Tarjetas con íconos» los párrafos y el dato son tarjetas; en «Dato grande», el destacado crece. */
.ap-d-lista .ap-texto{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:10px}
.ap-d-lista .ap-titulo-pantalla,.ap-d-lista .ap-subtitulo,.ap-d-lista .ap-items{grid-column:1/-1}
.ap-d-lista .ap-parrafo,.ap-d-lista .ap-dato{max-width:none;background:var(--ap-blanco);color:var(--ap-texto);border:0;border-top:4px solid var(--ap-secundario);border-radius:10px;padding:12px 14px;font-weight:400;box-shadow:0 2px 8px rgba(0,0,0,.07)}
.ap-d-lista .ap-parrafo::before,.ap-d-lista .ap-dato::before{content:"✓";display:grid;place-items:center;width:28px;height:28px;margin-bottom:6px;border-radius:50%;background:var(--ap-secundario);color:var(--ap-blanco);font-weight:700}
.ap-d-dato .ap-dato{background:none;border:0;box-shadow:none;padding:0;font-family:var(--ap-f-titulos),system-ui,sans-serif;font-size:clamp(32px,9cqi,64px);line-height:1.05;color:var(--ap-primario)}
.ap-oscuro.ap-d-dato .ap-dato{color:var(--ap-acento)}
.ap-medios{display:flex;gap:12px;justify-content:center;align-items:flex-end}
.ap-personaje{margin:0;width:min(34cqi,160px);flex:0 0 auto}
.ap-personaje svg,.ap-personaje img{display:block;width:100%;height:auto}
.ap-personaje .ap-silueta{fill:color-mix(in srgb,var(--ap-primario) 30%,transparent)}
.ap-narracion{display:flex;justify-content:center;padding:4px 12px 0}
.ap-narracion[hidden]{display:none}
.ap-imagen,.ap-video{margin:0;flex:1;min-width:0}
.ap-imagen img,.ap-video video{display:block;width:100%;height:auto;border-radius:10px}
.ap-sin-imagen{display:grid;place-items:center;min-height:120px;width:100%;padding:12px;border:2px dashed color-mix(in srgb,currentColor 35%,transparent);border-radius:10px;font-size:13px;text-align:center;opacity:.8}
.ap-video .ap-sin-imagen{aspect-ratio:16/9;background:#0E1512;color:#fff;border:0}
.ap-video-marco{position:relative}
.ap-video-capa:empty{display:none}
.ap-con-pregunta .ap-video-marco{min-height:min(360px,75vh)}
.ap-video-capa{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:12px;background:rgba(14,21,18,.55);border-radius:10px;overflow:auto}
.ap-video-capa>.ap-video-pregunta{margin-top:auto}
.ap-video-pregunta{background:var(--ap-blanco);color:var(--ap-texto);border-radius:12px;padding:14px 16px;width:min(100%,520px);display:flex;flex-direction:column;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.ap-video-tiempo{margin:0;font-size:.85em;font-weight:700}
.ap-video-enunciado{margin:0;font-size:1.05em}
.ap-opcion[aria-disabled=true]{cursor:default}
.ap-actividad{display:flex;flex-direction:column;gap:10px;background:color-mix(in srgb,var(--ap-blanco) 70%,transparent);color:var(--ap-texto);border-radius:12px;padding:12px}
.ap-instruccion{margin:0;font-weight:700}
.ap-juego{display:flex;flex-direction:column;gap:10px}
.ap-boton{min-height:44px;border:2px solid var(--ap-primario);background:var(--ap-blanco);color:var(--ap-primario);border-radius:10px;padding:6px 14px;font-weight:700}
.ap-boton.ap-primario{background:var(--ap-primario);color:var(--ap-blanco)}
.ap-boton:disabled{opacity:.45}
.ap-acciones{display:flex;gap:8px;flex-wrap:wrap}
.ap-acciones:empty{display:none}
.ap-opciones{display:grid;gap:8px}
.ap-opciones.ap-dos{grid-template-columns:1fr 1fr}
.ap-opcion{min-height:44px;text-align:left;border:2px solid color-mix(in srgb,var(--ap-primario) 35%,transparent);background:var(--ap-blanco);color:var(--ap-texto);border-radius:10px;padding:8px 12px}
.ap-opcion[aria-pressed=true],.ap-opcion.ap-elegida{border-color:var(--ap-primario);background:color-mix(in srgb,var(--ap-acento) 18%,var(--ap-blanco))}
.ap-opcion.ap-correcta{border-color:var(--ap-secundario);background:color-mix(in srgb,var(--ap-secundario) 15%,var(--ap-blanco))}
.ap-opcion.ap-correcta::after{content:" ✓";font-weight:700}
.ap-opcion.ap-incorrecta{border-color:var(--ap-alerta);background:color-mix(in srgb,var(--ap-alerta) 12%,var(--ap-blanco))}
.ap-opcion.ap-incorrecta::after{content:" ✗";font-weight:700}
.ap-opcion:disabled{cursor:default}
.ap-marcador,.ap-nota{margin:0;font-size:13px;opacity:.8}
.ap-nota:empty{display:none}
.ap-retro:empty{display:none}
.ap-retro{font-size:14px}
.ap-retro p{margin:0}
.ap-marca{font-weight:700}
.ap-bien{color:var(--ap-bien-texto,var(--ap-secundario))}
.ap-mal{color:var(--ap-mal-texto,var(--ap-alerta))}
.ap-resultado{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.ap-resultado-texto{margin:0;font-size:20px;font-weight:700;color:var(--ap-primario)}
.ap-rejilla{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ap-rejilla.ap-cuatro{grid-template-columns:repeat(4,minmax(0,1fr))}
.ap-carta{min-height:72px;border:0;border-radius:10px;background:var(--ap-primario);color:var(--ap-blanco);padding:6px;font-size:14px;transition:transform .25s}
.ap-carta.ap-volteada{background:var(--ap-blanco);color:var(--ap-texto);border:2px solid var(--ap-primario)}
.ap-carta.ap-pareja{border-color:var(--ap-secundario);background:color-mix(in srgb,var(--ap-secundario) 15%,var(--ap-blanco))}
.ap-carta:disabled,.ap-carta[aria-disabled=true]{cursor:default}
.ap-dorso{font-size:24px;font-weight:700}
.ap-leyenda{display:flex;gap:6px;flex-wrap:wrap}
.ap-etiqueta{background:var(--ap-primario);color:var(--ap-blanco);border-radius:999px;padding:2px 10px;font-size:12px}
.ap-elementos,.ap-pasos{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.ap-elemento,.ap-paso{background:var(--ap-blanco);border:2px solid transparent;border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.ap-paso{flex-direction:row;align-items:center}
.ap-acierto{border-color:var(--ap-secundario)}
.ap-error{border-color:var(--ap-alerta)}
.ap-grupos{display:flex;gap:6px;flex-wrap:wrap}
.ap-grupo{flex:1 1 120px}
.ap-numero{flex:0 0 28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--ap-primario);color:var(--ap-blanco);font-weight:700;font-size:13px}
.ap-paso-texto{flex:1;min-width:0}
.ap-mover{display:flex;gap:4px}
.ap-icono{width:44px;height:44px;border:2px solid var(--ap-primario);background:var(--ap-blanco);color:var(--ap-primario);border-radius:8px;font-weight:700}
.ap-icono:disabled{opacity:.3}
.ap-tarjetas{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.ap-tarjeta{min-height:96px;border:2px solid var(--ap-primario);border-radius:12px;background:var(--ap-primario);color:var(--ap-blanco);padding:10px;font-weight:700}
.ap-tarjeta.ap-volteada{background:var(--ap-blanco);color:var(--ap-texto);font-weight:400}
.ap-quiz-cabeza{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:13px;font-weight:700;color:var(--ap-bien-texto,var(--ap-secundario))}
.ap-vidas{color:var(--ap-mal-texto,var(--ap-alerta));letter-spacing:2px}
.ap-tiempo{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--ap-mal-texto,var(--ap-alerta))}
.ap-quitar-tiempo{min-height:36px;padding:4px 10px;font-size:13px}
.ap-enunciado,.ap-situacion{margin:0;font-size:18px;font-weight:700}
.ap-escena-img{position:relative;border-radius:10px;overflow:hidden;min-height:200px;display:grid}
.ap-escena-img img{width:100%;height:auto;display:block}
.ap-escena-img .ap-sin-imagen{min-height:220px}
.ap-punto{position:absolute;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;border:3px solid var(--ap-blanco);background:var(--ap-acento);color:var(--ap-texto);font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.ap-punto.ap-visto{background:var(--ap-secundario);color:var(--ap-blanco)}
.ap-panel-punto:empty{display:none}
.ap-panel-punto{background:var(--ap-blanco);border-left:6px solid var(--ap-acento);border-radius:8px;padding:8px 12px}
.ap-panel-punto p{margin:0}
.ap-punto-titulo{font-weight:700}
.ap-afirmacion{background:var(--ap-blanco);border:2px solid var(--ap-primario);border-radius:14px;padding:18px;font-size:18px;text-align:center;touch-action:pan-y;user-select:none;transition:transform .25s}
.ap-afirmacion p{margin:0}
.ap-a-la-derecha{transform:translateX(6%) rotate(2deg)}
.ap-a-la-izquierda{transform:translateX(-6%) rotate(-2deg)}
.ap-id{align-self:flex-start;font:12px/1.4 ui-monospace,monospace;background:rgba(16,32,51,.85);color:#fff;border-radius:6px;padding:2px 6px}
.ap-id-pantalla{position:absolute;top:8px;right:8px;z-index:2}
@container (min-width:640px){
  .ap-pantalla{padding:32px 40px}
  .ap-contenido.ap-contenido{flex-direction:row;align-items:center}
  .ap-texto{flex:1}
  .ap-medios{flex:0 0 38%}
  .ap-d-personaje .ap-contenido{flex-direction:row-reverse}
  .ap-d-lista .ap-items{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
  .ap-opciones{grid-template-columns:1fr 1fr}
  .ap-elemento{flex-direction:row;align-items:center}
  .ap-elemento-contenido{flex:1}
  .ap-grupos{flex:0 0 55%}
  .ap-rejilla{grid-template-columns:repeat(4,minmax(0,1fr))}
}
/* HU-0606 · Elementos agregados en el editor: sobre la pantalla, en % de su ancho y alto. «oculto» los saca de la vista. */
.ap-extras{position:absolute;inset:0;pointer-events:none}
.ap-extra{position:absolute;margin:0;pointer-events:auto;box-sizing:border-box}
.ap-extra-titulo{font-family:var(--ap-f-titulos),system-ui,sans-serif;font-weight:700;font-size:clamp(20px,5cqi,34px);line-height:1.1;color:var(--ap-primario)}
.ap-oscuro .ap-extra-titulo{color:inherit}
.ap-extra-texto{font-size:16px}
.ap-extra-dato{background:var(--ap-blanco);color:var(--ap-texto);border-left:6px solid var(--ap-acento);border-radius:8px;padding:10px 14px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.ap-extra-boton{min-height:44px;border:0;border-radius:10px;padding:8px 16px;background:var(--ap-acento);color:var(--ap-texto);font:inherit;font-weight:700;cursor:pointer}
.ap-extra-boton:focus-visible{outline:3px solid var(--ap-primario);outline-offset:2px}
.ap-extra-imagen img{display:block;width:100%;height:auto;border-radius:8px}
.ap-extra-insignia svg{display:block;width:100%;height:auto}
.ap-insignia-fondo{fill:var(--ap-secundario)}
.ap-insignia-estrella{fill:var(--ap-acento)}
.ap-extra-forma{aspect-ratio:3/1;border-radius:10px;background:var(--ap-acento)}
.ap-oculto-el{display:none!important}
.ap-fuera{display:none!important}
/* HU-0610 · «Ocultar» de un disparador: gana sobre la línea de tiempo y sobre el editor. */
.ap-r .ap-disparo-oculto{display:none!important}
.ap-entra{animation:ap-aparecer .4s ease-out both}
/* HU-0603 · Desplazamiento del modo Libre, en % del ancho del reproductor y por dispositivo. */
.ap-desp{translate:var(--ap-dx) var(--ap-dy)}
@container (min-width:640px){.ap-desp-escritorio{translate:var(--ap-dx) var(--ap-dy)}}
@container (max-width:639.98px){.ap-desp-celular{translate:var(--ap-dx) var(--ap-dy)}}
/* HU-0602 · Animaciones de entrada elegidas en el editor; «reducir movimiento» las quita (abajo). */
.ap-anim-aparecer{animation:ap-aparecer .5s ease-out both}
.ap-anim-deslizar{animation:ap-deslizar .5s ease-out both}
.ap-anim-zoom{animation:ap-zoom .5s ease-out both}
.ap-anim-rebotar{animation:ap-rebotar .7s cubic-bezier(.3,1.4,.5,1) both}
@keyframes ap-aparecer{from{opacity:0}to{opacity:1}}
@keyframes ap-deslizar{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes ap-zoom{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}}
@keyframes ap-rebotar{0%{opacity:0;transform:translateY(-24px)}60%{opacity:1;transform:translateY(6px)}100%{transform:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}

/* HU-1103 · Patrones de navegación. */
.ap-puntos{font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.ap-barra-historias{flex-direction:column;align-items:stretch;gap:6px}
.ap-barra-fila{display:flex;align-items:center;gap:8px;min-width:0}
.ap-barra-fila .ap-titulo-curso{flex:1 1 auto}
.ap-segmentos{display:flex;gap:3px}
.ap-segmentos i{flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.35)}
.ap-segmentos i.ap-visto{background:var(--ap-acento)}
.ap-zona{position:absolute;top:0;bottom:0;z-index:3;width:44px;display:flex;align-items:center;justify-content:center;border:0;background:linear-gradient(to var(--ap-lado,right),rgba(16,32,51,.18),transparent);color:var(--ap-blanco);font-size:30px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.6)}
/* Las zonas, el motivo, el marcador y los botones flotantes nunca tapan el contenido ni el foco (WCAG 2.4.11). */
.ap-r:not(.ap-sin-marco)[data-barra="ninguna"] .ap-escena{padding-inline:44px;scroll-padding-inline:44px}
.ap-r:not(.ap-sin-marco):not([data-barra="abajo"]) .ap-escena{padding-bottom:52px;scroll-padding-bottom:52px}
.ap-r:not(.ap-sin-marco)[data-barra="flotante"] .ap-escena{padding-bottom:76px;scroll-padding-bottom:76px}
.ap-r:not(.ap-sin-marco)[data-marcador="true"] .ap-escena{padding-top:64px;scroll-padding-top:64px}
.ap-segmentos-puntos{gap:4px;justify-content:center}
.ap-segmentos-puntos i{flex:0 0 8px;height:8px;border-radius:50%}
.ap-barra .ap-nav{min-height:40px;padding:4px 10px}
.ap-nav[hidden]{display:none}
.ap-zona-izq{left:0;--ap-lado:right}
.ap-zona-der{right:0;--ap-lado:left}
.ap-zona:disabled{opacity:.25}
.ap-motivo-flotante{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:4;max-width:calc(100% - 120px);padding:6px 12px;border-radius:999px;background:var(--ap-blanco);box-shadow:0 2px 10px rgba(0,0,0,.18);text-align:center}
.ap-hud{position:absolute;top:10px;right:10px;z-index:4;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;border-radius:12px;background:var(--ap-primario);color:var(--ap-blanco);box-shadow:0 2px 10px rgba(0,0,0,.2)}
.ap-fab{position:absolute;bottom:12px;z-index:4;width:48px;height:48px;border-radius:50%;border:2px solid var(--ap-blanco);background:var(--ap-primario);color:var(--ap-blanco);font-size:18px;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.ap-fab-izq{left:12px}
.ap-fab-der{right:12px}
.ap-fab:disabled{opacity:.4}
.ap-zona[hidden],.ap-fab[hidden],.ap-hud[hidden],.ap-pie[hidden],.ap-volver-mapa[hidden]{display:none}
.ap-mapa{flex:1;display:flex;flex-direction:column;gap:16px;padding:20px 16px;overflow:auto}
.ap-mapa-titulo{margin:0;font-family:var(--ap-f-titulos),system-ui,sans-serif;font-size:24px;color:var(--ap-primario)}
.ap-estaciones,.ap-temas{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.ap-estaciones{grid-template-columns:1fr;position:relative}
.ap-temas{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
.ap-estacion{display:flex;align-items:center;gap:12px;width:100%;min-height:64px;padding:10px 14px;text-align:left;border:2px solid var(--ap-primario);border-radius:14px;background:var(--ap-blanco);color:var(--ap-texto)}
.ap-estacion:disabled{opacity:.55;border-style:dashed}
.ap-estacion.ap-completa{border-color:var(--ap-secundario)}
.ap-estacion-num{flex:0 0 40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--ap-primario);color:var(--ap-blanco);font-weight:700}
.ap-completa .ap-estacion-num{background:var(--ap-secundario)}
.ap-estacion-texto{display:flex;flex-direction:column;min-width:0}
.ap-estacion-texto small{opacity:.8}
.ap-temas .ap-estacion{flex-direction:column;align-items:flex-start;min-height:120px}
@container (min-width:640px){.ap-estaciones{grid-template-columns:repeat(3,1fr)}.ap-estaciones .ap-estacion{flex-direction:column;text-align:center;min-height:140px;justify-content:center}.ap-estaciones .ap-estacion-texto{align-items:center}}
`;
