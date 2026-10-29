import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { api } from '../../api';
import { Avatar, ColorBadge, Empty, ErrorBox, Field, ListRow, Loading, Modal, PageHead, PlayerPicker, Seg, Tabs, useApi, useToast } from '../../components/ui';
import { INJ_COLOR, INJ_STATUS, addDays, fmtDate, todayISO } from '../../lib/format';

export default function InjuryDashboard() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [status, setStatus] = useState('abiertas');
  const [q, setQ] = useState('');
  const [adv, setAdv] = useState(false);
  const [f, setF] = useState({ type: '', from: '', to: '' });
  const list = useApi('/injuries?' + new URLSearchParams(Object.entries({ status, q, ...f }).filter(([, v]) => v)).toString());
  const dash = useApi('/injuries/dashboard');
  const [tab, setTab] = useState('lista');
  const [creating, setCreating] = useState(!!sp.get('player'));
  const d = dash.data;
  const overdue = d?.upcoming.filter(i => i.review_overdue).length || 0;
  return <div style={{ maxWidth: 960 }}>
    <PageHead title="Lesiones" sub={d ? `${d.activeTotal} procesos abiertos${overdue ? ` · ${overdue} revisiones vencidas` : ''}` : null}
      actions={<button className="btn primary" onClick={() => setCreating(true)}>+ Registrar lesión</button>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'lista', label: 'Procesos' }, { key: 'revisiones', label: 'Revisiones' }, { key: 'calendario', label: 'Calendario' }, { key: 'evolucion', label: 'Evolución' }]} />
    {tab === 'lista' && <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Seg value={status} onChange={setStatus} options={[{ value: 'abiertas', label: 'Abiertos' }, { value: 'completada', label: 'Completados' }, { value: '', label: 'Todos' }]} />
        <input type="search" placeholder="Buscar jugador…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 220 }} />
        <button className="btn sm ghost" onClick={() => setAdv(a => !a)}>{adv ? 'Ocultar filtros' : 'Más filtros'}</button>
      </div>
      {adv && <div className="card row" style={{ marginBottom: 12 }}>
        <Field label="Tipo o zona"><input type="search" value={f.type} onChange={e => setF({ ...f, type: e.target.value })} /></Field>
        <Field label="Desde"><input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Hasta"><input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></Field>
      </div>}
      {list.loading ? <Loading /> : !list.data?.length ? <Empty title={status === 'abiertas' ? 'No hay procesos abiertos' : 'No hay procesos con estos filtros'} /> :
        <div className="list">{list.data.map(i => <ListRow key={i.id} onClick={() => nav('/lesiones/' + i.id)}
          left={<Avatar name={i.player_name} fileId={i.photo_file_id} />} title={i.player_name}
          sub={[i.zone || 'Zona pendiente', i.laterality, `${i.days_elapsed} días`].filter(Boolean).join(' · ')}
          right={<>{i.last_pain && <span className="tag" title={`Último dolor registrado por el jugador (${i.last_pain.date})`}>EVA {i.last_pain.eva}</span>}{i.review_overdue && <span className="tag warn">Revisión vencida</span>}<ColorBadge color={INJ_COLOR[i.status]}>{INJ_STATUS[i.status]}</ColorBadge></>} />)}</div>}
    </>}
    {tab === 'revisiones' && d && (!d.upcoming.length ? <Empty title="No hay revisiones programadas" /> : <div className="list">{d.upcoming.map(i => <ListRow key={i.id} onClick={() => nav('/lesiones/' + i.id)}
      left={<b style={{ font: '700 18px var(--head)', minWidth: 64, color: i.review_overdue ? 'var(--rojo)' : 'var(--ink)' }}>{fmtDate(i.next_review, { day: 'numeric', month: 'short' })}</b>}
      title={i.player_name} sub={`${i.zone || 'Lesión'} · ${i.phase_name || ''}`} right={i.review_overdue ? <span className="tag warn">Vencida</span> : null} />)}</div>)}
    {tab === 'calendario' && <Calendar />}
    {tab === 'evolucion' && d && <div className="card"><h3>Lesiones nuevas y procesos completados por mes</h3>
      <ResponsiveContainer width="100%" height={260}><BarChart data={d.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="#ecede8" vertical={false} /><XAxis dataKey="month" stroke="#9a9b95" fontSize={11} tickLine={false} tickFormatter={m => fmtDate(m + '-01', { month: 'short', year: '2-digit' })} />
        <YAxis allowDecimals={false} stroke="#9a9b95" fontSize={11} tickLine={false} width={30} /><Tooltip labelFormatter={m => fmtDate(m + '-01', { month: 'long', year: 'numeric' })} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="nuevas" name="Nuevas lesiones" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={22} /><Bar isAnimationActive={false} dataKey="completadas" name="Procesos completados" fill="#eb6834" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart></ResponsiveContainer></div>}
    {creating && <NewInjury presetPlayer={sp.get('player')} onClose={() => { setCreating(false); if (sp.get('player')) setSp({}); }} onSaved={id => nav('/lesiones/' + id)} />}
  </div>;
}

