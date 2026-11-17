/**
 * HU-1606 · Consentimiento de cookies del sitio pre-renderizado (REQ-079, RN-17-6, CP-137, Ley 29733). Solo cuando la
 * versión publicada trae etiquetas (`sitio.cookies`: el banner encendido y al menos un ID), sus páginas cargan un script
 * propio y pequeño (`{base}/_cookies.js`, diferido, del mismo origen, sin cookies propias) con los IDs en sus `data-*`.
 * - Sin una decisión vigente en `localStorage` (`aptio.cookies`) muestra un aviso fijo abajo (no mueve la página:
 *   CLS 0) con «Rechazar», «Configurar» y «Aceptar». «Configurar» y el enlace «Configurar cookies» del pie (`#cookies`)
 *   abren un diálogo modal (`role="dialog"`, `aria-modal`) con un interruptor por categoría; atrapa el foco, se cierra con
 *   Escape y devuelve el foco a quien lo abrió.
 * - GA4, Tag Manager y Meta Pixel se inyectan solo después de aceptar su categoría; al rechazar no se pide nada a Google
 *   ni a Meta (CP-137). Retirar un consentimiento ya usado borra las cookies conocidas de esas etiquetas y recarga la
 *   página, para que dejen de correr.
 * Aplica en el navegador las mismas reglas que `@aptio/schema/cookies` (vigencia, versión y categorías nuevas): si
 * cambias una, cambia la otra. Los textos se ponen con `textContent`, nunca como HTML.
 */
import { CATEGORIA_ETIQUETA, CLAVE_COOKIES, type CookiesPublicadas, ETIQUETA_CATEGORIA, VIGENCIA_MESES } from '@aptio/schema/cookies';

export const ARCHIVO_COOKIES = '_cookies.js';
/** Lo publicado de la versión (`CookiesPublicadas`): lo lee quien sirve el sitio para armar la CSP de sus páginas. */
export const ARCHIVO_COOKIES_JSON = '_cookies.json';
export const ANCLA_COOKIES = '#cookies';

export const TEXTOS_COOKIES = {
  es: {
    aviso: 'Aviso de cookies', texto: 'Usamos cookies para medir visitas y mejorar el sitio. Las de {c} solo se activan si las aceptas (Ley 29733).', y: ' y ',
    privacidad: 'Política de privacidad', rechazar: 'Rechazar', configurar: 'Configurar', aceptar: 'Aceptar',
    titulo: 'Preferencias de cookies', intro: 'Elige qué cookies aceptas. Puedes cambiarlo cuando quieras desde «Configurar cookies», al pie de cada página.',
    siempre: 'Siempre activas', guardar: 'Guardar preferencias', cerrar: 'Cerrar', guardadas: 'Tus preferencias de cookies quedaron guardadas.',
    pie: 'Configurar cookies',
    desc: {
      necesarias: 'Hacen funcionar el sitio y recuerdan tu elección en este navegador. No se pueden desactivar.',
      analitica: 'Cuentan las visitas y las páginas que se ven, para mejorar el sitio.',
      publicidad: 'Miden los anuncios que te llevaron al sitio.',
    },
    categorias: ETIQUETA_CATEGORIA.es,
  },
  en: {
    aviso: 'Cookie notice', texto: 'We use cookies to measure visits and improve the site. {c} cookies only turn on if you accept them (Peru Law 29733).', y: ' and ',
    privacidad: 'Privacy policy', rechazar: 'Reject', configurar: 'Settings', aceptar: 'Accept',
    titulo: 'Cookie preferences', intro: 'Choose which cookies you accept. You can change it any time from “Cookie settings” at the bottom of each page.',
    siempre: 'Always on', guardar: 'Save preferences', cerrar: 'Close', guardadas: 'Your cookie preferences were saved.',
    pie: 'Cookie settings',
    desc: {
      necesarias: 'They make the site work and remember your choice in this browser. They cannot be turned off.',
      analitica: 'They count visits and the pages viewed, to improve the site.',
      publicidad: 'They measure the ads that brought you to the site.',
    },
    categorias: ETIQUETA_CATEGORIA.en,
  },
} as const;

