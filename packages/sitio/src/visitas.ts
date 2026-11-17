/**
 * HU-1607 · Visitas anónimas del sitio (REQ-080, PNT-24). Un script propio, diferido y mínimo, en todas las páginas
 * publicadas: manda una sola vez por página `POST {base}/_visita` con la ruta (sin la base, la consulta ni el ancla), el
 * idioma, si es la primera página de la sesión del navegador (marca en `sessionStorage`) y el origen atribuido
 * (`utm_source` de la primera visita, que guarda el script de captación, o de la dirección). Sin cookies, sin
 * identificadores y sin tocar la página (CLS 0). Si `sessionStorage` está bloqueado, cada página cuenta como primera.
 */
import { CLAVE_SESION } from './captacion.js';

/** El script dentro de la versión; se sirve en `{base}/_visita.js`. */
export const ARCHIVO_VISITA = '_visita.js';
/** Adónde manda la visita, bajo la base del sitio. */
export const RUTA_VISITA = '_visita';
/** La marca de la sesión: si existe, la página no es la primera. */
export const CLAVE_VISITA = 'aptio.visita';

export const SCRIPT_VISITA = `(function(){try{var c=document.currentScript,b=(c&&c.getAttribute('data-base'))||'',p=location.pathname,l=document.documentElement.lang==='en'?'en':'es',s=null,primera=true,o=null;
if(b&&p.indexOf(b)===0)p=p.slice(b.length)||'/';
try{s=window.sessionStorage;primera=!s.getItem(${JSON.stringify(CLAVE_VISITA)});s.setItem(${JSON.stringify(CLAVE_VISITA)},'1')}catch(e){primera=true}
try{var g=s&&s.getItem(${JSON.stringify(CLAVE_SESION)});if(g)o=JSON.parse(g).utm_source||null}catch(e){}
if(!o)o=new URLSearchParams(location.search).get('utm_source');
var d=JSON.stringify({ruta:p,idioma:l,primeraPagina:primera,origen:o?String(o).slice(0,60):null}),u=b+'/${RUTA_VISITA}';
if(navigator.sendBeacon&&navigator.sendBeacon(u,new Blob([d],{type:'application/json'})))return;
fetch(u,{method:'POST',body:d,headers:{'Content-Type':'application/json'},credentials:'same-origin',keepalive:true}).catch(function(){})}catch(e){}})();
`;