function Calendar() {
  const nav = useNavigate();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const ev = useApi('/injuries/calendar?month=' + month);
  const first = month + '-01';
  const startWd = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const daysIn = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  const shift = n => { const d = new Date(first + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const t = todayISO();
  return <div className="card">
    <div className="card-head"><h3 style={{ textTransform: 'capitalize' }}>{fmtDate(first, { month: 'long', year: 'numeric' })}</h3>
      <div className="row"><button className="btn sm" onClick={() => shift(-1)}>←</button><button className="btn sm" onClick={() => setMonth(t.slice(0, 7))}>Hoy</button><button className="btn sm" onClick={() => shift(1)}>→</button></div></div>
    <div className="calendar">
      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="dh">{d}</div>)}
      {cells.map((c, i) => c ? <div key={i} className={'d' + (c === t ? ' today' : '')}><span className="n">{+c.slice(8)}</span>
        {(ev.data || []).filter(e => e.date === c).map((e, j) => <button key={j} className={'ev ' + (e.type === 'lesion' ? 'lesion' : '') + (e.overdue ? ' overdue' : '')} title={`${e.player_name} · ${e.text}`} onClick={() => nav('/lesiones/' + e.injury_id)}>{e.player_name.split(' ')[0]} · {e.text}</button>)}
      </div> : <div key={i} className="d out" />)}
    </div>
    <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: '#eef4fc', border: '1px solid #c9dcf4' }} />Revisión</span><span><i style={{ background: '#fdeeee', border: '1px solid #f0c4c4' }} />Fecha de lesión</span><span><i style={{ background: '#fff1d6', border: '1px solid #f3dca2' }} />Revisión vencida</span></div>
  </div>;
}

function NewInjury({ presetPlayer, onClose, onSaved }) {
  const toast = useToast();
  const players = useApi('/players');
  const [player, setPlayer] = useState(null);
  const [v, setV] = useState({ injury_date: todayISO(), zone: '', laterality: '', injury_type: '', diagnosis: '', mechanism: '' });
  const [err, setErr] = useState(null);
  useEffect(() => { if (presetPlayer && players.data) setPlayer(players.data.find(p => String(p.id) === presetPlayer) || null); }, [presetPlayer, players.data]);
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const save = async () => {
    try { const r = await api.post('/injuries', { ...v, player_id: player.id, laterality: v.laterality || null }); toast('Proceso de lesión abierto'); onSaved(r.id); }
    catch (e) { setErr(e.message); }
  };
  const all = useMemo(() => players.data || [], [players.data]);
  return <Modal title="Registrar lesión" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!player} onClick={save}>Abrir proceso</button></>}>
    <div className="stack">
      {!player ? <PlayerPicker players={all} onChange={setPlayer} /> : <div className="row"><Avatar name={player.full_name} fileId={player.photo_file_id} /><b>{player.full_name}</b><span className="muted">{player.category_name}</span><button className="btn sm ghost" onClick={() => setPlayer(null)}>Cambiar</button></div>}
      <div className="inline-fields">
        <Field label="Fecha de lesión" required><input type="date" value={v.injury_date} onChange={set('injury_date')} /></Field>
        <Field label="Zona anatómica"><input type="text" value={v.zone} onChange={set('zone')} placeholder="p. ej. Isquiotibiales" /></Field>
        <Field label="Lateralidad"><select value={v.laterality} onChange={set('laterality')}><option value="">Pendiente</option><option value="derecha">Derecha</option><option value="izquierda">Izquierda</option><option value="bilateral">Bilateral</option></select></Field>
        <Field label="Tipo de lesión"><input type="text" value={v.injury_type} onChange={set('injury_type')} placeholder="p. ej. Muscular" /></Field>
      </div>
      <Field label="Diagnóstico o descripción exacta disponible" hint="del profesional sanitario"><textarea value={v.diagnosis} onChange={set('diagnosis')} /></Field>
      <Field label="Mecanismo de lesión" hint="si se conoce"><input type="text" value={v.mechanism} onChange={set('mechanism')} /></Field>
      <ErrorBox error={err} />
    </div>
  </Modal>;
}
