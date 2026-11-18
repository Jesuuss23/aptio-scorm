/**
 * HU-1703 · El pago de una suscripción en el sitio pre-renderizado (REQ-083, CP-143, RN-18-2): una página estática
 * `/pago?plan={slug}` (y `/en/pago`), sin indexar, sin popups ni chat, con un contenedor de altura reservada (CLS 0) y
 * un script propio, diferido y sin cookies (`{base}/_checkout.js`) que guía en tres pasos:
 * 1. Empresa: razón social, RUC opcional (con el dígito verificador de SUNAT: con RUC, factura; sin RUC, boleta),
 *    HU-1712: el DNI para la boleta (8 dígitos; obligatorio si el total supera S/ 700 o US$ 200: se avisa al pagar),
 *    administrador, correo y consentimiento;
 * 2. Resumen: mensual o anual (si la página lo ofrece), subtotal, IGV de 18 % y total, con el precio del plan publicado;
 *    HU-1709: el «Código de cupón» con «Aplicar» (vista previa en `POST …/checkout/cupon`, mensaje en `role="status"`) y
 *    la fila del descuento; con un rechazo, el motivo y el total sin cambios (CP-151);
 * 3. Pago: la pasarela de pruebas (solo en el entorno de pruebas), la página alojada de la pasarela (Stripe Checkout,
 *    HU-1704) o su formulario incrustado (Culqi Checkout); la tarjeta nunca pasa por Aptio SCORM (PCI SAQ A). Si no hay
 *    pasarela, el aviso con «Agendar demo»;
 * y la confirmación en `role="status"`. HU-1704: si el plan se cobra en dólares (precio en USD y una pasarela que cobre
 * en dólares), el paso 2 ofrece la moneda. Al volver de la página alojada (`?checkout={id}`), espera la confirmación. El precio y la validación finales los pone la API (`POST /api/v1/publico/checkout`).
 * Sin JavaScript, el `<noscript>` lleva a agendar una demo. Los textos van con `textContent`, nunca como HTML.
 */
import { UMBRAL_DNI_BOLETA } from '@aptio/schema/comprobantes';
import { CLAVE_SESION } from './captacion.js';

export const ARCHIVO_CHECKOUT = '_checkout.js';
/** La ruta de la página (los popups y el chat nunca salen ahí, RN-17-3). */
export const RUTA_PAGO_SITIO = '/pago';
export const RUTA_CHECKOUT_API = '/api/v1/publico/checkout';
export const RUTA_PLANES_API = '/api/v1/publico/planes';
/** HU-1704 · El script de Culqi Checkout (se carga solo al elegir pagar con Culqi; origen permitido en la CSP de `/pago`, SUP-294). */
export const SCRIPT_CULQI = 'https://checkout.culqi.com/js/v4';

