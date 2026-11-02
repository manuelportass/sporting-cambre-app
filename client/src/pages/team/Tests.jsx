import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api } from '../../api';
import { Confirm, Empty, ErrorBox, Field, Loading, Modal, PageHead, Tabs, useApi, useToast } from '../../components/ui';
import { MultiLine } from '../../components/charts';
import { exportCSV, exportXLSX } from '../../lib/files';
import { fmtDate, fmtNum, todayISO } from '../../lib/format';
import JumpLab from '../../components/JumpLab';
import SquatLab, { LV_TEST, RM_TEST } from '../../components/SquatLab';
import { VO2_NOTE, isIFT, mergeVO2, vo2Detail, withVO2 } from '../../lib/vo2';

export default function Tests() {
  const types = useApi('/team/test-types');
  const [typeId, setTypeId] = useState(null);
  const [tab, setTab] = useState('registrar');
  useEffect(() => { if (types.data?.length && !types.data.find(t => t.id === typeId)) setTypeId((types.data.find(isIFT) || types.data[0]).id); }, [types.data, typeId]);
  const type = types.data?.find(t => t.id === typeId);
  return <div>
    <PageHead back="/primer-equipo" title="Tests físicos" actions={types.data && tab !== 'configurar' && <select value={typeId || ''} onChange={e => setTypeId(Number(e.target.value))} aria-label="Test" style={{ width: 'auto' }}>{types.data.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'registrar', label: 'Registrar' }, { key: 'historial', label: 'Historial' }, { key: 'comparar', label: 'Evolución' }, { key: 'configurar', label: 'Configurar' }]} />
    {types.loading ? <Loading /> : <>
      {tab === 'registrar' && type && <Register type={type} types={types.data} />}
      {tab === 'historial' && type && <History type={type} />}
      {tab === 'comparar' && type && <Compare type={type} />}
      {tab === 'configurar' && <Configure types={types.data} reload={types.reload} />}
    </>}
  </div>;
}