/** Los atributos `data-*` del script con lo publicado (los IDs ya están validados en los ajustes). */
export function atributosCookies(c: CookiesPublicadas, privacidad: string | null): Record<string, string> {
  return {
    'data-version': String(c.version),
    ...(c.etiquetas.ga4 ? { 'data-ga4': c.etiquetas.ga4 } : {}),
    ...(c.etiquetas.gtm ? { 'data-gtm': c.etiquetas.gtm } : {}),
    ...(c.etiquetas.metaPixel ? { 'data-pixel': c.etiquetas.metaPixel } : {}),
    ...(privacidad ? { 'data-privacidad': privacidad } : {}),
  };
}

/** Estilos del aviso y el diálogo; el script los agrega solo si hace falta mostrarlos. Todo es fijo: no mueve la página. */
export const CSS_COOKIES = [
  '.ck-aviso{position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:67;max-width:760px;margin:0 auto;background:#fff;color:var(--ink);border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.25);padding:16px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;font-family:var(--f-body);font-size:16px;line-height:1.5}',
  '.ck-aviso p{flex:1 1 320px;margin:0}.ck-aviso a{color:var(--b700)}',
  '.ck-botones{display:flex;flex-wrap:wrap;gap:8px}',
  '.ck-b{min-height:44px;padding:10px 18px;border-radius:8px;border:1px solid var(--b700);background:#fff;color:var(--b700);font-family:var(--f-ui);font-size:16px;font-weight:700;cursor:pointer}',
  '.ck-b.ck-p{background:var(--b700);color:#fff}',
  '.ck-ovl{position:fixed;inset:0;z-index:72;background:rgba(15,23,42,.45)}',
  '.ck-dlg{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:73;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:var(--ink);border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.3);padding:24px;font-family:var(--f-body);font-size:16px;line-height:1.5}',
  '.ck-dlg h2{font-family:var(--f-ui);font-size:20px;line-height:1.3;margin:0 48px 8px 0}.ck-dlg>p{margin:0 0 16px;color:var(--muted)}',
  '.ck-x{position:absolute;right:12px;top:12px;width:44px;height:44px;border:0;background:none;color:var(--ink);font-size:22px;cursor:pointer;border-radius:8px}',
  '.ck-cat{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}',
  '.ck-cat h3{font-family:var(--f-ui);font-size:16px;margin:0}.ck-cat p{grid-column:1/-1;margin:0;font-size:14px;color:var(--muted)}',
  '.ck-sw{position:relative;width:52px;height:30px;border-radius:15px;border:2px solid #64748B;background:#fff;cursor:pointer;padding:0}',
  '.ck-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#64748B}',
  '.ck-sw[aria-checked=true]{background:var(--b700);border-color:var(--b700)}.ck-sw[aria-checked=true]::after{left:25px;background:#fff}',
  '.ck-sw[aria-disabled=true]{cursor:not-allowed;opacity:.75}',
  '.ck-fin{display:flex;justify-content:flex-end;margin-top:16px}',
  '.ck-oculto{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
  '.ck-aviso :focus-visible,.ck-dlg :focus-visible{outline:3px solid var(--b700);outline-offset:2px}',
  '@media (max-width:480px){.ck-aviso{left:8px;right:8px;bottom:8px;padding:14px 16px}.ck-botones{width:100%}.ck-b{flex:1 1 auto}}',
  '@media (prefers-reduced-motion:no-preference){.ck-aviso{animation:ck-in .2s ease-out}@keyframes ck-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}}',
].join('');

/** Las cookies que dejan GA4 y Meta Pixel; se borran al retirar el consentimiento. */
const COOKIES_ETIQUETAS = '/^(_ga|_ga_.+|_gid|_gat.*|_gcl_.+|_fbp|_fbc)$/';

/**
 * El script, sin dependencias. Lee del propio `<script>`: `data-version` (la de la política), `data-ga4`, `data-gtm`,
 * `data-pixel` y `data-privacidad` (la ruta de la política, si está publicada).
 */
