/**
 * HU-1603 · Popups en el sitio pre-renderizado (REQ-076, RN-17-3, CP-131, CP-132). Cada página carga un script propio y
 * pequeño (`{base}/_popups.js`, diferido, sin cookies ni terceros) que lee los popups activos en vivo
 * (`{base}/_popups.json`), elige con las reglas de `@aptio/schema/popups` (frecuencia, páginas, pago, conversión) y arma
 * los disparadores. Guarda en `localStorage` cuándo vio cada popup y si dejó su correo; sin `localStorage` no muestra
 * ninguno solo (no puede respetar la frecuencia), pero los enlaces `#popup-<id>` siguen abriéndolos. Una página abierta
 * con `#popup-<id>` en la dirección («Probar en el sitio» del panel) lo abre al cargar.
 *
 * Accesibilidad: el modal es un diálogo (`role="dialog"`, `aria-modal`, título asociado) que atrapa el foco, se cierra
 * con Escape y devuelve el foco; el deslizable y la barra son fijos (no mueven la página: CLS 0) y no roban el foco.
 * Los textos se ponen con `textContent`, nunca como HTML. Como el script de captación (HU-1601), recuerda la primera
 * visita de la sesión (página de entrada, referente y `utm_*`) en `sessionStorage` para el lead del popup. Las animaciones solo corren sin `prefers-reduced-motion`.
 */
import { CAMPO_TRAMPA, PARAMETROS_UTM } from '@aptio/schema/leads';
import { DIA_MS, FRECUENCIA_MINIMA_DIAS, PREFIJO_ANCLA_POPUP, PREFIJO_PAGO } from '@aptio/schema/popups';
import { CLAVE_SESION } from './captacion.js';
import { TEXTOS } from './textos.js';

export const ARCHIVO_POPUPS = '_popups.js';
export const ARCHIVO_POPUPS_JSON = '_popups.json';
export const RUTA_EVENTO_POPUP = '_popup';
/** La entrada JSON de leads (SUP-240): en producción la CDN la envía a la API igual que `/s/*` (HU-1405). */
export const RUTA_LEADS_API = '/api/v1/publico/leads';
export const CLAVE_POPUPS = 'aptio.popups';

const TEXTOS_POPUP = {
  es: { cerrar: 'Cerrar', noGracias: 'No, gracias', correo: 'Correo de trabajo', consentimiento: TEXTOS.es.FORMULARIO.consentimiento, listo: 'Listo: te escribiremos a ese correo.', error: 'No se pudo enviar. Revisa el correo e intenta de nuevo.', demasiados: 'Recibimos varios envíos seguidos: espera unos minutos.' },
  en: { cerrar: 'Close', noGracias: 'No, thanks', correo: 'Work email', consentimiento: TEXTOS.en.FORMULARIO.consentimiento, listo: 'Done: we will write to that email.', error: 'It could not be sent. Check the email and try again.', demasiados: 'We received several submissions in a row: wait a few minutes.' },
} as const;

