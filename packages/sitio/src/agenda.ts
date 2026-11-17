/**
 * HU-1605 · El agendador del sitio pre-renderizado (REQ-078, RN-17-5, CP-135, CP-136). El bloque `agendador` deja un
 * contenedor de altura reservada (CLS 0) y un script propio, diferido y sin cookies (`{base}/_agenda.js`), que lee las
 * franjas libres en vivo (`{base}/_agenda.json`, hora de Lima) y reserva con `POST /api/v1/publico/citas`:
 * - calendario del mes como cuadrícula de botones: `aria-pressed`, un solo día en el orden de tabulación y flechas para
 *   moverse (los días sin horarios quedan deshabilitados);
 * - las franjas del día elegido, el formulario (nombre, correo, empresa, LMS y consentimiento, con el campo trampa) y la
 *   confirmación en `role="status"` con «Añadir a Google Calendar» y «Descargar .ics»;
 * - ante 409 FRANJA_OCUPADA avisa y vuelve a pedir los horarios.
 * Sin JavaScript, el `<noscript>` muestra el formulario de contacto y el enlace de WhatsApp. Los textos van con
 * `textContent`, nunca como HTML.
 */
import { LMS_AGENDA, LMS_AGENDA_EN, MESES } from '@aptio/schema/agenda';
import { CAMPO_TRAMPA } from '@aptio/schema/leads';
import { CLAVE_SESION } from './captacion.js';
import { TEXTOS } from './textos.js';

export const ARCHIVO_AGENDA = '_agenda.js';
export const ARCHIVO_AGENDA_JSON = '_agenda.json';
/** La página del enlace de cancelación (`{base}/_cita?t=…`) y su formulario. */
export const RUTA_CITA = '_cita';
/** La entrada JSON de reservas: en producción la CDN la envía a la API igual que `/s/*` (HU-1405). */
export const RUTA_CITAS_API = '/api/v1/publico/citas';

export const TEXTOS_AGENDA = {
  es: {
    etiqueta: 'Agendar demo', titulo: 'Elige día y hora', texto: 'Te mostramos el generador con un documento tuyo. Al final sabrás cuánto tardaría tu próxima cápsula.',
    puntos: ['Recorrido del generador con tu material', 'Revisión pantalla por pantalla', 'Exportación y prueba en tu LMS', 'Plan y costo para tu equipo'],
    cargando: 'Cargando los horarios disponibles…', zona: 'Hora de Lima', tipo: 'Tipo de reunión', minutos: 'min', anterior: 'Mes anterior', siguiente: 'Mes siguiente',
    dias: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], diasLargos: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'], meses: MESES.es,
    elegirDia: 'Elige un día disponible.', horariosDel: 'Horarios del', sinHorarios: 'No hay horarios libres en los próximos días. Escríbenos por WhatsApp o déjanos tus datos en el formulario de contacto.',
    nombre: 'Nombre', correo: 'Correo de trabajo', empresa: 'Empresa (opcional)', lms: 'LMS que usan (opcional)', lmsNinguno: 'Elige una opción', lmsOpciones: LMS_AGENDA.map((v) => [v, v]),
    consentimiento: TEXTOS.es.FORMULARIO.consentimiento, trampa: TEXTOS.es.FORMULARIO.trampa, confirmar: 'Confirmar demo del', alas: 'a las', enviando: 'Agendando…',
    listo: 'Tu demo está agendada', invitacion: 'Te enviamos la invitación con el enlace de la videollamada a tu correo, y recordatorios 24 horas y 1 hora antes.',
    google: 'Añadir a Google Calendar', ics: 'Descargar .ics', unirte: 'Enlace de la videollamada', otra: 'Agendar otra demo', pestana: '(se abre en una pestaña nueva)',
    ocupada: 'Alguien acaba de tomar ese horario. Te mostramos los horarios actualizados.', error: 'No pudimos agendar la demo. Revisa estos datos:', demasiados: 'Recibimos varias solicitudes seguidas: espera unos minutos e intenta de nuevo.',
    caido: 'No pudimos cargar los horarios. Recarga la página o escríbenos por WhatsApp.', sinJs: 'Para elegir día y hora necesitas JavaScript. Déjanos tus datos y te proponemos un horario.', whatsapp: 'Escríbenos por WhatsApp',
    seleccionado: 'elegido',
  },
  en: {
    etiqueta: 'Book a demo', titulo: 'Pick a day and time', texto: "We'll show you the generator with one of your documents. By the end you'll know how long your next capsule would take.",
    puntos: ['A tour of the generator with your material', 'Screen-by-screen review', 'Export and test in your LMS', 'Plan and cost for your team'],
    cargando: 'Loading available times…', zona: 'Lima time', tipo: 'Meeting type', minutos: 'min', anterior: 'Previous month', siguiente: 'Next month',
    dias: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], diasLargos: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], meses: MESES.en,
    elegirDia: 'Pick an available day.', horariosDel: 'Times on', sinHorarios: 'There are no free times in the coming days. Message us on WhatsApp or leave your details in the contact form.',
    nombre: 'Name', correo: 'Work email', empresa: 'Company (optional)', lms: 'LMS you use (optional)', lmsNinguno: 'Choose an option', lmsOpciones: LMS_AGENDA.map((v) => [v, LMS_AGENDA_EN[v]]),
    consentimiento: TEXTOS.en.FORMULARIO.consentimiento, trampa: TEXTOS.en.FORMULARIO.trampa, confirmar: 'Confirm demo on', alas: 'at', enviando: 'Booking…',
    listo: 'Your demo is booked', invitacion: 'We sent the invitation with the video call link to your email, plus reminders 24 hours and 1 hour before.',
    google: 'Add to Google Calendar', ics: 'Download .ics', unirte: 'Video call link', otra: 'Book another demo', pestana: '(opens in a new tab)',
    ocupada: 'Someone just took that time. Here are the updated times.', error: "We couldn't book the demo. Check these details:", demasiados: 'We received several requests in a row: wait a few minutes and try again.',
    caido: "We couldn't load the times. Reload the page or message us on WhatsApp.", sinJs: 'You need JavaScript to pick a day and time. Leave your details and we will propose a time.', whatsapp: 'Message us on WhatsApp',
    seleccionado: 'selected',
  },
} as const;

