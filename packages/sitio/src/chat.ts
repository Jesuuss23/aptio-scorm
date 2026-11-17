/**
 * HU-1604 · El chatbot del sitio pre-renderizado (REQ-077, RN-17-4, CP-133, CP-134). Cada página carga un script propio
 * y pequeño (`{base}/_chat.js`, diferido, sin cookies ni terceros) que lee el chatbot en vivo (`{base}/_chatbot.json`):
 * si está oculto no hace nada. No aparece en el pago (`/pago*`).
 * - Un botón flotante fijo (no mueve la página: CLS 0) abre un diálogo modal (`role="dialog"`, `aria-modal`) que
 *   atrapa el foco, se cierra con Escape y devuelve el foco al botón; la conversación es un `role="log"` que anuncia
 *   cada mensaje nuevo.
 * - Las preguntas van a `POST /api/v1/publico/chat` (IA-20 con las fuentes del sitio, o «no lo sé» con los botones).
 * - «Agendar demo» y «Hablar con una persona» se resuelven en el navegador, sin IA: el primero muestra los 6 próximos
 *   horarios libres (`_agenda.json`) y reserva con `POST /api/v1/publico/citas` y vía «chatbot» (409: recarga los
 *   horarios); el segundo ofrece WhatsApp en el horario de atención y, a cualquier hora, dejar el correo y la pregunta
 *   (`POST /api/v1/publico/leads`, vía «chatbot»).
 * - La conversación (su id y los mensajes) vive en `sessionStorage`: sigue al cambiar de página y se pierde al cerrar
 *   la pestaña. Los textos se ponen con `textContent`, nunca como HTML. Las animaciones solo corren sin
 *   `prefers-reduced-motion`. `#chat` en la dirección («Probar en el sitio» del panel) abre el chat al cargar.
 */
import { LIMITES_CHAT, TEXTOS_CHAT } from '@aptio/schema/chatbot';
import { CAMPO_TRAMPA } from '@aptio/schema/leads';
import { PREFIJO_PAGO } from '@aptio/schema/popups';
import { CLAVE_SESION } from './captacion.js';
import { RUTA_CITAS_API } from './agenda.js';
import { RUTA_LEADS_API } from './popups.js';
import { TEXTOS } from './textos.js';

export const ARCHIVO_CHAT = '_chat.js';
export const ARCHIVO_CHATBOT_JSON = '_chatbot.json';
export const RUTA_CHAT_API = '/api/v1/publico/chat';
export const CLAVE_CHAT = 'aptio.chat';
export const ANCLA_CHAT = '#chat';