/** Estilos de los popups; el script los agrega una vez, solo si muestra alguno. */
export const CSS_POPUPS = [
  '.pp-ovl{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px}',
  '.pp-caja{position:relative;background:#fff;color:var(--ink);border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.3);font-family:var(--f-body)}',
  '.pp-modal{width:min(480px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:32px 24px 24px}',
  '.pp-slide{position:fixed;z-index:55;right:16px;bottom:16px;width:min(360px,calc(100vw - 32px));padding:24px 20px 20px}',
  '.pp-barra{position:fixed;z-index:55;left:0;right:0;bottom:0;border-radius:0;padding:12px 56px 12px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:center;background:var(--b700);color:#fff}',
  '.pp-barra .pp-t{font-size:16px;margin:0}.pp-barra .pp-x{color:#fff}.pp-barra .btn{background:#fff;color:var(--b700)}',
  '.pp-t{font-family:var(--f-ui);font-size:20px;line-height:1.3;margin:0 0 8px}',
  '.pp-p{margin:0 0 16px;color:var(--muted)}.pp-barra .pp-p{margin:0;color:#fff}',
  '.pp-x{position:absolute;top:8px;right:8px;width:44px;height:44px;border:0;background:none;color:var(--muted);font-size:20px;cursor:pointer;border-radius:8px}',
  '.pp-f{display:grid;gap:12px}.pp-f label{font-family:var(--f-ui);font-size:14px;font-weight:700}',
  '.pp-f input[type=email]{width:100%;font:inherit;font-size:16px;border:1px solid #64748B;border-radius:8px;padding:10px 12px;margin-top:6px}',
  '.pp-ok{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:start}.pp-ok input{width:24px;height:24px;margin:0;accent-color:var(--b700)}',
  '.pp-ok label{font-family:var(--f-body);font-weight:400;color:var(--muted)}',
  '.pp-f .btn,.pp-caja .btn{min-height:48px;cursor:pointer}',
  '.pp-no{background:none;border:0;color:var(--b700);text-decoration:underline;font:inherit;margin-top:12px;min-height:44px;cursor:pointer}',
  '.pp-msg{margin:0;font-weight:700}',
  '.pp-trampa{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}',
  '.pp-caja :focus-visible{outline:3px solid var(--b700);outline-offset:2px}.pp-barra :focus-visible{outline-color:#fff}',
  '@media (prefers-reduced-motion:no-preference){.pp-modal,.pp-slide{animation:pp-in .2s ease-out}@keyframes pp-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}}',
].join('');

/**
 * El script, sin dependencias. `data-base` es la base del sitio (`/s` o vacío). Aplica en el navegador las mismas reglas
 * que `debeMostrarse` (`@aptio/schema/popups`): las pruebas de Playwright lo recorren en el sitio real.
 */