/** Estilos del bloque: van en la página que lo tiene. El contenedor reserva su alto para que nada se mueva al cargar. */
export const CSS_AGENDA = [
  '.book{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:48px;align-items:start}',
  '.book ul.puntos{margin:24px 0 0;padding-left:20px;display:grid;gap:8px;color:var(--muted)}',
  '.booker{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px;min-height:520px;display:grid;gap:16px;align-content:start}',
  '.ag-fila{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ag-fila .sp{flex:1}',
  '.ag-mes{font-family:var(--f-ui);font-size:16px;font-weight:700;margin:0}',
  '.ag-zona{font-size:14px;color:var(--muted)}',
  '@media (scripting:none){.ag-cargando{display:none}}',
  '.ag-nav{width:44px;height:44px;border:1px solid var(--line);background:#fff;border-radius:8px;font-size:18px;cursor:pointer;color:var(--ink)}',
  '.ag-nav:disabled{opacity:.4;cursor:default}',
  '.ag-dias{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}',
  '.ag-dias .h{text-align:center;font-family:var(--f-ui);font-size:12px;font-weight:700;color:var(--muted);padding:4px 0}',
  '.ag-dias button{min-height:44px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit;font-size:14px;color:var(--ink);cursor:pointer}',
  '.ag-dias button:disabled{background:transparent;border-color:transparent;color:#64748B;cursor:default;text-decoration:line-through}',
  '.ag-dias button[aria-pressed=true],.ag-horas button[aria-pressed=true]{background:var(--b700);border-color:var(--b700);color:#fff}',
  '.ag-horas{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}',
  '.ag-horas button{min-height:44px;min-width:76px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit;font-size:14px;color:var(--ink);cursor:pointer}',
  '.ag-tipo label,.ag-form label{display:block;font-family:var(--f-ui);font-size:14px;font-weight:700;margin-bottom:6px}',
  '.ag-tipo select,.ag-form select,.ag-form input[type=text],.ag-form input[type=email]{width:100%;font:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #64748B;border-radius:8px;padding:10px 12px;min-height:44px}',
  '.ag-form{display:grid;gap:12px}.ag-form p{margin:0}.ag-dos{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}',
  '.ag-ok{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:start}.ag-ok input{width:24px;height:24px;margin:0;accent-color:var(--b700)}.ag-ok label{font-family:var(--f-body);font-weight:400;color:var(--muted)}',
  '.ag-trampa{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}',
  '.ag-form .btn,.booker .btn{min-height:48px;cursor:pointer}',
  '.ag-msg{margin:0;padding:12px 16px;border-radius:8px;background:#FEF3C7;color:#78350F}.ag-msg ul{margin:8px 0 0;padding-left:20px}',
  '.ag-listo{display:grid;gap:12px}.ag-listo h3{font-family:var(--f-ui);font-size:20px;margin:0}.ag-listo p{margin:0}',
  '.ag-acciones{display:flex;flex-wrap:wrap;gap:8px}',
  '.booker :focus-visible{outline:3px solid var(--b700);outline-offset:2px}',
  '.booker .fcontacto{margin:0;padding:0;border:0;background:none}',
  '@media (max-width:860px){.book{grid-template-columns:minmax(0,1fr);gap:32px}.booker{padding:16px;min-height:560px}.ag-dos{grid-template-columns:minmax(0,1fr)}}',
].join('');

