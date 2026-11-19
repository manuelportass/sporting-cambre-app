import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { api } from '../../api';
import { Avatar, ColorBadge, Confirm, Empty, ErrorBox, Field, ListRow, Loading, Modal, PageHead, PlayerPicker, Seg, Tabs, useApi, useToast } from '../../components/ui';
import { INJ_COLOR, INJ_STATUS, addDays, fmtDate, todayISO } from '../../lib/format';
import { ALL_REGIONS, CATALOG, CONTEXTS, TISSUES, byKey } from '../../lib/injuryCatalog';
import { Chips, InjuryPicker, LatChips, injSub } from '../../components/InjuryParts';

export default function InjuryDashboard() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [status, setStatus] = useState('abiertas');
  const [q, setQ] = useState('');
  const [adv, setAdv] = useState(false);
  const [f, setF] = useState({ key: '', type: '', from: '', to: '' });
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
        <Field label="Lesión"><select value={f.key} onChange={e => setF({ ...f, key: e.target.value })}><option value="">Todas</option>{CATALOG.map(c => <option key={c.key} value={c.key}>{c.short}</option>)}<option value="otra">Otra lesión</option></select></Field>
        <Field label="Texto (zona, tipo)"><input type="search" value={f.type} onChange={e => setF({ ...f, type: e.target.value })} /></Field>
        <Field label="Desde"><input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Hasta"><input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></Field>
      </div>}
      {list.loading ? <Loading /> : !list.data?.length ? <Empty title={status === 'abiertas' ? 'No hay procesos abiertos' : 'No hay procesos con estos filtros'} /> :
        <div className="list">{list.data.map(i => <ListRow key={i.id} onClick={() => nav('/lesiones/' + i.id)}
          left={<Avatar name={i.player_name} fileId={i.photo_file_id} />} title={i.player_name}
          sub={`${injSub(i)} · ${i.days_elapsed} días`}
          right={<>{i.last_pain && <span className="tag" title={`Último dolor registrado por el jugador (${i.last_pain.date})`}>EVA {i.last_pain.eva}</span>}{i.review_overdue && <span className="tag warn">Revisión vencida</span>}{i.phase_sort && <span className="tag" title={i.phase_name}>Fase {i.phase_sort}</span>}<ColorBadge color={INJ_COLOR[i.status]}>{INJ_STATUS[i.status]}</ColorBadge></>} />)}</div>}
    </>}
    {tab === 'revisiones' && d && (!d.upcoming.length ? <Empty title="No hay revisiones programadas" /> : <div className="list">{d.upcoming.map(i => <ListRow key={i.id} onClick={() => nav('/lesiones/' + i.id)}
      left={<b style={{ font: '700 18px var(--head)', minWidth: 64, color: i.review_overdue ? 'var(--rojo)' : 'var(--ink)' }}>{fmtDate(i.next_review, { day: 'numeric', month: 'short' })}</b>}
      title={i.player_name} sub={`${injSub(i)} · ${i.phase_name || ''}`} right={i.review_overdue ? <span className="tag warn">Vencida</span> : null} />)}</div>)}
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
  const customs = useApi('/injuries/custom-types');
  const [player, setPlayer] = useState(null);
  const [step, setStep] = useState(1);
  const [v, setV] = useState({ catalog_key: '', injury_date: todayISO(), laterality: '', grade: '', mechanism: '', context: '', diagnosis: '', zone: '', injury_type: '', region: 'Otras', keep: true });
  const [delC, setDelC] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { if (presetPlayer && players.data) setPlayer(players.data.find(p => String(p.id) === presetPlayer) || null); }, [presetPlayer, players.data]);
  const c = byKey(v.catalog_key);
  const set = (k, val) => setV(o => ({ ...o, [k]: val }));
  const pick = k => { setV(o => ({ ...o, catalog_key: k, grade: '', mechanism: '', ...(k === 'otra' ? { zone: '', injury_type: '', region: 'Otras', keep: true, fromCustom: false } : {}) })); setStep(2); };
  const pickCustom = c => { setV(o => ({ ...o, catalog_key: 'otra', grade: '', mechanism: '', zone: c.name, injury_type: c.type || '', region: c.region || 'Otras', keep: false, fromCustom: true })); setStep(2); };
  const save = async () => {
    try {
      const other = c.key === 'otra';
      const { keep, region, fromCustom, ...rest } = v;
      const body = { ...rest, laterality: v.laterality || null, zone: other ? v.zone.trim() : c.zone, injury_type: other ? v.injury_type || null : c.type || null, player_id: player.id };
      const r = await api.post('/injuries', body);
      if (other && keep && !fromCustom) await api.post('/injuries/custom-types', { name: v.zone.trim(), region, type: v.injury_type }).catch(() => {}); toast('Proceso de lesión abierto'); onSaved(r.id);
    } catch (e) { setErr(e.message); }
  };
  const all = useMemo(() => players.data || [], [players.data]);
  const ready = player && c && (c.key !== 'otra' || v.zone.trim());
  return <Modal wide title={!player ? 'Registrar lesión · jugador' : step === 1 ? 'Registrar lesión · ¿qué lesión es?' : 'Registrar lesión · detalles'} onClose={onClose} footer={<>
    {step === 2 ? <button className="btn" onClick={() => setStep(1)}>‹ Cambiar lesión</button> : <button className="btn" onClick={onClose}>Cancelar</button>}
    <span className="spacer" />
    {step === 2 && <button className="btn primary" disabled={!ready} onClick={save}>Abrir proceso</button>}</>}>
    <div className="stack">
      {!player ? <PlayerPicker players={all} onChange={setPlayer} /> : <div className="row"><Avatar name={player.full_name} fileId={player.photo_file_id} /><b>{player.full_name}</b><span className="muted">{player.category_name}</span><button className="btn sm ghost" onClick={() => setPlayer(null)}>Cambiar</button></div>}
      {!player ? null : step === 1 ? <InjuryPicker value={v.catalog_key} onChange={pick} customs={customs.data || []} onPickCustom={pickCustom} onDeleteCustom={setDelC} /> : <>
        <div className="injsel"><span>{c.icon}</span><div><b>{c.name}</b><small>{c.key === 'otra' ? (v.fromCustom ? `${v.zone} · fases generales y anamnesis general` : 'Fases generales y anamnesis general (sin protocolo específico)') : `${c.zone} · ${c.type} · protocolo de 6 fases y anamnesis específica`}</small></div></div>
        {c.key === 'otra' && !v.fromCustom && <div className="stack injother" style={{ gap: 10 }}>
          <Field label="Nombre de la lesión" required><input type="text" value={v.zone} onChange={e => set('zone', e.target.value)} placeholder="p. ej. Contusión en el cuádriceps, fractura de metatarsiano, lumbalgia…" autoFocus /></Field>
          <div className="inline-fields">
            <Field label="Zona del cuerpo"><select value={v.region} onChange={e => set('region', e.target.value)}>{ALL_REGIONS.map(r => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Tipo de lesión"><select value={v.injury_type} onChange={e => set('injury_type', e.target.value)}><option value="">—</option>{TISSUES.map(t => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={v.keep} onChange={e => set('keep', e.target.checked)} /> Guardarla en la lista para elegirla directamente la próxima vez</label>
        </div>}
        <div className="inline-fields">
          <Field label="Fecha de lesión" required><input type="date" value={v.injury_date} max={todayISO()} onChange={e => set('injury_date', e.target.value)} /></Field>
          {c.grades.length > 0 && <Field label={c.gradeLabel}><select value={v.grade} onChange={e => set('grade', e.target.value)}><option value="">Pendiente</option>{c.grades.map(g => <option key={g.v}>{g.v}</option>)}</select></Field>}
          <Field label="Mecanismo"><select value={v.mechanism} onChange={e => set('mechanism', e.target.value)}><option value="">No se sabe</option>{c.mechs.map(m => <option key={m}>{m}</option>)}</select></Field>
        </div>
        <Field label="Lado"><LatChips value={v.laterality} onChange={x => set('laterality', x)} /></Field>
        <Field label="¿Dónde se lesionó?"><Chips options={CONTEXTS} value={v.context} onChange={x => set('context', x)} /></Field>
        <details><summary className="small">+ Añadir diagnóstico del profesional sanitario (opcional)</summary>
          <Field label="Diagnóstico o descripción"><textarea value={v.diagnosis} onChange={e => set('diagnosis', e.target.value)} /></Field></details>
        <p className="small muted" style={{ margin: 0 }}>La anamnesis, el protocolo y el resto de datos se completan después, en la ficha de la lesión.</p>
      </>}
      <ErrorBox error={err} />
    </div>
    {delC && <Confirm title="Quitar de la lista" confirmText="Quitar" message={`¿Quitar «${delC.name}» de la lista de lesiones? Las lesiones ya registradas con ese nombre no cambian.`} onConfirm={async () => { await api.del('/injuries/custom-types/' + delC.id); customs.reload(); }} onClose={() => setDelC(null)} />}
  </Modal>;
}