export const SCRIPT_COOKIES = `(function(){try{
var c=document.currentScript;if(!c)return;var L=document.documentElement.lang==='en'?'en':'es',T=${JSON.stringify(TEXTOS_COOKIES)}[L];
var E={ga4:c.getAttribute('data-ga4')||'',gtm:c.getAttribute('data-gtm')||'',metaPixel:c.getAttribute('data-pixel')||''},V=parseInt(c.getAttribute('data-version')||'1',10)||1,PRIV=c.getAttribute('data-privacidad');
var CAT=${JSON.stringify(CATEGORIA_ETIQUETA)},K=${JSON.stringify(CLAVE_COOKIES)},MESES=${VIGENCIA_MESES},OPC=['analitica','publicidad'];
var OF=OPC.filter(function(k){for(var e in E)if(E[e]&&CAT[e]===k)return true;return false});if(!OF.length)return;
var ls=null;try{ls=window.localStorage;ls.getItem('x')}catch(e){ls=null}
var actual=null,cargadas={},aviso=null,dlg=null,ovl=null,previo=null,vivo=null,estilo=false;
function el(t,a,h){var x=document.createElement(t);if(a)for(var k in a){var v=a[k];if(v===null||v===undefined||v===false)continue;if(k==='text')x.textContent=v;else if(k.indexOf('on')===0)x.addEventListener(k.slice(2),v);else x.setAttribute(k,v===true?'':v)}if(h)for(var i=0;i<h.length;i++)if(h[i])x.appendChild(typeof h[i]==='string'?document.createTextNode(h[i]):h[i]);return x}
function css(){if(estilo)return;estilo=true;document.head.appendChild(el('style',{text:${JSON.stringify(CSS_COOKIES)}}))}
function leer(){if(!ls)return actual;try{var d=JSON.parse(ls.getItem(K)||'null');if(!d||d.necesarias!==true||typeof d.analitica!=='boolean'||typeof d.publicidad!=='boolean'||typeof d.fecha!=='string'||isNaN(Date.parse(d.fecha))||!(d.versionPolitica>=1))return null;
d.ofrecidas=Array.isArray(d.ofrecidas)?d.ofrecidas.filter(function(x){return OPC.indexOf(x)>=0}):[];return d}catch(e){return null}}
function vence(f){var v=new Date(f.getTime()),dia=v.getUTCDate();v.setUTCDate(1);v.setUTCMonth(v.getUTCMonth()+MESES);var u=new Date(Date.UTC(v.getUTCFullYear(),v.getUTCMonth()+1,0)).getUTCDate();v.setUTCDate(Math.min(dia,u));return v}
function vigente(d){if(!d)return false;if(vence(new Date(d.fecha)).getTime()<=Date.now())return false;if(d.versionPolitica!==V)return false;for(var i=0;i<OF.length;i++)if(d.ofrecidas.indexOf(OF[i])<0)return false;return true}
function guardar(el2){var d={necesarias:true,analitica:OF.indexOf('analitica')>=0&&el2.analitica===true,publicidad:OF.indexOf('publicidad')>=0&&el2.publicidad===true,fecha:new Date().toISOString(),versionPolitica:V,ofrecidas:OF.slice()};
actual=d;if(ls)try{ls.setItem(K,JSON.stringify(d))}catch(e){}return d}
function script(src){var s=document.createElement('script');s.async=true;s.src=src;document.head.appendChild(s)}
function cargar(d){if(!vigente(d))return;
if(E.ga4&&d.analitica&&!cargadas.ga4){cargadas.ga4=true;window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};window.gtag('js',new Date());window.gtag('config',E.ga4);script('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(E.ga4))}
if(E.gtm&&d.analitica&&!cargadas.gtm){cargadas.gtm=true;window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});script('https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(E.gtm))}
if(E.metaPixel&&d.publicidad&&!cargadas.metaPixel){cargadas.metaPixel=true;if(!window.fbq){var n=window.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!window._fbq)window._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[]}
window.fbq('init',E.metaPixel);window.fbq('track','PageView');script('https://connect.facebook.net/en_US/fbevents.js')}}
function borrarCookies(){var re=${COOKIES_ETIQUETAS},h=location.hostname.split('.');document.cookie.split(';').forEach(function(p){var n=p.split('=')[0].trim();if(!re.test(n))return;
for(var i=0;i<h.length;i++){var dom=h.slice(i).join('.');document.cookie=n+'=; Max-Age=0; path=/; domain='+dom;}document.cookie=n+'=; Max-Age=0; path=/'})}
function aplicar(d){var retira=(cargadas.ga4||cargadas.gtm)&&!d.analitica||cargadas.metaPixel&&!d.publicidad;if(retira){borrarCookies();location.reload();return}cargar(d)}
function anunciar(t){if(!vivo){vivo=el('p',{'class':'ck-oculto',role:'status'});document.body.appendChild(vivo)}vivo.textContent='';setTimeout(function(){vivo.textContent=t},50)}
function nombres(){var n=OF.map(function(k){return T.categorias[k].toLowerCase()});if(L==='en'){n=OF.map(function(k){return T.categorias[k]})}return n.join(T.y)}
function cerrarAviso(){if(aviso){aviso.remove();aviso=null}}
function decidir(eleccion){var d=guardar(eleccion);cerrarAviso();aplicar(d);anunciar(T.guardadas)}
function mostrarAviso(){if(aviso)return;css();var t=T.texto.replace('{c}',nombres());if(L==='en')t=t.charAt(0).toUpperCase()+t.slice(1);
var p=el('p',null,[t]);if(PRIV){p.appendChild(document.createTextNode(' '));p.appendChild(el('a',{href:PRIV,text:T.privacidad}))}
aviso=el('section',{'class':'ck-aviso','aria-label':T.aviso},[p,el('div',{'class':'ck-botones'},[
el('button',{type:'button','class':'ck-b',text:T.rechazar,onclick:function(){decidir({analitica:false,publicidad:false})}}),
el('button',{type:'button','class':'ck-b',text:T.configurar,onclick:function(){abrir(this)}}),
el('button',{type:'button','class':'ck-b ck-p',text:T.aceptar,onclick:function(){decidir({analitica:true,publicidad:true})}})])]);
document.body.insertBefore(aviso,document.body.firstChild)}
function enfocables(){return Array.prototype.slice.call(dlg.querySelectorAll('button:not([aria-disabled="true"]),a[href]'))}
function cerrar(){if(!dlg)return;dlg.remove();ovl.remove();dlg=null;ovl=null;document.removeEventListener('keydown',teclas,true);var v=previo;previo=null;if(v&&v.isConnected&&v.focus)v.focus();else{var pie=document.querySelector('a[href="${ANCLA_COOKIES}"]');if(pie)pie.focus()}}
function teclas(e){if(!dlg)return;if(e.key==='Escape'){e.preventDefault();cerrar();return}if(e.key!=='Tab')return;var f=enfocables();if(!f.length)return;var i=f.indexOf(document.activeElement);
if(e.shiftKey&&(i<=0)){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}
function interruptor(k,activo,fijo){var id='ck-t-'+k;return el('div',{'class':'ck-cat'},[el('h3',{id:id,text:T.categorias[k]}),
el('button',{type:'button',role:'switch','class':'ck-sw','aria-checked':activo?'true':'false','aria-labelledby':id,'aria-describedby':'ck-d-'+k,'aria-disabled':fijo?'true':null,'data-cat':k,
onclick:function(){if(fijo)return;this.setAttribute('aria-checked',this.getAttribute('aria-checked')==='true'?'false':'true')}}),
el('p',{id:'ck-d-'+k,text:(fijo?T.siempre+'. ':'')+T.desc[k]})])}
function abrir(desde){if(dlg)return;css();previo=desde||document.activeElement;var d=vigente(actual)?actual:null;
ovl=el('div',{'class':'ck-ovl',onclick:cerrar});
dlg=el('div',{'class':'ck-dlg',role:'dialog','aria-modal':'true','aria-labelledby':'ck-titulo','aria-describedby':'ck-intro'},[
el('h2',{id:'ck-titulo',text:T.titulo}),el('p',{id:'ck-intro',text:T.intro}),
el('button',{type:'button','class':'ck-x','aria-label':T.cerrar,text:'\\u00d7',onclick:cerrar}),
interruptor('necesarias',true,true)].concat(OF.map(function(k){return interruptor(k,!!(d&&d[k]),false)})).concat([
el('div',{'class':'ck-fin'},[el('button',{type:'button','class':'ck-b ck-p',text:T.guardar,onclick:function(){var e={};dlg.querySelectorAll('[data-cat]').forEach(function(s){e[s.getAttribute('data-cat')]=s.getAttribute('aria-checked')==='true'});cerrar();decidir(e)}})])]));
document.body.appendChild(ovl);document.body.appendChild(dlg);document.addEventListener('keydown',teclas,true);var s=dlg.querySelector('[data-cat="'+OF[0]+'"]');(s||dlg.querySelector('button')).focus()}
function iniciar(){actual=leer();if(vigente(actual))cargar(actual);else mostrarAviso();
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href="${ANCLA_COOKIES}"]'):null;if(!a)return;e.preventDefault();abrir(a)});
if(location.hash==='${ANCLA_COOKIES}')abrir(null)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
}catch(e){}})();`;
