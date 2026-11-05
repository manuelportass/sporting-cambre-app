// Primer equipo · Wellness diario y RPE de cada sesión: resumen visual de las respuestas de los jugadores
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
import { Avatar, Empty, ErrorBox, Loading, PageHead, useApi } from '../../components/ui';
import { addDays, fmtDate, fmtNum, todayISO } from '../../lib/format';

const PCT = p => (p == null ? '#c9cac4' : p >= 75 ? 'var(--verde)' : p >= 50 ? 'var(--amarillo)' : p >= 25 ? 'var(--naranja)' : 'var(--rojo)');
const PCT_HEX = p => (p == null ? '#c9cac4' : p >= 75 ? '#2e9e4f' : p >= 50 ? '#e8b400' : p >= 25 ? '#ef7d32' : '#d6262f');
// RPE (CR-10): suave → verde, moderado → amarillo, duro → naranja, máximo → rojo
const RPE_HEX = v => (v == null ? '#c9cac4' : v <= 3 ? '#2e9e4f' : v <= 5 ? '#e8b400' : v <= 7 ? '#ef7d32' : '#d6262f');
const RPE_TXT = v => (v == null ? '' : v <= 2 ? 'Muy suave' : v <= 3 ? 'Suave' : v <= 5 ? 'Moderada' : v <= 7 ? 'Dura' : v <= 9 ? 'Muy dura' : 'Máxima');
const SHORT = { sueno: 'Sueño', fatiga: 'Fatiga', dolor: 'Dolor', estres: 'Estrés', animo: 'Ánimo', recuperacion: 'Recup.' };
const wd = d => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' });

// ---------------- Wellness ----------------
export function TeamWellness() {
  const [date, setDate] = useState(todayISO());
  const from = addDays(date, -13);
  const w = useApi(`/team/wellness?from=${from}&to=${date}`);
  const players = useApi('/players?category=senior');
  const st = useApi('/settings');
  const items = st.data?.wellness.items || [];
  const day = (w.data || []).filter(x => x.date === date);
  const byPlayer = new Map(day.map(x => [x.player_id, x]));
  const rows = (players.data || []).map(p => ({ p, e: byPlayer.get(p.id) })).sort((a, b) => (a.e ? 0 : 1) - (b.e ? 0 : 1) || (a.e?.summary.total ?? 0) - (b.e?.summary.total ?? 0));
  const answered = rows.filter(r => r.e), missing = rows.filter(r => !r.e);
  const avg = answered.length ? Math.round(answered.reduce((a, r) => a + (r.e.summary.total ?? 0), 0) / answered.length) : null;
  const itemAvg = items.map(it => { const v = answered.map(r => r.e.summary.items.find(i => i.key === it.key)?.pct).filter(x => x != null); return { ...it, pct: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null }; });
  const trend = useMemo(() => { const out = []; for (let k = 13; k >= 0; k--) { const d = addDays(date, -k); const l = (w.data || []).filter(x => x.date === d && x.summary.total != null); out.push({ date: d, avg: l.length ? Math.round(l.reduce((a, x) => a + x.summary.total, 0) / l.length) : null, n: l.length }); } return out; }, [w.data, date]);
  if ((w.loading && !w.data) || players.loading || st.loading) return <Loading />;
  return <div>
    <PageHead back="/primer-equipo" title="Wellness" sub="Respuestas diarias de los jugadores" />
    <DayNav date={date} setDate={setDate} />
    <ErrorBox error={w.error} />
    <div className="ck-top">
      <div className="card ck-big" style={{ borderTopColor: PCT(avg) }}><small>Media del equipo</small><b style={{ color: PCT(avg) }}>{avg ?? '—'}<span>%</span></b>
        <span className="small muted">{answered.length} de {rows.length} jugadores han respondido</span>
        <div className="ck-prog"><i style={{ width: (rows.length ? answered.length / rows.length * 100 : 0) + '%' }} /></div></div>
      <div className="card"><h3>Por ítem (media del equipo)</h3>
        <div className="ck-items">{itemAvg.map(it => <div key={it.key}><span className="small">{it.label}</span><div className="ck-bar"><i style={{ width: (it.pct ?? 0) + '%', background: PCT(it.pct) }} /></div><b className="small">{it.pct ?? '—'}{it.pct != null && ' %'}</b></div>)}</div></div>
      <div className="card"><h3>Últimos 14 días</h3>
        <ResponsiveContainer width="100%" height={150}><BarChart data={trend} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#ecede8" vertical={false} /><XAxis dataKey="date" tickFormatter={d => fmtDate(d, { day: 'numeric' })} stroke="#9a9b95" fontSize={10} tickLine={false} interval={0} />
          <YAxis domain={[0, 100]} stroke="#9a9b95" fontSize={10} tickLine={false} />
          <Tooltip formatter={(v, n, p) => [v == null ? 'Sin respuestas' : `${v} % (${p.payload.n} jug.)`, 'Media']} labelFormatter={d => wd(d)} />
          <Bar dataKey="avg" radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={x => x?.payload && setDate(x.payload.date)} style={{ cursor: 'pointer' }}>{trend.map((t, i) => <Cell key={i} fill={t.date === date ? '#111511' : PCT_HEX(t.avg)} />)}</Bar>
        </BarChart></ResponsiveContainer></div>
    </div>
    <div className="card" style={{ marginTop: 14 }}><div className="row between"><h3 style={{ margin: 0 }}>Jugadores</h3><span className="small muted">De peor a mejor estado · cada cuadro es un ítem</span></div>
      {!answered.length ? <Empty title="Nadie ha respondido todavía este día" /> :
        <div className="ck-wlist">
          <div className="ck-whead"><span /><span />{items.map(it => <span key={it.key} title={it.label}>{SHORT[it.key] || it.label.slice(0, 7)}</span>)}</div>
          {answered.map(({ p, e }) => <div key={p.id} className="ck-wrow">
            <span className="ck-who"><Avatar name={p.full_name} fileId={p.photo_file_id} /><span>{p.full_name}</span></span>
            <b className="ck-tot" style={{ background: PCT(e.summary.total) }}>{e.summary.total ?? '—'}</b>
            {items.map(it => { const x = e.summary.items.find(i => i.key === it.key); return <span key={it.key} className="ck-cell" title={`${it.label}: ${x?.value ?? '—'}${x?.value != null ? ` (${it.anchors?.[x.value - (st.data.wellness.min || 1)] || ''})` : ''}`} style={{ background: PCT(x?.pct) }}>{x?.value ?? ''}</span>; })}
            {e.notes && <span className="ck-note">💬 {e.notes}</span>}
          </div>)}
        </div>}
      {missing.length > 0 && <div className="ck-miss"><span className="small"><b>Sin responder ({missing.length}):</b></span> {missing.map(({ p }) => <span key={p.id} className="tag">{p.full_name}</span>)}</div>}
    </div>
  </div>;
}

