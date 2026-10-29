import React, { useState } from 'react';
import { api } from '../../api';
import { crestOf, teamName } from '../../lib/crests';
import { Crest } from '../Login';
import { Confirm, Empty, ErrorBox, Field, FileButton, ListRow, Loading, Modal, PageHead, Tabs, useApi, useToast } from '../../components/ui';
import { readTable, downloadTemplate, exportCSV, exportXLSX, saveBlob } from '../../lib/files';
import { actaToRows, readActaFile } from '../../lib/acta';
import { useClub } from '../../App';
import { fmtDate, fmtDateTime, seasonOf, todayISO } from '../../lib/format';

export default function Matches() {
  const [tab, setTab] = useState('partidos');
  const seasons = useApi('/team/seasons');
  const [season, setSeason] = useState(seasonOf(todayISO()));
  const allSeasons = [...new Set([seasonOf(todayISO()), ...(seasons.data || [])])].sort().reverse();
  return <div>
    <PageHead back="/primer-equipo" title="Partidos" actions={<select value={season} onChange={e => setSeason(e.target.value)} aria-label="Temporada" style={{ width: 'auto' }}>{allSeasons.map(s => <option key={s}>{s}</option>)}<option value="">Todas</option></select>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'partidos', label: 'Partidos' }, { key: 'estadisticas', label: 'Jugadores' }, { key: 'importar', label: 'Importar' }]} />
    {tab === 'partidos' && <MatchList season={season} />}
    {tab === 'estadisticas' && <StatsTable season={season} />}
    {tab === 'importar' && <ImportMatches season={season} onDone={() => { seasons.reload(); setTab('partidos'); }} />}
  </div>;
}

// Fila de resultado con los escudos de ambos equipos (local a la izquierda)
function MatchRow({ m, onClick }) {
  const club = useClub();
  const away = m.home_away === 'visitante';
  const has = m.goals_for !== null && m.goals_for !== undefined;
  const o = has ? (m.goals_for > m.goals_against ? 'V' : m.goals_for < m.goals_against ? 'D' : 'E') : null;
  const us = <span className="mr-t"><span className="mr-c"><Crest size={30} /></span><b>{club.name}</b></span>;
  const them = <span className="mr-t"><span className="mr-c">{crestOf(m.opponent) ? <img src={crestOf(m.opponent)} alt="" /> : null}</span><b>{teamName(m.opponent)}</b></span>;
  return <button className={'mrow2' + (o ? ' o' + o : '')} onClick={onClick}>
    <span className={'res' + (o ? ' r' + o : '')}>{o || '·'}</span>
    <span className="mr-main"><span className="mr-teams">{away ? them : us}<span className="mr-sc">{has ? (away ? `${m.goals_against} – ${m.goals_for}` : `${m.goals_for} – ${m.goals_against}`) : (m.date >= todayISO() ? 'Próximo' : '–')}</span>{away ? us : them}</span>
      <small>{[m.matchday ? `J${m.matchday}` : null, fmtDate(m.date, { weekday: 'short', day: 'numeric', month: 'short' }), m.competition].filter(Boolean).join(' · ')}</small></span>
    <span className="lrow-go" aria-hidden="true">›</span></button>;
}

function MatchList({ season }) {
  const toast = useToast();
  const l = useApi('/team/matches' + (season ? '?season=' + encodeURIComponent(season) : ''));
  const [form, setForm] = useState(null);
  const [stats, setStats] = useState(null);
  return <div className="stack">
    <div className="row"><span className="spacer" /><button className="btn primary" onClick={() => setForm({})}>+ Partido</button></div>
    {l.loading ? <Loading /> : !l.data.length ? <Empty title="No hay partidos en esta temporada">Añádelos con «+ Partido» o en la pestaña Importar.</Empty> :
      <div className="list">{l.data.map(m => <MatchRow key={m.id} m={m} onClick={() => setStats(m)} />)}</div>}
    {form && <MatchForm m={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { l.reload(); toast('Partido guardado'); }} />}
    {stats && <StatsEditor id={stats.id} onEditMatch={() => { setForm(stats); setStats(null); }} onClose={() => { setStats(null); l.reload(); }} />}
  </div>;
}

