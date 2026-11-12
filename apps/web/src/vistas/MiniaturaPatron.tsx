// HU-1103 · Miniatura decorativa de cada patrón de navegación (PNT-17), como en el prototipo.
// HU-1104 · Un patrón creado con IA lleva la marca ✦ y, si suma puntos, dibuja el marcador flotante.
import type { CSSProperties } from 'react';
import type { PatronBase } from './patrones-navegacion';

const P = 'var(--color-cobalto)';
const A = 'var(--color-validado)';
const G = '#C9D3DD';
type Caja = [l: number, t: number, w: number, h: number, estilo: CSSProperties];
const caja = (l: number, t: number, w: number, h: number, estilo: CSSProperties = {}): Caja => [l, t, w, h, estilo];
const linea = (l: number, t: number, w: number) => caja(l, t, w, 4, { background: G, borderRadius: 2 });
const punto = (l: number, t: number, c: string) => caja(l - 5, t - 8, 10, 16, { background: c, borderRadius: '50%', border: '2px solid #fff' });

const CAJAS: Record<PatronBase, Caja[]> = {
  clasico: [caja(0, 0, 100, 14, { background: P }), linea(8, 28, 50), linea(8, 40, 60), linea(8, 52, 45), caja(68, 26, 22, 42, { background: A, borderRadius: 4 }), caja(0, 82, 100, 18, { background: '#fff', borderTop: '1px solid #ddd' }), caja(4, 86, 18, 10, { border: `2px solid ${P}`, borderRadius: 3 }), caja(78, 86, 18, 10, { background: P, borderRadius: 3 })],
  historias: [caja(32, 0, 36, 100, { background: P }), ...[0, 1, 2, 3, 4].map((i) => caja(34 + i * 6.6, 4, 5.6, 2.5, { background: i < 2 ? '#fff' : 'rgba(255,255,255,.4)', borderRadius: 2 })), caja(40, 34, 20, 32, { background: A, borderRadius: '50%' }), caja(38, 74, 24, 4, { background: 'rgba(255,255,255,.75)', borderRadius: 2 }), caja(33, 40, 3, 20, { background: 'rgba(255,255,255,.3)' }), caja(64, 40, 3, 20, { background: 'rgba(255,255,255,.3)' })],
  vertical: [caja(0, 0, 100, 10, { background: P }), caja(10, 16, 70, 20, { background: '#fff', border: `1px solid ${A}`, borderRadius: 4 }), caja(10, 42, 70, 26, { background: '#fff', border: `2px solid ${P}`, borderRadius: 4 }), caja(36, 72, 18, 7, { background: P, borderRadius: 8 }), caja(10, 84, 70, 20, { background: '#E3E8EC', borderRadius: 4 }), caja(88, 16, 3, 80, { background: '#E3E8EC' }), caja(88, 40, 3, 22, { background: P })],
  mapa: [caja(0, 0, 100, 12, { background: P }), punto(14, 70, A), punto(38, 36, P), punto(62, 68, G), punto(86, 34, G)],
  hub: [caja(0, 0, 100, 14, { background: P }), ...[0, 1, 2].map((i) => caja(6 + i * 31, 26, 26, 60, { background: '#fff', border: `2px solid ${i === 0 ? A : i === 1 ? P : G}`, borderRadius: 5 }))],
  ramificado: [punto(10, 50, A), punto(38, 50, P), punto(66, 24, A), punto(66, 76, '#B54708'), punto(92, 50, P)],
  inmersivo: [caja(0, 0, 100, 100, { background: P }), caja(62, 6, 32, 10, { background: 'rgba(255,255,255,.25)', borderRadius: 8 }), caja(30, 28, 40, 44, { background: A, borderRadius: 12 }), caja(84, 78, 10, 16, { background: '#fff', borderRadius: '50%' })],
};
const RUTAS: Partial<Record<PatronBase, string[]>> = { mapa: ['14,70 38,36 62,68 86,34'], ramificado: ['10,50 38,50 66,24 92,50', '38,50 66,76 92,50'] };

/** El marcador de puntos flotante (HU-1104), arriba a la derecha bajo la cabecera. */
const MARCADOR = caja(66, 18, 28, 12, { background: 'var(--color-naranja)', borderRadius: 8, border: '2px solid #fff' });

/** Miniatura decorativa del patrón (el nombre va en el texto de la tarjeta). */
export function Miniatura({ patron, ia = false, marcador = false }: { patron: PatronBase; ia?: boolean; marcador?: boolean }) {
  const cajas = marcador && patron !== 'inmersivo' ? [...CAJAS[patron], MARCADOR] : CAJAS[patron];
  return (
    <div className="patron-miniatura" aria-hidden="true" data-patron={patron} data-marcador={marcador || undefined}>
      {RUTAS[patron]?.length ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {RUTAS[patron]!.map((r) => <polyline key={r} points={r} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />)}
        </svg>
      ) : null}
      {cajas.map(([l, t, w, h, estilo], i) => <i key={i} style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, ...estilo }} />)}
      {ia ? <span className="patron-miniatura-ia">✦</span> : null}
    </div>
  );
}