/**
 * El script, sin dependencias. Lee `data-base` del bloque y el idioma de la página; las franjas vienen en UTC con su
 * fecha y hora de Lima ya calculadas (`@aptio/schema/agenda`), así que el navegador no hace cuentas de zona horaria.
 */
export const SCRIPT_AGENDA = `(function(){try{
var raiz=document.querySelector('[data-agenda]');if(!raiz)return;
var b=raiz.getAttribute('data-base')||'',L=document.documentElement.lang==='en'?'en':'es',T=${JSON.stringify(TEXTOS_AGENDA)}[L],API=${JSON.stringify(RUTA_CITAS_API)};
var S={datos:null,tipo:null,mes:null,dia:null,hora:null,foco:null,aviso:null,listo:null,enviando:false};
function el(t,a,h){var e=document.createElement(t);if(a)for(var k in a){var v=a[k];if(v===null||v===undefined||v===false)continue;if(k==='text')e.textContent=v;else if(k.indexOf('on')===0)e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?'':v)}if(h)for(var i=0;i<h.length;i++)if(h[i])e.appendChild(typeof h[i]==='string'?document.createTextNode(h[i]):h[i]);return e}
function dos(n){return(n<10?'0':'')+n}
function sem(f){var p=f.split('-');return(new Date(Date.UTC(+p[0],+p[1]-1,+p[2])).getUTCDay()+6)%7}
function diasDe(){var m={};if(!S.datos)return m;S.datos.franjas.forEach(function(x){(m[x.fecha]=m[x.fecha]||[]).push(x)});return m}
function nombreDia(f){var p=f.split('-');return L==='en'?T.diasLargos[sem(f)]+', '+T.meses[+p[1]-1]+' '+(+p[2]):T.diasLargos[sem(f)]+' '+(+p[2])+' de '+T.meses[+p[1]-1]}
function cargar(tipo){return fetch(b+'/_agenda.json?idioma='+L+(tipo?'&tipo='+encodeURIComponent(tipo):''),{credentials:'omit'}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){S.datos=d;S.tipo=d.tipoId;var dd=diasDe(),k=Object.keys(dd).sort();if(S.dia&&!dd[S.dia]){S.dia=null;S.hora=null}if(S.hora&&!(dd[S.dia]||[]).some(function(x){return x.inicio===S.hora})){S.hora=null}S.mes=S.mes||(k[0]||d.hoy).slice(0,7);pintar()})}
function cambiarMes(n){var p=S.mes.split('-'),d=new Date(Date.UTC(+p[0],+p[1]-1+n,1));S.mes=d.getUTCFullYear()+'-'+dos(d.getUTCMonth()+1);S.foco=null;pintar();var x=raiz.querySelector('.ag-dias button[tabindex="0"]');if(x)x.focus()}
function elegirDia(f){S.dia=f;S.hora=null;S.foco=f;S.aviso=null;pintar();var x=raiz.querySelector('.ag-dias button[data-fecha="'+f+'"]');if(x)x.focus()}
function moverFoco(desde,paso){var dd=diasDe(),f=desde;for(var i=0;i<62;i++){var p=f.split('-'),d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]+paso));f=d.getUTCFullYear()+'-'+dos(d.getUTCMonth()+1)+'-'+dos(d.getUTCDate());if(f<S.datos.hoy||f>S.datos.horizonte)return;if(dd[f]){S.foco=f;S.mes=f.slice(0,7);pintar();var x=raiz.querySelector('.ag-dias button[data-fecha="'+f+'"]');if(x)x.focus();return}}}
function calendario(){var dd=diasDe(),p=S.mes.split('-'),a=+p[0],m=+p[1],n=new Date(Date.UTC(a,m,0)).getUTCDate(),pri=S.mes+'-01';
var disp=Object.keys(dd).filter(function(f){return f.slice(0,7)===S.mes}).sort(),tab=S.foco&&S.foco.slice(0,7)===S.mes&&dd[S.foco]?S.foco:(S.dia&&S.dia.slice(0,7)===S.mes?S.dia:disp[0]);
var g=el('div',{'class':'ag-dias',role:'group','aria-label':T.meses[m-1]+' '+a});T.dias.forEach(function(d){g.appendChild(el('span',{'class':'h','aria-hidden':'true',text:d}))});
for(var i=0;i<sem(pri);i++)g.appendChild(el('span',{'aria-hidden':'true'}));
for(var d=1;d<=n;d++){(function(f){var hay=!!dd[f];g.appendChild(el('button',{type:'button','data-fecha':f,disabled:!hay,'aria-pressed':S.dia===f?'true':'false','aria-label':nombreDia(f),tabindex:f===tab?'0':'-1',text:String(+f.slice(8)),onclick:function(){elegirDia(f)},onkeydown:function(e){var k={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(k){e.preventDefault();moverFoco(f,k)}}}))})(S.mes+'-'+dos(d))}
var ant=S.mes<=S.datos.hoy.slice(0,7),sig=S.mes>=S.datos.horizonte.slice(0,7);
return[el('div',{'class':'ag-fila'},[el('p',{'class':'ag-mes',text:T.meses[m-1].charAt(0).toUpperCase()+T.meses[m-1].slice(1)+' '+a}),el('span',{'class':'sp'}),el('span',{'class':'ag-zona',text:T.zona}),el('button',{type:'button','class':'ag-nav','aria-label':T.anterior,disabled:ant,onclick:function(){cambiarMes(-1)},text:'‹'}),el('button',{type:'button','class':'ag-nav','aria-label':T.siguiente,disabled:sig,onclick:function(){cambiarMes(1)},text:'›'})]),g]}
function horas(){var dd=diasDe(),l=dd[S.dia]||[];var id='ag-h-'+S.dia;return el('div',null,[el('p',{id:id,'class':'ag-mes',text:T.horariosDel+' '+nombreDia(S.dia)+' ('+T.zona.toLowerCase()+')'}),el('div',{'class':'ag-horas',role:'group','aria-labelledby':id},l.map(function(x){return el('button',{type:'button','aria-pressed':S.hora===x.inicio?'true':'false',text:x.hora,onclick:function(){S.hora=x.inicio;S.aviso=null;pintar();var f=raiz.querySelector('#ag-nombre');if(f)f.focus()}})}))])}
function formulario(){var f=(diasDe()[S.dia]||[]).filter(function(x){return x.inicio===S.hora})[0];if(!f)return null;
var lms=el('select',{id:'ag-lms',name:'lms'},[el('option',{value:'',text:T.lmsNinguno})].concat(T.lmsOpciones.map(function(o){return el('option',{value:o[0],text:o[1]})})));
var etiqueta=T.confirmar+' '+nombreDia(S.dia)+' '+T.alas+' '+f.hora;
return el('form',{'class':'ag-form',novalidate:true,onsubmit:enviar},[
el('div',{'class':'ag-dos'},[el('p',null,[el('label',{'for':'ag-nombre',text:T.nombre}),el('input',{id:'ag-nombre',name:'nombre',type:'text',required:true,maxlength:'120',autocomplete:'name'})]),el('p',null,[el('label',{'for':'ag-correo',text:T.correo}),el('input',{id:'ag-correo',name:'correo',type:'email',required:true,maxlength:'254',autocomplete:'email'})])]),
el('div',{'class':'ag-dos'},[el('p',null,[el('label',{'for':'ag-empresa',text:T.empresa}),el('input',{id:'ag-empresa',name:'empresa',type:'text',maxlength:'160',autocomplete:'organization'})]),el('p',null,[el('label',{'for':'ag-lms',text:T.lms}),lms])]),
el('p',{'class':'ag-trampa','aria-hidden':'true'},[el('label',{'for':'ag-web',text:T.trampa}),el('input',{id:'ag-web',name:${JSON.stringify(CAMPO_TRAMPA)},type:'text',tabindex:'-1',autocomplete:'off'})]),
el('p',{'class':'ag-ok'},[el('input',{id:'ag-acepto',name:'consentimiento',type:'checkbox',required:true}),el('label',{'for':'ag-acepto',text:T.consentimiento})]),
el('button',{'class':'btn primary',type:'submit',text:etiqueta})])}
function aviso(){if(!S.aviso)return null;var a=el('div',{'class':'ag-msg',role:'alert',tabindex:'-1'},[el('p',{text:S.aviso.texto})]);if(S.aviso.lista&&S.aviso.lista.length)a.appendChild(el('ul',null,S.aviso.lista.map(function(x){return el('li',{text:x})})));return a}
function listo(){var c=S.listo;var ics='data:text/calendar;charset=utf-8,'+encodeURIComponent(c.ics);
return el('div',{'class':'ag-listo',role:'status'},[el('h3',{tabindex:'-1',text:T.listo}),el('p',{text:c.tipo+' · '+c.texto}),el('p',{text:T.invitacion}),
el('p',null,[T.unirte+': ',el('a',{href:c.enlace,target:'_blank',rel:'noopener',text:c.enlace,'aria-label':c.enlace+' '+T.pestana})]),
el('div',{'class':'ag-acciones'},[el('a',{'class':'btn',href:c.google,target:'_blank',rel:'noopener','aria-label':T.google+' '+T.pestana,text:T.google}),el('a',{'class':'btn',href:ics,download:'demo.ics',text:T.ics}),el('button',{type:'button','class':'btn',text:T.otra,onclick:function(){S.listo=null;S.dia=null;S.hora=null;cargar(S.tipo)}})])])}
function sesion(){try{return JSON.parse(sessionStorage.getItem(${JSON.stringify(CLAVE_SESION)})||'null')||{}}catch(e){return{}}}
function enviar(e){e.preventDefault();if(S.enviando)return;var f=e.target,v=function(n){var x=f.elements.namedItem(n);return x?x.value:''};
var cuerpo={tipoId:S.tipo,inicio:S.hora,nombre:v('nombre'),correo:v('correo'),empresa:v('empresa'),lms:v('lms'),consentimiento:f.elements.namedItem('consentimiento').checked,idioma:L,paginaFormulario:location.pathname,website:v(${JSON.stringify(CAMPO_TRAMPA)})};
var s=sesion();for(var k in s)if(typeof s[k]==='string'&&!(k in cuerpo))cuerpo[k]=s[k];
S.enviando=true;var bt=f.querySelector('button[type=submit]');bt.disabled=true;bt.textContent=T.enviando;
fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cuerpo),credentials:'omit'}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){return{s:r.status,d:d}})}).then(function(r){S.enviando=false;
if(r.s===201&&r.d.cita){S.listo=r.d.cita;S.aviso=null;pintar();var h=raiz.querySelector('.ag-listo h3');if(h)h.focus();return}
if(r.s===201){S.listo=null;S.aviso={texto:T.invitacion};pintar();return}
if(r.s===409){S.aviso={texto:T.ocupada};S.hora=null;return cargar(S.tipo).then(foco)}
S.aviso=r.s===429?{texto:T.demasiados}:{texto:T.error,lista:(r.d.detalles||[]).map(function(x){return x.mensaje})};
var datos={};['nombre','correo','empresa','lms'].forEach(function(n){datos[n]=v(n)});var ok=f.elements.namedItem('consentimiento').checked;pintar();
var nf=raiz.querySelector('form');if(nf){for(var n in datos){var x=nf.elements.namedItem(n);if(x)x.value=datos[n]}nf.elements.namedItem('consentimiento').checked=ok}foco()}).catch(function(){S.enviando=false;S.aviso={texto:T.caido};pintar();foco()})}
function foco(){var a=raiz.querySelector('.ag-msg');if(a)a.focus()}
function pintar(){var hijos=[];if(S.listo){hijos.push(listo())}else if(!S.datos||!S.datos.tipos.length||!S.datos.franjas.length&&S.datos.tipos.length<2){hijos.push(aviso());hijos.push(el('p',{text:T.sinHorarios}))}else{
if(S.datos.tipos.length>1){var sel=el('select',{id:'ag-tipo',onchange:function(e){S.dia=null;S.hora=null;S.mes=null;cargar(e.target.value)}},S.datos.tipos.map(function(t){return el('option',{value:t.id,selected:t.id===S.tipo,text:t.nombre+' · '+t.minutos+' '+T.minutos})}));hijos.push(el('p',{'class':'ag-tipo'},[el('label',{'for':'ag-tipo',text:T.tipo}),sel]))}
else if(S.datos.tipos[0]){hijos.push(el('p',{'class':'ag-zona',text:S.datos.tipos[0].nombre+' · '+S.datos.tipos[0].minutos+' '+T.minutos}))}
hijos.push(aviso());if(!S.datos.franjas.length){hijos.push(el('p',{text:T.sinHorarios}))}else{hijos=hijos.concat(calendario());hijos.push(S.dia?horas():el('p',{'class':'ag-zona',text:T.elegirDia}));if(S.dia&&S.hora)hijos.push(formulario())}}
raiz.textContent='';hijos.forEach(function(h){if(h)raiz.appendChild(h)});raiz.setAttribute('aria-busy','false')}
cargar(null).catch(function(){S.aviso={texto:T.caido};raiz.textContent='';raiz.appendChild(aviso())});
}catch(e){}})();
`;