function MatchForm({ m, onClose, onSaved }) {
  const [v, setV] = useState({ date: m?.date || todayISO(), opponent: m?.opponent || '', competition: m?.competition || '', matchday: m?.matchday || '', home_away: m?.home_away || '', goals_for: m?.goals_for ?? '', goals_against: m?.goals_against ?? '', duration_min: m?.duration_min || 90, season: m?.season || '', notes: m?.notes || '' });
  const [err, setErr] = useState(null);
  const [del, setDel] = useState(false);
  const set = k => e => setV({ ...v, [k]: e.target.value });
  return <Modal title={m ? 'Editar partido' : 'Nuevo partido'} onClose={onClose} footer={<>
    {m && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setDel(true)}>Eliminar</button>}
    <button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
      try { const b = { ...v, home_away: v.home_away || null, season: v.season || seasonOf(v.date) }; if (m) await api.put('/team/matches/' + m.id, b); else await api.post('/team/matches', b); onSaved(); onClose(); } catch (e) { setErr(e.message); }
    }}>Guardar</button></>}>
    <div className="inline-fields">
      <Field label="Fecha" required><input type="date" value={v.date} onChange={set('date')} /></Field>
      <Field label="Rival" required><input type="text" value={v.opponent} onChange={set('opponent')} /></Field>
      <Field label="Local / visitante"><select value={v.home_away} onChange={set('home_away')}><option value="">Pendiente</option><option value="local">Local</option><option value="visitante">Visitante</option></select></Field>
      <Field label="Competición"><input type="text" value={v.competition} onChange={set('competition')} /></Field>
      <Field label="Jornada"><input type="text" value={v.matchday} onChange={set('matchday')} /></Field>
      <Field label="Temporada" hint="AAAA/AAAA"><input type="text" value={v.season} placeholder={seasonOf(v.date)} onChange={set('season')} /></Field>
      <Field label="Goles a favor"><input type="number" min="0" value={v.goals_for} onChange={set('goals_for')} /></Field>
      <Field label="Goles en contra"><input type="number" min="0" value={v.goals_against} onChange={set('goals_against')} /></Field>
      <Field label="Duración (min)"><input type="number" value={v.duration_min} onChange={set('duration_min')} /></Field>
    </div>
    <p className="small muted">Deja el resultado vacío si el partido aún no se ha disputado: aparecerá como próximo partido en el panel.</p>
    <ErrorBox error={err} />
    {del && <Confirm title="Eliminar partido" danger confirmText="Eliminar" message="Se eliminarán también sus estadísticas individuales." onConfirm={async () => { await api.del('/team/matches/' + m.id); onSaved(); onClose(); }} onClose={() => setDel(false)} />}
  </Modal>;
}

