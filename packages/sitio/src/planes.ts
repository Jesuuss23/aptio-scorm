/**
 * HU-1702 · Bloques «Planes (resumen)» y «Planes y precios» (REQ-082, CP-141, CP-142), en HTML estático desde la versión
 * publicada, sin JavaScript (CLS 0): precio al mes (o «A medida»), la línea anual con el ahorro si la página la muestra,
 * características visibles, «Más elegido» en el destacado y, en Precios, la cápsula adicional. HU-1703 · El botón de un
 * plan con precio lleva al pago (`/pago?plan=`) y el de uno a medida, a agendar una demo con el plan elegido. La tabla
 * comparativa y las preguntas de facturación no salen.
 */
import { createElement as h, type ReactNode } from 'react';
import { conIgv, RUTA_AGENDAR_PLAN, RUTA_PAGO, soles } from '@aptio/schema/planes';
import type { EntornoSitio } from '@aptio/schema/sitio-ficticios';
import type { PlanesInstantanea, PlanInstantanea } from '@aptio/schema/sitio-versiones';
import type { Idioma } from './textos.js';

export const TEXTOS_PLANES = {
  es: {
    etiqueta: 'Precios en soles', titulo: 'Planes para equipos de capacitación y productoras', bajada: 'Factura electrónica en cada cobro. Cambia de plan o cancela cuando lo necesites.',
    tituloPrecios: 'Planes a la medida de tu equipo de formación', bajadaPrecios: 'Precios en soles. La factura electrónica llega en cada cobro y puedes cancelar cuando quieras.',
    destacado: 'Más elegido', aMedida: 'A medida', alMes: 'al mes', conIgv: 'con IGV', masIgv: '+ IGV', alAnio: 'al año', o: 'o', ahorras: 'ahorras',
    adicional: 'Cápsula adicional', comparar: 'Ver los planes en detalle', ficticio: 'ficticio',
  },
  en: {
    etiqueta: 'Prices in soles', titulo: 'Plans for training teams and production studios', bajada: 'Electronic invoice with every charge. Change plans or cancel whenever you need.',
    tituloPrecios: 'Plans that fit your training team', bajadaPrecios: 'Prices in Peruvian soles. The electronic invoice arrives with every charge and you can cancel anytime.',
    destacado: 'Most popular', aMedida: 'Custom', alMes: 'per month', conIgv: 'incl. VAT', masIgv: '+ VAT', alAnio: 'per year', o: 'or', ahorras: 'you save',
    adicional: 'Additional capsule', comparar: 'See the plans in detail', ficticio: 'sample',
  },
} as const;

export const CSS_PLANES = [
  '.plans{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;align-items:stretch}',
  '.plan{position:relative;height:100%;background:var(--panel);border:1px solid var(--b200);border-radius:16px;padding:32px;display:flex;flex-direction:column;gap:20px}',
  '.plan.star{border:2px solid var(--b700);box-shadow:0 24px 48px -28px rgba(0,78,204,.45)}',
  '.plan .desc{color:var(--muted);margin-top:8px}',
  '.badge5{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--b700);color:#fff;font-family:var(--f-ui);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:4px 12px;white-space:nowrap}',
  '.price{font-family:var(--f-ui);font-size:40px;font-weight:700;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;color:var(--b700)}',
  '.price small{display:block;margin-top:8px;font-size:14px;line-height:20px;color:var(--muted);font-family:var(--f-body);letter-spacing:0;font-weight:400}',
  '.fine{font-size:14px;color:var(--muted)}',
  '.plan ul{padding-left:20px;margin:0;display:flex;flex-direction:column;gap:8px;flex:1}',
  '.plan li::marker{color:var(--muted)}',
  '.plan .btn{text-align:center}',
  '.plans-mas{text-align:center;margin-top:32px}',
  '@media (max-width:640px){.plan{padding:24px}.price{font-size:26px}}',
].join('');

interface Opciones { base: string; idioma: Idioma; entorno: EntornoSitio; id: string; ruta: (r: string) => string; completo: boolean }

/** Los planes que se muestran: en producción nunca un ficticio (segunda defensa). */
export const planesVisibles = (p: PlanesInstantanea | undefined, entorno: EntornoSitio): PlanInstantanea[] =>
  (p?.planes ?? []).filter((x) => entorno !== 'produccion' || !x.ficticio);

function Tarjeta({ p, ajustes, o }: { p: PlanInstantanea; ajustes: PlanesInstantanea['ajustes']; o: Opciones }): ReactNode {
  const T = TEXTOS_PLANES[o.idioma];
  const precio = (n: number) => soles(ajustes.conIgv ? conIgv(n) : n);
  const sufijo = ajustes.conIgv ? T.conIgv : T.masIgv;
  const enlace = `${o.ruta(p.precioMes === null ? RUTA_AGENDAR_PLAN : RUTA_PAGO)}?plan=${encodeURIComponent(p.slug)}`;
  const anual = ajustes.mostrarAnual && p.precioAnual !== null
    ? h('p', { className: 'fine' }, `${T.o} ${precio(p.precioAnual)} ${T.alAnio}${p.ahorroAnual ? ` (${T.ahorras} ${precio(p.ahorroAnual)})` : ''}`)
    : null;
  return h('article', { className: `plan${p.destacado ? ' star' : ''}`, 'aria-labelledby': `${o.id}-${p.slug}` },
    p.destacado ? h('span', { className: 'badge5' }, T.destacado) : null,
    h('div', null,
      h('h3', { id: `${o.id}-${p.slug}` }, p.nombre, p.ficticio ? h('span', { className: 'fic' }, T.ficticio) : null),
      p.descripcion ? h('p', { className: 'desc' }, p.descripcion) : null),
    h('div', null,
      h('p', { className: 'price' }, p.aMedida || p.precioMes === null ? T.aMedida : h('span', null, precio(p.precioMes), ' ', h('small', null, `${T.alMes} ${sufijo}`))),
      anual),
    p.caracteristicas.length ? h('ul', null, p.caracteristicas.map((c, i) => h('li', { key: i }, c))) : null,
    h('a', { className: `btn${p.destacado ? ' primary' : ''}`, href: enlace }, p.textoBoton),
    o.completo && !p.aMedida && p.capsulaAdicional !== null ? h('p', { className: 'fine' }, `${T.adicional}: ${precio(p.capsulaAdicional)}`) : null);
}

/** «Planes (resumen)» o «Planes y precios»; null si la versión no publica planes o no hay ninguno visible. */
export function SeccionPlanes({ planes, o }: { planes: PlanesInstantanea | undefined; o: Opciones }): ReactNode {
  const lista = planesVisibles(planes, o.entorno);
  if (!planes || !lista.length) return null;
  const T = TEXTOS_PLANES[o.idioma];
  return h('section', { id: o.completo ? 'precios' : 'planes', className: o.completo ? 'bg-ice' : undefined, 'aria-labelledby': o.id }, h('div', { className: 'in' },
    h('div', { className: 'sh' }, h('span', { className: 'tagp' }, T.etiqueta), h('h2', { id: o.id }, o.completo ? T.tituloPrecios : T.titulo), h('p', null, o.completo ? T.bajadaPrecios : T.bajada)),
    h('ul', { className: 'plans' }, lista.map((p) => h('li', { key: p.slug }, h(Tarjeta, { p, ajustes: planes.ajustes, o })))),
    o.completo ? null : h('p', { className: 'plans-mas' }, h('a', { className: 'more', href: o.ruta('/precios') }, T.comparar))));
}