// ---------------- RPE ----------------
export function TeamRpe() {
  const to = todayISO(), from = addDays(to, -55);
  const r = useApi(`/team/rpe-overview?from=${from}&to=${to}`);
  const [sel, setSel] = useState(null);
  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />;
  const days = r.data;
  const cur = days.find(d => d.date === sel) || days[0];
  const chart = [...days].reverse().map(d => ({ date: d.date, avg: d.avg_rpe, n: d.n }));
  return <div>
    <PageHead back="/primer-equipo" title="RPE" sub="Esfuerzo percibido de cada sesión (martes, jueves y viernes)" />
    {!days.length ? <Empty title="Sin sesiones de entrenamiento en las últimas semanas" /> : <>
      <div className="card"><h3>RPE medio por sesión · últimas 8 semanas</h3>
        <ResponsiveContainer width="100%" height={170}><BarChart data={chart} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#ecede8" vertical={false} /><XAxis dataKey="date" tickFormatter={d => fmtDate(d, { day: 'numeric', month: 'numeric' })} stroke="#9a9b95" fontSize={10} tickLine={false} minTickGap={6} />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} stroke="#9a9b95" fontSize={10} tickLine={false} />
          <Tooltip formatter={(v, n, p) => [v == null ? 'Sin respuestas' : `${fmtNum(v, 1)} (${p.payload.n} jug.)`, 'RPE medio']} labelFormatter={d => wd(d)} />
          <Bar dataKey="avg" radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={x => x?.payload && setSel(x.payload.date)} style={{ cursor: 'pointer' }}>{chart.map((c, i) => <Cell key={i} fill={c.date === cur.date ? '#111511' : RPE_HEX(c.avg)} />)}</Bar>
        </BarChart></ResponsiveContainer>
        <p className="small muted" style={{ margin: 0 }}>Toca una barra o una sesión de la lista para ver las respuestas de cada jugador.</p></div>
      <div className="ck-rpe">
        <div className="ck-days">{days.map(d => <button key={d.date} className={d.date === cur.date ? 'on' : ''} onClick={() => setSel(d.date)}>
          <span className="ck-dw">{fmtDate(d.date, { weekday: 'short' })}</span><span className="ck-dd">{fmtDate(d.date, { day: 'numeric', month: 'short' })}</span>
          <b style={{ background: RPE_HEX(d.avg_rpe) }}>{d.avg_rpe == null ? '—' : fmtNum(d.avg_rpe, 1)}</b><small>{d.n}/{d.expected}</small></button>)}</div>
        <div className="card ck-ses">
          <div className="ck-ses-head">
            <div><span className="small muted">{cur.session_type}{cur.planned_minutes ? ` · ${cur.planned_minutes} min previstos` : ''}</span><h3 style={{ margin: '2px 0 0', textTransform: 'capitalize' }}>{wd(cur.date)}</h3></div>
            <div className="ck-avg" style={{ '--c': RPE_HEX(cur.avg_rpe) }}><b>{cur.avg_rpe == null ? '—' : fmtNum(cur.avg_rpe, 1)}</b><span>RPE medio<br />{RPE_TXT(cur.avg_rpe)}</span></div>
          </div>
          <div className="small muted">{cur.n} respuesta{cur.n === 1 ? '' : 's'} de {cur.expected} jugadores esperados{cur.fills ? ` · ${cur.fills} relleno${cur.fills > 1 ? 's' : ''} automático${cur.fills > 1 ? 's' : ''} (no cuentan en la media)` : ''}</div>
          <Dist entries={cur.entries.filter(e => !e.fill)} />
          {cur.entries.length > 0 && <div className="ck-plist">{cur.entries.map(e => <div key={e.player_id} className={'ck-prow' + (e.fill ? ' fill' : '')}>
            <span className="ck-who"><Avatar name={e.name} fileId={e.photo_file_id} /><span>{e.name}{e.fill && <small className="muted"> · relleno</small>}</span></span>
            <span className="ck-rbar"><i style={{ width: e.rpe * 10 + '%', background: RPE_HEX(e.rpe) }} /></span>
            <b className="ck-rv" style={{ color: RPE_HEX(e.rpe) }}>{fmtNum(e.rpe, 0)}</b>
            <span className="small muted ck-rd">{fmtNum(e.duration, 0)}′ · {fmtNum(e.load, 0)} UA</span>
            {e.notes && <span className="ck-note">💬 {e.notes}</span>}</div>)}</div>}
          {cur.missing.length > 0 && <div className="ck-miss"><span className="small"><b>Sin RPE ({cur.missing.length}):</b></span> {cur.missing.map(m => <span key={m.player_id} className={'tag' + (m.reason ? '' : ' warn')}>{m.name}{m.reason ? ` · ${m.reason}` : ''}</span>)}</div>}
        </div>
      </div>
    </>}
  </div>;
}

// Distribución de respuestas en la escala 0–10
function Dist({ entries }) {
  if (!entries.length) return null;
  const c = Array.from({ length: 11 }, (_, v) => entries.filter(e => Math.round(e.rpe) === v).length), max = Math.max(...c);
  return <div className="ck-dist">{c.map((n, v) => <div key={v}><span className="ck-dn">{n || ''}</span><i style={{ height: max ? n / max * 46 + 2 : 2, background: n ? RPE_HEX(v) : '#ecede8' }} /><small>{v}</small></div>)}</div>;
}

function DayNav({ date, setDate }) {
  const t = todayISO();
  return <div className="row ck-nav"><button className="btn sm" onClick={() => setDate(addDays(date, -1))}>◀</button>
    <b style={{ textTransform: 'capitalize' }}>{date === t ? 'Hoy · ' : ''}{wd(date)}</b>
    <button className="btn sm" disabled={date >= t} onClick={() => setDate(addDays(date, 1))}>▶</button>
    <input type="date" value={date} max={t} onChange={e => e.target.value && setDate(e.target.value)} style={{ width: 'auto' }} />
    {date !== t && <button className="btn sm ghost" onClick={() => setDate(t)}>Hoy</button>}</div>;
}