export const SCRIPT_POPUPS = `(function(){try{
var c=document.currentScript,b=(c&&c.getAttribute('data-base'))||'',L=document.documentElement.lang==='en'?'en':'es',T=${JSON.stringify(TEXTOS_POPUP)}[L];
var ruta=location.pathname;if(b&&ruta.indexOf(b)===0)ruta=ruta.slice(b.length)||'/';var pub=ruta;if(ruta==='/en'||ruta.indexOf('/en/')===0)ruta=ruta.slice(3)||'/';
if(ruta.length>1)ruta=ruta.replace(/\\/+$/,'');
var ls=null;try{ls=window.localStorage;ls.getItem('x')}catch(e){ls=null}
var K=${JSON.stringify(CLAVE_POPUPS)},D=${DIA_MS},MIN=${FRECUENCIA_MINIMA_DIAS},abierto=null,automatico=false;
function leer(){try{return JSON.parse(ls.getItem(K))||{}}catch(e){return{}}}
function marcar(id,campo){if(!ls)return;try{var d=leer();d[id]=d[id]||{};d[id][campo]=Date.now();ls.setItem(K,JSON.stringify(d))}catch(e){}}
function coincide(x){if(x==='*')return true;if(x.slice(-2)==='/*'){var y=x.slice(0,-2);return y===''||ruta===y||ruta.indexOf(y+'/')===0}return x===ruta}
function debe(p){if(!ls)return false;if(ruta.indexOf(${JSON.stringify(PREFIJO_PAGO)})===0)return false;if(!p.paginas.some(coincide))return false;var r=leer()[p.id]||{};if(r.c)return false;
return !r.v||Date.now()-r.v>=Math.max(MIN,p.frecuenciaDias)*D}
function avisar(id,ev){try{fetch(b+'/${RUTA_EVENTO_POPUP}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({popupId:id,evento:ev}),keepalive:true,credentials:'same-origin'}).catch(function(){})}catch(e){}}
function el(t,cl,tx){var e=document.createElement(t);if(cl)e.className=cl;if(tx!=null)e.textContent=tx;return e}
function estilos(){if(document.getElementById('pp-css'))return;var s=el('style');s.id='pp-css';s.textContent=${JSON.stringify(CSS_POPUPS)};document.head.appendChild(s)}
var KS=${JSON.stringify(CLAVE_SESION)},primera=null;
try{var ss=window.sessionStorage,g=ss.getItem(KS);if(g)primera=JSON.parse(g);else{primera={paginaEntrada:pub,referente:''};try{if(document.referrer&&new URL(document.referrer).host!==location.host)primera.referente=document.referrer.slice(0,500)}catch(e){}
var q=new URLSearchParams(location.search);${JSON.stringify(PARAMETROS_UTM)}.forEach(function(n){var x=q.get(n);if(x)primera[n]=x.slice(0,150)});ss.setItem(KS,JSON.stringify(primera))}}catch(e){}
function atribucion(){return primera||{paginaEntrada:pub,referente:''}}
function cerrar(){if(!abierto)return;var a=abierto;abierto=null;document.removeEventListener('keydown',a.tecla,true);a.raiz.remove();if(a.previo&&a.previo.focus&&document.contains(a.previo))a.previo.focus()}
function enfocables(r){return Array.prototype.filter.call(r.querySelectorAll('a[href],button,input:not([type=hidden]):not([tabindex="-1"]),[tabindex="0"]'),function(e){return !e.disabled&&e.offsetParent!==null})}
function abrir(p){if(abierto)return;estilos();var id='pp-'+p.id.slice(0,8),modal=p.tipo==='modal',caja,raiz;
caja=el(modal?'div':(p.tipo==='barra'?'div':'aside'),'pp-caja '+(modal?'pp-modal':p.tipo==='barra'?'pp-barra':'pp-slide'));
caja.setAttribute('data-popup',p.id);
if(modal){caja.setAttribute('role','dialog');caja.setAttribute('aria-modal','true')}else caja.setAttribute('role',p.tipo==='barra'?'region':'complementary');
var t=el(modal?'h2':'p','pp-t',p.titulo);t.id=id+'-t';caja.setAttribute('aria-labelledby',t.id);
var x=el('button','pp-x','\\u2715');x.type='button';x.setAttribute('aria-label',T.cerrar);x.addEventListener('click',cerrar);
caja.appendChild(x);caja.appendChild(t);
if(p.texto){var d=el('p','pp-p',p.texto);d.id=id+'-d';caja.appendChild(d);if(modal)caja.setAttribute('aria-describedby',d.id)}
if(p.accion==='enlace_interno'&&p.enlaceDestino){var a=el('a','btn primary',p.boton);a.href=b+p.enlaceDestino;a.addEventListener('click',function(){avisar(p.id,'conversion')});caja.appendChild(a)}
else{var f=el('form','pp-f');f.noValidate=false;var lc=el('label',null,T.correo),ic=el('input');ic.type='email';ic.name='correo';ic.required=true;ic.maxLength=254;ic.autocomplete='email';ic.id=id+'-c';lc.htmlFor=ic.id;lc.appendChild(ic);
var ok=el('p','pp-ok'),ia=el('input');ia.type='checkbox';ia.required=true;ia.id=id+'-a';var la=el('label',null,T.consentimiento);la.htmlFor=ia.id;ok.appendChild(ia);ok.appendChild(la);
var tr=el('p','pp-trampa');tr.setAttribute('aria-hidden','true');var it=el('input');it.type='text';it.name=${JSON.stringify(CAMPO_TRAMPA)};it.tabIndex=-1;it.autocomplete='off';tr.appendChild(it);
var bt=el('button','btn primary',p.boton);bt.type='submit';var m=el('p','pp-msg');m.setAttribute('role','status');
f.appendChild(lc);f.appendChild(ok);f.appendChild(tr);f.appendChild(bt);f.appendChild(m);
f.addEventListener('submit',function(e){e.preventDefault();if(bt.disabled)return;bt.disabled=true;var v=atribucion(),cu={correo:ic.value,consentimiento:ia.checked,via:'popup',popupId:p.id,idioma:L,paginaFormulario:pub,paginaEntrada:v.paginaEntrada||pub,referente:v.referente||''};
cu[${JSON.stringify(CAMPO_TRAMPA)}]=it.value;${JSON.stringify(PARAMETROS_UTM)}.forEach(function(n){if(typeof v[n]==='string')cu[n]=v[n]});
fetch(${JSON.stringify(RUTA_LEADS_API)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cu),credentials:'same-origin'}).then(function(r){
if(r.ok){marcar(p.id,'c');f.replaceChildren(m);m.textContent=T.listo;return}bt.disabled=false;m.setAttribute('role','alert');
if(r.status===429){m.textContent=T.demasiados;return}return r.json().then(function(j){m.textContent=(j&&j.detalles&&j.detalles.length)?j.detalles.map(function(d){return d.mensaje}).join('. '):T.error})}).catch(function(){bt.disabled=false;m.setAttribute('role','alert');m.textContent=T.error})});
caja.appendChild(f)}
if(modal){var no=el('button','pp-no',T.noGracias);no.type='button';no.addEventListener('click',cerrar);caja.appendChild(no);raiz=el('div','pp-ovl');raiz.appendChild(caja);raiz.addEventListener('click',function(e){if(e.target===raiz)cerrar()})}else raiz=caja;
var previo=document.activeElement;
var tecla=function(e){if(e.key==='Escape'&&(modal||caja.contains(document.activeElement))){e.preventDefault();cerrar();return}
if(modal&&e.key==='Tab'){var q=enfocables(caja);if(!q.length)return;var i=q.indexOf(document.activeElement);if(e.shiftKey&&(i<=0)){e.preventDefault();q[q.length-1].focus()}else if(!e.shiftKey&&(i===q.length-1||i<0)){e.preventDefault();q[0].focus()}}};
abierto={raiz:raiz,tecla:tecla,previo:previo};document.addEventListener('keydown',tecla,true);document.body.appendChild(raiz);
if(modal){var q=enfocables(caja);(q[1]||q[0]).focus()}
marcar(p.id,'v');avisar(p.id,'impresion')}
function disparar(p){if(automatico||abierto)return;automatico=true;abrir(p)}
function armar(p){var v=p.valorDisparador;if(p.disparador==='al_cargar')disparar(p);
else if(p.disparador==='tiempo')setTimeout(function(){disparar(p)},(v||1)*1000);
else if(p.disparador==='desplazamiento'){var h=function(){var e=document.documentElement,pct=(window.scrollY+window.innerHeight)/Math.max(1,e.scrollHeight)*100;if(pct>=(v||50)){window.removeEventListener('scroll',h);disparar(p)}};window.addEventListener('scroll',h,{passive:true})}
else if(p.disparador==='intencion_salida'){if(window.matchMedia&&matchMedia('(pointer: coarse)').matches)return;var s=function(e){if(!e.relatedTarget&&e.clientY<=0){document.removeEventListener('mouseout',s);disparar(p)}};document.addEventListener('mouseout',s)}}
function iniciar(lista){var mios=lista.filter(function(p){return p.idioma===L});
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href^="#${PREFIJO_ANCLA_POPUP}"]');if(!a)return;var id=a.getAttribute('href').slice(${1 + PREFIJO_ANCLA_POPUP.length});
var p=lista.filter(function(x){return x.id===id})[0];if(!p||ruta.indexOf(${JSON.stringify(PREFIJO_PAGO)})===0)return;e.preventDefault();abrir(p)});
var hs=location.hash.indexOf('#${PREFIJO_ANCLA_POPUP}')===0?lista.filter(function(x){return x.id===location.hash.slice(${1 + PREFIJO_ANCLA_POPUP.length})})[0]:null;
if(hs&&ruta.indexOf(${JSON.stringify(PREFIJO_PAGO)})!==0){abrir(hs);return}
mios.filter(function(p){return p.disparador!=='clic_elemento'&&debe(p)}).forEach(armar)}
fetch(b+'/${ARCHIVO_POPUPS_JSON}',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():{popups:[]}}).then(function(d){iniciar(Array.isArray(d.popups)?d.popups:[])}).catch(function(){});
}catch(e){}})();
`;
