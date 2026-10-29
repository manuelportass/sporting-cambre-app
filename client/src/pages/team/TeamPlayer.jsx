import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { ColorBadge, Confirm, Empty, ErrorBox, Field, FileButton, Loading, Modal, MoreMenu, PageHead, Pending, Seg, Tabs, show, useApi, useToast } from '../../components/ui';
import { fileUrl } from '../../api';
import { normalizePlayerPhoto } from '../../lib/files';
import { AcuteChronicChart, AcwrChart, DailyLoadChart, MatchMinutesChart, MultiLine, WEEK_PARTS, WeeklyStackChart } from '../../components/charts';
import { ATT_LABEL, AVAIL_COLOR, COLOR_HEX, COLOR_LABEL, INJ_COLOR, INJ_STATUS, addDays, fmtDate, fmtDateTime, fmtNum, mondayOf, posGroup, todayISO } from '../../lib/format';

export default function TeamPlayer() {
  const { id } = useParams();
  const nav = useNavigate();
  const s = useApi('/team/players/' + id + '/summary');
  const [tab, setTab] = useState('resumen');
  if (s.loading && !s.data) return <Loading />;
  if (s.error) return <ErrorBox error={s.error} />;
  const { player: p, availability } = s.data;
  return <div>
    <PageHead back="/primer-equipo/jugadores" eyebrow={<span className="row" style={{ gap: 6 }}><span className="sdot" style={{ background: `var(--${AVAIL_COLOR[availability.code]})` }} />{availability.label}</span>} title={p.full_name}
      sub={[p.position, p.age !== null ? p.age + ' años' : null].filter(Boolean).join(' · ') || null}
      actions={<MoreMenu items={[{ label: 'Ficha general del jugador', onClick: () => nav('/jugadores/' + id) }, { label: 'Disponibilidad y observaciones', onClick: () => setTab('general') }]} />} />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'resumen', label: 'Resumen' }, { key: 'carga', label: 'Carga' }, { key: 'wellness', label: 'Wellness' }, { key: 'competicion', label: 'Partidos' }, { key: 'tests', label: 'Tests' }, { key: 'lesiones', label: `Lesiones${s.data.injuries.length ? ` (${s.data.injuries.length})` : ''}` }, { key: 'registros', label: 'Registros' }, { key: 'general', label: 'Ficha' }]} />
    {tab === 'resumen' && <Overview id={id} data={s.data} go={setTab} />}
    {tab === 'carga' && <LoadTab id={id} />}
    {tab === 'wellness' && <WellnessTab id={id} />}
    {tab === 'registros' && <EntriesTab id={id} />}
    {tab === 'competicion' && <CompetitionTab data={s.data} />}
    {tab === 'tests' && <TestsTab tests={s.data.tests} />}
    {tab === 'lesiones' && <InjuriesTab data={s.data} />}
    {tab === 'general' && <GeneralTab data={s.data} reload={s.reload} />}
  </div>;
}

