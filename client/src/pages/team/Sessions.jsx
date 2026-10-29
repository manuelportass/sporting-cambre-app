import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { ColorBadge, Confirm, Empty, ErrorBox, Field, ListRow, Loading, Modal, MoreMenu, PageHead, Tabs, useApi, useToast } from '../../components/ui';
import { LoadEntryModal } from './TeamPlayer';
import { AVAIL_COLOR, addDays, fmtDate, fmtDateTime, fmtNum, mondayOf, todayISO } from '../../lib/format';

export default function Sessions() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState(sp.get('tab') || 'sesiones');
  return <div>
    <PageHead back="/primer-equipo" title="Sesiones" />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'sesiones', label: 'Entrenamientos' }, { key: 'wellness', label: 'Wellness del día' }, { key: 'correcciones', label: 'Correcciones' }]} />
    {tab === 'sesiones' && <SessionsList />}
    {tab === 'wellness' && <DailyWellness />}
    {tab === 'correcciones' && <Corrections />}
  </div>;
}

function SessionsList() {
  const toast = useToast();
  const [from, setFrom] = useState(addDays(mondayOf(todayISO()), -7));
  const to = addDays(from, 13);
  const l = useApi(`/team/sessions?from=${from}&to=${to}`);
  const [open, setOpen] = useState(null);
  const [create, setCreate] = useState(false);
  const [gen, setGen] = useState(false);
  const [hist, setHist] = useState(false);
  const [fill, setFill] = useState(false);
  return <div className="stack">
    <div className="row"><button className="btn sm" onClick={() => setFrom(addDays(from, -14))} aria-label="Anteriores">‹</button><b>{fmtDate(from, { day: 'numeric', month: 'short' })} – {fmtDate(to, { day: 'numeric', month: 'short' })}</b><button className="btn sm" onClick={() => setFrom(addDays(from, 14))} aria-label="Siguientes">›</button>
      <span className="spacer" /><MoreMenu items={[{ label: 'Programar martes, jueves y viernes', onClick: () => setGen(true) }, { label: 'Importar histórico de RPE (formulario)', onClick: () => setHist(true) }, { label: 'Rellenar entrenamientos sin RPE', onClick: () => setFill(true) }]} /><button className="btn primary" onClick={() => setCreate(true)}>+ Sesión</button></div>
    {l.loading ? <Loading /> : !l.data.filter(s => s.session_type !== 'Partido').length ? <Empty title="No hay sesiones en estas dos semanas">Usa «⋯ → Programar martes, jueves y viernes».</Empty> :
      <div className="list">{l.data.filter(s => s.session_type !== 'Partido').map(s => <ListRow key={s.id} onClick={() => setOpen(s.id)} title={fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'short' })} sub={`${s.notes === 'Amistoso' ? 'Amistoso' : s.session_type} · ${s.rpe_count} registros`}
        right={s.rpe_count ? <span className="row small" style={{ gap: 14 }}>{s.avg_rpe != null && <span><span className="muted">RPE medio </span><b>{fmtNum(s.avg_rpe, 1)}</b></span>}<span><span className="muted">Carga media </span><b>{fmtNum(s.avg_load)} UA</b></span></span> : <span className="small muted">Sin registros</span>} />)}</div>}
    {open && <SessionDetail id={open} onClose={() => { setOpen(null); l.reload(); }} />}
    {create && <SessionForm onClose={() => setCreate(false)} onSaved={() => { l.reload(); toast('Sesión creada'); }} />}
    {gen && <Generate onClose={() => setGen(false)} onSaved={n => { l.reload(); toast(`${n} sesiones creadas`); }} />}
    {fill && <FillMissing onClose={() => setFill(false)} onDone={() => l.reload()} />}
    {hist && <ImportHistory onClose={() => setHist(false)} onDone={from => { setFrom(from); l.reload(); }} />}
  </div>;
}

