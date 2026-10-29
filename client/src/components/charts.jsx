import React from 'react';
import { ResponsiveContainer, ComposedChart, LineChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, Cell, Legend as RLegend } from 'recharts';
import { COLOR_HEX, fmtNum, fmtShort } from '../lib/format';

const axis = { stroke: '#9a9b95', fontSize: 11, tickLine: false };
const grid = <CartesianGrid stroke="#ecede8" vertical={false} />;
const S1 = '#2a78d6', S2 = '#eb6834', S3 = '#1baf7a';

function TipBox({ title, rows }) {
  return <div style={{ background: '#fff', border: '1px solid #dcdcd6', borderRadius: 8, padding: '8px 10px', fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
    <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
    {rows.map(([k, v, c], i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{c && <i style={{ width: 9, height: 9, borderRadius: 2, background: c }} />}<span style={{ color: '#4c524c' }}>{k}</span><b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{v}</b></div>)}
  </div>;
}
const STATE = { registrado: 'Registrado', sin_registro: 'Registro pendiente', sin_actividad: 'Sin actividad programada', previo: 'Antes del primer registro' };

export function DailyLoadChart({ series, height = 220 }) {
  const data = series.map(d => ({ ...d, bar: d.dayLoad ?? 0, missing: d.state === 'sin_registro' ? 1 : 0 }));
  return <ResponsiveContainer width="100%" height={height}>
    <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
      {grid}
      <XAxis dataKey="date" tickFormatter={fmtShort} {...axis} minTickGap={20} />
      <YAxis {...axis} width={46} />
      <Tooltip cursor={{ fill: 'rgba(42,120,214,.07)' }} content={({ active, payload }) => active && payload?.length ? <TipBox title={fmtShort(payload[0].payload.date)} rows={[
        ['Carga del día', payload[0].payload.dayLoad === null ? '—' : fmtNum(payload[0].payload.dayLoad) + ' UA'], ['Estado', STATE[payload[0].payload.state]]]} /> : null} />
      <Bar isAnimationActive={false} dataKey="bar" name="Carga diaria (UA)" radius={[4, 4, 0, 0]} maxBarSize={18}>
        {data.map((d, i) => <Cell key={i} fill={d.state === 'sin_registro' ? '#d6d7d1' : S1} />)}
      </Bar>
    </ComposedChart>
  </ResponsiveContainer>;
}

export function AcuteChronicChart({ series, unit, height = 220 }) {
  return <ResponsiveContainer width="100%" height={height}>
    <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      {grid}
      <XAxis dataKey="date" tickFormatter={fmtShort} {...axis} minTickGap={20} />
      <YAxis {...axis} width={50} />
      <Tooltip content={({ active, payload }) => active && payload?.length ? <TipBox title={fmtShort(payload[0].payload.date)} rows={[
        ['Aguda', payload[0].payload.acute === null ? 'No calculable' : fmtNum(payload[0].payload.acute) + ' ' + unit, S1],
        ['Crónica', payload[0].payload.chronic === null ? 'No calculable' : fmtNum(payload[0].payload.chronic) + ' ' + unit, S2]]} /> : null} />
      <RLegend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
      <Line isAnimationActive={false} dataKey="acute" name={`Aguda (${unit})`} stroke={S1} strokeWidth={2} dot={false} connectNulls={false} />
      <Line isAnimationActive={false} dataKey="chronic" name={`Crónica (${unit})`} stroke={S2} strokeWidth={2} dot={false} connectNulls={false} />
    </LineChart>
  </ResponsiveContainer>;
}

export function AcwrChart({ series, bands, height = 220 }) {
  const max = Math.max(2, ...series.map(s => s.acwr || 0)) + 0.1;
  return <ResponsiveContainer width="100%" height={height}>
    <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      {grid}
      <ReferenceArea y1={bands.green[0]} y2={bands.green[1]} fill={COLOR_HEX.verde} fillOpacity={0.09} ifOverflow="hidden" />
      {bands.yellow.map((b, i) => <ReferenceArea key={'y' + i} y1={b[0]} y2={b[1]} fill={COLOR_HEX.amarillo} fillOpacity={0.1} />)}
      {bands.orange.map((b, i) => <ReferenceArea key={'o' + i} y1={b[0]} y2={b[1]} fill={COLOR_HEX.naranja} fillOpacity={0.1} />)}
      <XAxis dataKey="date" tickFormatter={fmtShort} {...axis} minTickGap={20} />
      <YAxis {...axis} width={40} domain={[0, Math.ceil(max * 2) / 2]} />
      <Tooltip content={({ active, payload }) => active && payload?.length ? <TipBox title={fmtShort(payload[0].payload.date)} rows={[
        ['ACWR', payload[0].payload.acwr === null ? 'No calculable' : fmtNum(payload[0].payload.acwr, 2), COLOR_HEX[payload[0].payload.acwrColor]]]} /> : null} />
      <Line isAnimationActive={false} dataKey="acwr" name="ACWR" stroke="#111511" strokeWidth={2} connectNulls={false}
        dot={p => p.payload.acwr === null ? null : <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={COLOR_HEX[p.payload.acwrColor]} stroke="#fff" strokeWidth={2} />} />
    </LineChart>
  </ResponsiveContainer>;
}

// Líneas genéricas: lines = [{ key, label }]
export function MultiLine({ data, lines, xKey = 'date', height = 220, yDomain, unit = '', decimals = 1 }) {
  const colors = [S1, S2, S3, '#eda100', '#e87ba4', '#008300'];
  return <ResponsiveContainer width="100%" height={height}>
    <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      {grid}
      <XAxis dataKey={xKey} tickFormatter={fmtShort} {...axis} minTickGap={20} />
      <YAxis {...axis} width={44} domain={yDomain || ['auto', 'auto']} />
      <Tooltip content={({ active, payload }) => active && payload?.length ? <TipBox title={fmtShort(payload[0].payload[xKey])} rows={lines.map((l, i) => [l.label, payload[0].payload[l.key] === null || payload[0].payload[l.key] === undefined ? '—' : fmtNum(payload[0].payload[l.key], decimals) + (unit ? ' ' + unit : ''), colors[i]])} /> : null} />
      {lines.length > 1 && <RLegend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
      {lines.map((l, i) => <Line isAnimationActive={false} key={l.key} dataKey={l.key} name={l.label} stroke={colors[i]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: colors[i] }} connectNulls />)}
    </LineChart>
  </ResponsiveContainer>;
}

// Carga semanal apilada por origen (entrenos registrados, relleno, partidos, adicionales)
export const WEEK_PARTS = [
  { key: 'entreno', label: 'Entrenos (RPE del jugador)', color: S1 },
  { key: 'relleno', label: 'Entrenos sin RPE (relleno 5 × 90′)', color: '#a9c6ea' },
  { key: 'partido', label: 'Partidos (RPE 10 × min)', color: '#dc0b11' },
  { key: 'adicional', label: 'Adicionales', color: S3 },
];
export function WeeklyStackChart({ data, height = 230 }) {
  return <ResponsiveContainer width="100%" height={height}>
    <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={6}>
      {grid}
      <XAxis dataKey="week" tickFormatter={fmtShort} {...axis} minTickGap={16} />
      <YAxis {...axis} width={48} />
      <Tooltip cursor={{ fill: 'rgba(42,120,214,.07)' }} content={({ active, payload }) => active && payload?.length ? <TipBox title={'Semana del ' + fmtShort(payload[0].payload.week)}
        rows={[...WEEK_PARTS.filter(p => payload[0].payload[p.key]).map(p => [p.label, fmtNum(payload[0].payload[p.key]) + ' UA', p.color]), ['Total', fmtNum(payload[0].payload.total) + ' UA']]} /> : null} />
      {WEEK_PARTS.map((p, i) => <Bar key={p.key} isAnimationActive={false} dataKey={p.key} stackId="w" fill={p.color} maxBarSize={30} radius={i === WEEK_PARTS.length - 1 ? [4, 4, 0, 0] : 0} />)}
    </ComposedChart>
  </ResponsiveContainer>;
}
// Minutos por partido
export function MatchMinutesChart({ data, height = 170 }) {
  return <ResponsiveContainer width="100%" height={height}>
    <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      {grid}
      <XAxis dataKey="date" tickFormatter={fmtShort} {...axis} />
      <YAxis {...axis} width={34} domain={[0, 90]} ticks={[0, 45, 90]} />
      <Tooltip cursor={{ fill: 'rgba(220,11,17,.06)' }} content={({ active, payload }) => active && payload?.length ? <TipBox title={fmtShort(payload[0].payload.date)} rows={[[payload[0].payload.type, payload[0].payload.minutes + '′']]} /> : null} />
      <Bar isAnimationActive={false} dataKey="minutes" maxBarSize={22} radius={[4, 4, 0, 0]}>{data.map((d, i) => <Cell key={i} fill={d.type === 'Amistoso' ? '#f0a4a6' : '#dc0b11'} />)}</Bar>
    </ComposedChart>
  </ResponsiveContainer>;
}