const ATT_CELL = { asistio: ['#0ca30c', 'Asistió (RPE o asistencia)'], relleno: ['#a9c6ea', 'Sin RPE: relleno 5 × 90′'], sin_dato: ['#e2e3de', 'Sin dato'], ausente: ['#d03b3b', 'Ausente'], justificada: ['#fab219', 'Justificada / lesionado'] };
function Stat({ label, value, sub, color, children, onClick }) {
  return <button className="card stat" onClick={onClick} style={{ textAlign: 'left', cursor: onClick ? 'pointer' : 'default' }}>
    <span className="l">{label}</span><span className="v" style={color ? { color } : null}>{value}</span>{children}{sub && <span className="s">{sub}</span>}</button>;
}
// Resumen gráfico: asistencia, partidos, carga semanal y ACWR de un vistazo
function Overview({ id, data, go }) {
  const to = todayISO();
  const tr = data.trainings, mp = data.matchesPlayed;
  const from = tr.from;
  const ser = useApi(`/team/players/${id}/load?from=${addDays(to, -83)}&to=${to}`);
  const loads = useApi(`/team/load?player_id=${id}&from=${from}&to=${to}`);
  const weeks = useMemo(() => {
    if (!loads.data) return [];
    const m = new Map();
    const first = loads.data.reduce((a, l) => (l.date < a ? l.date : a), to);
    for (let w = mondayOf(first); w <= to; w = addDays(w, 7)) m.set(w, { week: w, entreno: 0, relleno: 0, partido: 0, adicional: 0, total: 0 });
    for (const l of loads.data) {
      const w = m.get(mondayOf(l.date)); if (!w) continue;
      const k = l.kind === 'partido' ? 'partido' : l.kind === 'adicional' ? 'adicional' : l.description === 'Relleno automático' ? 'relleno' : 'entreno';
      w[k] += l.load_au; w.total += l.load_au;
    }
    return [...m.values()];
  }, [loads.data, from, to]);
  const ind = ser.data?.indicators;
  const pctColor = tr.pct === null ? undefined : tr.pct >= 80 ? COLOR_HEX.verde : tr.pct >= 60 ? COLOR_HEX.amarillo : COLOR_HEX.rojo;
  return <div className="stack" style={{ gap: 14 }}>
    <div className="stats">
      <Stat label="Entrenamientos" value={<>{tr.attended}<small>/{tr.total}</small></>} color={pctColor} sub={tr.pct === null ? 'Sin sesiones' : `${tr.pct} % asistidos${tr.justified ? ` · ${tr.justified} justificados` : ''}`}>
        <span className="meter"><i style={{ width: (tr.pct || 0) + '%', background: pctColor }} /></span></Stat>
      <Stat label="Partidos" value={mp.played} sub={`${fmtNum(mp.minutes)}′ · ${mp.official} oficial${mp.official === 1 ? '' : 'es'}${mp.friendly ? ` · ${mp.friendly} amistoso${mp.friendly === 1 ? '' : 's'}` : ''}`} onClick={() => go('competicion')} />
      <Stat label="ACWR" value={ind ? (ind.acwr.value === null ? 'n/c' : fmtNum(ind.acwr.value, 2)) : '…'} color={ind && ind.acwr.value !== null ? COLOR_HEX[ind.acwr.color] : undefined} sub={ind ? `${COLOR_LABEL[ind.acwr.color] || ''}` : null} onClick={() => go('carga')} />
      <Stat label="Aguda / crónica" value={ind ? <>{fmtNum(ind.acute.value)}<small> / {fmtNum(ind.chronic.value)}</small></> : '…'} sub="UA · últimos 7 días / media semanal 28 d" onClick={() => go('carga')} />
    </div>
    <div className="card"><div className="row between"><h3 style={{ margin: 0 }}>Asistencia a entrenamientos</h3><span className="small muted">desde {fmtDate(from)}</span></div>
      <div className="attgrid">{(tr.list || []).map(x => <i key={x.date} title={`${fmtDate(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}: ${ATT_CELL[x.status][1]}`} style={{ background: ATT_CELL[x.status][0] }} />)}</div>
      <div className="row small muted" style={{ gap: 14, marginTop: 8 }}>{Object.entries(ATT_CELL).filter(([k]) => (tr.list || []).some(x => x.status === k)).map(([k, [c, l]]) => <span key={k} className="row" style={{ gap: 5 }}><i className="sq" style={{ background: c }} />{l}</span>)}</div>
    </div>
    <div className="card"><h3>Carga semanal (UA)</h3>{loads.loading ? <Loading /> : <WeeklyStackChart data={weeks} />}
      <div className="row small muted" style={{ gap: 14 }}>{WEEK_PARTS.filter(p => weeks.some(w => w[p.key])).map(p => <span key={p.key} className="row" style={{ gap: 5 }}><i className="sq" style={{ background: p.color }} />{p.label}</span>)}</div></div>
    <div className="grid g2">
      <div className="card"><h3>ACWR · últimas 12 semanas</h3>{ser.loading ? <Loading /> : <AcwrChart series={ser.data.series} bands={ser.data.settings.acwrBands} height={190} />}</div>
      <div className="card"><h3>Minutos por partido</h3>{!mp.list.length ? <p className="small muted">Sin partidos registrados esta temporada.</p> : <MatchMinutesChart data={mp.list} />}
        {mp.list.length > 0 && <p className="small muted" style={{ margin: 0 }}>Rojo: oficial (acta) · rosa: amistoso.</p>}</div>
    </div>
  </div>;
}

