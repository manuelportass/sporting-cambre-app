import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth, useClub } from '../../App';
import { Avatar, ColorBadge, Empty, ErrorBox, Field, Loading, Modal, useApi, useToast } from '../../components/ui';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, ReferenceLine, Cell, LineChart, Line } from 'recharts';
import { fileUrl } from '../../api';
import { crestOf, teamName } from '../../lib/crests';
import { canPromptInstall, disablePush, enablePush, isDemo, isIOS, isStandalone, onInstallable, promptInstall, pushState, pushSupported } from '../../lib/push';
import ChangePin from '../ChangePin';
import { Crest } from '../Login';
import { addDays, fmtDate, fmtDateLong, fmtDateTime, fmtNum, todayISO } from '../../lib/format';

const Icon = ({ d }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const IC = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', hist: 'M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  prog: 'M4 20V10M10 20V4M16 20v-7M22 20H2', season: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 2l3 5-3 3-3-3zM2.5 10l4.5 1 1 4.5M21.5 10l-4.5 1-1 4.5M8 21l1-5.5h6L16 21', user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  rpe: 'M13 2L3 14h9l-1 8 10-12h-9z', pain: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 15s1.5-2 4-2 4 2 4 2M9 9h.01M15 9h.01', well: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z', plus: 'M12 5v14M5 12h14',
};

export default function PlayerApp() {
  const [view, setView] = useState(() => { try { const v = new URLSearchParams(window.location.search).get('v'); return { name: ['wellness', 'rpe', 'dolor', 'extra'].includes(v) ? v : 'inicio' }; } catch { return { name: 'inicio' }; } });
  useEffect(() => { try { if (window.location.search.includes('v=')) window.history.replaceState(null, '', window.location.pathname); } catch { /* nada */ } }, []);
  const go = (name, extra = {}) => { setView({ name, ...extra }); window.scrollTo(0, 0); };
  const profile = useApi('/me/profile');
  const club = useClub();
  const nav = [['inicio', 'Inicio', IC.home], ['temporada', 'Mi temporada', IC.season], ['progreso', 'Mi progreso', IC.prog], ['perfil', 'Perfil', IC.user]];
  const main = nav.some(([k]) => k === view.name);
  const p = profile.data;
  return <div className="pl">
    {view.name === 'inicio' ? <HomeScreen p={p} club={club} go={go} /> :
      <div className="pl-top slim"><div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        {!main ? <button className="pl-back" onClick={() => go('inicio')}>← Volver</button> : <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}><Crest size={30} /><b className="pl-title">{nav.find(([k]) => k === view.name)?.[1]}</b></div>}
        {p && <Avatar name={p.full_name} fileId={p.photo_file_id} />}</div></div>}
    {view.name !== 'inicio' && <div className="pl-body">
      {view.name === 'rpe' && <RpeForm go={go} kind="colectivo" />}
      {view.name === 'extra' && <RpeForm go={go} kind="adicional" />}
      {view.name === 'wellness' && <WellnessForm go={go} />}
      {view.name === 'dolor' && <PainForm go={go} />}
      {view.name === 'ok' && <Saved view={view} go={go} />}
      {view.name === 'temporada' && <Season />}
      {view.name === 'progreso' && <Progress />}
      {view.name === 'registros' && <History />}
      {view.name === 'perfil' && <Profile p={p} go={go} />}
    </div>}
    <nav className="pl-nav"><div>{nav.map(([k, l, d]) => <button key={k} className={view.name === k ? 'on' : ''} onClick={() => go(k)}><Icon d={d} />{l}</button>)}</div></nav>
  </div>;
}

// Inicio: escudo y club, saludo, accesos rápidos justo debajo y la foto del jugador abajo a la izquierda
function HomeScreen({ p, club, go }) {
  const [broken, setBroken] = useState(false);
  const src = p?.photo_file_id && !broken ? fileUrl(p.photo_file_id) : null;
  const first = (p?.first_name || '').split(' ')[0];
  return <div className="pl-home">
    <div className="pl-home-head">
      <div className="pl-hero-top"><Crest size={34} /><span>{club.name}</span></div>
      <div className="hello">Hola, <span>{first}</span></div><small>{fmtDateLong(todayISO())}</small>
    </div>
    <div className="pl-home-actions"><HomeView go={go} /><SetupCard /></div>
    <div className="pl-home-photo">
      <i className="deco d1" aria-hidden="true" /><i className="deco d2" aria-hidden="true" />
      <span className="pl-home-crest" aria-hidden="true"><Crest size={150} /></span>
      <HomeNext go={go} />
      {src ? <img className="pl-ph" src={src} alt={p.full_name} onError={() => setBroken(true)} /> : null}
    </div>
  </div>;
}