export const TEXTOS_CHAT_SITIO = {
  es: {
    abrir: 'Abrir el chat con', cerrar: 'Cerrar el chat', asistente: 'Asistente del sitio: responde con la información de Aptio', conversacion: 'Conversación', tu: 'Tú', rapidas: 'Respuestas rápidas',
    escribe: 'Escribe tu pregunta', enviar: 'Enviar', escribiendo: 'Escribiendo…', fuente: 'Fuente', agendar: 'Agendar demo', persona: 'Hablar con una persona',
    error: 'No pudimos responder ahora. Intenta de nuevo, agenda una demo o habla con una persona.', demasiados: 'Escribiste varios mensajes seguidos: espera un minuto e intenta de nuevo.',
    noDisponible: 'El chat no está disponible en este momento.', sinMensajes: 'Llegaste al límite de mensajes de esta conversación.', caracteres: 'caracteres como máximo',
    horarios: 'Elige un horario (hora de Lima):', cargando: 'Buscando horarios libres…', sinHorarios: 'No hay horarios libres en los próximos días. Te puede ayudar una persona del equipo.',
    nombre: 'Nombre', correo: 'Correo de trabajo', empresa: 'Empresa (opcional)', pregunta: 'Tu pregunta', consentimiento: TEXTOS.es.FORMULARIO.consentimiento, trampa: TEXTOS.es.FORMULARIO.trampa,
    confirmar: 'Confirmar demo', enviando: 'Enviando…', revisa: 'Revisa estos datos:', ocupada: 'Alguien acaba de tomar ese horario. Estos son los horarios actualizados:',
    listo: 'Tu demo está agendada:', invitacion: 'Te enviamos la invitación con el enlace de la videollamada a tu correo.', google: 'Añadir a Google Calendar', ics: 'Descargar .ics',
    whatsapp: 'Escribir por WhatsApp', pestana: '(se abre en una pestaña nueva)', dejarCorreo: 'Enviar mi pregunta', recibido: 'Listo: te escribiremos a ese correo.',
    recibidoFuera: 'Listo: te respondemos el siguiente día hábil a ese correo.', horarioAtencion: 'Atención de personas:', hora: 'hora de Lima',
    dias: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'], meses: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    ...TEXTOS_CHAT.es,
  },
  en: {
    abrir: 'Open the chat with', cerrar: 'Close the chat', asistente: "Site assistant: answers with Aptio's information", conversacion: 'Conversation', tu: 'You', rapidas: 'Quick replies',
    escribe: 'Type your question', enviar: 'Send', escribiendo: 'Typing…', fuente: 'Source', agendar: 'Book a demo', persona: 'Talk to a person',
    error: "We couldn't answer right now. Try again, book a demo or talk to a person.", demasiados: 'You sent several messages in a row: wait a minute and try again.',
    noDisponible: 'The chat is not available right now.', sinMensajes: "You've reached the message limit for this conversation.", caracteres: 'characters at most',
    horarios: 'Pick a time (Lima time):', cargando: 'Looking for free times…', sinHorarios: 'There are no free times in the coming days. Someone from the team can help you.',
    nombre: 'Name', correo: 'Work email', empresa: 'Company (optional)', pregunta: 'Your question', consentimiento: TEXTOS.en.FORMULARIO.consentimiento, trampa: TEXTOS.en.FORMULARIO.trampa,
    confirmar: 'Confirm demo', enviando: 'Sending…', revisa: 'Check these details:', ocupada: 'Someone just took that time. These are the updated times:',
    listo: 'Your demo is booked:', invitacion: 'We sent the invitation with the video call link to your email.', google: 'Add to Google Calendar', ics: 'Download .ics',
    whatsapp: 'Message us on WhatsApp', pestana: '(opens in a new tab)', dejarCorreo: 'Send my question', recibido: 'Done: we will write to that email.',
    recibidoFuera: "Done: we'll reply to that email on the next business day.", horarioAtencion: 'Human support:', hora: 'Lima time',
    dias: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], meses: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ...TEXTOS_CHAT.en,
  },
} as const;

