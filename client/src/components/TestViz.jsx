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

export const Sym = ({ v, label = 'Simetría' }) => <span className="sym" style={{ '--c': symColor(v) }}>{label} {v == null ? '—' : `${fmtNum(v, 0)} %`}</span>;

// Barra doble: medición anterior (gris) y última (color), escaladas al máximo del grupo
export function DuoBar({ prev, cur, max, tone }) {
  const pc = v => (v == null || !max ? 0 : Math.max(2, v / max * 100));
  return <div className="duo"><i className="p" style={{ width: pc(prev) + '%' }} /><i className={'c ' + (tone || '')} style={{ width: pc(cur) + '%' }} /></div>;
}