export const TEXTOS_PAGO = {
  es: {
    titulo: 'Suscríbete a Aptio SCORM', descripcion: 'Contrata tu plan en tres pasos: los datos de tu empresa, el resumen con IGV y el pago.',
    cargando: 'Cargando el plan…', sinJs: 'Para pagar en línea necesitas JavaScript. Agenda una demo y te ayudamos a suscribirte.', agendar: 'Agendar una demo', precios: 'Ver los planes',
    pasos: ['Empresa', 'Resumen', 'Pago'], paso: 'Paso', de: 'de', planElegido: 'Plan elegido',
    noPlan: 'Este plan no se puede contratar en línea. Elige otro plan o agenda una demo y te ayudamos.', caido: 'No pudimos cargar el plan. Recarga la página o agenda una demo.',
    empresa: 'Datos de la empresa', razonSocial: 'Razón social o nombre', ruc: 'RUC (opcional)', rucAyuda: 'Con RUC emitimos factura; sin RUC, boleta de venta.',
    dni: 'DNI (para la boleta)', dniAyuda: 'Sin RUC, las boletas de más de S/ 700 llevan tu DNI de 8 dígitos.', eDni: 'El DNI tiene 8 dígitos', eDniFalta: 'Las boletas de más de S/ 700 necesitan el DNI del comprador',
    nombreAdmin: 'Nombre de quien administrará la cuenta', correoAdmin: 'Correo de quien administrará la cuenta', correoAyuda: 'Ahí llega el enlace para crear la clave.',
    consentimiento: 'Acepto los términos del servicio y el tratamiento de mis datos personales para crear y administrar la cuenta (Ley 29733).',
    continuar: 'Continuar', volver: 'Volver', revisa: 'Revisa estos datos:',
    eRazon: 'Escribe la razón social o tu nombre', eRuc11: 'El RUC tiene 11 dígitos', eRuc: 'Revisa el RUC: el dígito verificador no coincide', eNombre: 'Escribe el nombre de quien administrará la cuenta',
    eCorreo: 'Escribe un correo válido, por ejemplo nombre@empresa.com', eOk: 'Acepta los términos y el tratamiento de tus datos personales para continuar',
    resumen: 'Resumen de tu suscripción', ciclo: 'Ciclo de pago', mensual: 'Mensual', anual: 'Anual', alMes: 'al mes', alAnio: 'al año', ahorras: 'ahorras',
    subtotal: 'Subtotal', igv: 'IGV (18 %)', total: 'Total a pagar', comprobante: 'Comprobante', factura: 'Factura con RUC', boleta: 'Boleta de venta', aPagar: 'Continuar al pago', enviando: 'Preparando el pago…',
    pago: 'Pago', pruebas: 'Pasarela de pruebas: no se cobra nada. Usa 4111 1111 1111 1111 para aprobar o 4000 0000 0000 0002 para rechazar.',
    tarjeta: 'Número de tarjeta', pagar: 'Pagar', pagando: 'Procesando el pago…', eTarjeta: 'Escribe el número de la tarjeta',
    noDisponible: 'El pago en línea todavía no está disponible. Agenda una demo y te ayudamos a suscribirte.', enUso: 'Ese correo ya tiene una cuenta: inicia sesión en la plataforma o usa otro correo.',
    demasiados: 'Recibimos varias solicitudes seguidas: espera unos minutos e intenta de nuevo.', fallo: 'No pudimos procesar el pago. Intenta de nuevo en unos minutos.',
    rechazado: 'El pago fue rechazado', reintentarTexto: 'Revisa el resumen y vuelve a intentarlo.', esperando: 'Esperando la confirmación de la pasarela…',
    listo: 'Tu suscripción está activa', correoEnviado: 'Te enviamos un correo a {correo} con el enlace para crear tu clave (vale 72 horas).', hasta: 'Pagado hasta', inicio: 'Volver al inicio',
    moneda: 'Moneda', soles: 'Soles (S/)', dolares: 'Dólares (US$)', pagarCon: 'Pagar con',
    redireccion: 'Te llevaremos a la página segura de {p} para pagar. Tu tarjeta no pasa por Aptio SCORM.', formulario: 'Escribirás tu tarjeta en la ventana segura de {p}. Tu tarjeta no pasa por Aptio SCORM.',
    cancelado: 'Cancelaste el pago. Puedes intentarlo de nuevo cuando quieras.', abriendo: 'Abriendo la ventana de pago…',
    cupon: 'Código de cupón (opcional)', cuponAyuda: 'Si tienes un cupón o un convenio, escríbelo y pulsa Aplicar.', aplicar: 'Aplicar', aplicando: 'Aplicando…', quitar: 'Quitar el cupón',
    descuento: 'Descuento {c} (−{p} %)', cuponOk: 'Cupón {c} aplicado: −{p} % {d}.', cuponQuitado: 'Quitaste el cupón: el total vuelve al precio del plan.', eCupon: 'Escribe el código del cupón',
    ciclos1: 'en el primer pago', ciclosN: 'en los primeros {n} pagos', permanente: 'en cada pago',
    motivos: {
      CUPON_NO_EXISTE: 'Ese cupón no existe: revisa el código.', CUPON_INACTIVO: 'Este cupón ya no está disponible.', CUPON_NO_VIGENTE: 'Este cupón vale desde el {f}.',
      CUPON_VENCIDO: 'Este cupón venció el {f}.', CUPON_AGOTADO: 'Este cupón ya se usó todas las veces permitidas.', CUPON_NO_APLICA_PLAN: 'Este cupón no aplica al plan elegido.',
      CUPON_CORREO_CONVENIO: 'Este convenio es para correos institucionales: vuelve al paso 1 y usa el tuyo como correo del administrador.', CUPON_YA_USADO: 'Tu empresa ya usó este cupón.',
      CUPON_SIN_COBRO: 'Con este cupón no queda nada por pagar en línea: agenda una demo y activamos tu cuenta.',
    },
    sinCambio: 'El total no cambia.',
  },
  en: {
    titulo: 'Subscribe to Aptio SCORM', descripcion: 'Get your plan in three steps: your company details, the summary with IGV tax, and the payment.',
    cargando: 'Loading the plan…', sinJs: 'You need JavaScript to pay online. Book a demo and we will help you subscribe.', agendar: 'Book a demo', precios: 'See the plans',
    pasos: ['Company', 'Summary', 'Payment'], paso: 'Step', de: 'of', planElegido: 'Chosen plan',
    noPlan: "This plan can't be bought online. Choose another plan or book a demo and we'll help you.", caido: "We couldn't load the plan. Reload the page or book a demo.",
    empresa: 'Company details', razonSocial: 'Legal name or your name', ruc: 'RUC tax ID (optional)', rucAyuda: 'With a RUC we issue an invoice (factura); without it, a receipt (boleta).',
    dni: 'DNI (for the receipt)', dniAyuda: 'Without a RUC, receipts over S/ 700 carry your 8-digit DNI.', eDni: 'The DNI has 8 digits', eDniFalta: 'Receipts over S/ 700 need the buyer’s DNI',
    nombreAdmin: 'Name of the account administrator', correoAdmin: 'Email of the account administrator', correoAyuda: 'The link to create the password goes there.',
    consentimiento: 'I accept the terms of service and the processing of my personal data to create and manage the account (Peruvian Law 29733).',
    continuar: 'Continue', volver: 'Back', revisa: 'Check these details:',
    eRazon: 'Enter the legal name or your name', eRuc11: 'The RUC has 11 digits', eRuc: 'Check the RUC: the check digit does not match', eNombre: 'Enter the name of the account administrator',
    eCorreo: 'Enter a valid email, for example name@company.com', eOk: 'Accept the terms and the processing of your personal data to continue',
    resumen: 'Subscription summary', ciclo: 'Billing cycle', mensual: 'Monthly', anual: 'Yearly', alMes: 'per month', alAnio: 'per year', ahorras: 'you save',
    subtotal: 'Subtotal', igv: 'IGV tax (18 %)', total: 'Total to pay', comprobante: 'Receipt', factura: 'Invoice with RUC', boleta: 'Sales receipt', aPagar: 'Continue to payment', enviando: 'Preparing the payment…',
    pago: 'Payment', pruebas: 'Test gateway: nothing is charged. Use 4111 1111 1111 1111 to approve or 4000 0000 0000 0002 to decline.',
    tarjeta: 'Card number', pagar: 'Pay', pagando: 'Processing the payment…', eTarjeta: 'Enter the card number',
    noDisponible: "Online payment isn't available yet. Book a demo and we'll help you subscribe.", enUso: 'That email already has an account: sign in to the platform or use another email.',
    demasiados: 'We received several requests in a row: wait a few minutes and try again.', fallo: "We couldn't process the payment. Try again in a few minutes.",
    rechazado: 'The payment was declined', reintentarTexto: 'Check the summary and try again.', esperando: 'Waiting for the gateway confirmation…',
    listo: 'Your subscription is active', correoEnviado: 'We emailed {correo} with the link to create your password (valid for 72 hours).', hasta: 'Paid until', inicio: 'Back to home',
    moneda: 'Currency', soles: 'Peruvian soles (S/)', dolares: 'US dollars (US$)', pagarCon: 'Pay with',
    redireccion: "We'll take you to {p}'s secure page to pay. Your card never goes through Aptio SCORM.", formulario: "You'll enter your card in {p}'s secure window. Your card never goes through Aptio SCORM.",
    cancelado: 'You cancelled the payment. You can try again whenever you want.', abriendo: 'Opening the payment window…',
    cupon: 'Coupon code (optional)', cuponAyuda: 'If you have a coupon or an agreement code, enter it and press Apply.', aplicar: 'Apply', aplicando: 'Applying…', quitar: 'Remove the coupon',
    descuento: 'Discount {c} (−{p} %)', cuponOk: 'Coupon {c} applied: −{p} % {d}.', cuponQuitado: 'You removed the coupon: the total goes back to the plan price.', eCupon: 'Enter the coupon code',
    ciclos1: 'on the first payment', ciclosN: 'on the first {n} payments', permanente: 'on every payment',
    motivos: {
      CUPON_NO_EXISTE: "That coupon doesn't exist: check the code.", CUPON_INACTIVO: 'This coupon is no longer available.', CUPON_NO_VIGENTE: 'This coupon is valid from {f}.',
      CUPON_VENCIDO: 'This coupon expired on {f}.', CUPON_AGOTADO: 'This coupon has reached its usage limit.', CUPON_NO_APLICA_PLAN: "This coupon doesn't apply to the chosen plan.",
      CUPON_CORREO_CONVENIO: 'This agreement is for institutional emails: go back to step 1 and use yours as the administrator email.', CUPON_YA_USADO: 'Your company already used this coupon.',
      CUPON_SIN_COBRO: 'With this coupon there is nothing left to pay online: book a demo and we will activate your account.',
    },
    sinCambio: 'The total stays the same.',
  },
} as const;

