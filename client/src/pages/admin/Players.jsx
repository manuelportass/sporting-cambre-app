import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DEMO, api } from '../../api';
import { Avatar, Empty, ErrorBox, Field, FileButton, ListRow, Loading, Modal, MoreMenu, PageHead, Seg, useApi, useToast } from '../../components/ui';
import PlayerForm from '../../components/PlayerForm';
import { readTable, downloadTemplate, exportCSV } from '../../lib/files';
import { WEEKDAYS } from '../../lib/format';


export default function Players() {
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const list = useApi('/players' + (showInactive ? '?active=all' : ''));
  const slots = useApi('/gym/slots');
  const [form, setForm] = useState(false);
  const [imp, setImp] = useState(sp.get('cargar') ? 'season' : false);
  const slotName = id => { const s = slots.data?.find(x => x.id === id); return s ? `${WEEKDAYS[s.weekday].toLowerCase()} ${s.start_time}` : ''; };
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rows = useMemo(() => (list.data || []).filter(p => (!cat || (cat === 'none' ? !p.category_code : p.category_code === cat)) && norm(p.full_name).includes(norm(q))), [list.data, cat, q]);
  return <div>
    <PageHead title="Jugadores" sub={list.data ? `${rows.length} de ${list.data.length}` : null} actions={<>
      <MoreMenu items={[
        { label: 'Cargar listado 2026/27', onClick: () => setImp('season') },
        { label: 'Importar CSV / Excel', onClick: () => setImp('file') },
        ...(DEMO ? [] : [{ label: 'Cargar fotos del primer equipo', onClick: async () => { try { const r = await api.post('/seed/photos', {}); toast(`${r.done} fotos asignadas${r.unmatched.length ? ` · sin jugador: ${r.unmatched.join(', ')}` : ''}`); list.reload(); } catch (e) { toast(e.message, 'err'); } } }]),
        { label: 'Exportar listado (CSV)', onClick: () => exportCSV(rows, [{ key: 'first_name', label: 'Nombre' }, { key: 'last_name', label: 'Apellidos' }, { key: 'category_name', label: 'Categoría' }, { key: 'position', label: 'Posición' }], 'jugadores.csv') },
        { label: showInactive ? 'Ocultar desactivados' : 'Mostrar desactivados', onClick: () => setShowInactive(v => !v) },
      ]} />
      <button className="btn primary" onClick={() => setForm(true)}>+ Nuevo</button></>} />
    <div className="row" style={{ marginBottom: 12 }}>
      <Seg value={cat} onChange={setCat} options={[{ value: '', label: 'Todos' }, { value: 'infantil', label: 'Infantil' }, { value: 'cadete', label: 'Cadete' }, { value: 'juvenil', label: 'Juvenil' }, { value: 'senior', label: 'Primer equipo' }]} />
      <input type="search" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 220 }} />
    </div>
    <ErrorBox error={list.error} retry={list.reload} />
    {list.loading ? <Loading /> : !rows.length ? <Empty title="No hay jugadores que mostrar">Usa «⋯ → Cargar listado 2026/27» o «+ Nuevo».</Empty> :
      <div className="list">{rows.map(p => <ListRow key={p.id} onClick={() => nav('/jugadores/' + p.id)}
        left={<Avatar name={p.full_name} fileId={p.photo_file_id} />} title={p.full_name}
        sub={[p.category_name || 'Sin categoría', p.category_code !== 'senior' && p.slot_ids.length ? p.slot_ids.map(slotName).join(', ') : null].filter(Boolean).join(' · ')}
        right={<>{!p.active && <span className="tag">Desactivado</span>}{p.open_injuries > 0 && <span className="tag warn">Lesión</span>}</>} />)}</div>}
    {form && <PlayerForm onClose={() => setForm(false)} onSaved={() => list.reload()} />}
    {imp && <ImportPlayers season={imp === 'season'} onClose={() => { setImp(false); if (sp.get('cargar')) setSp({}); }} onDone={() => { list.reload(); slots.reload(); }} />}
  </div>;
}

