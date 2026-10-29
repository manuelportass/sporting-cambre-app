import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api } from '../../api';
import { Confirm, Empty, ErrorBox, Field, Loading, Modal, PageHead, Tabs, useApi, useToast } from '../../components/ui';
import { MultiLine } from '../../components/charts';
import { exportCSV, exportXLSX } from '../../lib/files';
import { fmtDate, fmtNum, todayISO } from '../../lib/format';

export default function Tests() {
  const types = useApi('/team/test-types');
  const [typeId, setTypeId] = useState(null);
  const [tab, setTab] = useState('registrar');
  useEffect(() => { if (types.data?.length && !types.data.find(t => t.id === typeId)) setTypeId(types.data[0].id); }, [types.data, typeId]);
  const type = types.data?.find(t => t.id === typeId);
  return <div>
    <PageHead back="/primer-equipo" title="Tests físicos" actions={types.data && tab !== 'configurar' && <select value={typeId || ''} onChange={e => setTypeId(Number(e.target.value))} aria-label="Test" style={{ width: 'auto' }}>{types.data.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'registrar', label: 'Registrar' }, { key: 'historial', label: 'Historial' }, { key: 'comparar', label: 'Evolución' }, { key: 'configurar', label: 'Configurar' }]} />
    {types.loading ? <Loading /> : <>
      {tab === 'registrar' && type && <Register type={type} />}
      {tab === 'historial' && type && <History type={type} />}
      {tab === 'comparar' && type && <Compare type={type} />}
      {tab === 'configurar' && <Configure types={types.data} reload={types.reload} />}
    </>}
  </div>;
}

function Register({ type }) {
  const toast = useToast();
  const players = useApi('/players?category=senior');
  const [meta, setMeta] = useState({ date: todayISO(), device: '', protocol: type.protocol || '', conditions: '' });
  const [vals, setVals] = useState({});
  const [err, setErr] = useState(null);
  useEffect(() => { setVals({}); setMeta(m => ({ ...m, protocol: type.protocol || '' })); }, [type.id, type.protocol]);
  const save = async () => {
    const items = Object.entries(vals).filter(([, v]) => type.fields.some(f => v[f.key] !== '' && v[f.key] !== undefined))
      .map(([pid, v]) => ({ test_type_id: type.id, player_id: Number(pid), ...meta, notes: v.__notes || null,
        values: Object.fromEntries(type.fields.map(f => [f.key, v[f.key] === '' || v[f.key] === undefined ? null : v[f.key]])) }));
    if (!items.length) return setErr('Introduce al menos un resultado.');
    try { await api.post('/team/tests', { items }); toast(`${items.length} resultado(s) guardado(s)`); setVals({}); setErr(null); }
    catch (e) { setErr(e.message); }
  };
  return <div className="stack">
    <div className="card"><div className="row"><Field label="Fecha" required><input type="date" value={meta.date} onChange={e => setMeta({ ...meta, date: e.target.value })} /></Field></div>
      <details style={{ marginTop: 10 }}><summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Dispositivo, condiciones y protocolo</summary><div className="inline-fields" style={{ marginTop: 10 }}>
      <Field label="Dispositivo / método"><input type="text" value={meta.device} onChange={e => setMeta({ ...meta, device: e.target.value })} placeholder="p. ej. plataforma de contacto, fotocélulas" /></Field>
      <Field label="Condiciones de evaluación"><input type="text" value={meta.conditions} onChange={e => setMeta({ ...meta, conditions: e.target.value })} placeholder="superficie, hora, clima, calentamiento…" /></Field>
    </div><Field label="Protocolo" style={{ marginTop: 12 }}><textarea value={meta.protocol} onChange={e => setMeta({ ...meta, protocol: e.target.value })} /></Field></details></div>
    {players.loading ? <Loading /> : !players.data?.length ? <Empty title="No hay jugadores en el primer equipo" /> :
      <div className="table-wrap"><table className="t"><thead><tr><th>Jugador</th>{type.fields.map(f => <th key={f.key}>{f.label}{f.unit ? ` (${f.unit})` : ''}</th>)}<th>Observaciones</th></tr></thead>
        <tbody>{players.data.map(p => <tr key={p.id}><td><b>{p.full_name}</b></td>{type.fields.map(f => <td key={f.key}><input type="number" step={Math.pow(10, -f.decimals)} value={vals[p.id]?.[f.key] ?? ''} onChange={e => setVals(o => ({ ...o, [p.id]: { ...o[p.id], [f.key]: e.target.value } }))} style={{ maxWidth: 120 }} /></td>)}
          <td><input type="text" value={vals[p.id]?.__notes ?? ''} onChange={e => setVals(o => ({ ...o, [p.id]: { ...o[p.id], __notes: e.target.value } }))} /></td></tr>)}</tbody></table></div>}
    <ErrorBox error={err} />
    <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={save}>Guardar resultados</button>
  </div>;
}

