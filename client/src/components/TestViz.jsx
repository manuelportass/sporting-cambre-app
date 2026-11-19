// Piezas visuales de los tests: minigráfica, variación test → retest y simetría D/I
import React from 'react';
import { fmtNum } from '../lib/format';
import { symColor } from '../lib/tests';

export function Spark({ values, w = 90, h = 26, color = '#e30613' }) {
  const v = values.filter(x => x != null);
  if (v.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const pts = v.map((x, i) => [i / (v.length - 1) * (w - 6) + 3, h - 3 - (x - min) / r * (h - 6)]);
  return <svg width={w} height={h} className="spark" aria-hidden="true">
    <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.8" fill={color} />
  </svg>;
}

export function Delta({ dl, decimals = 1, unit = '', pct = true }) {
  if (!dl) return <span className="dlt none">primera medición</span>;
  const arrow = dl.d > 0 ? '▲' : dl.d < 0 ? '▼' : '=';
  return <span className={'dlt ' + dl.tone}>{arrow} {dl.d > 0 ? '+' : dl.d < 0 ? '−' : ''}{fmtNum(Math.abs(dl.d), decimals)}{unit && ` ${unit}`}{pct && dl.pct != null && dl.d ? ` (${dl.d > 0 ? '+' : '−'}${fmtNum(Math.abs(dl.pct), 1)} %)` : ''}</span>;
}

export const Sym = ({ v, label = 'LSI' }) => <span className="sym" style={{ '--c': symColor(v) }}>{label} {v == null ? '—' : `${fmtNum(v, 0)} %`}</span>;

// Barra doble: medición anterior (gris) y última (color), escaladas al máximo del grupo
export function DuoBar({ prev, cur, max, tone }) {
  const pc = v => (v == null || !max ? 0 : Math.max(2, v / max * 100));
  return <div className="duo"><i className="p" style={{ width: pc(prev) + '%' }} /><i className={'c ' + (tone || '')} style={{ width: pc(cur) + '%' }} /></div>;
}

// LSI (índice de simetría entre extremidades) en una escala de colores 50–110 %:
// rojo < 80 · naranja 80–89 · verde ≥ 90. Punto relleno = último; hueco = anterior.
const G0 = 50, G1 = 110;
const gx = v => Math.max(0, Math.min(100, (v - G0) / (G1 - G0) * 100));
export function LsiGauge({ v, prev, weak, compact }) {
  return <div className={'lsig' + (compact ? ' compact' : '')} style={{ '--c': symColor(v) }}>
    <div className="lsig-top"><span className="lsig-l">LSI</span><b>{v == null ? '—' : `${fmtNum(v, 1)} %`}</b>
      {weak && v != null && v < 100 && <span className="lsig-w">menor: {weak}</span>}</div>
    <div className="lsig-track" aria-hidden="true">
      <i className="z r" style={{ left: 0, width: gx(80) + '%' }} /><i className="z o" style={{ left: gx(80) + '%', width: gx(90) - gx(80) + '%' }} /><i className="z g" style={{ left: gx(90) + '%', right: 0 }} />
      <i className="tick" style={{ left: gx(100) + '%' }} />
      {prev != null && <i className="mk p" style={{ left: gx(prev) + '%' }} title={`Anterior ${fmtNum(prev, 1)} %`} />}
      {v != null && <i className="mk" style={{ left: gx(v) + '%' }} />}
    </div>
    {!compact && <div className="lsig-sc"><span>50</span><span style={{ left: gx(80) + '%' }}>80</span><span style={{ left: gx(90) + '%' }}>90</span><span style={{ left: gx(100) + '%' }}>100</span></div>}
  </div>;
}

// Dos barras horizontales, una por lado (con el valor), escaladas al mayor
export function SideBars({ a, b, la, lb, unit = '', decimals = 1, ca = '#e30613', cb = '#2a78d6' }) {
  const m = Math.max(a ?? 0, b ?? 0) || 1;
  const row = (l, v, c) => <div className="sbar"><span className="sbar-l">{l}</span><span className="sbar-t"><i style={{ width: (v == null ? 0 : Math.max(2, v / m * 100)) + '%', background: c }} /></span><b>{v == null ? '—' : fmtNum(v, decimals)}<small>{unit ? ` ${unit}` : ''}</small></b></div>;
  return <div className="sbars">{row(la, a, ca)}{row(lb, b, cb)}</div>;
}