function Register({ type, types }) {
  const [jl, setJl] = useState(false);
  const [sq, setSq] = useState(false);
  const isSquat = type.name === RM_TEST || type.name === LV_TEST;
  const inFields = type.name === RM_TEST ? type.fields.filter(f => f.key !== 'rm') : type.name === 'Perímetros' ? type.fields.filter(f => f.key !== 'icc') : type.fields;
  const toast = useToast();
  const players = useApi('/players?category=senior');
  const [meta, setMeta] = useState({ date: todayISO(), device: '', protocol: type.protocol || '', conditions: '' });
  const [vals, setVals] = useState({});
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(null); // VO₂máx estimado de lo recién guardado (30-15 IFT)
  useEffect(() => { setVals({}); setSaved(null); setMeta(m => ({ ...m, protocol: type.protocol || '' })); }, [type.id, type.protocol]);
  const save = async () => {
    const items = Object.entries(vals).filter(([, v]) => type.fields.some(f => v[f.key] !== '' && v[f.key] !== undefined))
      .map(([pid, v]) => ({ test_type_id: type.id, player_id: Number(pid), ...meta, notes: v.__notes || null,
        values: Object.fromEntries(type.fields.map(f => [f.key, v[f.key] === '' || v[f.key] === undefined ? null : v[f.key]])) }));
    if (!items.length) return setErr('Introduce al menos un resultado.');
    try {
      const r = await api.post('/team/tests', { items }); toast(`${items.length} resultado(s) guardado(s)`); setVals({}); setErr(null);
      if (isIFT(type)) { const all = await api.get(`/team/tests?type_id=${type.id}&from=${meta.date}&to=${meta.date}`); setSaved(all.filter(x => r.ids.includes(x.id))); }
    }
    catch (e) { setErr(e.message); }
  };
  return <div className="stack">
    {type.family === 'salto' && <div className="card jl-cta"><span className="jl-ico">🎥</span><div style={{ flex: 1 }}><b>Medir con vídeo</b><div className="small muted">Graba o adjunta 3 saltos por jugador: la altura se calcula sola por el tiempo de vuelo y se guardan el salto más alto y la media.</div></div>
      <button className="btn primary" onClick={() => setJl(true)}>Test con vídeo</button></div>}
    {jl && <JumpLab types={types} initialTypeId={type.id} onClose={() => setJl(false)} />}
    {isSquat && <div className="card jl-cta"><span className="jl-ico">🏋️</span><div style={{ flex: 1 }}><b>Sentadilla: 1RM y velocidad con vídeo</b><div className="small muted">Registra el 1RM estimado (Brzycki) y graba la sentadilla al 20, 40, 60 y 80 % del 1RM: se mide la velocidad de la barra y se dibuja la curva carga–velocidad.</div></div>
      <button className="btn primary" onClick={() => setSq(true)}>Abrir</button></div>}
    {sq && <SquatLab types={types} onClose={() => setSq(false)} />}
    {type.name === 'Perímetros' && <div className="alert info small"><span>ⓘ</span><div>El índice cintura-cadera se calcula solo al guardar (cintura / cadera). Puedes dejar en blanco los perímetros que no midas.</div></div>}
    {type.name === RM_TEST && <div className="alert info small"><span>ⓘ</span><div>El 1RM estimado se calcula solo al guardar: 1RM = peso / (1,0278 − 0,0278 × repeticiones) (Brzycki, 1993). Entre 1 y 10 repeticiones.</div></div>}
    <div className="card"><div className="row"><Field label="Fecha" required><input type="date" value={meta.date} onChange={e => setMeta({ ...meta, date: e.target.value })} /></Field></div>
      <details style={{ marginTop: 10 }}><summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Dispositivo, condiciones y protocolo</summary><div className="inline-fields" style={{ marginTop: 10 }}>
      <Field label="Dispositivo / método"><input type="text" value={meta.device} onChange={e => setMeta({ ...meta, device: e.target.value })} placeholder="p. ej. plataforma de contacto, fotocélulas" /></Field>
      <Field label="Condiciones de evaluación"><input type="text" value={meta.conditions} onChange={e => setMeta({ ...meta, conditions: e.target.value })} placeholder="superficie, hora, clima, calentamiento…" /></Field>
    </div><Field label="Protocolo" style={{ marginTop: 12 }}><textarea value={meta.protocol} onChange={e => setMeta({ ...meta, protocol: e.target.value })} /></Field></details></div>
    {players.loading ? <Loading /> : !players.data?.length ? <Empty title="No hay jugadores en el primer equipo" /> :
      <div className="table-wrap"><table className="t"><thead><tr><th>Jugador</th>{inFields.map(f => <th key={f.key}>{f.label}{f.unit ? ` (${f.unit})` : ''}</th>)}<th>Observaciones</th></tr></thead>
        <tbody>{players.data.map(p => <tr key={p.id}><td><b>{p.full_name}</b></td>{inFields.map(f => <td key={f.key}><input type="number" step={Math.pow(10, -f.decimals)} value={vals[p.id]?.[f.key] ?? ''} onChange={e => setVals(o => ({ ...o, [p.id]: { ...o[p.id], [f.key]: e.target.value } }))} style={{ maxWidth: 120 }} /></td>)}
          <td><input type="text" value={vals[p.id]?.__notes ?? ''} onChange={e => setVals(o => ({ ...o, [p.id]: { ...o[p.id], __notes: e.target.value } }))} /></td></tr>)}</tbody></table></div>}
    {isIFT(type) && <div className="alert info small"><span>ⓘ</span><div>Al guardar, la app calcula automáticamente el <b>VO₂máx estimado</b> de cada jugador. {VO2_NOTE} El peso usado es el registro de «Peso corporal» más cercano a la fecha del test.</div></div>}
    <ErrorBox error={err} />
    <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={save}>Guardar resultados</button>
    {saved?.length > 0 && <VO2Saved rows={saved} onClose={() => setSaved(null)} />}
  </div>;
}

function VO2Saved({ rows, onClose }) {
  return <div className="card vo2-card"><div className="row between"><h3 style={{ margin: 0 }}>VO₂máx estimado · {fmtDate(rows[0].date)}</h3><button className="btn sm ghost" onClick={onClose}>Cerrar</button></div>
    <table className="t small"><thead><tr><th>Jugador</th><th className="n">VIFT (km/h)</th><th className="n">VO₂máx estimado (ml/kg/min)</th><th>Datos usados</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td><b>{r.player_name}</b></td><td className="n">{fmtNum(r.values.vift, 1)}</td>
        <td className="n">{r.vo2?.value != null ? <b>{fmtNum(r.vo2.value, 1)}</b> : <span className="muted">—</span>}</td>
        <td className={r.vo2?.value == null ? 'small warn-t' : 'small muted'}>{vo2Detail(r.vo2)}{r.vo2?.value == null && ' · complétalo en la ficha del jugador y se calculará solo'}</td></tr>)}</tbody></table>
    <p className="small muted" style={{ margin: 0 }}>{VO2_NOTE}</p></div>;
}