// Detalle de la portada: próximo partido en pequeño, a la derecha de la foto
function HomeNext({ go }) {
  const n = useApi('/me/next-match');
  const m = n.data;
  if (!m) return null;
  const days = Math.round((new Date(m.date + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 864e5);
  return <button className="hn" onClick={() => go('temporada')}>
    <span className="hn-l">Próximo partido<em>Jornada {m.matchday}</em></span>
    <span className="hn-c">{crestOf(m.opponent) ? <img src={crestOf(m.opponent)} alt="" /> : null}</span>
    <b>{teamName(m.opponent)}</b>
    <span className="hn-d">{fmtDate(m.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {m.home_away === 'local' ? 'casa' : 'fuera'}</span>
    <span className="hn-n">{days === 0 ? '¡Hoy!' : days === 1 ? 'Mañana' : `Faltan ${days} días`}</span>
  </button>;
}

function HomeView({ go }) {
  const t = useApi('/me/today');
  const inj = useApi('/me/injury');
  if (t.loading) return <Loading />;
  if (t.error) return <ErrorBox error={t.error} retry={t.reload} />;
  const d = t.data;
  const colRpe = d.rpe.filter(r => r.kind === 'colectivo');
  const extra = d.rpe.filter(r => r.kind === 'adicional').length;
  const tiles = [
    { k: 'wellness', label: 'Wellness', ic: IC.well, done: !!d.wellness, st: d.wellness ? 'Hecho' : 'Cada día' },
    { k: 'rpe', label: 'RPE', ic: IC.rpe, done: colRpe.length > 0, st: colRpe.length ? `Enviado · ${colRpe[0].rpe}` : 'Al terminar' },
    { k: 'extra', label: 'Adicional', ic: IC.plus, done: extra > 0, st: extra ? `${extra} hoy` : 'Por tu cuenta' },
    ...(inj.data?.injury ? [{ k: 'dolor', label: 'EVA lesión', ic: IC.pain, done: !!inj.data.today, st: inj.data.today ? `Hoy: ${inj.data.today.eva}` : 'Tras la sesión', warn: true }] : []),
  ];
  const wd = d.weekday;
  const today = d.match ? { ic: '⚽', t: <>Hoy hay <b>partido</b> vs {teamName(d.match.opponent)}</> }
    : d.sessions.length || d.isCollectiveDay ? { ic: '●', t: <>Hoy, {wd}, hay <b>entrenamiento</b>{d.sessions[0]?.session_type && d.sessions[0].session_type !== 'Entrenamiento' ? ` (${d.sessions[0].session_type.toLowerCase()})` : ''}</>, on: true }
    : { ic: '○', t: <>Hoy no hay entrenamiento · entrenamos {d.collectiveDays.join(', ').replace(/, ([^,]*)$/, ' y $1')}</> };
  return <>
    <div className={'today-line' + (today.on ? ' on' : '')}><span className="tl-dot">{today.ic}</span>{today.t}</div>
    <div className={'qtiles n' + tiles.length}>{tiles.map(x => <button key={x.k} className={'qtile' + (x.done ? ' done' : '') + (x.warn ? ' warn' : '')} onClick={() => go(x.k)}>
      <span className="qi"><Icon d={x.ic} /></span>
      {x.done && <span className="qok" aria-label="Hecho"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg></span>}
      <b>{x.label}</b><small>{x.st}</small></button>)}</div>
  </>;
}

function RpeForm({ go, kind }) {
  const t = useApi('/me/today');
  const settings = useApi('/settings');
  const isExtra = kind === 'adicional';
  const days = useApi(isExtra ? null : '/me/rpe-sessions');
  const [v, setV] = useState({ date: isExtra ? todayISO() : '', session_type: '', description: '', duration_min: '', rpe: null, notes: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (t.data && !v.session_type) setV(o => ({ ...o, session_type: isExtra ? t.data.extraTypes[0] : t.data.sessionTypes[0], duration_min: !isExtra && t.data.sessions[0]?.planned_minutes ? String(t.data.sessions[0].planned_minutes) : o.duration_min }));
  }, [t.data, isExtra, v.session_type]);
  if (t.loading || settings.loading || (!isExtra && days.loading)) return <Loading />;
  const scale = settings.data.rpeScale;
  const load = v.duration_min && v.rpe !== null ? Number(v.duration_min) * v.rpe : null;
  const ready = v.date && v.session_type && Number(v.duration_min) > 0 && v.rpe !== null && v.notes.trim();
  const submit = async e => {
    e.preventDefault(); if (!ready) return; setBusy(true); setErr(null);
    try { const r = await api.post(isExtra ? '/me/extra' : '/me/rpe', v); go('ok', { what: isExtra ? 'Entrenamiento adicional' : 'RPE de la sesión', entry: r.entry }); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  const types = isExtra ? t.data.extraTypes : t.data.sessionTypes;
  return <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
    <h2>{isExtra ? 'Entrenamiento adicional' : 'RPE de la sesión'}</h2>
    <div className="card stack">
      {isExtra ? <Field label="Fecha" required><input type="date" value={v.date} max={todayISO()} min={addDays(todayISO(), -14)} onChange={e => setV({ ...v, date: e.target.value })} /></Field> :
        <div className="stack" style={{ gap: 6 }}><span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Día de la sesión <span style={{ color: 'var(--accent)' }}>*</span></span>
          <div className="day-pick" role="radiogroup" aria-label="Día de la sesión">{(days.data || []).map(d => <button type="button" role="radio" key={d.date} aria-checked={v.date === d.date} disabled={!!d.done} className={v.date === d.date ? 'on' : ''}
            onClick={() => setV({ ...v, date: d.date, duration_min: d.planned_minutes ? String(d.planned_minutes) : v.duration_min })}>
            <b>{d.weekday}</b><span>{d.done ? '✓ enviado' : fmtDate(d.date, { day: 'numeric', month: 'short' })}</span></button>)}</div></div>}
      <Field label={isExtra ? 'Tipo de entrenamiento' : 'Tipo de sesión'} required><select value={v.session_type} onChange={e => setV({ ...v, session_type: e.target.value })}>{types.map(x => <option key={x}>{x}</option>)}</select></Field>
      {isExtra && <Field label="Descripción o modalidad"><input type="text" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} placeholder="p. ej. Gimnasio, tren inferior" /></Field>}
      <Field label="Duración real (minutos)" required><input type="number" inputMode="numeric" min="1" max="300" value={v.duration_min} onChange={e => setV({ ...v, duration_min: e.target.value })} /></Field>
      <div className="row" style={{ gap: 6 }}>{[45, 60, 75, 90, 105].map(m => <button type="button" key={m} className="btn sm" onClick={() => setV({ ...v, duration_min: String(m) })}>{m}′</button>)}</div>
    </div>
    <div className="card stack"><span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>¿Qué tan dura ha sido la sesión? (RPE 0–10) <span style={{ color: 'var(--accent)' }}>*</span></span>
      <div className="rpe-grid" role="radiogroup" aria-label="RPE">{scale.map((l, i) => <button type="button" key={i} role="radio" aria-checked={v.rpe === i} className={v.rpe === i ? 'on' : ''} onClick={() => setV({ ...v, rpe: i })}><b>{i}</b><span>{l}</span></button>)}</div>
    </div>
    <div className="big-total"><div><div className="small muted">Carga de la sesión</div><div className="small muted">duración × RPE (se calcula sola)</div></div><span className="v">{load === null ? '—' : fmtNum(load)} <span className="small">UA</span></span></div>
    <div className="card"><Field label="Observaciones" required hint="obligatorio"><textarea value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} placeholder="¿Cómo te has sentido? ¿Alguna molestia?" /></Field></div>
    <ErrorBox error={err} />
    <button className="btn primary lg" disabled={!ready || busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
    {!ready && <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>{isExtra ? 'Completa la duración, el RPE y las observaciones para poder enviar.' : 'Elige el día de la sesión y completa la duración, el RPE y las observaciones.'}</p>}
  </form>;
}

const EVA_HINT = ['Sin dolor', '', '', 'Leve', '', 'Moderado', '', 'Intenso', '', '', 'El peor imaginable'];
const evaBg = v => v <= 2 ? 'var(--verde)' : v <= 4 ? 'var(--amarillo)' : v <= 6 ? 'var(--naranja)' : 'var(--rojo)';
// Cuestionario de dolor durante la sesión (solo con un proceso de lesión abierto)
function PainForm({ go }) {
  const inj = useApi('/me/injury');
  const [v, setV] = useState({ date: todayISO(), eva: null, notes: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  if (inj.loading) return <Loading />;
  if (!inj.data?.injury) return <Empty title="No tienes ningún proceso de lesión abierto" />;
  const ready = v.date && v.eva !== null && v.notes.trim();
  const submit = async e => {
    e.preventDefault(); if (!ready) return; setBusy(true); setErr(null);
    try { await api.post('/me/pain', v); go('ok', { what: 'Dolor (EVA)' }); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
    <h2>EVA tras la sesión (lesión)</h2>
    <div className="card stack">
      <Field label="Fecha de la sesión" required><input type="date" value={v.date} max={todayISO()} min={addDays(todayISO(), -7)} onChange={e => setV({ ...v, date: e.target.value })} /></Field>
    </div>
    <div className="card stack"><span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>¿Cuánto dolor has sentido durante la sesión? (EVA 0–10) <span style={{ color: 'var(--accent)' }}>*</span></span>
      <div className="eva-grid" role="radiogroup" aria-label="EVA">{EVA_HINT.map((l, n) => <button type="button" key={n} role="radio" aria-checked={v.eva === n} className={v.eva === n ? 'on' : ''} style={v.eva === n ? { background: evaBg(n), borderColor: evaBg(n) } : null} onClick={() => setV({ ...v, eva: n })}><b>{n}</b></button>)}</div>
      <div className="row between small muted"><span>0 · Sin dolor</span><span>10 · El peor imaginable</span></div>
    </div>
    <div className="card"><Field label="Observaciones sobre el dolor" required hint="obligatorio"><textarea value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} placeholder="¿Dónde? ¿En qué ejercicio o momento? ¿Ha ido a más o a menos?" /></Field></div>
    <ErrorBox error={err} />
    <button className="btn primary lg" disabled={!ready || busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
    {!ready && <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Indica la fecha, el dolor (EVA) y tus observaciones para poder enviar.</p>}
    {inj.data.pain.length > 0 && <div className="card"><h3>Tus últimos registros</h3>{inj.data.pain.slice(0, 8).map(x => <div key={x.id} className="row small" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)', flexWrap: 'nowrap' }}>
      <span className="evab" style={{ width: 26, height: 26, fontSize: 14, background: evaBg(x.eva) }}>{x.eva}</span><span style={{ minWidth: 70 }}>{fmtDate(x.date, { day: 'numeric', month: 'short' })}</span><span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.notes}</span></div>)}</div>}
  </form>;
}

function WellnessForm({ go }) {
  const settings = useApi('/settings');
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(todayISO());
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  if (settings.loading) return <Loading />;
  const w = settings.data.wellness;
  const vals = Array.from({ length: w.max - w.min + 1 }, (_, i) => w.min + i);
  const ready = w.items.every(it => scores[it.key] !== undefined) && notes.trim();
  const submit = async e => {
    e.preventDefault(); if (!ready) return; setBusy(true); setErr(null);
    try { const r = await api.post('/me/wellness', { date, scores, notes }); go('ok', { what: 'Wellness', wellness: r }); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  return <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
    <h2>Wellness</h2>
    <Field label="Fecha"><input type="date" value={date} max={todayISO()} min={addDays(todayISO(), -3)} onChange={e => setDate(e.target.value)} /></Field>
    {w.items.map(it => <div key={it.key} className="card stack" style={{ gap: 8 }}>
      <b style={{ font: '700 17px var(--head)', textTransform: 'uppercase' }}>{it.label}</b>
      <div className="scale" style={{ gridTemplateColumns: `repeat(${vals.length}, 1fr)` }} role="radiogroup" aria-label={it.label}>
        {vals.map((n, k) => <button type="button" key={n} role="radio" aria-checked={scores[it.key] === n} className={scores[it.key] === n ? 'on' : ''} onClick={() => setScores({ ...scores, [it.key]: n })}><b>{n}</b><span>{it.anchors?.[k] || ''}</span></button>)}</div>
      {scores[it.key] !== undefined && it.anchors?.[scores[it.key] - w.min] && <span className="small muted">{scores[it.key]} = {it.anchors[scores[it.key] - w.min]}</span>}
    </div>)}
    <div className="card"><Field label="Observaciones" required hint="obligatorio"><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Cualquier cosa que el preparador deba saber" /></Field></div>
    <ErrorBox error={err} />
    <button className="btn primary lg" disabled={!ready || busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
    {!ready && <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Responde a todos los apartados y escribe tus observaciones para poder enviar.</p>}
  </form>;
}

function Saved({ view, go }) {
  const e = view.entry;
  return <div className="stack" style={{ gap: 14, textAlign: 'center' }}>
    <div style={{ fontSize: 54, color: 'var(--verde)' }} aria-hidden="true">✓</div>
    <h2>{view.what} guardado</h2>
    {e && <div className="card" style={{ textAlign: 'left' }}>
      <div className="row between"><span className="muted">Fecha</span><b>{fmtDate(e.date)}</b></div>
      <div className="row between"><span className="muted">Sesión</span><b>{e.session_type}</b></div>
      <div className="row between"><span className="muted">Duración</span><b>{fmtNum(e.duration_min)} min</b></div>
      <div className="row between"><span className="muted">RPE</span><b>{e.rpe}</b></div>
      <div className="row between"><span className="muted">Carga</span><b>{fmtNum(e.load_au)} UA</b></div>
      <div className="small muted" style={{ marginTop: 6 }}>Registrado el {fmtDateTime(e.created_at)}</div></div>}
    {view.wellness && <div className="card"><ColorBadge color={view.wellness.summary.color}>Estado global: {view.wellness.summary.total} %</ColorBadge></div>}
    <button className="btn primary lg" onClick={() => go('inicio')}>Volver al inicio</button>
    
  </div>;
}

function History() {
  const h = useApi('/me/history');
  const settings = useApi('/settings');
  const [corr, setCorr] = useState(null);
  const toast = useToast();
  if (h.loading) return <Loading />;
  if (h.error) return <ErrorBox error={h.error} />;
  const pend = new Set(h.data.corrections.filter(c => c.status === 'pendiente').map(c => c.entity + c.entity_id));
  const items = [...h.data.loads.map(l => ({ ...l, t: 'load' })), ...h.data.wellness.map(w => ({ ...w, t: 'wellness' }))].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  return <div className="stack">
    <h2>Mis registros enviados</h2>
    <p className="small muted" style={{ margin: 0 }}>Últimas 6 semanas. Los registros enviados no se pueden modificar directamente: si hay un error, solicita una corrección al preparador.</p>
    {!items.length ? <Empty title="Aún no tienes registros" /> : items.map(x => <div key={x.t + x.id} className="card" style={{ opacity: x.status === 'anulado' ? 0.55 : 1 }}>
      <div className="row between"><b>{fmtDate(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
        {x.t === 'load' ? <span className="tag">{x.kind === 'adicional' ? 'Adicional' : x.kind === 'partido' ? 'Partido' : 'Colectivo'}</span> : <span className="tag">Wellness</span>}</div>
      {x.t === 'load' ? <div className="small" style={{ marginTop: 4 }}>{x.session_type}{x.description ? ` · ${x.description}` : ''} · {fmtNum(x.duration_min)}′ · RPE {x.rpe} · <b>{fmtNum(x.load_au)} UA</b></div> :
        <div className="row small" style={{ marginTop: 4 }}><ColorBadge color={x.summary.color}>Estado global {x.summary.total} %</ColorBadge></div>}
      <div className="small muted" style={{ marginTop: 4 }}>{x.notes}</div>
      <div className="row between small" style={{ marginTop: 6 }}>
        <span className="muted">{x.status === 'anulado' ? 'Anulado / corregido' : `Enviado ${fmtDateTime(x.created_at)}`}</span>
        {x.status === 'valido' && (pend.has(x.t + x.id) ? <span className="tag warn">Corrección pendiente</span> : <button className="btn sm" onClick={() => setCorr(x)}>Solicitar corrección</button>)}</div>
    </div>)}
    {corr && <CorrectionRequest x={corr} wellness={settings.data?.wellness} onClose={() => setCorr(null)} onSaved={() => { toast('Solicitud enviada al preparador'); h.reload(); }} />}
  </div>;
}

function CorrectionRequest({ x, wellness, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [p, setP] = useState({ duration_min: '', rpe: '', notes: '', delete: false, scores: {} });
  const [err, setErr] = useState(null);
  const send = async () => {
    try {
      const proposed = x.t === 'load' ? { duration_min: p.duration_min, rpe: p.rpe, notes: p.notes || undefined, delete: p.delete } : { scores: p.scores, notes: p.notes || undefined, delete: p.delete };
      await api.post('/me/corrections', { entity: x.t, entity_id: x.id, reason, proposed }); onSaved(); onClose();
    } catch (e) { setErr(e.message); }
  };
  return <Modal title="Solicitar corrección" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!reason.trim()} onClick={send}>Enviar solicitud</button></>}>
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>El preparador revisará la solicitud. Si la aprueba, el registro original quedará guardado como corregido.</p>
      <label className="check"><input type="checkbox" checked={p.delete} onChange={e => setP({ ...p, delete: e.target.checked })} /> Este registro es un error o está duplicado (eliminar)</label>
      {!p.delete && (x.t === 'load' ? <div className="inline-fields"><Field label={`Duración correcta (actual ${x.duration_min})`}><input type="number" value={p.duration_min} onChange={e => setP({ ...p, duration_min: e.target.value })} /></Field>
        <Field label={`RPE correcto (actual ${x.rpe})`}><input type="number" min="0" max="10" value={p.rpe} onChange={e => setP({ ...p, rpe: e.target.value })} /></Field></div> :
        <div className="inline-fields">{wellness?.items.map(it => <Field key={it.key} label={`${it.label} (actual ${x.scores[it.key]})`}><input type="number" min={wellness.min} max={wellness.max} value={p.scores[it.key] ?? ''} onChange={e => setP({ ...p, scores: { ...p.scores, [it.key]: e.target.value } })} /></Field>)}</div>)}
      <Field label="Motivo" required><textarea value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <ErrorBox error={err} />
    </div>
  </Modal>;
}

// Anillo de progreso (valor / total)
function Ring({ value, total, label, sub, color = 'var(--accent)', size = 150 }) {
  const pct = total ? Math.min(1, value / total) : 0, r = 42, c = 2 * Math.PI * r;
  return <div className="ring" style={{ width: size }}>
    <svg viewBox="0 0 100 100" width={size} height={size}><circle cx="50" cy="50" r={r} fill="none" stroke="#ecede8" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 50 50)" /></svg>
    <div className="ring-c"><b>{value}<small>/{total}</small></b><span>{label}</span></div>
    {sub && <div className="ring-s">{sub}</div>}
  </div>;
}
function Bar2({ a, b, la, lb }) {
  const t = a + b;
  return <div><div className="bar2"><i style={{ flex: a || 0.0001, background: 'var(--accent)' }} /><i style={{ flex: b || 0.0001, background: '#f0a4a6' }} /></div>
    <div className="row between small" style={{ marginTop: 4 }}><span><b>{a}</b> {la}</span><span>{lb} <b>{b}</b></span></div>{!t && <div className="small muted">Sin convocatorias todavía</div>}</div>;
}
const pctColor = p => p === null ? '#9a9b95' : p >= 80 ? 'var(--verde)' : p >= 60 ? 'var(--amarillo)' : 'var(--rojo)';

function Season() {
  const r = useApi('/me/season');
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const d = r.data, tr = d.trainings;
  return <div className="stack" style={{ gap: 12 }}>
    <div className="card ring-row">
      <Ring value={d.minutes} total={d.minutesTotal} label="minutos" sub={d.minutesTotal ? `${Math.round((d.minutes / d.minutesTotal) * 100)} % de los minutos posibles` : 'Aún no hay partidos con acta'} />
      <Ring value={tr.attended} total={tr.total} label="entrenos" color={pctColor(tr.pct)} sub={tr.pct === null ? 'Sin entrenamientos' : `${tr.pct} % de asistencia`} />
    </div>
    <div className="sgrid">
      <div className="card sbox"><span className="l">Convocado</span><span className="v">{d.called}<small>/{d.matchesTotal}</small></span><span className="meter"><i style={{ width: (d.matchesTotal ? (d.called / d.matchesTotal) * 100 : 0) + '%', background: 'var(--accent)' }} /></span><span className="s">partidos</span></div>
      <div className="card sbox"><span className="l">Goles</span><span className="v">{d.goals}</span><span className="s">{d.yellow || d.red ? <>🟨 {d.yellow}{d.red ? <> · 🟥 {d.red}</> : null}</> : 'sin tarjetas'}</span></div>
      <div className="card sbox wide"><span className="l">Titular / suplente</span><Bar2 a={d.starter} b={d.sub} la="titular" lb="suplente" /></div>
    </div>
    {d.next && <NextMatch m={d.next} />}
    <div className="card"><div className="row between" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>Mis partidos</h3></div>{!d.matches.length ? <p className="small muted" style={{ margin: 0 }}>Aparecerán cuando el preparador suba el acta de cada partido.</p> :
      d.matches.map((m, i) => <div key={i} className={'mrow' + (m.outcome ? ' o' + m.outcome : '')}>{m.outcome ? <span className={'res r' + m.outcome} title={{ V: 'Victoria', E: 'Empate', D: 'Derrota' }[m.outcome]}>{m.outcome}</span> : <span className="res">–</span>}
        <span className="mcrest">{crestOf(m.opponent) ? <img src={crestOf(m.opponent)} alt="" /> : null}</span>
        <span className="mo">{teamName(m.opponent)}<small>{fmtDate(m.date, { day: 'numeric', month: 'short' })} · {m.home_away === 'visitante' ? 'fuera' : 'casa'}{m.result && <> · <b className={m.outcome ? 'sc' + m.outcome : ''}>{m.result}</b></>}</small></span>
        {!m.called ? <span className="pill off">No convocado</span> : <><span className={'pill' + (m.started ? ' on' : '')}>{m.started ? 'Titular' : m.started === 0 ? 'Suplente' : 'Convocado'}</span><span className="mm">{m.minutes}′{m.goals ? ` · ${'⚽'.repeat(Math.min(m.goals, 3))}` : ''}</span></>}</div>)}</div>
    <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Temporada {d.season} · partidos oficiales con acta</p>
  </div>;
}

function NextMatch({ m }) {
  const club = useClub();
  const them = <div className="nm-team"><span className="nm-crest">{crestOf(m.opponent) ? <img src={crestOf(m.opponent)} alt="" /> : '?'}</span><b>{teamName(m.opponent)}</b></div>;
  const us = <div className="nm-team"><span className="nm-crest"><Crest size={58} /></span><b>{club.name}</b></div>;
  const days = Math.round((new Date(m.date + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 864e5);
  return <div className="card nm">
    <div className="nm-head"><span>Próximo partido</span><span>J{m.matchday} · {days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`}</span></div>
    <div className="nm-body">{m.home_away === 'local' ? us : them}<span className="nm-vs">VS</span>{m.home_away === 'local' ? them : us}</div>
    <div className="nm-foot">{fmtDate(m.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {m.home_away === 'local' ? 'en casa' : 'fuera'}</div>
  </div>;
}

const MSG = { ok: ['var(--verde)', '👍'], baja: ['var(--amarillo)', '↓'], alta: ['var(--naranja)', '↑'], sin_datos: ['#9a9b95', '…'] };
function Progress() {
  const r = useApi('/me/progress');
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const { load, wellness, tests, view } = r.data;
  const wAvg = l => l.length ? Math.round(l.reduce((a, x) => a + x.total, 0) / l.length) : null;
  const w7 = wellness.filter(x => x.date > addDays(todayISO(), -7)), w14 = wellness.filter(x => x.date <= addDays(todayISO(), -7) && x.date > addDays(todayISO(), -14));
  const wNow = wAvg(w7), wPrev = wAvg(w14);
  return <div className="stack" style={{ gap: 12 }}>
    {load && <>
      <div className="card status" style={{ borderColor: MSG[load.message.code][0] }}><span className="si" style={{ background: MSG[load.message.code][0] }}>{MSG[load.message.code][1]}</span>
        <div><b>{load.message.title}</b><p>{load.message.text}</p></div></div>
      <div className="card"><h3>Mi carga por semanas</h3>
        <ResponsiveContainer width="100%" height={170}><BarChart data={load.weeks} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="week" tickFormatter={(w, i) => i === load.weeks.length - 1 ? 'Últ. 7 d' : fmtDate(w, { day: 'numeric', month: 'short' })} stroke="#9a9b95" fontSize={10} tickLine={false} axisLine={false} interval={0} />
          <YAxis hide />
          {load.average ? <ReferenceLine y={load.average} stroke="#111511" strokeDasharray="4 4" /> : null}
          <Bar dataKey="load" radius={[5, 5, 0, 0]} isAnimationActive={false}>{load.weeks.map((w, i) => <Cell key={i} fill={i === load.weeks.length - 1 ? 'var(--accent)' : '#d9d9d4'} />)}</Bar>
        </BarChart></ResponsiveContainer>
        <div className="row between small"><span><i className="sq" style={{ background: 'var(--accent)' }} /> Últimos 7 días <b>{fmtNum(load.current)}</b></span>{load.average ? <span><i className="dash" /> Tu media semanal <b>{fmtNum(load.average)}</b></span> : null}</div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>La carga es minutos × lo dura que fue la sesión (RPE). Los partidos cuentan con RPE 10.</p>
        {view.showAcwr && load.acwr != null && <p className="small" style={{ margin: '4px 0 0' }}>Índice agudo:crónico <b>{fmtNum(load.acwr, 2)}</b></p>}
      </div></>}
    <div className="card"><h3>Cómo me encuentro</h3>{!wellness.length ? <p className="small muted" style={{ margin: 0 }}>Rellena el wellness antes de entrenar para ver tu evolución.</p> : <>
      <div className="row" style={{ gap: 14, alignItems: 'center' }}><span className="big-pct" style={{ color: wNow === null ? '#9a9b95' : wNow >= 70 ? 'var(--verde)' : wNow >= 50 ? 'var(--amarillo)' : 'var(--rojo)' }}>{wNow ?? '—'}<small>%</small></span>
        <span className="small">{wNow === null ? 'Sin registros esta semana' : wPrev === null ? 'Media de esta semana' : wNow > wPrev + 3 ? <>Mejor que la semana pasada <b>({wPrev} %)</b></> : wNow < wPrev - 3 ? <>Peor que la semana pasada <b>({wPrev} %)</b></> : <>Igual que la semana pasada</>}</span></div>
      <ResponsiveContainer width="100%" height={90}><LineChart data={wellness} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}><YAxis hide domain={[0, 100]} /><XAxis dataKey="date" hide />
        <Line dataKey="total" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></>}</div>
    {tests && <div className="card"><h3>Mis tests</h3>{!tests.length ? <p className="small muted" style={{ margin: 0 }}>Todavía no tienes tests.</p> : tests.map((x, i) => {
      const diff = x.value !== null && x.previous !== null ? x.value - x.previous : null;
      const good = diff === null || diff === 0 || !x.better ? null : (x.better === 'higher') === diff > 0;
      return <div key={i} className="trow"><div><b>{x.name}</b><small>{fmtDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' })}</small></div>
        <span className="tv">{fmtNum(x.value, x.decimals)}<small> {x.unit}</small></span>
        {diff !== null && <span className="td" style={{ color: good === null ? 'var(--ink-3)' : good ? 'var(--verde)' : 'var(--rojo)' }}>{diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {fmtNum(Math.abs(diff), x.decimals)}</span>}</div>;
    })}</div>}
  </div>;
}

// Instalar en la pantalla de inicio y activar los avisos
function SetupCard({ full }) {
  const toast = useToast();
  const [st, setSt] = useState(null);
  const [inst, setInst] = useState(canPromptInstall());
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('scpf-setup-hide') === '1'; } catch { return false; } });
  useEffect(() => { pushState().then(setSt); return onInstallable(setInst); }, []);
  if (st === null) return null;
  const standalone = isStandalone(), ios = isIOS();
  const needInstall = !standalone && (ios || inst);
  const needPush = st === 'inactivo';
  if (!full && (hidden || (!needInstall && !needPush))) return null;
  const on = async () => { setBusy(true); try { await enablePush(); setSt('activo'); toast('Avisos activados'); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const off = async () => { setBusy(true); try { await disablePush(); setSt('inactivo'); toast('Avisos desactivados'); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return <div className={'setup' + (full ? ' full' : '')}>
    {!full && <button className="setup-x" aria-label="Ocultar" onClick={() => { setHidden(true); try { localStorage.setItem('scpf-setup-hide', '1'); } catch { /* nada */ } }}>×</button>}
    <b>{full ? 'App y avisos' : 'Recibe los recordatorios en el móvil'}</b>
    {isDemo() ? <p>En la versión de prueba no se pueden instalar ni recibir avisos. Funcionará en la versión publicada.</p> : <>
      {!standalone && <div className="setup-row"><span className={'setup-n' + (standalone ? ' ok' : '')}>1</span><div><span>Añade la app a la pantalla de inicio</span>
        {ios ? <button className="btn sm" onClick={() => setHelp(h => !h)}>Cómo se hace</button> : inst ? <button className="btn sm primary" onClick={async () => { if (await promptInstall()) toast('App instalada'); setInst(false); }}>Instalar</button> : <small>Menú del navegador (⋮) → «Instalar app» o «Añadir a pantalla de inicio».</small>}
        {help && <small className="setup-help">En Safari pulsa <b>Compartir</b> (el cuadrado con la flecha ↑) → <b>«Añadir a pantalla de inicio»</b> → «Añadir». Después abre la app desde el icono y activa los avisos.</small>}</div></div>}
      <div className="setup-row"><span className={'setup-n' + (st === 'activo' ? ' ok' : '')}>{st === 'activo' ? '✓' : standalone ? '1' : '2'}</span><div>
        {st === 'activo' ? <><span>Avisos activados</span><small>Te avisaremos del wellness cada día y del RPE los días de entrenamiento.</small>{full && <button className="btn sm" disabled={busy} onClick={off}>Desactivar</button>}</> :
          st === 'bloqueado' ? <><span>Avisos bloqueados</span><small>Actívalos en Ajustes del móvil → Notificaciones → SC Física.</small></> :
          st === 'no_soportado' ? <><span>Avisos no disponibles aquí</span><small>{ios && !standalone ? 'En iPhone primero hay que añadir la app a la pantalla de inicio y abrirla desde el icono.' : 'Este navegador no admite notificaciones.'}</small></> :
          <><span>Activa los avisos</span><button className="btn sm primary" disabled={busy} onClick={on}>{busy ? 'Activando…' : 'Activar avisos'}</button></>}
      </div></div>
    </>}
  </div>;
}

function Profile({ p, go }) {
  const { logout } = useAuth();
  if (!p) return <Loading />;
  return <div className="stack" style={{ gap: 14 }}>
    <div className="card row"><Avatar name={p.full_name} fileId={p.photo_file_id} size="lg" /><div><h2>{p.full_name}</h2><div className="small muted">{p.category_name}{p.position ? ' · ' + p.position : ''}</div></div></div>
    <button className="action" onClick={() => go('registros')}><span className="ic"><Icon d={IC.hist} /></span><div style={{ flex: 1 }}><b>Mis registros enviados</b><span className="st">Revisa o pide corregir un error</span></div><span aria-hidden="true">›</span></button>
    <SetupCard full />
    <details className="card pin-det"><summary>Cambiar mi PIN</summary><ChangePinInline /></details>
    <button className="btn lg" onClick={logout}>Cerrar sesión</button>
    <p className="small muted" style={{ margin: 0 }}>Solo tú y el preparador físico podéis ver tus registros. Para consultar o eliminar tus datos, habla con el preparador físico.</p>
  </div>;
}
const ChangePinInline = () => <div className="player-pin"><ChangePin /></div>;