function Indicator({ title, ind, digits = 0, extra }) {
  return <div className={'ind c-' + ind.color}>
    <span className="l">{title}</span>
    <div className="row" style={{ gap: 6, alignItems: 'baseline' }}><span className="v">{ind.value === null ? 'n/c' : fmtNum(ind.value, digits)}</span><span className="u">{ind.unit}</span></div>
    {ind.color !== 'neutro' && <span className="small"><ColorBadge color={ind.color} /></span>}
    <details className="e"><summary style={{ cursor: 'pointer', color: 'var(--ink-3)' }}>Detalle</summary>
      <div><b>Periodo:</b> {ind.period}</div><div>{ind.explain}</div>
      <div className="muted">Hace 7 días: {ind.previous === null || ind.previous === undefined ? '—' : fmtNum(ind.previous, digits)}{extra}</div></details>
  </div>;
}

function LoadTab({ id }) {
  const [range, setRange] = useState(56);
  const to = todayISO();
  const r = useApi(`/team/players/${id}/load?from=${addDays(to, -range + 1)}&to=${to}`);
  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const { series, indicators: ind, settings } = r.data;
  return <div className="stack" style={{ gap: 14 }}>
    <div className="row between"><span /><Seg value={range} onChange={setRange} options={[{ value: 28, label: '4 sem.' }, { value: 56, label: '8 sem.' }, { value: 112, label: '16 sem.' }, { value: 280, label: 'Temporada' }]} /></div>
    <div className="grid g3">
      <Indicator title="Carga aguda" ind={ind.acute} extra={ind.acute.change !== null ? ` · variación ${ind.acute.change > 0 ? '+' : ''}${fmtNum(ind.acute.change, 1)} %` : ''} />
      <Indicator title="Carga crónica" ind={ind.chronic} />
      <Indicator title="ACWR" ind={ind.acwr} digits={2} />
    </div>
    <div className="card"><h3>Carga diaria (UA)</h3><DailyLoadChart series={series} /><p className="small muted" style={{ margin: 0 }}>Gris: sesión sin RPE registrado.</p></div>
    <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Más gráficos: aguda, crónica y ACWR</summary>
      <div className="grid g2" style={{ marginTop: 12 }}>
        <div><h3>Aguda y crónica ({series[0]?.unit})</h3><AcuteChronicChart series={series} unit={series[0]?.unit} /></div>
        <div><h3>ACWR</h3><AcwrChart series={series} bands={settings.acwrBands} /></div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Método: {ind.method}. Calculado el {fmtDateTime(ind.computedAt)}. Orientativo: no predice lesiones. <Link to="/primer-equipo/metodologia">Ver fórmulas</Link></p>
    </details>
    <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Tabla de datos</summary>
      <div className="table-wrap" style={{ marginTop: 10, maxHeight: 360 }}><table className="t"><thead><tr><th>Fecha</th><th>Estado</th><th className="n">Carga día</th><th className="n">Aguda</th><th className="n">Crónica</th><th className="n">ACWR</th><th>Motivo n/c</th></tr></thead>
        <tbody>{[...series].reverse().map(x => <tr key={x.date}><td>{fmtDate(x.date)}</td><td className="small">{x.state.replace('_', ' ')}</td><td className="n">{fmtNum(x.dayLoad)}</td><td className="n">{fmtNum(x.acute)}</td><td className="n">{fmtNum(x.chronic)}</td><td className="n">{fmtNum(x.acwr, 2)}</td><td className="small muted">{x.reasons.join(' · ')}</td></tr>)}</tbody></table></div>
    </details>
  </div>;
}