function History({ type }) {
  const toast = useToast();
  const l = useApi('/team/tests?type_id=' + type.id);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const cols = [{ key: 'date', label: 'Fecha' }, { key: 'player_name', label: 'Jugador' }, ...type.fields.map(f => ({ key: f.key, label: `${f.label}${f.unit ? ' (' + f.unit + ')' : ''}`, align: 'right' })), { key: 'device', label: 'Dispositivo' }, { key: 'protocol', label: 'Protocolo' }, { key: 'conditions', label: 'Condiciones' }, { key: 'notes', label: 'Observaciones' }];
  const rows = (l.data || []).map(r => ({ ...r, ...r.values }));
  return <div className="stack">
    <div className="row"><span className="spacer" /><button className="btn" onClick={() => exportCSV(rows, cols, `tests-${type.name}.csv`)}>CSV</button><button className="btn" onClick={() => exportXLSX([{ name: type.name.slice(0, 30), columns: cols, rows }], `tests-${type.name}.xlsx`)}>Excel</button></div>
    {l.loading ? <Loading /> : !rows.length ? <Empty title="Sin resultados registrados para este test" /> :
      <div className="table-wrap"><table className="t"><thead><tr>{cols.map(c => <th key={c.key} className={c.align ? 'n' : ''}>{c.label}</th>)}<th /></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><td>{fmtDate(r.date)}</td><td><b>{r.player_name}</b></td>{type.fields.map(f => <td key={f.key} className="n">{fmtNum(r[f.key], f.decimals)}</td>)}
          <td className="small">{r.device || '—'}</td><td className="small" style={{ maxWidth: 200 }}>{r.protocol || '—'}</td><td className="small">{r.conditions || '—'}</td><td className="small">{r.notes || ''}</td>
          <td><div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}><button className="btn sm ghost" onClick={() => setEdit(r)}>Editar</button><button className="btn sm ghost" onClick={() => setDel(r)}>×</button></div></td></tr>)}</tbody></table></div>}
    {edit && <EditResult r={edit} type={type} onClose={() => setEdit(null)} onSaved={() => { l.reload(); toast('Resultado actualizado'); }} />}
    {del && <Confirm title="Eliminar resultado" danger confirmText="Eliminar" message={`¿Eliminar el resultado de ${del.player_name} del ${fmtDate(del.date)}?`} onConfirm={async () => { await api.del('/team/tests/' + del.id); l.reload(); }} onClose={() => setDel(null)} />}
  </div>;
}
function EditResult({ r, type, onClose, onSaved }) {
  const [v, setV] = useState({ date: r.date, device: r.device || '', protocol: r.protocol || '', conditions: r.conditions || '', notes: r.notes || '', values: { ...r.values } });
  const [err, setErr] = useState(null);
  return <Modal title={`Editar · ${r.player_name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { await api.put('/team/tests/' + r.id, { ...v, player_id: r.player_id }); onSaved(); onClose(); } catch (e) { setErr(e.message); }
  }}>Guardar</button></>}>
    <div className="inline-fields"><Field label="Fecha"><input type="date" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></Field>
      {type.fields.map(f => <Field key={f.key} label={`${f.label} ${f.unit ? '(' + f.unit + ')' : ''}`}><input type="number" value={v.values[f.key] ?? ''} onChange={e => setV({ ...v, values: { ...v.values, [f.key]: e.target.value } })} /></Field>)}
      <Field label="Dispositivo"><input type="text" value={v.device} onChange={e => setV({ ...v, device: e.target.value })} /></Field>
      <Field label="Condiciones"><input type="text" value={v.conditions} onChange={e => setV({ ...v, conditions: e.target.value })} /></Field></div>
    <Field label="Protocolo" style={{ marginTop: 12 }}><textarea value={v.protocol} onChange={e => setV({ ...v, protocol: e.target.value })} /></Field>
    <Field label="Observaciones"><textarea value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></Field>
    <ErrorBox error={err} />
  </Modal>;
}

function Compare({ type }) {
  const l = useApi('/team/tests?type_id=' + type.id);
  const [field, setField] = useState(type.fields[0].key);
  const [player, setPlayer] = useState('');
  const [proto, setProto] = useState('');
  useEffect(() => setField(type.fields[0].key), [type.id, type.fields]);
  const f = type.fields.find(x => x.key === field) || type.fields[0];
  const data = l.data || [];
  const protocols = [...new Set(data.map(r => (r.protocol || '').trim()).filter(Boolean))];
  const playersL = [...new Map(data.map(r => [r.player_id, r.player_name])).entries()];
  const latest = useMemo(() => {
    const m = new Map();
    for (const r of data) if ((!proto || (r.protocol || '').trim() === proto) && r.values[f.key] !== null && !m.has(r.player_id)) m.set(r.player_id, { name: r.player_name, value: r.values[f.key], date: r.date, device: r.device });
    return [...m.values()].sort((a, b) => (f.better === 'lower' ? a.value - b.value : b.value - a.value));
  }, [data, proto, f]);
  const evo = data.filter(r => String(r.player_id) === player).reverse().map(r => ({ date: r.date, v: r.values[f.key] }));
  const devices = new Set(latest.map(x => x.device || '—'));
  if (l.loading) return <Loading />;
  if (!data.length) return <Empty title="Sin resultados para comparar" />;
  return <div className="stack" style={{ gap: 14 }}>
    <div className="row"><Field label="Variable"><select value={field} onChange={e => setField(e.target.value)}>{type.fields.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
      <Field label="Protocolo (para comparar entre jugadores)"><select value={proto} onChange={e => setProto(e.target.value)}><option value="">Todos</option>{protocols.map(p => <option key={p} value={p}>{p.slice(0, 60)}</option>)}</select></Field></div>
    <div className="grid g2">
      <div className="card"><h3>Último resultado por jugador · {f.label} ({f.unit})</h3>
        {(protocols.length > 1 && !proto) || devices.size > 1 ? <div className="alert warn small" style={{ marginBottom: 8 }}><span>⚠</span><div>Hay mediciones con distintos protocolos o dispositivos. Compara entre jugadores solo cuando el protocolo sea comparable (filtra arriba).</div></div> : null}
        <ResponsiveContainer width="100%" height={Math.max(180, latest.length * 26 + 30)}><BarChart data={latest} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
          <CartesianGrid stroke="#ecede8" horizontal={false} /><XAxis type="number" stroke="#9a9b95" fontSize={11} tickLine={false} /><YAxis type="category" dataKey="name" width={130} stroke="#9a9b95" fontSize={11} tickLine={false} />
          <Tooltip formatter={v => [fmtNum(v, f.decimals) + ' ' + f.unit, f.label]} labelFormatter={(n, p) => `${n} · ${p?.[0] ? fmtDate(p[0].payload.date) : ''}`} />
          <Bar isAnimationActive={false} dataKey="value" fill="#2a78d6" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fontSize: 11, formatter: v => fmtNum(v, f.decimals) }} /></BarChart></ResponsiveContainer>
        <p className="small muted" style={{ margin: 0 }}>Ordenado {f.better === 'lower' ? 'de menor a mayor (menor es mejor)' : f.better === 'higher' ? 'de mayor a menor' : 'por valor'}. Sin clasificaciones ni valores de referencia.</p></div>
      <div className="card"><h3>Evolución individual</h3>
        <Field label="Jugador"><select value={player} onChange={e => setPlayer(e.target.value)}><option value="">Selecciona…</option>{playersL.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></Field>
        {player && (evo.length >= 2 ? <MultiLine data={evo} lines={[{ key: 'v', label: `${f.label} (${f.unit})` }]} decimals={f.decimals} /> : <p className="muted small">Se necesitan al menos dos mediciones.</p>)}
        {player && <table className="t small"><tbody>{evo.slice().reverse().map((r, i, a) => <tr key={i}><td>{fmtDate(r.date)}</td><td className="n"><b>{fmtNum(r.v, f.decimals)} {f.unit}</b></td><td className="n muted">{a[i + 1] && r.v !== null && a[i + 1].v !== null ? `${r.v - a[i + 1].v > 0 ? '+' : ''}${fmtNum(r.v - a[i + 1].v, f.decimals)}` : ''}</td></tr>)}</tbody></table>}
      </div>
    </div>
  </div>;
}

function Configure({ types, reload }) {
  const [edit, setEdit] = useState(null);
  return <div className="stack">
    <div className="row"><p className="muted small" style={{ margin: 0 }}>Añade nuevas pruebas o edita los campos y unidades sin cambiar la estructura de la app.</p><span className="spacer" /><button className="btn primary" onClick={() => setEdit({ name: '', family: 'otro', protocol: '', fields: [{ key: 'valor', label: 'Resultado', unit: '', decimals: 2, better: null }] })}>+ Nuevo test</button></div>
    <div className="grid g3">{types.map(t => <div key={t.id} className="card"><div className="row between"><h3 style={{ margin: 0 }}>{t.name}</h3><button className="btn sm" onClick={() => setEdit(t)}>Editar</button></div>
      <div className="small muted">{t.family}</div><ul className="small" style={{ paddingLeft: 18 }}>{t.fields.map(f => <li key={f.key}>{f.label} {f.unit && `(${f.unit})`} · {f.decimals} decimales{f.better ? ` · ${f.better === 'higher' ? 'mayor es mejor' : 'menor es mejor'}` : ''}</li>)}</ul></div>)}</div>
    {edit && <TypeForm t={edit} onClose={() => setEdit(null)} onSaved={reload} />}
  </div>;
}
function TypeForm({ t, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState(JSON.parse(JSON.stringify(t)));
  const [err, setErr] = useState(null);
  const [del, setDel] = useState(false);
  const setF = (i, k, val) => setV(o => ({ ...o, fields: o.fields.map((f, j) => (j === i ? { ...f, [k]: val } : f)) }));
  return <Modal wide title={t.id ? 'Editar test' : 'Nuevo test'} onClose={onClose} footer={<>
    {t.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setDel(true)}>Archivar test</button>}
    <button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
      try { if (t.id) await api.put('/team/test-types/' + t.id, v); else await api.post('/team/test-types', v); toast('Test guardado'); onSaved(); onClose(); } catch (e) { setErr(e.message); }
    }}>Guardar</button></>}>
    <div className="inline-fields"><Field label="Nombre" required><input type="text" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Familia"><select value={v.family} onChange={e => setV({ ...v, family: e.target.value })}>{['resistencia', 'salto', 'sprint', 'fuerza', 'movilidad', 'antropometria', 'otro'].map(x => <option key={x}>{x}</option>)}</select></Field></div>
    <Field label="Protocolo por defecto" style={{ marginTop: 12 }}><textarea value={v.protocol || ''} onChange={e => setV({ ...v, protocol: e.target.value })} /></Field>
    <h3 style={{ margin: '14px 0 8px' }}>Campos</h3>
    <div className="table-wrap"><table className="t"><thead><tr><th>Clave</th><th>Nombre</th><th>Unidad</th><th>Decimales</th><th>Interpretación</th><th /></tr></thead>
      <tbody>{v.fields.map((f, i) => <tr key={i}><td><input type="text" value={f.key} onChange={e => setF(i, 'key', e.target.value)} disabled={!!t.id && t.fields.some(x => x.key === f.key) && i < t.fields.length} /></td>
        <td><input type="text" value={f.label} onChange={e => setF(i, 'label', e.target.value)} /></td><td><input type="text" value={f.unit} onChange={e => setF(i, 'unit', e.target.value)} style={{ width: 80 }} /></td>
        <td><input type="number" min="0" max="4" value={f.decimals} onChange={e => setF(i, 'decimals', e.target.value)} style={{ width: 70 }} /></td>
        <td><select value={f.better || ''} onChange={e => setF(i, 'better', e.target.value || null)}><option value="">Neutra</option><option value="higher">Mayor es mejor</option><option value="lower">Menor es mejor</option></select></td>
        <td><button className="btn sm ghost" onClick={() => setV(o => ({ ...o, fields: o.fields.filter((_, j) => j !== i) }))}>×</button></td></tr>)}</tbody></table></div>
    <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setV(o => ({ ...o, fields: [...o.fields, { key: 'campo' + (o.fields.length + 1), label: '', unit: '', decimals: 2, better: null }] }))}>+ Campo</button>
    <p className="small muted">La clave identifica el campo en el historial: no la cambies si ya hay resultados guardados.</p>
    <ErrorBox error={err} />
    {del && <Confirm title="Archivar test" confirmText="Archivar" message="El test dejará de aparecer para nuevos registros. Los resultados históricos se conservan." onConfirm={async () => { await api.del('/team/test-types/' + t.id); onSaved(); onClose(); }} onClose={() => setDel(false)} />}
  </Modal>;
}