function FillMissing({ onClose, onDone }) {
  const toast = useToast();
  const info = useApi('/team/fill-missing');
  const [v, setV] = useState({ rpe: 5, minutes: 90 });
  const [err, setErr] = useState(null);
  const run = async (undo) => {
    try { const r = await api.post(undo ? '/team/fill-missing/undo' : '/team/fill-missing', v); toast(undo ? `${r.voided} registros de relleno anulados` : `${r.created} entrenamientos rellenados`); onDone(); onClose(); }
    catch (e) { setErr(e.message); }
  };
  const d = info.data;
  return <Modal title="Rellenar entrenamientos sin RPE" onClose={onClose} footer={<>
    {d?.filled > 0 && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => run(true)}>Deshacer relleno</button>}
    <button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!d?.pending} onClick={() => run(false)}>Rellenar {d?.pending || ''}</button></>}>
    {!d ? <Loading /> : <div className="stack">
      <p style={{ margin: 0 }}>Cada entrenamiento sin RPE se completa como si el jugador hubiera participado, para poder calcular la carga aguda, la crónica y el ACWR.</p>
      <div className="inline-fields"><Field label="RPE"><input type="number" min="0" max="10" value={v.rpe} onChange={e => setV({ ...v, rpe: e.target.value })} /></Field>
        <Field label="Duración (min)"><input type="number" min="1" max="300" value={v.minutes} onChange={e => setV({ ...v, minutes: e.target.value })} /></Field></div>
      <p className="small muted" style={{ margin: 0 }}>{d.pending} entrenamientos pendientes{d.filled ? ` · ${d.filled} ya rellenados` : ''}. No se rellena a quien está marcado ausente, justificado o lesionado. Los rellenos quedan marcados como «Relleno automático» y no cuentan como asistencia.</p>
      <ErrorBox error={err} />
    </div>}
  </Modal>;
}

function ImportHistory({ onClose, onDone }) {
  const toast = useToast();
  const info = useApi('/team/seed/rpe-history');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const d = info.data;
  return <Modal title="Histórico de RPE" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!d || busy} onClick={async () => {
    setBusy(true); setErr(null);
    try { const r = await api.post('/team/seed/rpe-history'); toast(`${r.entries} registros importados en ${r.sessions} sesiones nuevas`); onDone(mondayOf('2026-10-12')); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }}>{busy ? 'Importando…' : 'Importar'}</button></>}>
    {!d ? <Loading /> : <div className="stack">
      <p style={{ margin: 0 }}>{d.source}. Ya depurado: solo jugadores del equipo modesto, fechas y minutos corregidos.</p>
      <div className="row" style={{ gap: 18 }}><span><b>{d.entries}</b> <span className="muted">registros</span></span><span><b>{d.sessions}</b> <span className="muted">sesiones</span></span><span><b>{d.players}</b> <span className="muted">jugadores</span></span></div>
      <p className="small muted" style={{ margin: 0 }}>Hasta la J1 ({fmtDate(d.match.date)}) los datos van tal cual. Desde la J1, cada partido de liga se calcula con su acta (RPE 10 × minutos) y los entrenamientos quedan en martes, jueves y viernes. Quien no respondió queda como «pendiente»: no se cuenta como carga 0. Si no entrenó, márcalo ausente en la sesión («Sin RPE → ausentes»).</p>
      {d.missing.length > 0 && <div className="alert warn small"><span>⚠</span><div>No están en la base de datos: {d.missing.join(', ')}. Carga antes el listado de jugadores.</div></div>}
      {d.imported > 0 && <div className="alert info small"><span>ℹ</span><div>Ya hay {d.imported} registros importados: no se duplicarán.</div></div>}
      <ErrorBox error={err} />
    </div>}
  </Modal>;
}

function SessionForm({ session, onClose, onSaved }) {
  const settings = useApi('/settings');
  const [v, setV] = useState({ date: session?.date || todayISO(), session_type: session?.session_type || 'Entrenamiento', planned_minutes: session?.planned_minutes || 90, notes: session?.notes || '' });
  const [err, setErr] = useState(null);
  return <Modal title={session ? 'Editar sesión' : 'Nueva sesión colectiva'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { if (session) await api.put('/team/sessions/' + session.id, v); else await api.post('/team/sessions', v); onSaved(); onClose(); } catch (e) { setErr(e.message); }
  }}>Guardar</button></>}>
    <div className="inline-fields">
      <Field label="Fecha"><input type="date" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></Field>
      <Field label="Tipo"><select value={v.session_type} onChange={e => setV({ ...v, session_type: e.target.value })}>{(settings.data?.sessionTypes || ['Entrenamiento']).filter(t => t !== 'Partido').map(t => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Duración prevista (min)"><input type="number" value={v.planned_minutes} onChange={e => setV({ ...v, planned_minutes: e.target.value })} /></Field>
    </div>
    <Field label="Notas" style={{ marginTop: 12 }}><textarea value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></Field>
    <ErrorBox error={err} />
  </Modal>;
}
function Generate({ onClose, onSaved }) {
  const [v, setV] = useState({ from: todayISO(), to: addDays(todayISO(), 27), planned_minutes: 90 });
  const [err, setErr] = useState(null);
  return <Modal title="Programar entrenamientos colectivos" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { const r = await api.post('/team/sessions/generate', v); onSaved(r.created); onClose(); } catch (e) { setErr(e.message); }
  }}>Crear sesiones</button></>}>
    <p className="small muted" style={{ marginTop: 0 }}>Crea una sesión «Entrenamiento» en cada día colectivo configurado (por defecto martes, jueves y viernes). Las fechas que ya tengan sesión no se duplican.</p>
    <div className="inline-fields"><Field label="Desde"><input type="date" value={v.from} onChange={e => setV({ ...v, from: e.target.value })} /></Field><Field label="Hasta"><input type="date" value={v.to} onChange={e => setV({ ...v, to: e.target.value })} /></Field>
      <Field label="Duración prevista (min)"><input type="number" value={v.planned_minutes} onChange={e => setV({ ...v, planned_minutes: e.target.value })} /></Field></div>
    <ErrorBox error={err} />
  </Modal>;
}