const TARGETS = [
  { key: 'full_name', label: 'Nombre completo', guess: ['nombre_completo', 'jugador', 'nombre_y_apellidos', 'alumno'] },
  { key: 'first_name', label: 'Nombre', guess: ['nombre'] },
  { key: 'last_name', label: 'Apellidos', guess: ['apellidos', 'apellido', 'apellido_1'] },
  { key: 'category', label: 'Categoría', guess: ['categoria', 'equipo'] },
  { key: 'weekday', label: 'Día', guess: ['dia', 'dia_semana'] },
  { key: 'start_time', label: 'Hora de inicio', guess: ['hora', 'hora_inicio', 'inicio', 'franja'] },
  { key: 'schedule', label: 'Horario (día + hora en una columna)', guess: ['horario', 'turno'] },
  { key: 'joined_at', label: 'Fecha de incorporación', guess: ['fecha_incorporacion', 'alta', 'fecha_alta'] },
  { key: 'notes', label: 'Observaciones', guess: ['observaciones', 'notas'] },
];

function ImportPlayers({ onClose, onDone, season }) {
  const seed = useApi(season ? '/seed/season' : null);
  const toast = useToast();
  const cats = useApi('/categories');
  const slots = useApi('/gym/slots');
  const [file, setFile] = useState(null);
  const [table, setTable] = useState(null);
  const [map, setMap] = useState({});
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async f => {
    setErr(null); setRows(null);
    try {
      const t = await readTable(f);
      setFile(f); setTable(t);
      const m = {};
      for (const tg of TARGETS) m[tg.key] = t.keys.find(k => tg.guess.includes(k)) || '';
      if (m.full_name && m.first_name === m.full_name) m.first_name = '';
      if (m.first_name && !m.last_name && !m.full_name) { m.full_name = m.first_name; m.first_name = ''; }
      setMap(m);
    } catch (e) { setErr(e.message); }
  };
  const build = () => table.rows.map(r => {
    const o = {};
    for (const [k, src] of Object.entries(map)) if (src) o[k] = r[src];
    if (o.schedule && !o.weekday) {
      const m = String(o.schedule).match(/([a-zA-Záéíóú]+)\D*(\d{1,2}[:.h]?\d{0,2})?/);
      if (m) { o.weekday = m[1]; o.start_time = o.start_time || m[2]; }
    }
    if (typeof o.joined_at === 'number') o.joined_at = new Date(Date.UTC(1899, 11, 30) + o.joined_at * 864e5).toISOString().slice(0, 10);
    else if (o.joined_at && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(o.joined_at)) { const [d, mo, y] = o.joined_at.split('/'); o.joined_at = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; }
    delete o.schedule;
    return o;
  });
  const preview = async (preset) => {
    setBusy(true); setErr(null);
    try { const r = await api.post('/players/import/preview', { rows: preset || build() }); setRows(r.rows); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const loadSeason = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.post('/seed/season/slots'); if (r.created) toast(`${r.created} franjas horarias creadas`); slots.reload(); await preview(seed.data.players); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  const commit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/players/import/commit', { rows });
      toast(`Importación completada: ${r.created} nuevos, ${r.updated} actualizados, ${r.skipped} omitidos`);
      onDone(); onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const upd = (i, k, val) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  const errors = rows?.filter(r => !r.skip && r.issues.some(i => i.level === 'error')).length || 0;

  return <Modal title="Importar jugadores" onClose={onClose} wide footer={<>
    <button className="btn" onClick={onClose}>Cancelar</button>
    {table && !rows && <button className="btn primary" disabled={busy || (!map.full_name && !map.first_name)} onClick={() => preview()}>Ver vista previa</button>}
    {season && !rows && <button className="btn primary" disabled={busy || !seed.data} onClick={loadSeason}>Crear franjas y ver vista previa</button>}
    {rows && <><button className="btn" onClick={() => setRows(null)}>Volver</button><button className="btn primary" disabled={busy || errors > 0} onClick={commit}>Guardar {rows.filter(r => !r.skip).length} jugadores</button></>}
  </>}>
    <div className="stack" style={{ gap: 14 }}>
      {season && !rows && (!seed.data ? <Loading /> : <>
        <p style={{ margin: 0 }}>Listado de la temporada <b>{seed.data.season}</b> extraído de los documentos que facilitaste. Antes de guardar podrás revisar y corregir cada jugador; los que ya existan se actualizan en lugar de duplicarse.</p>
        <div className="grid g2">
          <div className="card"><h3>Franjas del gimnasio</h3>{seed.data.slots.map((s, i) => <div key={i} className="row small" style={{ padding: '3px 0' }}><b style={{ minWidth: 150 }}>{WEEKDAYS[s.weekday]} {s.start_time}–{s.end_time}</b><span style={{ textTransform: 'capitalize' }}>{s.category}{s.label ? ` · ${s.label}` : ''}</span><span className="spacer" />{s.exists ? <span className="tag">Ya existe</span> : <span className="tag warn">Se creará</span>}</div>)}</div>
          <div className="card"><h3>Jugadores</h3>{['infantil', 'cadete', 'juvenil', 'senior'].map(c => <div key={c} className="row between small" style={{ padding: '3px 0' }}><span>{{ infantil: 'Infantil', cadete: 'Cadete', juvenil: 'Juvenil', senior: 'Primer equipo (modestos)' }[c]}</span><b>{seed.data.players.filter(p => p.category === c).length}</b></div>)}</div>
        </div>
        {seed.data.pending.map((t, i) => <div key={i} className="alert warn small"><span>⚠</span><div>{t} Quedan como pendientes de introducir.</div></div>)}
      </>)}
      {!season && !table && <>
        <p style={{ margin: 0 }}>Sube un archivo <b>.xlsx</b> o <b>.csv</b> con una fila de cabecera. Se detectarán las columnas automáticamente y podrás revisar cada fila antes de guardar. No se inventa ningún dato: lo que falte quedará como pendiente.</p>
        <div className="row"><FileButton className="btn primary" accept=".xlsx,.csv,.txt" onFile={load}>Seleccionar archivo</FileButton>
          <button className="btn ghost" onClick={() => downloadTemplate(['Nombre', 'Apellidos', 'Categoría', 'Día', 'Hora', 'Fecha incorporación', 'Observaciones'], 'plantilla-jugadores.csv')}>Descargar plantilla</button></div>
      </>}
      {table && !rows && <>
        <div className="alert info"><span>📄</span><div><b>{file.name}</b> · {table.rows.length} filas. Indica qué columna corresponde a cada dato.</div></div>
        <div className="inline-fields">{TARGETS.map(tg => <Field key={tg.key} label={tg.label}>
          <select value={map[tg.key] || ''} onChange={e => setMap({ ...map, [tg.key]: e.target.value })}><option value="">— No disponible —</option>{table.keys.map((k, i) => <option key={k + i} value={k}>{table.headers[i]}</option>)}</select></Field>)}</div>
        <p className="muted small" style={{ margin: 0 }}>Usa «Nombre completo» si nombre y apellidos están en la misma columna, o «Nombre» + «Apellidos» si están separados.</p>
      </>}
      {rows && <>
        {errors > 0 && <div className="alert err"><span>⚠</span><div>{errors} fila(s) con errores. Corrígelas o márcalas como «Omitir».</div></div>}
        <div className="table-wrap" style={{ maxHeight: 460 }}><table className="t">
          <thead><tr><th>#</th><th>Omitir</th><th>Nombre</th><th>Apellidos</th><th>Categoría</th><th>Franja</th><th>Avisos</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} style={{ opacity: r.skip ? 0.45 : 1 }}>
            <td className="muted">{r.row}</td>
            <td><input type="checkbox" checked={!!r.skip} onChange={e => upd(i, 'skip', e.target.checked)} /></td>
            <td><input type="text" value={r.first_name} onChange={e => upd(i, 'first_name', e.target.value)} /></td>
            <td><input type="text" value={r.last_name} onChange={e => upd(i, 'last_name', e.target.value)} /></td>
            <td><select value={r.category_id || ''} onChange={e => upd(i, 'category_id', e.target.value ? Number(e.target.value) : null)}><option value="">Pendiente</option>{cats.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
            <td><select value={r.slot_id || ''} onChange={e => upd(i, 'slot_id', e.target.value ? Number(e.target.value) : null)}><option value="">Sin asignar</option>{slots.data?.map(s => <option key={s.id} value={s.id}>{WEEKDAYS[s.weekday].slice(0, 3)} {s.start_time}</option>)}</select></td>
            <td className="small">{r.existing_id && <span className="tag">Existente</span>} {r.issues.map((x, j) => <div key={j} style={{ color: x.level === 'error' ? 'var(--rojo)' : x.level === 'warn' ? '#8a5a00' : 'var(--ink-3)' }}>{x.msg}</div>)}</td>
          </tr>)}</tbody></table></div>
      </>}
      <ErrorBox error={err} />
    </div>
  </Modal>;
}