function StatsEditor({ id, onClose, onEditMatch }) {
  const toast = useToast();
  const r = useApi('/team/matches/' + id);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  if (r.data && !rows) {
    const by = new Map(r.data.stats.map(s => [s.player_id, s]));
    const ids = new Set([...r.data.squad.map(p => p.id), ...r.data.stats.map(s => s.player_id)]);
    const names = new Map([...r.data.squad.map(p => [p.id, p.name]), ...r.data.stats.map(s => [s.player_id, s.name])]);
    setRows([...ids].map(pid => { const s = by.get(pid); return { player_id: pid, name: names.get(pid), on: !!s, started: s?.started === 1 ? 'si' : s?.started === 0 ? 'no' : '', minutes: s?.minutes ?? '', goals: s?.goals ?? 0, assists: s?.assists ?? '', yellow: s?.yellow ?? 0, red: s?.red ?? 0, source: s?.source }; }).sort((a, b) => b.on - a.on || (a.started === 'si' ? -1 : 0) - (b.started === 'si' ? -1 : 0) || a.name.localeCompare(b.name, 'es')));
  }
  const upd = (i, k, v) => setRows(rs => rs.map((x, j) => (j === i ? { ...x, [k]: v, on: k === 'on' ? v : true } : x)));
  const save = async () => {
    try {
      await api.put(`/team/matches/${id}/stats`, { stats: rows.filter(x => x.on).map(x => ({ ...x, started: x.started === '' ? null : x.started === 'si', minutes: x.minutes === '' ? null : x.minutes, assists: x.assists === '' ? null : x.assists })) });
      toast('Estadísticas guardadas'); onClose();
    } catch (e) { setErr(e.message); }
  };
  const m = r.data?.match;
  return <Modal wide title={m ? `${m.opponent} · ${fmtDate(m.date)}` : 'Partido'} onClose={onClose} footer={<><button className="btn ghost" style={{ marginRight: 'auto' }} onClick={onEditMatch}>Editar datos del partido</button><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar estadísticas</button></>}>
    {!rows ? <Loading /> : <>
      <div className="row" style={{ marginBottom: 10 }}>
        <b className="small">Acta:</b>
        {!r.data.files.length ? <span className="small muted">sin adjuntar</span> : r.data.files.map(f => <span key={f.id} className="row small" style={{ gap: 4 }}>{f.original_name}
          <button className="btn sm ghost" onClick={async () => { try { const res = await api.raw('GET', '/files/' + f.id); await saveBlob(await res.blob(), f.original_name); } catch (e) { toast(e.message, 'err'); } }}>Descargar</button>
          <button className="btn sm ghost" onClick={async () => { await api.del('/team/matches/files/' + f.id); r.reload(); }}>Quitar</button></span>)}
        <label className="btn sm">Adjuntar PDF<input type="file" accept="application/pdf,.pdf,image/*" hidden onChange={async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await api.upload(`/team/matches/${id}/files`, f); toast('Acta adjuntada'); r.reload(); } catch (x) { toast(x.message, 'err'); } }} /></label>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>Marca los convocados. Deja vacío lo que no sepas (no cuenta como 0).</p>
      <div className="table-wrap"><table className="t"><thead><tr><th>Conv.</th><th>Jugador</th><th>Titular</th><th>Minutos</th><th>Goles</th><th>Asist.</th><th>TA</th><th>TR</th><th>Fuente</th></tr></thead>
        <tbody>{rows.map((x, i) => <tr key={x.player_id} style={{ opacity: x.on ? 1 : 0.5 }}>
          <td><input type="checkbox" checked={x.on} onChange={e => upd(i, 'on', e.target.checked)} /></td><td><b>{x.name}</b></td>
          <td><select value={x.started} onChange={e => upd(i, 'started', e.target.value)}><option value="">Sin dato</option><option value="si">Sí</option><option value="no">No</option></select></td>
          {['minutes', 'goals', 'assists', 'yellow', 'red'].map(k => <td key={k}><input type="number" min="0" style={{ width: 70 }} value={x[k]} onChange={e => upd(i, k, e.target.value)} /></td>)}
          <td className="small muted">{x.source || ''}</td></tr>)}</tbody></table></div>
      <ErrorBox error={err} />
    </>}
  </Modal>;
}

const SCOLS = [{ key: 'name', label: 'Jugador' }, { key: 'convocatorias', label: 'Convocatorias', align: 'right' }, { key: 'partidos', label: 'Partidos', align: 'right' }, { key: 'minutos', label: 'Minutos', align: 'right' },
  { key: 'titularidades', label: 'Titularidades', align: 'right' }, { key: 'goles', label: 'Goles', align: 'right' }, { key: 'asistencias', label: 'Asistencias', align: 'right' }, { key: 'amarillas', label: 'Amarillas', align: 'right' }, { key: 'rojas', label: 'Rojas', align: 'right' }];