function History({ type: baseType }) {
  const type = withVO2(baseType);
  const toast = useToast();
  const l = useApi('/team/tests?type_id=' + type.id);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const cols = [{ key: 'date', label: 'Fecha' }, { key: 'player_name', label: 'Jugador' }, ...type.fields.map(f => ({ key: f.key, label: `${f.label}${f.unit ? ' (' + f.unit + ')' : ''}`, align: 'right' })), { key: 'device', label: 'Dispositivo' }, { key: 'protocol', label: 'Protocolo' }, { key: 'conditions', label: 'Condiciones' }, { key: 'notes', label: 'Observaciones' }];
  const rows = (l.data || []).map(mergeVO2).map(r => ({ ...r, ...r.values, vo2info: r.vo2 }));
  return <div className="stack">
    {isIFT(type) && <p className="small muted" style={{ margin: 0 }}>{VO2_NOTE}</p>}
    <div className="row"><span className="spacer" /><button className="btn" onClick={() => exportCSV(rows, cols, `tests-${type.name}.csv`)}>CSV</button><button className="btn" onClick={() => exportXLSX([{ name: type.name.slice(0, 30), columns: cols, rows }], `tests-${type.name}.xlsx`)}>Excel</button></div>
    {l.loading ? <Loading /> : !rows.length ? <Empty title="Sin resultados registrados para este test" /> :
      <div className="table-wrap"><table className="t"><thead><tr>{cols.map(c => <th key={c.key} className={c.align ? 'n' : ''}>{c.label}</th>)}<th /></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><td>{fmtDate(r.date)}</td><td><b>{r.player_name}</b></td>{type.fields.map(f => <td key={f.key} className="n" title={f.virtual ? vo2Detail(r.vo2info) : undefined}>{f.virtual && r[f.key] == null ? <span className="muted" title={vo2Detail(r.vo2info)}>falta dato</span> : fmtNum(r[f.key], f.decimals)}</td>)}
          <td className="small">{r.device || '—'}</td><td className="small" style={{ maxWidth: 200 }}>{r.protocol || '—'}</td><td className="small">{r.conditions || '—'}</td><td className="small">{r.notes || ''}</td>
          <td><div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}><button className="btn sm ghost" onClick={() => setEdit(r)}>Editar</button><button className="btn sm ghost" onClick={() => setDel(r)}>×</button></div></td></tr>)}</tbody></table></div>}
    {edit && <EditResult r={edit} type={baseType} onClose={() => setEdit(null)} onSaved={() => { l.reload(); toast('Resultado actualizado'); }} />}
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

function Compare({ type: baseType }) {
  const type = withVO2(baseType);
  const l = useApi('/team/tests?type_id=' + type.id);
  const [field, setField] = useState(type.fields[0].key);
  const [player, setPlayer] = useState('');
  const [proto, setProto] = useState('');
  useEffect(() => setField(isIFT(baseType) ? 'vo2' : baseType.fields[0].key), [baseType.id]); // eslint-disable-line
  const f = type.fields.find(x => x.key === field) || type.fields[0];
  const data = useMemo(() => (l.data || []).map(mergeVO2), [l.data]);
  const protocols = [...new Set(data.map(r => (r.protocol || '').trim()).filter(Boolean))];
  const playersL = [...new Map(data.map(r => [r.player_id, r.player_name])).entries()];
  const latest = useMemo(() => {
    const m = new Map();
    for (const r of data) if ((!proto || (r.protocol || '').trim() === proto) && r.values[f.key] != null && !m.has(r.player_id)) m.set(r.player_id, { name: r.player_name, value: r.values[f.key], date: r.date, device: r.device });
    return [...m.values()].sort((a, b) => (f.better === 'lower' ? a.value - b.value : b.value - a.value));
  }, [data, proto, f]);
  const evo = data.filter(r => String(r.player_id) === player && r.values[f.key] != null).reverse().map(r => ({ date: r.date, v: r.values[f.key] }));
  const devices = new Set(latest.map(x => x.device || '—'));
  if (l.loading) return <Loading />;
  if (!data.length) return <Empty title="Sin resultados para comparar" />;
  return <div className="stack" style={{ gap: 14 }}>
    {f.virtual && <div className="alert info small"><span>ⓘ</span><div>{VO2_NOTE}</div></div>}
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