const ATT = [['presente', 'P'], ['ausente', 'A'], ['justificada', 'J'], ['lesionado', 'L']];
function SessionDetail({ id, onClose }) {
  const toast = useToast();
  const r = useApi('/team/sessions/' + id);
  const sd = r.data?.session.date;
  const isTue = sd && new Date(sd + 'T12:00:00').getDay() === 2 && r.data.session.session_type !== 'Partido';
  const pm = useApi(isTue ? '/team/post-match?date=' + sd : null, [sd]);
  const pmBy = new Map((pm.data?.groups || []).flatMap(g => g.players.map(x => [x.player_id, { g: g.key, focus: g.focus, min: x.minutes }])));
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [rpeFor, setRpeFor] = useState(null);
  const set = async (pid, status) => { try { await api.post(`/team/sessions/${id}/attendance`, { player_id: pid, status }); r.reload(); } catch (e) { toast(e.message, 'err'); } };
  const all = async status => { try { await api.post(`/team/sessions/${id}/attendance`, { items: r.data.players.filter(p => !p.attendance).map(p => ({ player_id: p.player_id, status })) }); r.reload(); } catch (e) { toast(e.message, 'err'); } };
  const noRpeAbsent = async () => { const items = r.data.players.filter(p => !p.rpe && !p.attendance).map(p => ({ player_id: p.player_id, status: 'ausente' })); if (!items.length) return toast('No hay jugadores sin RPE ni asistencia'); try { await api.post(`/team/sessions/${id}/attendance`, { items }); toast(`${items.length} marcados ausentes`); r.reload(); } catch (e) { toast(e.message, 'err'); } };
  return <Modal wide title={r.data ? `${r.data.session.session_type} · ${fmtDate(r.data.session.date, { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Sesión'} onClose={onClose}
    footer={<><button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setDel(true)}>Eliminar sesión</button><button className="btn" onClick={() => setEdit(true)}>Editar</button><button className="btn primary" onClick={onClose}>Cerrar</button></>}>
    {!r.data ? <Loading /> : <>
      {r.data.session.rpe_count > 0 && <div className="row" style={{ gap: 18, marginBottom: 10 }}>
        {r.data.session.avg_rpe != null && <span><span className="muted">RPE medio </span><b>{fmtNum(r.data.session.avg_rpe, 1)}</b></span>}
        <span><span className="muted">Minutos medios </span><b>{fmtNum(r.data.session.avg_minutes)}</b></span>
        <span><span className="muted">Carga media </span><b>{fmtNum(r.data.session.avg_load)} UA</b></span>
        <span className="muted">({r.data.session.rpe_count} registros)</span></div>}
      {isTue && pm.data?.match && <div className="alert info small" style={{ marginBottom: 10 }}><span>ℹ</span><div>Martes post-partido (J{pm.data.match.matchday} vs {pm.data.match.opponent}): {pm.data.groups.map(g => `${g.players.length} ${g.focus.toLowerCase()}`).join(' · ')}.{pm.data.missingActa ? ` Falta el acta de la J${pm.data.missingActa.matchday}.` : ''}</div></div>}
      <div className="row" style={{ marginBottom: 10 }}><span className="small muted">P presente · A ausente · J justificada · L lesionado</span><span className="spacer" />
        <MoreMenu items={[{ label: 'Sin marcar → presentes', onClick: () => all('presente') }, { label: 'Sin RPE → ausentes', onClick: noRpeAbsent }]} /></div>
      {!r.data.players.length ? <Empty title="No hay jugadores en el primer equipo" /> : <div className="table-wrap"><table className="t">
        <thead><tr><th>Jugador</th><th>Asistencia</th><th>RPE</th></tr></thead>
        <tbody>{r.data.players.map(p => <tr key={p.player_id}><td><b>{p.name}</b>{pmBy.get(p.player_id) && <span className={'pmtag g-' + pmBy.get(p.player_id).g} title={`${pmBy.get(p.player_id).min}′ en el último partido`}>{pmBy.get(p.player_id).focus} · {pmBy.get(p.player_id).min}′</span>}</td>
          <td><div className="statusbtns">{ATT.map(([k, l]) => <button key={k} data-s={k === 'lesionado' ? 'ausente' : k} className={p.attendance === k ? 'on' : ''} title={k} onClick={() => set(p.player_id, p.attendance === k ? null : k)}>{l}</button>)}</div></td>
          <td>{p.rpe ? <span className="small"><b>{fmtNum(p.rpe.rpe)}</b> × {fmtNum(p.rpe.duration_min)}′ = {fmtNum(p.rpe.rpe * p.rpe.duration_min)} UA</span> :
            r.data.session.session_type === 'Partido' ? <span className="muted small">Sin minutos</span> :
            ['ausente', 'justificada', 'lesionado'].includes(p.attendance) ? <span className="muted small">No requerido</span> :
            <span className="row small"><span style={{ color: '#8a5a00', fontWeight: 600 }}>Pendiente</span><button className="btn sm" onClick={() => setRpeFor(p)}>Registrar</button></span>}</td></tr>)}</tbody></table></div>}
      {edit && <SessionForm session={r.data.session} onClose={() => setEdit(false)} onSaved={r.reload} />}
      {rpeFor && <LoadEntryModal playerId={rpeFor.player_id} preset={{ date: r.data.session.date, session_type: r.data.session.session_type, team_session_id: id, duration_min: r.data.session.planned_minutes || '' }} onClose={() => setRpeFor(null)} onSaved={() => { r.reload(); toast('RPE registrado'); }} />}
      {del && <Confirm title="Eliminar sesión" danger confirmText="Eliminar" message="Se eliminará la sesión y su asistencia. Los RPE enviados se conservan." onConfirm={async () => { await api.del('/team/sessions/' + id); onClose(); }} onClose={() => setDel(false)} />}
    </>}
  </Modal>;
}

function DailyWellness() {
  const [date, setDate] = useState(todayISO());
  const w = useApi(`/team/wellness?from=${date}&to=${date}`);
  const settings = useApi('/settings');
  const items = settings.data?.wellness.items || [];
  return <div className="stack">
    <Field label="Fecha" style={{ maxWidth: 200 }}><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
    {w.loading ? <Loading /> : !w.data.length ? <Empty title="Sin registros de wellness este día" /> :
      <div className="table-wrap"><table className="t"><thead><tr><th>Jugador</th>{items.map(i => <th key={i.key} className="n">{i.label}</th>)}<th>Global</th><th>Observaciones</th><th>Enviado</th></tr></thead>
        <tbody>{w.data.map(x => <tr key={x.id}><td><b>{x.player_name}</b></td>{x.summary.items.map(i => <td key={i.key} className="n"><span className="cell-color"><i style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${i.color})`, display: 'inline-block' }} />{i.value ?? '—'}</span></td>)}
          <td><ColorBadge color={x.summary.color}>{x.summary.total ?? '—'} %</ColorBadge></td><td className="small">{x.notes}</td><td className="small muted">{fmtDateTime(x.created_at)}</td></tr>)}</tbody></table></div>}
  </div>;
}