function StatsTable({ season }) {
  const [month, setMonth] = useState('');
  const s = useApi('/team/stats?' + new URLSearchParams({ ...(season ? { season } : {}), ...(month ? { month } : {}) }).toString());
  const rows = (s.data || []).map(x => ({ ...x, titularidades: x.tit_sin_dato === x.convocatorias ? 'Sin dato' : x.titularidades, asistencias: x.asis_sin_dato === x.convocatorias ? 'Sin dato' : x.asistencias ?? 0 }));
  return <div className="stack">
    <div className="row"><Field label="Mes"><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></Field><span className="spacer" />
      <button className="btn" onClick={() => exportCSV(rows, SCOLS, `estadisticas-${(season || 'todas').replace('/', '-')}.csv`)}>CSV</button>
      <button className="btn" onClick={() => exportXLSX([{ name: 'Estadísticas', columns: SCOLS, rows }], `estadisticas-${(season || 'todas').replace('/', '-')}.xlsx`)}>Excel</button></div>
    {s.loading ? <Loading /> : !rows.length ? <Empty title="Sin estadísticas para este filtro" /> :
      <div className="table-wrap"><table className="t"><thead><tr>{SCOLS.map(c => <th key={c.key} className={c.align ? 'n' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map(x => <tr key={x.player_id}>{SCOLS.map(c => <td key={c.key} className={c.align ? 'n' : ''}>{c.key === 'name' ? <b>{x.name}</b> : x[c.key]}</td>)}</tr>)}</tbody></table></div>}
  </div>;
}

const MAP_TARGETS = [['fecha', 'Fecha', ['fecha', 'dia']], ['rival', 'Rival', ['rival', 'adversario', 'contrario']], ['competicion', 'Competición', ['competicion']], ['jornada', 'Jornada', ['jornada', 'j']],
  ['local_visitante', 'Local / visitante', ['local_visitante', 'condicion', 'lv']], ['goles_favor', 'Goles a favor', ['goles_favor', 'gf']], ['goles_contra', 'Goles en contra', ['goles_contra', 'gc']],
  ['jugador', 'Jugador', ['jugador', 'nombre', 'nombre_completo']], ['titular', 'Titular', ['titular', 'tit']], ['minutos', 'Minutos', ['minutos', 'min']], ['goles', 'Goles del jugador', ['goles', 'gol']],
  ['asistencias', 'Asistencias', ['asistencias', 'asist']], ['amarillas', 'Tarjetas amarillas', ['amarillas', 'ta', 'tarjetas_amarillas']], ['rojas', 'Tarjetas rojas', ['rojas', 'tr', 'tarjetas_rojas']]];

function ImportMatches({ season, onDone }) {
  const toast = useToast();
  const club = useClub();
  const [mode, setMode] = useState(null);
  const [actas, setActas] = useState([]); // [{ file, data, error }]
  const readPdfs = async list => {
    setErr(null); setBusy(true); setPrev(null);
    const out = [];
    for (const file of list) {
      try { out.push({ file, data: await readActaFile(file, { clubName: club.name }) }); }
      catch (e) { out.push({ file, error: e.message }); }
    }
    setActas(out); setBusy(false);
    const ok = out.filter(a => a.data);
    if (!ok.length) return;
    setMeta(m => ({ ...m, source: ok.length === 1 ? `Acta Futgal · ${ok[0].file.name}` : `Actas Futgal (${ok.length})` }));
    setBusy(true);
    try { setPrev(await api.post('/team/matches/import/preview', { rows: ok.flatMap(a => actaToRows(a.data)), season })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const [table, setTable] = useState(null);
  const [file, setFile] = useState(null);
  const [map, setMap] = useState({});
  const [meta, setMeta] = useState({ competition: '', source: '' });
  const [prev, setPrev] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async f => {
    setErr(null); setPrev(null);
    try { const t = await readTable(f); setTable(t); setFile(f); setMeta(m => ({ ...m, source: f.name })); setMap(Object.fromEntries(MAP_TARGETS.map(([k, , g]) => [k, t.keys.find(x => g.includes(x)) || '']))); }
    catch (e) { setErr(e.message); }
  };
  const preview = async () => {
    setBusy(true); setErr(null);
    try {
      const rows = table.rows.map(r => Object.fromEntries(Object.entries(map).filter(([, s]) => s).map(([k, s]) => [k, r[s]])));
      setPrev(await api.post('/team/matches/import/preview', { rows, season, competition: meta.competition || null }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true); setErr(null);
    try {
      // Jugadores nuevos (no estaban en la plantilla): se crean en el primer equipo
      const cats = await api.get('/categories');
      const senior = cats.find(c => c.code === 'senior')?.id;
      const created = new Map();
      for (const m of prev.matches) for (const st of m.stats) if (st.player_id === 'new' && !st.skip) {
        if (!created.has(st.source_name)) {
          const [first, ...rest] = st.source_name.split(' ');
          const r0 = await api.post('/players', { first_name: first, last_name: rest.join(' '), category_id: senior, allowDuplicate: true });
          created.set(st.source_name, r0.id);
        }
        st.player_id = created.get(st.source_name);
      }
      const r = await api.post('/team/matches/import/commit', { matches: prev.matches, source: meta.source });
      // Adjunta cada acta PDF a su partido
      const kept = prev.matches.filter(m => !m.skip);
      let attached = 0;
      for (const [i, m] of kept.entries()) {
        const a = actas.find(x => x.data && x.data.date === m.date && x.data.opponent === m.opponent);
        if (a && r.matchIds[i]) { await api.upload(`/team/matches/${r.matchIds[i]}/files`, a.file); attached++; }
      }
      toast(`Guardado: ${r.createdMatches} partido(s) nuevo(s), ${r.statsWritten} jugadores${attached ? `, ${attached} acta(s) adjuntada(s)` : ''}`);
      onDone();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const updStat = (mi, si, k, v) => setPrev(p => ({ ...p, matches: p.matches.map((m, i) => i !== mi ? m : { ...m, stats: m.stats.map((s, j) => (j === si ? { ...s, [k]: v } : s)) }) }));
  const updMatch = (mi, k, v) => setPrev(p => ({ ...p, matches: p.matches.map((m, i) => (i === mi ? { ...m, [k]: v } : m)) }));
  const unmatched = prev?.matches.reduce((a, m) => a + (m.skip ? 0 : m.stats.filter(s => !s.player_id && !s.skip).length), 0) || 0;

  return <div className="stack" style={{ gap: 14 }}>
    {!mode && !prev && <div className="tiles">
      <button className="tile" onClick={() => setMode('pdf')}><span className="tile-t">Actas en PDF</span><span className="tile-h">Sube la «Ficha del Partido» de Futgal: se leen alineación, minutos, goles y tarjetas.</span><span className="tile-go" aria-hidden="true">›</span></button>
      <button className="tile" onClick={() => setMode('sheet')} style={{ borderTopColor: 'var(--line-strong)' }}><span className="tile-t">Hoja de cálculo</span><span className="tile-h">CSV o Excel con una fila por jugador y partido.</span><span className="tile-go" aria-hidden="true">›</span></button>
    </div>}
    {mode === 'pdf' && !prev && <div className="card stack">
      <div className="row"><button className="btn sm ghost" onClick={() => { setMode(null); setActas([]); }}>← Volver</button></div>
      <p style={{ margin: 0 }}>Selecciona una o varias actas (PDF descargado de Futgal). Antes de guardar verás lo que se ha leído de cada jugador y podrás corregirlo.</p>
      <label className="btn primary" style={{ alignSelf: 'flex-start' }}>{busy ? 'Leyendo actas…' : 'Seleccionar actas PDF'}
        <input type="file" accept="application/pdf,.pdf" multiple hidden disabled={busy} onChange={e => { const l = [...e.target.files]; e.target.value = ''; if (l.length) readPdfs(l); }} /></label>
      {actas.filter(a => a.error).map((a, i) => <div key={i} className="alert err small"><span>⚠</span><div><b>{a.file.name}</b>: {a.error}</div></div>)}
    </div>}
    {mode === 'sheet' && !prev && <div className="row"><button className="btn sm ghost" onClick={() => setMode(null)}>← Volver</button></div>}
    {mode === 'sheet' && !prev && <div className="card stack">
      <div className="row"><FileButton className="btn primary" accept=".xlsx,.csv,.txt" onFile={load}>Seleccionar archivo</FileButton>
        <button className="btn ghost" onClick={() => downloadTemplate(['Fecha', 'Rival', 'Competición', 'Jornada', 'Local/Visitante', 'Goles favor', 'Goles contra', 'Jugador', 'Titular', 'Minutos', 'Goles', 'Asistencias', 'Amarillas', 'Rojas'], 'plantilla-partidos.csv')}>Descargar plantilla</button>
        {file && <span className="small muted">{file.name} · {table.rows.length} filas</span>}</div>
      {table && <>
        <div className="inline-fields"><Field label="Competición (si no viene en el archivo)"><input type="text" value={meta.competition} onChange={e => setMeta({ ...meta, competition: e.target.value })} /></Field>
          <Field label="Procedencia de los datos"><input type="text" value={meta.source} onChange={e => setMeta({ ...meta, source: e.target.value })} placeholder="p. ej. Acta Futgal J5" /></Field>
          <Field label="Temporada"><input type="text" value={season || 'según fecha'} readOnly /></Field></div>
        <h3>Columnas</h3>
        <div className="inline-fields">{MAP_TARGETS.map(([k, l]) => <Field key={k} label={l}><select value={map[k] || ''} onChange={e => setMap({ ...map, [k]: e.target.value })}><option value="">— No disponible —</option>{table.keys.map((x, i) => <option key={x + i} value={x}>{table.headers[i]}</option>)}</select></Field>)}</div>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !map.fecha || !map.rival} onClick={preview}>Ver vista previa</button>
      </>}
    </div>}
    {prev && <>
      {prev.errors.length > 0 && <div className="alert warn"><span>⚠</span><div className="small">{prev.errors.map((e, i) => <div key={i}>{e}</div>)}</div></div>}
      {unmatched > 0 && <div className="alert warn"><span>⚠</span><div>{unmatched} jugador(es) sin asociar. Selecciona su perfil o márcalos como «Omitir». Las asociaciones que confirmes se recordarán en próximas importaciones.</div></div>}
      {actas.filter(a => a.data).map((a, i) => { const notes = a.data.players.flatMap(p => p.notes.map(n => `${p.name}: ${n}`)); return (notes.length || a.data.goalsUnmatched.length) ? <div key={i} className="alert warn small"><span>⚠</span><div><b>{a.file.name}</b>{notes.map((n, j) => <div key={j}>{n}</div>)}{a.data.goalsUnmatched.map((g, j) => <div key={'g' + j}>Gol de {g}: no figura en la alineación</div>)}</div></div> : null; })}
      {prev.matches.map((m, mi) => <div key={m.key} className="card" style={{ opacity: m.skip ? 0.5 : 1 }}>
        <div className="card-head"><div><h3 style={{ margin: 0 }}>{fmtDate(m.date)} · {m.opponent}</h3><span className="small muted">{m.competition || 'Competición pendiente'} · {m.season} {m.goals_for !== null && !Number.isNaN(m.goals_for) ? `· ${m.goals_for}–${m.goals_against}` : ''}</span></div>
          <div className="row">{m.existing_id ? <span className="tag warn">Ya existe: se completará</span> : <span className="tag">Nuevo</span>}
            {m.existing_id && <label className="check small"><input type="checkbox" checked={!!m.overwriteMatch} onChange={e => updMatch(mi, 'overwriteMatch', e.target.checked)} /> Sobrescribir datos del partido</label>}
            <label className="check small"><input type="checkbox" checked={!!m.skip} onChange={e => updMatch(mi, 'skip', e.target.checked)} /> Omitir partido</label></div></div>
        {!m.stats.length ? <p className="small muted">Sin filas de jugadores.</p> : <div className="table-wrap"><table className="t small"><thead><tr><th>Nombre en el archivo</th><th>Perfil asociado</th><th>Titular</th><th className="n">Min</th><th className="n">G</th><th className="n">A</th><th className="n">TA</th><th className="n">TR</th><th>Avisos</th><th>Omitir</th></tr></thead>
          <tbody>{m.stats.map((s, si) => <tr key={si} style={{ opacity: s.skip ? 0.5 : 1 }}><td>{s.source_name}</td>
            <td><select value={s.player_id || ''} onChange={e => updStat(mi, si, 'player_id', e.target.value === 'new' ? 'new' : e.target.value ? Number(e.target.value) : null)} style={{ borderColor: !s.player_id ? 'var(--naranja)' : undefined }}><option value="">— Sin asociar —</option><option value="new">+ Crear jugador nuevo</option>{prev.squad.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              {(!s.player_id || s.check) && <div className="muted">{s.check ? 'Comprueba que es él' : s.how}</div>}</td>
            <td>{s.started === null ? '—' : s.started ? 'Sí' : 'No'}</td><td className="n">{s.minutes ?? '—'}</td><td className="n">{s.goals}</td><td className="n">{s.assists ?? '—'}</td><td className="n">{s.yellow}</td><td className="n">{s.red}</td>
            <td>{s.duplicate && <div style={{ color: 'var(--rojo)' }}>Duplicado en el archivo</div>}
              {s.conflict && <div style={{ color: '#8a5a00' }}>Difiere del dato manual ({s.diff.join(', ')}): <label className="check"><input type="checkbox" checked={!!s.overwrite} onChange={e => updStat(mi, si, 'overwrite', e.target.checked)} /> sobrescribir</label></div>}
              {s.existing && !s.conflict && <div className="muted">Ya registrado ({s.existing.source})</div>}</td>
            <td><input type="checkbox" checked={!!s.skip} onChange={e => updStat(mi, si, 'skip', e.target.checked)} /></td></tr>)}</tbody></table></div>}
      </div>)}
      <div className="row"><button className="btn" onClick={() => setPrev(null)}>Volver</button><button className="btn primary" disabled={busy || unmatched > 0} onClick={commit}>{busy ? 'Guardando…' : 'Confirmar y guardar'}</button></div>
    </>}
    <ErrorBox error={err} />
  </div>;
}