/** Estilos de la página. El contenedor reserva su alto para que el pie no se mueva al cargar (CLS 0). */
export const CSS_PAGO = [
  '.pago{max-width:720px;margin:0 auto}',
  '.pg{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px;min-height:860px;display:grid;gap:20px;align-content:start}',
  '@media (scripting:none){.pg-cargando{display:none}}',
  '.pg-pasos{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;counter-reset:paso}',
  '.pg-pasos li{counter-increment:paso;font-family:var(--f-ui);font-size:14px;font-weight:700;color:var(--muted);border-top:4px solid var(--line);padding-top:8px}',
  '.pg-pasos li::before{content:counter(paso) ". "}',
  '.pg-pasos li[aria-current=step]{color:var(--b700);border-color:var(--b700)}.pg-pasos li.hecho{color:var(--ink);border-color:var(--b200)}',
  '.pg h2{font-family:var(--f-ui);font-size:20px;line-height:1.3;margin:0}.pg h2:focus{outline:none}',
  '.pg-plan{margin:0;color:var(--muted)}',
  '.pg form{display:grid;gap:16px}.pg form p{margin:0}',
  '.pg label,.pg legend{display:block;font-family:var(--f-ui);font-size:14px;font-weight:700;margin-bottom:6px;color:var(--ink)}',
  '.pg input[type=text],.pg input[type=email]{width:100%;box-sizing:border-box;font:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #64748B;border-radius:8px;padding:10px 12px;min-height:44px}',
  '.pg input[aria-invalid=true]{border-color:#B91C1C;border-width:2px}',
  '.pg-ayuda{display:block;font-size:14px;color:var(--muted);margin-top:4px}.pg-error{display:block;font-size:14px;color:#B91C1C;font-weight:700;margin-top:4px}',
  '.pg-ok{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:start}.pg-ok input{width:24px;height:24px;margin:0;accent-color:var(--b700)}.pg-ok label{font-family:var(--f-body);font-weight:400;color:var(--muted);margin:0}',
  '.pg fieldset{border:0;margin:0;padding:0;display:grid;gap:8px}',
  '.pg-ciclo{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:12px;min-height:44px}',
  '.pg-ciclo input{width:20px;height:20px;margin:0;accent-color:var(--b700)}.pg-ciclo label{margin:0;font-weight:400;font-family:var(--f-body);font-size:16px}',
  '.pg dl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;margin:0}.pg dt{color:var(--muted)}.pg dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}',
  '.pg dt.t,.pg dd.t{font-family:var(--f-ui);font-weight:700;font-size:18px;color:var(--ink);border-top:1px solid var(--line);padding-top:8px}',
  '.pg-acciones{display:flex;flex-wrap:wrap;gap:8px}.pg .btn{min-height:48px;cursor:pointer}.pg .btn:disabled{opacity:.6;cursor:default}',
  '.pg .btn:focus-visible,.pg input:focus-visible{outline:3px solid var(--b700);outline-offset:2px}',
  '.pg-msg{margin:0;padding:12px 16px;border-radius:8px;background:var(--warn-soft);color:#78350F}.pg-msg:focus{outline:3px solid var(--b700);outline-offset:2px}.pg-msg ul{margin:8px 0 0;padding-left:20px}',
  '.pg-nota{margin:0;padding:12px 16px;border-radius:8px;background:var(--b50);border:1px solid var(--b200);font-size:14px}',
  '.pg-cupon{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.pg-cupon p{grid-column:1/-1}.pg-cupon .pg-acciones{grid-column:1/-1}',
  '.pg-cupon-msg{margin:0;min-height:22px;font-size:14px;font-weight:700}.pg-cupon-msg.ok{color:#166534}.pg-cupon-msg.no{color:#B91C1C}',
  '@media (max-width:560px){.pg{padding:16px;min-height:1000px}}',
].join('');