/** Estilos del chat; el script los agrega una vez, solo si el chatbot está visible. Todo es fijo: no mueve la página. */
export const CSS_CHAT = [
  '.ch-abrir{position:fixed;right:20px;bottom:20px;z-index:45;width:56px;height:56px;border-radius:50%;border:0;background:var(--b700);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 10px 24px -10px rgba(11,28,48,.5)}',
  '.ch-abrir.ch-arriba{bottom:88px}',
  '.ch-ovl{position:fixed;inset:0;z-index:70;background:rgba(15,23,42,.35)}',
  '.ch-caja{position:fixed;right:16px;bottom:16px;z-index:71;width:min(400px,calc(100vw - 32px));height:min(620px,calc(100vh - 32px));display:flex;flex-direction:column;background:#fff;color:var(--ink);border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.3);font-family:var(--f-body);overflow:hidden}',
  '.ch-cab{display:flex;align-items:flex-start;gap:8px;padding:16px 8px 12px 16px;background:var(--b700);color:#fff}',
  '.ch-cab h2{font-family:var(--f-ui);font-size:18px;line-height:1.3;margin:0;color:#fff}.ch-cab p{margin:2px 0 0;font-size:14px;color:#fff}.ch-cab .sp{flex:1}',
  '.ch-x{width:44px;height:44px;border:0;background:none;color:#fff;font-size:20px;cursor:pointer;border-radius:8px;flex:none}',
  '.ch-log{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:var(--panel,#F8FAFC)}',
  '.ch-m{max-width:88%;padding:10px 14px;border-radius:14px;line-height:1.45;font-size:16px;white-space:pre-line;overflow-wrap:anywhere}',
  '.ch-bot{align-self:flex-start;background:#fff;border:1px solid var(--line)}.ch-yo{align-self:flex-end;background:var(--b700);color:#fff}',
  '.ch-m p{margin:0}.ch-m p+p,.ch-m p+div,.ch-m div+p{margin-top:8px}',
  '.ch-fuente{font-size:14px;color:var(--muted)}.ch-fuente a{color:var(--b700)}',
  '.ch-acc{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}',
  '.ch-acc button,.ch-acc a,.ch-rap button{min-height:44px;padding:8px 14px;border:1px solid var(--b700);border-radius:22px;background:#fff;color:var(--b700);font:inherit;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}',
  '.ch-rap{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 12px;background:var(--panel,#F8FAFC)}',
  '.ch-form{display:flex;gap:8px;padding:12px 16px 16px;border-top:1px solid var(--line);background:#fff}',
  '.ch-form input{flex:1;min-width:0;font:inherit;font-size:16px;border:1px solid #64748B;border-radius:8px;padding:10px 12px;min-height:44px}',
  '.ch-form .btn,.ch-mini .btn{min-height:44px;cursor:pointer}',
  '.ch-mini{display:grid;gap:10px;margin-top:8px}.ch-mini label{display:block;font-family:var(--f-ui);font-size:14px;font-weight:700;margin-bottom:4px}',
  '.ch-mini input[type=text],.ch-mini input[type=email],.ch-mini textarea{width:100%;font:inherit;font-size:16px;border:1px solid #64748B;border-radius:8px;padding:8px 10px;min-height:44px}',
  '.ch-ok{display:grid;grid-template-columns:24px minmax(0,1fr);gap:8px;align-items:start}.ch-ok input{width:24px;height:24px;margin:0;accent-color:var(--b700)}.ch-ok label{font-family:var(--f-body);font-weight:400;font-size:14px;color:var(--muted)}',
  '.ch-trampa{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}',
  '.ch-alerta{margin:0;padding:8px 12px;border-radius:8px;background:#FEF3C7;color:#78350F;font-size:14px}.ch-alerta ul{margin:4px 0 0;padding-left:18px}',
  '.ch-oculto{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
  '.ch-caja :focus-visible{outline:3px solid var(--b700);outline-offset:2px}.ch-cab :focus-visible,.ch-abrir:focus-visible{outline:3px solid #fff;outline-offset:-5px}',
  '@media (max-width:480px){.ch-caja{right:8px;left:8px;bottom:8px;width:auto;height:calc(100vh - 16px)}}',
  '@media (prefers-reduced-motion:no-preference){.ch-caja{animation:ch-in .2s ease-out}@keyframes ch-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}}',
].join('');

const ICONO = '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/></svg>';

/**
 * El script, sin dependencias. `data-base` es la base del sitio (`/s` o vacío). Aplica los límites de
 * `@aptio/schema/chatbot` (500 caracteres por mensaje); el resto lo decide la API.
 */