function WellnessTab({ id }) {
  const to = todayISO();
  const w = useApi(`/team/wellness?player_id=${id}&from=${addDays(to, -90)}&to=${to}`);
  const settings = useApi('/settings');
  if (w.loading || settings.loading) return <Loading />;
  const items = settings.data.wellness.items;
  const data = [...w.data].reverse().map(x => ({ date: x.date, total: x.summary.total, ...Object.fromEntries(x.summary.items.map(i => [i.key, i.pct])) }));
  if (!w.data.length) return <Empty title="Sin registros de wellness" />;
  return <div className="stack" style={{ gap: 14 }}>
    <div className="card"><h3>Wellness global (% del estado más favorable)</h3><MultiLine data={data} lines={[{ key: 'total', label: 'Global' }]} yDomain={[0, 100]} unit="%" decimals={0} />
      <p className="small muted" style={{ margin: 0 }}>100 % = estado más favorable.</p></div>
    <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Gráfico por ítem</summary><MultiLine data={data} lines={items.slice(0, 6).map(i => ({ key: i.key, label: i.label }))} yDomain={[0, 100]} unit="%" decimals={0} /></details>
    <div className="table-wrap"><table className="t"><thead><tr><th>Fecha</th>{items.map(i => <th key={i.key} className="n">{i.label}</th>)}<th>Global</th><th>Observaciones</th></tr></thead>
      <tbody>{w.data.map(x => <tr key={x.id}><td>{fmtDate(x.date)}</td>{x.summary.items.map(i => <td key={i.key} className="n"><span className="cell-color"><i style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${i.color})`, display: 'inline-block' }} />{i.value}</span></td>)}
        <td><ColorBadge color={x.summary.color}>{x.summary.total ?? '—'} %</ColorBadge></td><td className="small">{x.notes}</td></tr>)}</tbody></table></div>
  </div>;
}

function EntriesTab({ id }) {
  const toast = useToast();
  const to = todayISO();
  const [from, setFrom] = useState(addDays(to, -41));
  const l = useApi(`/team/load?player_id=${id}&from=${from}&to=${to}&include_void=1`);
  const [add, setAdd] = useState(false);
  const [corr, setCorr] = useState(null);
  return <div className="stack">
    <div className="row"><Field label="Desde"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><span className="spacer" /><button className="btn primary" onClick={() => setAdd(true)}>+ Registrar carga</button></div>
    {l.loading ? <Loading /> : !l.data.length ? <Empty title="Sin registros en este periodo" /> :
      <div className="table-wrap"><table className="t"><thead><tr><th>Fecha</th><th>Tipo</th><th>Sesión</th><th className="n">Min</th><th className="n">RPE</th><th className="n">Carga (UA)</th><th>Observaciones</th><th>Estado</th><th /></tr></thead>
        <tbody>{l.data.map(e => <tr key={e.id} style={{ opacity: e.status === 'anulado' ? 0.5 : 1 }}><td>{fmtDate(e.date)}</td><td><span className="tag">{e.kind}</span></td><td className="small">{e.session_type}{e.description ? ' · ' + e.description : ''}</td>
          <td className="n">{fmtNum(e.duration_min)}</td><td className="n">{fmtNum(e.rpe)}</td><td className="n"><b>{fmtNum(e.load_au)}</b></td><td className="small">{e.notes}</td>
          <td className="small">{e.status === 'anulado' ? 'Anulado' + (e.superseded_by ? ' (corregido)' : '') : 'Válido'}</td>
          <td>{e.status === 'valido' && <button className="btn sm" onClick={() => setCorr(e)}>Corregir</button>}</td></tr>)}</tbody></table></div>}
    {add && <LoadEntryModal playerId={id} onClose={() => setAdd(false)} onSaved={() => { l.reload(); toast('Carga registrada'); }} />}
    {corr && <CorrectModal e={corr} onClose={() => setCorr(null)} onSaved={() => { l.reload(); toast('Registro corregido (el original queda anulado en el historial)'); }} />}
  </div>;
}

export function LoadEntryModal({ playerId, onClose, onSaved, preset = {} }) {
  const [v, setV] = useState({ date: todayISO(), kind: 'colectivo', session_type: 'Entrenamiento', duration_min: '', rpe: '', notes: '', description: '', ...preset });
  const [err, setErr] = useState(null);
  const load = v.duration_min !== '' && v.rpe !== '' ? Number(v.duration_min) * Number(v.rpe) : null;
  return <Modal title="Registrar carga (preparador)" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { await api.post('/team/load', { ...v, player_id: playerId }); onSaved(); onClose(); } catch (e) { setErr(e.message); }
  }}>Guardar</button></>}>
    <div className="inline-fields">
      <Field label="Fecha" required><input type="date" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></Field>
      <Field label="Tipo"><select value={v.kind} onChange={e => setV({ ...v, kind: e.target.value, ...(e.target.value === 'partido' ? { rpe: 10, session_type: 'Partido' } : {}) })}><option value="colectivo">Colectivo</option><option value="adicional">Adicional</option><option value="partido">Partido</option></select></Field>
      <Field label="Sesión / modalidad" required><input type="text" value={v.session_type} onChange={e => setV({ ...v, session_type: e.target.value })} /></Field>
      <Field label="Duración (min)" required><input type="number" value={v.duration_min} onChange={e => setV({ ...v, duration_min: e.target.value })} /></Field>
      <Field label="RPE (0–10)" required><input type="number" min="0" max="10" step="0.5" value={v.rpe} onChange={e => setV({ ...v, rpe: e.target.value })} /></Field>
      <Field label="Carga calculada"><input type="text" readOnly value={load === null ? '' : load + ' UA'} /></Field>
    </div>
    <Field label="Observaciones" required style={{ marginTop: 12 }}><textarea value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></Field>
    <ErrorBox error={err} />
  </Modal>;
}
function CorrectModal({ e, onClose, onSaved }) {
  const [v, setV] = useState({ duration_min: e.duration_min, rpe: e.rpe, notes: e.notes, reason: '', voidOnly: false });
  const [err, setErr] = useState(null);
  return <Modal title="Corregir registro" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { await api.post(`/team/load/${e.id}/correct`, { reason: v.reason, voidOnly: v.voidOnly, changes: { duration_min: v.duration_min, rpe: v.rpe, notes: v.notes } }); onSaved(); onClose(); } catch (x) { setErr(x.message); }
  }}>Guardar corrección</button></>}>
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>El registro original se conserva como «anulado» y se crea uno nuevo enlazado, de forma trazable.</p>
      <label className="check"><input type="checkbox" checked={v.voidOnly} onChange={x => setV({ ...v, voidOnly: x.target.checked })} /> Anular sin sustituir (registro erróneo o duplicado)</label>
      {!v.voidOnly && <div className="inline-fields"><Field label="Duración (min)"><input type="number" value={v.duration_min} onChange={x => setV({ ...v, duration_min: x.target.value })} /></Field>
        <Field label="RPE"><input type="number" min="0" max="10" value={v.rpe} onChange={x => setV({ ...v, rpe: x.target.value })} /></Field></div>}
      {!v.voidOnly && <Field label="Observaciones"><textarea value={v.notes} onChange={x => setV({ ...v, notes: x.target.value })} /></Field>}
      <Field label="Motivo de la corrección" required><input type="text" value={v.reason} onChange={x => setV({ ...v, reason: x.target.value })} /></Field>
      <ErrorBox error={err} />
    </div>
  </Modal>;
}

function CompetitionTab({ data }) {
  const [season, setSeason] = useState(data.seasons[0] || '');
  const [month, setMonth] = useState('');
  const ms = data.matches.filter(m => (!season || m.season === season) && (!month || m.date.startsWith(month)));
  const tot = ms.reduce((a, m) => ({ conv: a.conv + 1, pj: a.pj + ((m.minutes || 0) > 0 ? 1 : 0), min: a.min + (m.minutes || 0), tit: a.tit + (m.started ? 1 : 0), titNull: a.titNull + (m.started === null ? 1 : 0), g: a.g + (m.goals || 0), as: a.as + (m.assists || 0), asNull: a.asNull + (m.assists === null ? 1 : 0), ta: a.ta + (m.yellow || 0), tr: a.tr + (m.red || 0) }), { conv: 0, pj: 0, min: 0, tit: 0, titNull: 0, g: 0, as: 0, asNull: 0, ta: 0, tr: 0 });
  const months = [...new Set(data.matches.filter(m => !season || m.season === season).map(m => m.date.slice(0, 7)))].sort();
  if (!data.matches.length) return <Empty title="Sin estadísticas competitivas">Regístralas o impórtalas en <Link to="/primer-equipo/partidos">Partidos</Link>.</Empty>;
  return <div className="stack">
    <div className="row"><Field label="Temporada"><select value={season} onChange={e => { setSeason(e.target.value); setMonth(''); }}><option value="">Todas</option>{data.seasons.map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Mes"><select value={month} onChange={e => setMonth(e.target.value)}><option value="">Todos</option>{months.map(m => <option key={m} value={m}>{fmtDate(m + '-01', { month: 'long', year: 'numeric' })}</option>)}</select></Field></div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
      {[['Partidos', tot.pj], ['Minutos', tot.min], ['Goles', tot.g], ['Tarjetas', `${tot.ta} / ${tot.tr}`]].map(([l, v]) => <div key={l} className="card kpi"><span className="v">{v}</span><span className="l">{l}</span></div>)}
    </div>
    <div className="table-wrap"><table className="t"><thead><tr><th>Fecha</th><th>Rival</th><th>Resultado</th><th className="n">Min</th><th className="n">Goles</th></tr></thead>
      <tbody>{ms.map(m => <tr key={m.id}><td>{fmtDate(m.date, { day: 'numeric', month: 'short' })}</td><td>{m.opponent}</td>
        <td>{m.goals_for !== null ? `${m.goals_for}–${m.goals_against}` : '—'}</td><td className="n">{m.minutes ?? '—'}</td><td className="n">{m.goals || ''}</td></tr>)}</tbody></table></div>
  </div>;
}

// Historial de lesiones del jugador (procesos abiertos y finalizados)
function InjuriesTab({ data }) {
  const nav = useNavigate();
  const l = data.injuries;
  if (!l.length) return <Empty title="Sin lesiones registradas">Las lesiones se registran en el apartado Lesiones.</Empty>;
  const open = l.filter(i => i.status !== 'completada');
  const daysOut = l.reduce((a, i) => a + (i.days || 0), 0);
  return <div className="stack" style={{ gap: 14 }}>
    <div className="stats">
      <div className="card stat"><span className="l">Lesiones</span><span className="v">{l.length}</span><span className="s">esta y anteriores temporadas</span></div>
      <div className="card stat"><span className="l">Días de baja</span><span className="v">{daysOut}</span><span className="s">suma de todos los procesos</span></div>
      <div className="card stat"><span className="l">Ahora</span><span className="v" style={{ color: open.length ? 'var(--rojo)' : 'var(--verde)', fontSize: 26 }}>{open.length ? 'En proceso' : 'Sin lesión'}</span><span className="s">{open.length ? open[0].phase_name || '' : 'ningún proceso abierto'}</span></div>
    </div>
    <div className="inj-tl">{l.map(i => <button key={i.id} className={'inj-it' + (i.status === 'completada' ? ' done' : '')} onClick={() => nav('/lesiones/' + i.id)}>
      <span className="inj-dot" />
      <div className="inj-b">
        <div className="row between"><b>{i.zone || 'Lesión'}{i.laterality ? ` · ${i.laterality}` : ''}</b><ColorBadge color={INJ_COLOR[i.status]}>{INJ_STATUS[i.status]}</ColorBadge></div>
        <div className="small muted">{[i.injury_type, i.mechanism].filter(Boolean).join(' · ') || i.diagnosis || '—'}</div>
        <div className="inj-m"><span><small>Lesión</small>{fmtDate(i.injury_date)}</span><span><small>{i.status === 'completada' ? 'Alta' : 'Fase'}</small>{i.status === 'completada' ? fmtDate(i.closed_at) : i.phase_name || '—'}</span>
          <span><small>Días</small>{i.days}</span><span><small>EVA medio</small>{i.pain.n ? `${String(i.pain.avg).replace('.', ',')} (${i.pain.n})` : '—'}</span><span><small>Seguimientos</small>{i.entries}</span></div>
      </div><span className="lrow-go" aria-hidden="true">›</span></button>)}</div>
  </div>;
}

function TestsTab({ tests }) {
  const byType = useMemo(() => { const m = new Map(); for (const t of tests) { if (!m.has(t.name)) m.set(t.name, []); m.get(t.name).push(t); } return [...m.entries()]; }, [tests]);
  if (!tests.length) return <Empty title="Sin tests registrados">Regístralos en <Link to="/primer-equipo/tests">Tests físicos</Link>.</Empty>;
  return <div className="grid g2">{byType.map(([name, list]) => {
    const fields = list[0].fields;
    const data = [...list].reverse().map(r => ({ date: r.date, ...r.values }));
    return <div key={name} className="card"><h3>{name}</h3>
      {list.length >= 2 ? <MultiLine data={data} lines={fields.map(f => ({ key: f.key, label: `${f.label}${f.unit ? ' (' + f.unit + ')' : ''}` }))} decimals={fields[0].decimals} height={180} /> : <p className="muted small">Se mostrará la evolución con al menos dos mediciones.</p>}
      <table className="t small"><thead><tr><th>Fecha</th>{fields.map(f => <th key={f.key} className="n">{f.label} {f.unit && `(${f.unit})`}</th>)}<th>Dispositivo</th></tr></thead>
        <tbody>{list.map((r, k) => { const prev = list[k + 1]; return <tr key={r.id}><td>{fmtDate(r.date)}</td>{fields.map(f => { const v = r.values[f.key], pv = prev?.values[f.key]; const diff = v !== null && pv !== null && pv !== undefined ? v - pv : null; return <td key={f.key} className="n">{fmtNum(v, f.decimals)}{diff !== null && <span className="muted"> ({diff > 0 ? '+' : ''}{fmtNum(diff, f.decimals)})</span>}</td>; })}<td>{r.device || '—'}</td></tr>; })}</tbody></table>
    </div>;
  })}</div>;
}

// Foto del jugador (solo el preparador puede cambiarla). Se ajusta sola al formato de las demás (3:4).
function PhotoBox({ p, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const up = async f => {
    setBusy(true);
    try { await api.upload(`/players/${p.id}/photo`, await normalizePlayerPhoto(f)); toast('Foto actualizada'); reload(); }
    catch (e) { toast(e.message || 'No se pudo subir la foto', 'err'); } finally { setBusy(false); }
  };
  return <div className="card photobox"><h3 style={{ margin: 0 }}>Foto del jugador</h3>
    <div className="row" style={{ gap: 16, alignItems: 'center', flexWrap: 'nowrap' }}>
      <span className="pb-img">{p.photo_file_id ? <img src={fileUrl(p.photo_file_id)} alt="" /> : <span className="muted small">Sin foto</span>}</span>
      <div className="stack" style={{ gap: 8 }}>
        <span className="small muted">Se ajusta sola al formato de las demás fotos (vertical 3:4). Es la que el jugador ve en su pantalla de inicio.</span>
        <div className="row" style={{ gap: 8 }}>
          <FileButton className="btn primary sm" accept="image/*" onFile={up}>{busy ? 'Subiendo…' : p.photo_file_id ? 'Cambiar foto' : 'Subir foto'}</FileButton>
          {p.photo_file_id && <button className="btn sm ghost" disabled={busy} onClick={() => setDel(true)}>Quitar</button>}</div>
      </div></div>
    {del && <Confirm title="Quitar foto" danger confirmText="Quitar" message="El jugador verá el escudo en lugar de su foto." onConfirm={async () => { await api.del(`/players/${p.id}/photo`); toast('Foto eliminada'); reload(); }} onClose={() => setDel(false)} />}
  </div>;
}

// Peso corporal: se registra como test para ver su evolución durante la temporada
function WeightBox({ data, reload }) {
  const toast = useToast();
  const types = useApi('/team/test-types');
  const list = data.tests.filter(t => t.name === 'Peso corporal').map(t => ({ date: t.date, peso: t.values.peso })).filter(x => x.peso != null).sort((a, b) => a.date.localeCompare(b.date));
  const [v, setV] = useState({ peso: '', date: todayISO() });
  const last = list[list.length - 1], first = list[0], prev = list[list.length - 2];
  const save = async () => {
    const tp = types.data?.find(t => t.name === 'Peso corporal');
    if (!tp || !v.peso) return;
    try { await api.post('/team/tests', { test_type_id: tp.id, player_id: data.player.id, date: v.date, values: { peso: v.peso } }); toast('Peso registrado'); setV({ peso: '', date: todayISO() }); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  const diff = (a, b) => (a && b ? a.peso - b.peso : null);
  const sign = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + fmtNum(Math.abs(x), 1);
  return <div className="card wbox"><div className="row between"><h3 style={{ margin: 0 }}>Peso corporal</h3>{list.length > 0 && <span className="small muted">{list.length} registro{list.length > 1 ? 's' : ''}</span>}</div>
    {last ? <div className="wb-now"><b>{fmtNum(last.peso, 1)}<small> kg</small></b><div className="small">
      <div className="muted">{fmtDate(last.date)}</div>
      {prev && <div>Desde el anterior: <b>{sign(diff(last, prev))} kg</b></div>}
      {list.length > 2 && <div>Desde el inicio: <b>{sign(diff(last, first))} kg</b></div>}</div></div> : <p className="small muted" style={{ margin: '6px 0' }}>Sin registros de peso.</p>}
    {list.length >= 2 && <MultiLine data={list} lines={[{ key: 'peso', label: 'Peso (kg)' }]} decimals={1} height={140} />}
    <div className="row" style={{ gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
      <Field label="Nuevo peso (kg)"><input type="number" min="30" max="200" step="0.1" value={v.peso} onChange={e => setV({ ...v, peso: e.target.value })} style={{ width: 110 }} /></Field>
      <Field label="Fecha"><input type="date" value={v.date} max={todayISO()} onChange={e => setV({ ...v, date: e.target.value })} /></Field>
      <button className="btn primary" disabled={!v.peso} onClick={save}>Registrar</button></div>
  </div>;
}
const POSITIONS = ['Portero', 'Defensa', 'Lateral', 'Medio', 'Delantero', 'Extremo'];
const AVAIL = [['disponible', 'Disponible', 'var(--verde)'], ['limitado', 'Limitado', 'var(--amarillo)'], ['lesionado', 'Lesionado', 'var(--rojo)']];
function GeneralTab({ data, reload }) {
  const toast = useToast();
  const p = data.player;
  const cur = p.availability === 'no_disponible' || p.availability === 'lesionado' ? 'lesionado' : p.availability === 'limitado' ? 'limitado' : 'disponible';
  const [v, setV] = useState({ position: p.position || '', age: p.age_input ?? (p.birth_date ? '' : p.age ?? ''), dominant_leg: p.dominant_leg || '', availability: cur, notes: p.notes || '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.put('/players/' + p.id, { position: v.position || null, dominant_leg: v.dominant_leg || null, availability: v.availability, notes: v.notes, private: { age: v.age === '' ? null : v.age } }); toast('Ficha guardada'); reload(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return <div className="grid g2" style={{ alignItems: 'start' }}>
    <div className="card stack"><h3>Ficha del jugador</h3>
      <div className="inline-fields">
        <Field label="Posición"><select value={posGroup(v.position) || ''} onChange={e => setV({ ...v, position: e.target.value })}><option value="">—</option>{POSITIONS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Edad" hint={p.birth_date ? `por fecha de nacimiento: ${p.age} años` : 'años'}><input type="number" min="8" max="60" value={v.age} disabled={!!p.birth_date} placeholder={p.birth_date ? String(p.age) : ''} onChange={e => setV({ ...v, age: e.target.value })} /></Field>
      </div>
      <div><span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Pierna dominante</span>
        <div className="segpick">{[['derecha', 'Derecha'], ['izquierda', 'Izquierda'], ['ambas', 'Ambas']].map(([k, l]) => <button key={k} type="button" className={v.dominant_leg === k ? 'on' : ''} onClick={() => setV({ ...v, dominant_leg: v.dominant_leg === k ? '' : k })}>{l}</button>)}</div></div>
      <div><span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Disponibilidad</span>
        <div className="segpick avail">{AVAIL.map(([k, l, c]) => <button key={k} type="button" className={v.availability === k ? 'on' : ''} style={{ '--c': c }} onClick={() => setV({ ...v, availability: k })}><i />{l}</button>)}</div>
        {data.availability.source === 'lesion' && <div className="alert warn small" style={{ marginTop: 8 }}><span>⚠</span><div>Tiene un proceso de lesión abierto: mientras siga abierto, la app lo muestra como «{data.availability.label}».</div></div>}</div>
      <Field label="Observaciones del preparador físico"><textarea value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></Field>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar ficha'}</button>
    </div>
    <div className="stack" style={{ gap: 14 }}>
      <PhotoBox p={p} reload={reload} />
      <WeightBox data={data} reload={reload} />
      <div className="card"><h3>Historial de lesiones</h3>{!data.injuries.length ? <p className="muted small">Sin lesiones registradas.</p> : data.injuries.map(i => <div key={i.id} className="row small" style={{ borderBottom: '1px solid var(--line)', padding: '5px 0' }}>
        <Link to={'/lesiones/' + i.id}>{fmtDate(i.injury_date)} · {i.zone || 'Lesión'}{i.laterality ? ` (${i.laterality})` : ''}</Link><span className="spacer" /><ColorBadge color={INJ_COLOR[i.status]}>{INJ_STATUS[i.status]}</ColorBadge></div>)}</div>
      <div className="card"><h3>Asistencia a entrenamientos</h3>{!data.attendance.length ? <p className="muted small">Sin sesiones programadas.</p> :
        <div style={{ maxHeight: 300, overflow: 'auto' }}>{data.attendance.map((a, k) => <div key={k} className="row small" style={{ borderBottom: '1px solid var(--line)', padding: '4px 0' }}><span style={{ minWidth: 90 }}>{fmtDate(a.date)}</span><span>{a.session_type}</span><span className="spacer" />{a.status ? ATT_LABEL[a.status] : <span className="muted">Sin marcar</span>}</div>)}</div>}</div>
    </div>
  </div>;
}