function Corrections() {
  const toast = useToast();
  const [status, setStatus] = useState('pendiente');
  const l = useApi('/team/corrections?status=' + status);
  const resolve = async (c, approve) => { try { await api.post(`/team/corrections/${c.id}/resolve`, { approve }); toast(approve ? 'Corrección aplicada' : 'Solicitud rechazada'); l.reload(); } catch (e) { toast(e.message, 'err'); } };
  const fmt = o => Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  return <div className="stack">
    <div className="row"><select value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 220 }}><option value="pendiente">Pendientes</option><option value="aprobada">Aprobadas</option><option value="rechazada">Rechazadas</option><option value="">Todas</option></select></div>
    {l.loading ? <Loading /> : !l.data.length ? <Empty title="No hay solicitudes" /> : l.data.map(c => <div key={c.id} className="card stack" style={{ gap: 6 }}>
      <div className="row"><b>{c.player_name}</b><span className="tag">{c.entity === 'load' ? 'RPE / carga' : 'Wellness'}</span><span className="small muted">{fmtDateTime(c.created_at)}</span><span className="spacer" /><span className="tag">{c.status}</span></div>
      <div className="small"><b>Motivo:</b> {c.reason}</div>
      {c.original && <div className="small"><b>Original ({fmtDate(c.original.date)}):</b> {c.entity === 'load' ? `${c.original.session_type} · ${c.original.duration_min}′ × RPE ${c.original.rpe} = ${c.original.load_au} UA · «${c.original.notes}»` : fmt(c.original.scores || {})}</div>}
      <div className="small"><b>Propuesta:</b> {c.proposed.delete ? 'Eliminar el registro' : fmt(c.proposed)}</div>
      {c.status === 'pendiente' && <div className="row"><button className="btn sm primary" onClick={() => resolve(c, true)}>Aprobar y aplicar</button><button className="btn sm" onClick={() => resolve(c, false)}>Rechazar</button></div>}
    </div>)}
  </div>;
}