export const SCRIPT_CHAT = `(function(){try{
var c=document.currentScript,b=(c&&c.getAttribute('data-base'))||'',L=document.documentElement.lang==='en'?'en':'es',T=${JSON.stringify(TEXTOS_CHAT_SITIO)}[L];
var ruta=location.pathname;if(b&&ruta.indexOf(b)===0)ruta=ruta.slice(b.length)||'/';var pub=ruta;if(ruta==='/en'||ruta.indexOf('/en/')===0)ruta=ruta.slice(3)||'/';
if(ruta.indexOf(${JSON.stringify(PREFIJO_PAGO)})===0)return;
var K=${JSON.stringify(CLAVE_CHAT)},MAX=${LIMITES_CHAT.mensaje},ss=null;try{ss=window.sessionStorage;ss.getItem('x')}catch(e){ss=null}
var S={id:null,m:[]},B=null,boton=null,caja=null,ovl=null,log=null,entrada=null,enviarB=null,rap=null,abierto=false,ocupado=false,previo=null,registro=Promise.resolve();
function leer(){if(!ss)return;try{var d=JSON.parse(ss.getItem(K)||'null');if(d&&Array.isArray(d.m)){S.id=typeof d.id==='string'?d.id:null;S.m=d.m.slice(-60)}}catch(e){}}
function guardar(){if(!ss)return;try{ss.setItem(K,JSON.stringify({id:S.id,m:S.m.slice(-60)}))}catch(e){}}
function el(t,a,h){var e=document.createElement(t);if(a)for(var k in a){var v=a[k];if(v===null||v===undefined||v===false)continue;if(k==='text')e.textContent=v;else if(k.indexOf('on')===0)e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?'':v)}if(h)for(var i=0;i<h.length;i++)if(h[i])e.appendChild(typeof h[i]==='string'?document.createTextNode(h[i]):h[i]);return e}
function sesion(){try{return JSON.parse(sessionStorage.getItem(${JSON.stringify(CLAVE_SESION)})||'null')||{}}catch(e){return{}}}
function post(u,cuerpo){return fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cuerpo),credentials:'omit'}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){return{s:r.status,d:d}})})}
function abajo(){if(log)log.scrollTop=log.scrollHeight}
function burbuja(de,hijos){var m=el('div',{'class':'ch-m '+(de==='bot'?'ch-bot':'ch-yo')},[el('span',{'class':'ch-oculto',text:(de==='bot'?B.nombre:T.tu)+': '})].concat(hijos));log.appendChild(m);abajo();return m}
function textoBot(x){var h=[el('p',{text:x.t})];
if(x.f&&x.f.length)h.push(el('p',{'class':'ch-fuente'},[T.fuente+': '].concat(x.f.map(function(f,i){var a=f.ruta?el('a',{href:b+f.ruta,text:f.titulo}):el('span',{text:f.titulo});return i?[', ',a]:[a]}).reduce(function(p,q){return p.concat(q)},[]))));
if(x.a&&x.a.length)h.push(acciones(x.a));return h}
function pintarMensaje(x){burbuja(x.de,x.de==='bot'?textoBot(x):[el('p',{text:x.t})])}
function agregar(x){S.m.push(x);guardar();pintarMensaje(x)}
function acciones(lista){return el('div',{'class':'ch-acc'},lista.map(function(a){return el('button',{type:'button',text:a==='agendar_demo'?T.agendar:T.persona,onclick:function(){local(a,a==='agendar_demo'?T.agendar:T.persona)}})}))}
function quedan(n){if(n>0)return;entrada.disabled=true;enviarB.disabled=true;entrada.setAttribute('placeholder',T.sinMensajes)}
function registrar(accion){registro=post(${JSON.stringify(RUTA_CHAT_API)},{accion:accion,idioma:L,conversacionId:S.id}).then(function(r){if(r.s===200&&r.d.conversacionId){S.id=r.d.conversacionId;if(typeof r.d.enHorario==='boolean')B.enHorario=r.d.enHorario;guardar()}}).catch(function(){});return registro}
function preguntar(texto){texto=String(texto||'').replace(/\\s+/g,' ').trim();if(!texto||ocupado)return;if(texto.length>MAX)texto=texto.slice(0,MAX);
quitarRapidas();agregar({de:'yo',t:texto});ocupado=true;enviarB.disabled=true;log.setAttribute('aria-busy','true');var esp=burbuja('bot',[el('p',{text:T.escribiendo})]);
post(${JSON.stringify(RUTA_CHAT_API)},{mensaje:texto,idioma:L,conversacionId:S.id}).then(function(r){esp.remove();ocupado=false;enviarB.disabled=false;log.setAttribute('aria-busy','false');
if(r.s===200&&r.d.respuesta){S.id=r.d.conversacionId;var x=r.d.respuesta;agregar({de:'bot',t:x.texto,f:(x.fuentes||[]).map(function(f){return{titulo:f.titulo,ruta:f.ruta}}),a:x.acciones||[]});quedan(r.d.quedan);return}
if(r.s===429){agregar({de:'bot',t:T.demasiados});return}if(r.s===404){agregar({de:'bot',t:T.noDisponible});return}
agregar({de:'bot',t:T.error,a:['agendar_demo','hablar_persona']})}).catch(function(){esp.remove();ocupado=false;enviarB.disabled=false;log.setAttribute('aria-busy','false');agregar({de:'bot',t:T.error,a:['agendar_demo','hablar_persona']})})}
function local(accion,texto){quitarRapidas();agregar({de:'yo',t:texto});registrar(accion);if(accion==='agendar_demo')horarios(null);else persona()}
function dos(n){return(n<10?'0':'')+n}
function nombreFranja(x){var p=x.fecha.split('-'),d=(new Date(Date.UTC(+p[0],+p[1]-1,+p[2])).getUTCDay()+6)%7;return T.dias[d]+' '+(+p[2])+' '+T.meses[+p[1]-1]+' · '+x.hora}
function alerta(dentro,texto,lista){var v=dentro.querySelector('.ch-alerta');if(v)v.remove();var a=el('div',{'class':'ch-alerta',role:'alert'},[el('p',{text:texto})]);if(lista&&lista.length)a.appendChild(el('ul',null,lista.map(function(x){return el('li',{text:x})})));dentro.insertBefore(a,dentro.firstChild)}
var nf=0;
function campo(k,nombre,etq,tipo,attrs){var id='ch-'+nombre+'-'+k,i=el(tipo==='area'?'textarea':'input',Object.assign({id:id,name:nombre},tipo==='area'?{rows:'3'}:{type:tipo},attrs||{}));return el('p',null,[el('label',{'for':id,text:etq}),i])}
function consentimiento(k){return el('p',{'class':'ch-ok'},[el('input',{id:'ch-acepto-'+k,name:'consentimiento',type:'checkbox',required:true}),el('label',{'for':'ch-acepto-'+k,text:T.consentimiento})])}
function trampa(k){return el('p',{'class':'ch-trampa','aria-hidden':'true'},[el('label',{'for':'ch-web-'+k,text:T.trampa}),el('input',{id:'ch-web-'+k,name:${JSON.stringify(CAMPO_TRAMPA)},type:'text',tabindex:'-1',autocomplete:'off'})])}
function atribucion(cu){var s=sesion();for(var k in s)if(typeof s[k]==='string'&&!(k in cu))cu[k]=s[k];if(!cu.paginaEntrada)cu.paginaEntrada=pub;return cu}
function horarios(aviso){var m=burbuja('bot',[el('p',{text:aviso||T.cargando})]);
fetch(b+'/_agenda.json?idioma='+L,{credentials:'omit'}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){var f=(d.franjas||[]).slice(0,6);m.textContent='';m.appendChild(el('span',{'class':'ch-oculto',text:B.nombre+': '}));
if(!d.tipoId||!f.length){m.appendChild(el('p',{text:T.sinHorarios}));m.appendChild(acciones(['hablar_persona']));S.m.push({de:'bot',t:T.sinHorarios,a:['hablar_persona']});guardar();abajo();return}
m.appendChild(el('p',{text:aviso||T.horarios}));var g=el('div',{'class':'ch-acc',role:'group','aria-label':T.horarios},f.map(function(x){return el('button',{type:'button',text:nombreFranja(x),onclick:function(){g.querySelectorAll('button').forEach(function(y){y.setAttribute('aria-pressed',y===this?'true':'false')},this);formCita(m,d.tipoId,x)}})}));
g.querySelectorAll('button').forEach(function(y){y.setAttribute('aria-pressed','false')});m.appendChild(g);abajo();var p=g.querySelector('button');if(p)p.focus()}).catch(function(){m.textContent='';m.appendChild(el('p',{text:T.error}))})}
function formCita(m,tipoId,x){var v=m.querySelector('form');if(v)v.remove();var bt=el('button',{'class':'btn primary',type:'submit',text:T.confirmar+' · '+nombreFranja(x)});
var k=++nf,f=el('form',{'class':'ch-mini',novalidate:true},[campo(k,'nombre',T.nombre,'text',{required:true,maxlength:'120',autocomplete:'name'}),campo(k,'correo',T.correo,'email',{required:true,maxlength:'254',autocomplete:'email'}),campo(k,'empresa',T.empresa,'text',{maxlength:'160',autocomplete:'organization'}),trampa(k),consentimiento(k),bt]);
f.addEventListener('submit',function(e){e.preventDefault();if(bt.disabled)return;bt.disabled=true;bt.textContent=T.enviando;var q=function(n){var y=f.elements.namedItem(n);return y?y.value:''};
registro.then(function(){var cu=atribucion({via:'chatbot',conversacionId:S.id,tipoId:tipoId,inicio:x.inicio,nombre:q('nombre'),correo:q('correo'),empresa:q('empresa'),consentimiento:f.elements.namedItem('consentimiento').checked,idioma:L,paginaFormulario:pub});cu[${JSON.stringify(CAMPO_TRAMPA)}]=q(${JSON.stringify(CAMPO_TRAMPA)});return post(${JSON.stringify(RUTA_CITAS_API)},cu)}).then(function(r){
if(r.s===201&&r.d.cita){var ci=r.d.cita,t=T.listo+' '+ci.tipo+' · '+ci.texto+'. '+T.invitacion;f.remove();m.querySelectorAll('button').forEach(function(y){y.disabled=true});S.m.push({de:'bot',t:t});guardar();
var ok=burbuja('bot',[el('p',{text:t}),el('div',{'class':'ch-acc'},[el('a',{href:ci.google,target:'_blank',rel:'noopener','aria-label':T.google+' '+T.pestana,text:T.google}),el('a',{href:'data:text/calendar;charset=utf-8,'+encodeURIComponent(ci.ics),download:'demo.ics',text:T.ics})])]);ok.setAttribute('tabindex','-1');ok.focus();return}
if(r.s===201){f.remove();agregar({de:'bot',t:T.invitacion});return}
bt.disabled=false;bt.textContent=T.confirmar+' · '+nombreFranja(x);
if(r.s===409){f.remove();horarios(T.ocupada);return}
if(r.s===429){alerta(f,T.demasiados);return}alerta(f,T.revisa,(r.d.detalles||[]).map(function(d){return d.mensaje}));var a=f.querySelector('.ch-alerta');if(a){a.setAttribute('tabindex','-1');a.focus()}}).catch(function(){bt.disabled=false;alerta(f,T.error)})});
m.appendChild(f);abajo();f.elements.namedItem('nombre').focus()}
function persona(){var fuera=!B.enHorario,t=fuera?T.fueraDeHorario:(B.whatsapp?T.enHorario:T.sinWhatsapp),m=burbuja('bot',[el('p',{text:t}),el('p',{'class':'ch-fuente',text:T.horarioAtencion+' '+B.horario+' ('+T.hora+')'})]);
S.m.push({de:'bot',t:t});guardar();
if(!fuera&&B.whatsapp)m.appendChild(el('div',{'class':'ch-acc'},[el('a',{href:B.whatsapp,target:'_blank',rel:'noopener','aria-label':T.whatsapp+' '+T.pestana,text:T.whatsapp})]));
var bt=el('button',{'class':'btn primary',type:'submit',text:T.dejarCorreo});
var k=++nf,f=el('form',{'class':'ch-mini',novalidate:true},[campo(k,'correo',T.correo,'email',{required:true,maxlength:'254',autocomplete:'email'}),campo(k,'pregunta',T.pregunta,'area',{required:true,maxlength:String(MAX)}),trampa(k),consentimiento(k),bt]);
var ultima=S.m.filter(function(x){return x.de==='yo'&&x.t!==T.persona&&x.t!==T.agendar}).slice(-1)[0];if(ultima)f.elements.namedItem('pregunta').value=ultima.t;
f.addEventListener('submit',function(e){e.preventDefault();if(bt.disabled)return;bt.disabled=true;bt.textContent=T.enviando;var q=function(n){var y=f.elements.namedItem(n);return y?y.value:''};
registro.then(function(){var cu=atribucion({via:'chatbot',conversacionId:S.id,correo:q('correo'),mensaje:q('pregunta'),consentimiento:f.elements.namedItem('consentimiento').checked,idioma:L,paginaFormulario:pub});cu[${JSON.stringify(CAMPO_TRAMPA)}]=q(${JSON.stringify(CAMPO_TRAMPA)});return post(${JSON.stringify(RUTA_LEADS_API)},cu)}).then(function(r){
if(r.s===201){f.remove();var ok=burbuja('bot',[el('p',{text:fuera?T.recibidoFuera:T.recibido})]);S.m.push({de:'bot',t:fuera?T.recibidoFuera:T.recibido});guardar();ok.setAttribute('tabindex','-1');ok.focus();return}
bt.disabled=false;bt.textContent=T.dejarCorreo;if(r.s===429){alerta(f,T.demasiados);return}alerta(f,T.revisa,(r.d.detalles||[]).map(function(d){return d.mensaje}));var a=f.querySelector('.ch-alerta');if(a){a.setAttribute('tabindex','-1');a.focus()}}).catch(function(){bt.disabled=false;alerta(f,T.error)})});
m.appendChild(f);abajo();f.elements.namedItem('correo').focus()}
function quitarRapidas(){if(rap){rap.remove();rap=null}}
function rapidas(){if(!B.rapidas.length||S.m.some(function(x){return x.de==='yo'}))return null;
return el('div',{'class':'ch-rap',role:'group','aria-label':T.rapidas},B.rapidas.map(function(r){return el('button',{type:'button',text:r.texto,onclick:function(){if(r.accion==='consulta_ia')preguntar(r.texto);else local(r.accion,r.texto)}})}))}
function enfocables(){return Array.prototype.filter.call(caja.querySelectorAll('a[href],button,input:not([type=hidden]):not([tabindex="-1"]),textarea,[tabindex="0"]'),function(e){return !e.disabled&&e.offsetParent!==null})}
function tecla(e){if(!abierto)return;if(e.key==='Escape'){e.preventDefault();cerrar();return}
if(e.key==='Tab'){var q=enfocables();if(!q.length)return;var i=q.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();q[q.length-1].focus()}else if(!e.shiftKey&&(i===q.length-1||i<0)){e.preventDefault();q[0].focus()}}}
function construir(){var t=el('h2',{id:'ch-t',text:B.nombre});
log=el('div',{'class':'ch-log',role:'log','aria-live':'polite','aria-relevant':'additions','aria-label':T.conversacion,tabindex:'0'});
entrada=el('input',{id:'ch-q',type:'text',maxlength:String(MAX),autocomplete:'off','aria-describedby':'ch-lim'});
enviarB=el('button',{'class':'btn primary',type:'submit',text:T.enviar});
var f=el('form',{'class':'ch-form',onsubmit:function(e){e.preventDefault();var v=entrada.value;if(!v.trim())return;entrada.value='';preguntar(v)}},[el('label',{'for':'ch-q','class':'ch-oculto',text:T.escribe}),entrada,el('span',{id:'ch-lim','class':'ch-oculto',text:MAX+' '+T.caracteres}),enviarB]);
entrada.setAttribute('placeholder',T.escribe);
caja=el('div',{'class':'ch-caja',role:'dialog','aria-modal':'true','aria-labelledby':'ch-t','aria-describedby':'ch-d'},[el('div',{'class':'ch-cab'},[el('div',null,[t,el('p',{id:'ch-d',text:T.asistente})]),el('span',{'class':'sp'}),el('button',{'class':'ch-x',type:'button','aria-label':T.cerrar,text:'\\u2715',onclick:cerrar})]),log,null,f]);
burbuja('bot',[el('p',{text:B.saludo})]);S.m.forEach(pintarMensaje);rap=rapidas();if(rap)caja.insertBefore(rap,f)}
function abrir(){if(abierto)return;if(!caja)construir();previo=document.activeElement;ovl=el('div',{'class':'ch-ovl',onclick:cerrar});document.body.appendChild(ovl);document.body.appendChild(caja);abierto=true;boton.setAttribute('aria-expanded','true');
document.addEventListener('keydown',tecla,true);abajo();if(!entrada.disabled)entrada.focus();else caja.querySelector('.ch-x').focus()}
function cerrar(){if(!abierto)return;abierto=false;document.removeEventListener('keydown',tecla,true);caja.remove();if(ovl)ovl.remove();boton.setAttribute('aria-expanded','false');(boton||previo).focus()}
function iniciar(d){if(!d||d.visible!==true)return;B=d;B.rapidas=Array.isArray(B.rapidas)?B.rapidas:[];leer();
var s=document.createElement('style');s.id='ch-css';s.textContent=${JSON.stringify(CSS_CHAT)};document.head.appendChild(s);
boton=el('button',{type:'button','class':'ch-abrir'+(document.querySelector('a.whatsapp')?' ch-arriba':''),'aria-label':T.abrir+' '+B.nombre,'aria-haspopup':'dialog','aria-expanded':'false',onclick:abrir});boton.innerHTML=${JSON.stringify(ICONO)};
document.body.appendChild(boton);
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href="${ANCLA_CHAT}"]');if(a){e.preventDefault();abrir()}});
if(location.hash===${JSON.stringify(ANCLA_CHAT)})abrir()}
fetch(b+'/${ARCHIVO_CHATBOT_JSON}?idioma='+L,{credentials:'omit'}).then(function(r){return r.ok?r.json():null}).then(iniciar).catch(function(){});
}catch(e){}})();
`;