/**
 * El script, sin dependencias. Lee el plan de `?plan=` y su precio publicado (`GET /api/v1/publico/planes/{slug}`), guarda
 * lo escrito entre pasos y mueve el foco al título de cada paso. La atribución (página de entrada, UTM y referente) sale
 * de la sesión que guarda el script de captación, si la hay.
 */
export const SCRIPT_CHECKOUT = `(function(){try{
var raiz=document.querySelector('[data-checkout]');if(!raiz)return;
var b=raiz.getAttribute('data-base')||'',L=document.documentElement.lang==='en'?'en':'es',T=${JSON.stringify(TEXTOS_PAGO)}[L],API=${JSON.stringify(RUTA_CHECKOUT_API)},PL=${JSON.stringify(RUTA_PLANES_API)};
var q=new URLSearchParams(location.search),slug=(q.get('plan')||'').slice(0,60);
var S={paso:1,plan:null,ajustes:null,ciclo:'MENSUAL',moneda:'PEN',monedas:['PEN'],d:{razonSocial:'',ruc:'',dni:'',nombreAdmin:'',correoAdmin:'',consentimiento:false},err:{},aviso:null,co:null,res:null,sinPasarela:false,ocupado:false,volviendo:false,cupon:null,cuponTexto:'',cuponMsg:null,aplicando:false};
var NOMBRES={stripe:'Stripe',culqi:'Culqi'},CULQI=${JSON.stringify(SCRIPT_CULQI)},UMBRAL_DNI=${JSON.stringify(UMBRAL_DNI_BOLETA)};
var CAMPOS=['razonSocial','ruc','dni','nombreAdmin','correoAdmin','consentimiento'];
function el(t,a,h){var e=document.createElement(t);if(a)for(var k in a){var v=a[k];if(v===null||v===undefined||v===false)continue;if(k==='text')e.textContent=v;else if(k.indexOf('on')===0)e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?'':v)}if(h)for(var i=0;i<h.length;i++)if(h[i])e.appendChild(typeof h[i]==='string'?document.createTextNode(h[i]):h[i]);return e}
function soles(n){return'S/ '+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function dinero(n,m){return(m==='USD'?'US$ ':'S/ ')+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmt(n){return dinero(n,S.moneda)}
function mes(){return S.moneda==='USD'?S.plan.precioMesUsd:S.plan.precioMes}
function anualP(){var a=S.moneda==='USD'?S.plan.precioAnualUsd:S.plan.precioAnual;return a===undefined?null:a}
function ahorro(){return S.moneda==='USD'?Math.max(0,mes()*12-anualP()):S.plan.ahorroAnual}
function r2(n){return Math.round(n*100)/100}
function igv(n){return r2(n*0.18)}
function conIgv(n){return r2(n+n*0.18)}
function desc(s){return S.cupon?r2(s*S.cupon.porcentaje/100):0}
function diaTexto(d){try{return new Intl.DateTimeFormat(L==='en'?'en-US':'es-PE',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'))}catch(e){return d}}
function motivoTexto(x){var m=x&&T.motivos[x.motivo];return m?m.replace('{f}',x.fecha?diaTexto(x.fecha):''):(x&&x.mensaje)||T.fallo}
function ciclosTexto(n){return n===null||n===undefined?T.permanente:n===1?T.ciclos1:T.ciclosN.replace('{n}',n)}
function rucOk(r){if(!/^(10|15|16|17|20)\\d{9}$/.test(r))return false;var p=[5,4,3,2,7,6,5,4,3,2],s=0;for(var i=0;i<10;i++)s+=p[i]*(+r[i]);var d=11-s%11;return(d===10?0:d===11?1:d)===+r[10]}
function rutaL(r){return b+(L==='en'?'/en'+(r==='/'?'':r):r)}
function agendar(){return rutaL('/agendar-demo')+(slug?'?plan='+encodeURIComponent(slug):'')}
function anualDisponible(){return!!(S.ajustes&&S.ajustes.mostrarAnual&&S.plan&&anualP()!==null)}
function subtotal(){return S.ciclo==='ANUAL'?anualP():mes()}
function sesion(){try{return JSON.parse(sessionStorage.getItem(${JSON.stringify(CLAVE_SESION)})||'null')||{}}catch(e){return{}}}
function json(r){return r.json().catch(function(){return{}}).then(function(d){return{s:r.status,d:d}})}
function pasos(){return el('ol',{'class':'pg-pasos','aria-label':T.paso+' '+Math.min(S.paso,3)+' '+T.de+' 3'},T.pasos.map(function(n,i){var a=S.paso===i+1;return el('li',{'aria-current':a?'step':null,'class':S.paso>i+1?'hecho':null},[n])}))}
function aviso(){if(!S.aviso)return null;var a=el('div',{'class':'pg-msg',role:'alert',tabindex:'-1'},[el('p',{style:'margin:0',text:S.aviso.texto})]);if(S.aviso.lista&&S.aviso.lista.length)a.appendChild(el('ul',null,S.aviso.lista.map(function(x){return el('li',{text:x})})));if(S.aviso.enlace)a.appendChild(el('p',{style:'margin:8px 0 0'},[el('a',{href:S.aviso.enlace.href,text:S.aviso.enlace.texto})]));return a}
function campo(n,tipo,etq,extra,ayuda){var id='pg-'+n,e=S.err[n],desc=[];if(ayuda)desc.push(id+'-a');if(e)desc.push(id+'-e');
return el('p',null,[el('label',{'for':id,text:etq}),el('input',Object.assign({id:id,name:n,type:tipo,value:S.d[n],'aria-invalid':e?'true':null,'aria-describedby':desc.length?desc.join(' '):null},extra)),ayuda?el('span',{id:id+'-a','class':'pg-ayuda',text:ayuda}):null,e?el('span',{id:id+'-e','class':'pg-error',text:e}):null])}
function planLinea(){return el('p',{'class':'pg-plan',text:T.planElegido+': '+S.plan.nombre+' · '+soles(S.plan.precioMes)+' '+T.alMes+' + IGV'})}
function pasoEmpresa(){var ok=S.err.consentimiento;
return[el('h2',{tabindex:'-1',text:T.empresa}),planLinea(),aviso(),el('form',{novalidate:true,onsubmit:siguiente},[
campo('razonSocial','text',T.razonSocial,{required:true,maxlength:'150',autocomplete:'organization'}),
campo('ruc','text',T.ruc,{inputmode:'numeric',maxlength:'13',autocomplete:'off'},T.rucAyuda),
campo('dni','text',T.dni,{inputmode:'numeric',maxlength:'10',autocomplete:'off'},T.dniAyuda),
campo('nombreAdmin','text',T.nombreAdmin,{required:true,maxlength:'120',autocomplete:'name'}),
campo('correoAdmin','email',T.correoAdmin,{required:true,maxlength:'160',autocomplete:'email'},T.correoAyuda),
el('p',{'class':'pg-ok'},[el('input',{id:'pg-consentimiento',name:'consentimiento',type:'checkbox',required:true,checked:S.d.consentimiento,'aria-invalid':ok?'true':null,'aria-describedby':ok?'pg-consentimiento-e':null}),el('label',{'for':'pg-consentimiento',text:T.consentimiento}),ok?el('span',{id:'pg-consentimiento-e','class':'pg-error',style:'grid-column:2',text:ok}):null]),
el('div',{'class':'pg-acciones'},[el('button',{'class':'btn primary',type:'submit',text:T.continuar})])])]}
function leer(f){CAMPOS.forEach(function(n){var x=f.elements.namedItem(n);if(!x)return;S.d[n]=n==='consentimiento'?x.checked:x.value})}
function dniLimpio(){return S.d.dni.replace(/[\\s.-]/g,'')}
function validar(){var e={},d=S.d,c=d.correoAdmin.trim(),r=d.ruc.replace(/[\\s-]/g,''),n=dniLimpio();
if(!d.razonSocial.trim())e.razonSocial=T.eRazon;
if(r&&!/^\\d{11}$/.test(r))e.ruc=T.eRuc11;else if(r&&!rucOk(r))e.ruc=T.eRuc;
if(!r&&n&&!/^\\d{8}$/.test(n))e.dni=T.eDni;
if(!d.nombreAdmin.trim())e.nombreAdmin=T.eNombre;
if(!/^[^\\s@<>"]+@[^\\s@<>"]+\\.[^\\s@<>"]{2,}$/.test(c))e.correoAdmin=T.eCorreo;
if(!d.consentimiento)e.consentimiento=T.eOk;return e}
function siguiente(ev){ev.preventDefault();leer(ev.target);S.err=validar();var k=Object.keys(S.err);
if(k.length){S.aviso={texto:T.revisa,lista:k.map(function(n){return S.err[n]})};pintar();var x=raiz.querySelector('#pg-'+k[0]);if(x)x.focus();return}
S.aviso=null;ir(2)}
function ir(p){S.paso=p;pintar();var h=raiz.querySelector('h2');if(h)h.focus()}
function fila(dt,dd,t){return[el('dt',{'class':t?'t':null,text:dt}),el('dd',{'class':t?'t':null,text:dd})]}
function radios(nombre,leyenda,op,actual,cambiar){return el('fieldset',null,[el('legend',{text:leyenda})].concat(op.map(function(o){var id='pg-'+nombre+'-'+o[0].toLowerCase();return el('div',{'class':'pg-ciclo'},[el('input',{id:id,type:'radio',name:nombre,value:o[0],checked:actual===o[0],onchange:function(){cambiar(o[0]);S.aviso=null;pintar();var x=raiz.querySelector('#'+id);if(x)x.focus()}}),el('label',{'for':id,text:o[1]})])})))}
function pasoResumen(){var s=subtotal(),r=S.d.ruc.replace(/[\\s-]/g,''),hijos=[el('h2',{tabindex:'-1',text:T.resumen}),aviso()];
if(S.monedas.length>1)hijos.push(radios('moneda',T.moneda,[['PEN',T.soles],['USD',T.dolares]],S.moneda,function(m){S.moneda=m;if(!anualDisponible())S.ciclo='MENSUAL'}));
s=subtotal();
if(anualDisponible()){var ah=ahorro(),op=[['MENSUAL',T.mensual+' · '+fmt(mes())+' '+T.alMes],['ANUAL',T.anual+' · '+fmt(anualP())+' '+T.alAnio+(ah?' ('+T.ahorras+' '+fmt(ah)+')':'')]];
hijos.push(radios('ciclo',T.ciclo,op,S.ciclo,function(c){S.ciclo=c}))}
hijos.push(formaCupon());
var dsc=desc(s),base=r2(s-dsc);
var dl=el('dl',null,[].concat(fila(T.planElegido,S.plan.nombre+' · '+(S.ciclo==='ANUAL'?T.anual:T.mensual)),fila(T.subtotal,fmt(s)),S.cupon?fila(T.descuento.replace('{c}',S.cupon.codigo).replace('{p}',S.cupon.porcentaje),'−'+fmt(dsc)):[],fila(T.igv,fmt(igv(base))),fila(T.comprobante,r?T.factura+' '+r:T.boleta+(dniLimpio()?' · DNI '+dniLimpio():'')),fila(T.total,fmt(conIgv(base)),true)));
hijos.push(dl);
hijos.push(el('div',{'class':'pg-acciones'},[el('button',{'class':'btn',type:'button',text:T.volver,onclick:function(){S.aviso=null;ir(1)}}),el('button',{'class':'btn primary',type:'button',id:'pg-a-pagar',disabled:S.ocupado,text:S.ocupado?T.enviando:T.aPagar,onclick:crear})]));
return hijos}
function formaCupon(){var e=S.cuponMsg&&!S.cuponMsg.ok,desc_=['pg-cupon-a','pg-cupon-m'].join(' ');
return el('form',{'class':'pg-cupon',novalidate:true,onsubmit:aplicarCupon},[el('p',null,[el('label',{'for':'pg-cupon',text:T.cupon}),
el('input',{id:'pg-cupon',name:'cupon',type:'text',value:S.cupon?S.cupon.codigo:S.cuponTexto,maxlength:'30',autocomplete:'off',autocapitalize:'characters',spellcheck:'false','aria-invalid':e?'true':null,'aria-describedby':desc_}),
el('span',{id:'pg-cupon-a','class':'pg-ayuda',text:T.cuponAyuda})]),
el('div',{'class':'pg-acciones'},[el('button',{'class':'btn',type:'submit',id:'pg-aplicar',disabled:S.aplicando,text:S.aplicando?T.aplicando:T.aplicar}),S.cupon?el('button',{'class':'btn',type:'button',id:'pg-quitar',text:T.quitar,onclick:quitarCupon}):null]),
el('p',{id:'pg-cupon-m','class':'pg-cupon-msg'+(S.cuponMsg?(S.cuponMsg.ok?' ok':' no'):''),role:'status','aria-live':'polite'})])}
function anunciar(){var m=raiz.querySelector('#pg-cupon-m');if(m&&S.cuponMsg){var t=S.cuponMsg.texto;setTimeout(function(){m.textContent=t},60)}}
function enfocarCupon(id){var x=raiz.querySelector('#'+(id||'pg-cupon'));if(x)x.focus();anunciar()}
function aplicarCupon(ev){ev.preventDefault();if(S.aplicando)return;var v=(ev.target.elements.namedItem('cupon').value||'').trim().toUpperCase();S.cuponTexto=v;
if(!v){S.cupon=null;S.cuponMsg={ok:false,texto:T.eCupon};pintar();return enfocarCupon()}
S.aplicando=true;S.cuponMsg=null;pintar();
fetch(API+'/cupon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:slug,ciclo:S.ciclo,moneda:S.moneda,cupon:v,correoAdmin:S.d.correoAdmin,ruc:S.d.ruc}),credentials:'omit'}).then(json).then(function(r){S.aplicando=false;
if(r.s===200&&r.d.resumen&&r.d.resumen.cupon){var c=r.d.resumen.cupon;S.cupon={codigo:c.codigo,porcentaje:c.porcentaje,ciclos:c.ciclosDescuento};S.cuponMsg={ok:true,texto:T.cuponOk.replace('{c}',c.codigo).replace('{p}',c.porcentaje).replace('{d}',ciclosTexto(c.ciclosDescuento))};pintar();return enfocarCupon('pg-quitar')}
S.cupon=null;var d=r.d&&r.d.detalles&&r.d.detalles[0];S.cuponMsg={ok:false,texto:(r.s===429?T.demasiados:r.s===422?motivoTexto(d):T.fallo)+' '+T.sinCambio};pintar();enfocarCupon()}).catch(function(){S.aplicando=false;S.cupon=null;S.cuponMsg={ok:false,texto:T.fallo+' '+T.sinCambio};pintar();enfocarCupon()})}
function quitarCupon(){S.cupon=null;S.cuponTexto='';S.cuponMsg={ok:true,texto:T.cuponQuitado};pintar();enfocarCupon()}
function crear(){if(S.ocupado)return;
var rr=S.d.ruc.replace(/[\\s-]/g,''),nn=dniLimpio(),tt=conIgv(r2(subtotal()-desc(subtotal())));
if(!rr&&!nn&&tt>UMBRAL_DNI[S.moneda]){S.err={dni:T.eDniFalta};S.aviso={texto:T.revisa,lista:[T.eDniFalta]};ir(1);var z=raiz.querySelector('#pg-dni');if(z)z.focus();return}
S.ocupado=true;S.aviso=null;pintar();
var c={plan:slug,ciclo:S.ciclo,moneda:S.moneda,cupon:S.cupon?S.cupon.codigo:undefined,razonSocial:S.d.razonSocial,ruc:S.d.ruc,dni:rr?undefined:(nn||undefined),nombreAdmin:S.d.nombreAdmin,correoAdmin:S.d.correoAdmin,consentimiento:S.d.consentimiento,idioma:L,paginaFormulario:location.pathname};
var s=sesion();for(var k in s)if(typeof s[k]==='string'&&!(k in c))c[k]=s[k];if(!c.paginaEntrada)c.paginaEntrada=location.pathname;
fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c),credentials:'omit'}).then(json).then(function(r){S.ocupado=false;
if(r.s===201){S.co=r.d;S.sinPasarela=false;return ir(3)}
if(r.s===503){S.co=null;S.sinPasarela=true;return ir(3)}
if(r.s===409){S.err={correoAdmin:T.enUso};S.aviso={texto:T.enUso};ir(1);var x=raiz.querySelector('#pg-correoAdmin');if(x)x.focus();return}
if(r.s===422&&(r.d.detalles||[]).some(function(x){return x.campo==='cupon'})){var dc=r.d.detalles.filter(function(x){return x.campo==='cupon'})[0];S.cupon=null;S.cuponMsg={ok:false,texto:motivoTexto(dc)+' '+T.sinCambio};pintar();return enfocarCupon()}
if(r.s===422){var det=r.d.detalles||[],e={};det.forEach(function(x){if(CAMPOS.indexOf(x.campo)>=0)e[x.campo]=x.mensaje});S.aviso={texto:T.revisa,lista:det.map(function(x){return x.mensaje})};
if(Object.keys(e).length){S.err=e;ir(1);var y=raiz.querySelector('#pg-'+Object.keys(e)[0]);if(y)y.focus();return}pintar();return foco()}
if(r.s===404){S.aviso={texto:T.noPlan,enlace:{href:agendar(),texto:T.agendar}};pintar();return foco()}
S.aviso={texto:r.s===429?T.demasiados:T.fallo};pintar();foco()}).catch(function(){S.ocupado=false;S.aviso={texto:T.fallo};pintar();foco()})}
function pasoPago(){if(S.sinPasarela)return[el('h2',{tabindex:'-1',text:T.pago}),el('p',{'class':'pg-msg',text:T.noDisponible}),el('div',{'class':'pg-acciones'},[el('button',{'class':'btn',type:'button',text:T.volver,onclick:function(){ir(2)}}),el('a',{'class':'btn primary',href:agendar(),text:T.agendar})])];
if(S.volviendo)return[el('h2',{tabindex:'-1',text:T.pago}),aviso(),el('p',{'class':'pg-nota',role:'status',text:T.esperando})];
var pg=S.co.pago||{tipo:'simulado'},tot=dinero(S.co.resumen.total,S.co.resumen.moneda),nom=NOMBRES[S.co.pasarela]||S.co.pasarela,
atras=el('button',{'class':'btn',type:'button',text:T.volver,onclick:function(){S.co=null;S.aviso=null;ir(2)}});
if(pg.tipo==='redireccion')return[el('h2',{tabindex:'-1',text:T.pago}),aviso(),el('p',{'class':'pg-nota',id:'pg-nota',text:T.redireccion.replace('{p}',nom)}),el('dl',null,fila(T.total,tot,true)),
el('div',{'class':'pg-acciones'},[atras,el('a',{'class':'btn primary',id:'pg-pagar',href:pg.url,'aria-describedby':'pg-nota',text:T.pagarCon+' '+nom+' · '+tot})])];
if(pg.tipo==='formulario')return[el('h2',{tabindex:'-1',text:T.pago}),aviso(),el('p',{'class':'pg-nota',id:'pg-nota',text:T.formulario.replace('{p}',nom)}),el('dl',null,fila(T.total,tot,true)),
el('div',{'class':'pg-acciones'},[atras,el('button',{'class':'btn primary',type:'button',id:'pg-pagar','aria-describedby':'pg-nota',disabled:S.ocupado,text:S.ocupado?T.abriendo:T.pagarCon+' '+nom+' · '+tot,onclick:culqi})])];
var e=S.err.tarjeta;
return[el('h2',{tabindex:'-1',text:T.pago}),aviso(),el('p',{'class':'pg-nota',id:'pg-nota',text:T.pruebas}),el('dl',null,fila(T.total,tot,true)),
el('form',{novalidate:true,onsubmit:pagar},[el('p',null,[el('label',{'for':'pg-tarjeta',text:T.tarjeta}),el('input',{id:'pg-tarjeta',name:'tarjeta',type:'text',inputmode:'numeric',autocomplete:'cc-number',maxlength:'23',required:true,'aria-invalid':e?'true':null,'aria-describedby':'pg-nota'+(e?' pg-tarjeta-e':'')}),e?el('span',{id:'pg-tarjeta-e','class':'pg-error',text:e}):null]),
el('div',{'class':'pg-acciones'},[atras,el('button',{'class':'btn primary',type:'submit',disabled:S.ocupado,text:S.ocupado?T.pagando:T.pagar+' '+tot})])])]}
function cargarCulqi(fn){if(window.Culqi)return fn(true);var x=document.createElement('script');x.src=CULQI;x.async=true;x.onload=function(){fn(true)};x.onerror=function(){fn(false)};document.head.appendChild(x)}
function fallo(t){S.ocupado=false;S.aviso={texto:t||T.fallo};pintar();foco()}
function culqi(){if(S.ocupado)return;S.ocupado=true;S.aviso=null;pintar();var pg=S.co.pago;
cargarCulqi(function(ok){var C=window.Culqi;if(!ok||!C)return fallo();
try{C.publicKey=pg.llavePublica;C.settings({title:'Aptio SCORM',currency:pg.moneda,amount:pg.montoCentimos,description:pg.descripcion});if(C.options)C.options({lang:L});
window.culqi=function(){if(C.token&&C.token.id){var t=C.token.id;if(C.close)C.close();enviarToken(t)}else if(C.error)fallo(C.error.user_message)};C.open()}catch(e){fallo()}})}
function enviarToken(t){fetch(API+'/'+encodeURIComponent(S.co.id)+'/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t}),credentials:'omit'}).then(json).then(function(r){
if(r.s===202)return resultado(r.d,0);fallo(r.d&&typeof r.d.mensaje==='string'?r.d.mensaje:null)}).catch(function(){fallo()})}
function volver(id){S.co={id:id};S.volviendo=true;S.ocupado=true;S.paso=3;pintar();resultado({estado:'PENDIENTE'},0)}
function pagar(ev){ev.preventDefault();if(S.ocupado)return;var t=ev.target.elements.namedItem('tarjeta').value;if(!t.replace(/\\D/g,'')){S.err={tarjeta:T.eTarjeta};pintar();var x=raiz.querySelector('#pg-tarjeta');if(x)x.focus();return}
S.err={};S.ocupado=true;S.aviso=null;pintar();
fetch(API+'/'+encodeURIComponent(S.co.id)+'/pago-prueba',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tarjeta:t}),credentials:'omit'}).then(json).then(function(r){
if(r.s===422){S.ocupado=false;S.err={tarjeta:(r.d.detalles&&r.d.detalles[0]&&r.d.detalles[0].mensaje)||T.eTarjeta};pintar();var x=raiz.querySelector('#pg-tarjeta');if(x)x.focus();return}
if(r.s!==200){S.ocupado=false;S.aviso={texto:T.fallo};pintar();return foco()}
resultado(r.d,0)}).catch(function(){S.ocupado=false;S.aviso={texto:T.fallo};pintar();foco()})}
function resultado(d,n){if(d.estado==='PENDIENTE'){if(n>=20){S.ocupado=false;S.aviso={texto:T.esperando};pintar();return foco()}
return setTimeout(function(){fetch(API+'/'+encodeURIComponent(S.co.id),{credentials:'omit'}).then(json).then(function(r){resultado(r.s===200?r.d:{estado:'PENDIENTE'},n+1)}).catch(function(){resultado({estado:'PENDIENTE'},n+1)})},1500)}
S.ocupado=false;var v=S.volviendo;S.volviendo=false;if(d.estado==='APROBADA'){S.res=d;S.paso=4;pintar();var h=raiz.querySelector('h2');if(h)h.focus();return}
S.co=null;S.aviso={texto:T.rechazado+(d.motivoRechazo?': '+d.motivoRechazo:'')+'. '+T.reintentarTexto};S.paso=v?1:2;pintar();foco()}
function fecha(iso){try{return new Intl.DateTimeFormat(L==='en'?'en-US':'es-PE',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Lima'}).format(new Date(iso))}catch(e){return iso.slice(0,10)}}
function listo(){var d=S.res;return[el('div',{role:'status',style:'display:grid;gap:16px'},[el('h2',{tabindex:'-1',text:T.listo}),el('p',{style:'margin:0',text:T.correoEnviado.replace('{correo}',d.correoAdmin)}),
el('dl',null,[].concat(fila(T.planElegido,d.nombrePlan+' · '+(d.ciclo==='ANUAL'?T.anual:T.mensual)),d.finPeriodo?fila(T.hasta,fecha(d.finPeriodo)):[],fila(T.comprobante,d.tipoComprobante==='FACTURA'?T.factura:T.boleta),fila(T.total,dinero(d.total,d.moneda),true)))]),
el('div',{'class':'pg-acciones'},[el('a',{'class':'btn',href:rutaL('/'),text:T.inicio})])]}
function sinPlan(t){raiz.textContent='';raiz.setAttribute('aria-busy','false');[el('p',{'class':'pg-msg',text:t}),el('div',{'class':'pg-acciones'},[el('a',{'class':'btn',href:rutaL('/precios'),text:T.precios}),el('a',{'class':'btn primary',href:agendar(),text:T.agendar})])].forEach(function(x){raiz.appendChild(x)})}
function foco(){var a=raiz.querySelector('.pg-msg');if(a)a.focus()}
function pintar(){raiz.textContent='';raiz.setAttribute('aria-busy','false');var h=S.paso===4?listo():[pasos()].concat(S.paso===1?pasoEmpresa():S.paso===2?pasoResumen():pasoPago());h.forEach(function(x){if(x)raiz.appendChild(x)})}
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){sinPlan(T.noPlan);return}
fetch(PL+'/'+encodeURIComponent(slug),{credentials:'omit'}).then(json).then(function(r){if(r.s!==200||r.d.aMedida||r.d.precioMes===null){sinPlan(T.noPlan);return}
S.plan=r.d;S.ajustes=r.d.ajustes||null;S.monedas=r.d.monedas&&r.d.monedas.length?r.d.monedas:['PEN'];if(q.get('moneda')==='usd'&&S.monedas.indexOf('USD')>=0)S.moneda='USD';if(q.get('ciclo')==='anual'&&anualDisponible())S.ciclo='ANUAL';
var vuelta=q.get('checkout')||'';if(/^[0-9a-f-]{36}$/i.test(vuelta))return volver(vuelta);if(q.get('cancelado'))S.aviso={texto:T.cancelado};pintar()}).catch(function(){sinPlan(T.caido)});
}catch(e){}})();
`;
