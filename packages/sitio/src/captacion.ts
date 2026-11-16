/**
 * HU-1601 · Captación en el sitio pre-renderizado (REQ-074, RN-17-1): el formulario de contacto funciona sin JavaScript
 * (envío HTML normal a `POST {base}/_lead`, que redirige a la página de gracias) y un script propio y pequeño lo mejora:
 * recuerda la primera visita de la sesión (página de entrada, `utm_*` y referente externo) en `sessionStorage`, sin
 * cookies ni terceros, y la copia a los campos ocultos de cada formulario `data-captacion`.
 */
import { PARAMETROS_UTM } from '@aptio/schema/leads';

/** El script de captación dentro de la versión; se sirve en `{base}/_captacion.js`. */
export const ARCHIVO_CAPTACION = '_captacion.js';
/** Adónde envía el formulario, bajo la base del sitio. */
export const RUTA_LEAD = '_lead';
/** La página de confirmación tras el envío (`{base}/_gracias` y `{base}/en/_gracias`). */
export const RUTA_GRACIAS = '_gracias';
export const TIPO_FORMULARIO = 'formulario_contacto';
/** Los campos ocultos de atribución que llena el script. */
export const CAMPOS_ATRIBUCION = ['paginaEntrada', 'referente', ...PARAMETROS_UTM] as const;
export const CLAVE_SESION = 'aptio.captacion';

/**
 * El script, sin dependencias. `data-base` es la base del sitio (`/s` o vacío), que se quita de la página de entrada.
 * Si el navegador bloquea `sessionStorage`, no hace nada y el formulario se envía igual, sin UTM.
 */
export const SCRIPT_CAPTACION = `(function(){try{var c=document.currentScript,b=(c&&c.getAttribute('data-base'))||'',s=window.sessionStorage,k=${JSON.stringify(CLAVE_SESION)},g=s.getItem(k),v;
if(g){v=JSON.parse(g)}else{var p=location.pathname;if(b&&p.indexOf(b)===0)p=p.slice(b.length)||'/';v={paginaEntrada:p,referente:''};
try{if(document.referrer&&new URL(document.referrer).host!==location.host)v.referente=document.referrer.slice(0,500)}catch(e){}
var q=new URLSearchParams(location.search);${JSON.stringify(PARAMETROS_UTM)}.forEach(function(n){var x=q.get(n);if(x)v[n]=x.slice(0,150)});s.setItem(k,JSON.stringify(v))}
var f=document.querySelectorAll('form[data-captacion]');for(var i=0;i<f.length;i++){for(var n in v){var e=f[i].elements.namedItem(n);if(e&&typeof v[n]==='string')e.value=v[n]}}}catch(e){}})();
`;
