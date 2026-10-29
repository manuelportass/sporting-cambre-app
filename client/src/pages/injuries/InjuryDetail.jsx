import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { ColorBadge, Confirm, Empty, ErrorBox, Field, FileButton, ListRow, Loading, Modal, MoreMenu, PageHead, Pending, Tabs, show, useApi, useToast } from '../../components/ui';
import { MultiLine } from '../../components/charts';
import { saveBlob } from '../../lib/files';
import { INJ_COLOR, INJ_STATUS, fmtDate, fmtDateTime, todayISO } from '../../lib/format';

export default function InjuryDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const r = useApi('/injuries/' + id);
  const phases = useApi('/injuries/phases');
  const settings = useApi('/settings');
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('resumen');
  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const i = r.data, p = i.player;
  const pain = settings.data?.painScale || { min: 0, max: 10, label: 'EVA 0–10' };
  const curIdx = phases.data?.findIndex(f => f.id === i.phase_id) ?? -1;
  const painData = [...i.pain].reverse().map(e => ({ date: e.date, pain: e.eva }));
  const lastPain = i.pain[0];
  const uploadDoc = async f => { try { await api.upload(`/injuries/${id}/files`, f); toast('Documento adjuntado'); r.reload(); } catch (e) { toast(e.message, 'err'); } };
  const lesion = [['Fecha', fmtDate(i.injury_date)], ['Zona', i.zone], ['Lateralidad', i.laterality], ['Tipo', i.injury_type], ['Mecanismo', i.mechanism],
    ['Próxima revisión', i.next_review && fmtDate(i.next_review) + (i.review_overdue ? ' (vencida)' : '')], ['Vuelta al entrenamiento', i.return_training_date && fmtDate(i.return_training_date)], ['Vuelta a la competición', i.return_match_date && fmtDate(i.return_match_date)]];
  const textos = [['Diagnóstico', i.diagnosis], ['Pruebas y valoración sanitaria', i.diagnostics], ['Objetivos de la fase', i.phase_objectives], ['Criterios pendientes para progresar', i.pending_criteria],
    ['Síntomas y evolución', i.symptoms], ['Restricciones médicas', i.restrictions], ['Antecedentes', i.previous_injuries], ['Observaciones', i.coach_notes]];
  const missing = lesion.filter(([, v]) => !v).length + textos.filter(([, v]) => !v).length;
  return <div style={{ maxWidth: 960 }}>
    <PageHead back="/lesiones" eyebrow={<ColorBadge color={INJ_COLOR[i.status]}>{INJ_STATUS[i.status]}</ColorBadge>} title={p.full_name}
      sub={`${i.zone || 'Zona pendiente'}${i.laterality ? ' · ' + i.laterality : ''} · ${i.days_elapsed} días`} actions={<>
        <MoreMenu items={[
          { label: 'Cambiar fase o estado', onClick: () => setModal('phase') },
          { label: 'Editar datos de la lesión', onClick: () => setModal('edit') },
          { label: 'Ficha del jugador', onClick: () => nav('/jugadores/' + p.id) },
          { label: 'Eliminar proceso', danger: true, onClick: () => setModal('delete') },
        ]} />
        {i.status !== 'completada' && <button className="btn" onClick={() => setModal('entry')}>+ Seguimiento</button>}
        {i.status !== 'completada' && <button className="btn primary" onClick={() => setModal('finish')}>✓ Finalizar recuperación</button>}</>} />
    {i.status === 'completada' && <div className="alert ok" style={{ marginBottom: 14 }}><span>✓</span><div><b>Recuperación finalizada</b> el {fmtDate(i.closed_at)} · {i.days_elapsed} días desde la lesión. Queda guardada en el historial del jugador.</div></div>}
    {phases.data && <button className="card" onClick={() => setModal('phase')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 14 }}>
      <div className="row between small" style={{ marginBottom: 6 }}><b>Fase {curIdx + 1} de {phases.data.length}: {i.phase_name || 'Sin fase'}</b><span className="muted">Cambiar ›</span></div>
      <div className="phasebar" aria-hidden="true">{phases.data.map((f, k) => <i key={f.id} title={f.name} className={k < curIdx ? 'done' : k === curIdx ? 'cur' : ''} />)}</div>
    </button>}
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'resumen', label: 'Resumen' }, { key: 'dolor', label: `Dolor EVA (${i.pain.length})` }, { key: 'seguimiento', label: `Seguimiento (${i.entries.length})` }, { key: 'docs', label: `Documentos (${i.files.length})` }, { key: 'historial', label: 'Historial' }]} />
    {tab === 'resumen' && <div className="stack" style={{ gap: 14 }}>
      <div className="card"><dl className="grid g3" style={{ margin: 0, gap: 12 }}>{lesion.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="small muted">{k}</dt><dd style={{ margin: 0, fontWeight: 500 }}>{v}</dd></div>)}</dl>
        {textos.filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ marginTop: 12 }}><div className="small muted">{k}</div><div style={{ whiteSpace: 'pre-wrap' }}>{v}</div></div>)}
        {missing > 0 && <button className="btn sm ghost" style={{ paddingLeft: 0, marginTop: 8 }} onClick={() => setModal('edit')}>{missing} datos pendientes de introducir · Completar</button>}
      </div>
      <div className="card"><div className="row between"><h3 style={{ margin: 0 }}>Dolor durante la sesión (EVA)</h3>{lastPain && <span className="small muted">Último: <b>{lastPain.eva}</b> · {fmtDate(lastPain.date, { day: 'numeric', month: 'short' })}</span>}</div>
        {!i.pain.length ? <p className="small muted" style={{ marginBottom: 0 }}>Aún no hay registros. El jugador lo registra desde su cuenta después de cada sesión (fecha, EVA 0–10 y observaciones).</p> :
          painData.length >= 2 ? <MultiLine data={painData} lines={[{ key: 'pain', label: 'EVA' }]} yDomain={[0, 10]} decimals={0} height={180} /> : <p className="small" style={{ marginBottom: 0 }}>EVA {lastPain.eva} el {fmtDate(lastPain.date)}: «{lastPain.notes}»</p>}
      </div>
    </div>}
    {tab === 'dolor' && (!i.pain.length ? <Empty title="Sin registros de dolor">El jugador lo registra desde su cuenta, en «Dolor (EVA)», después de cada sesión.</Empty> :
      <div className="list">{i.pain.map(e => <div key={e.id} className="lrow" style={{ cursor: 'default' }}>
        <span className="evab" style={{ background: evaColor(e.eva) }}>{e.eva}</span>
        <span className="lrow-main"><span className="lrow-t">{fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className="lrow-s">{e.notes}</span></span>
        <span className="small muted">{fmtDateTime(e.created_at)}</span><button className="btn sm ghost del" aria-label="Eliminar registro de dolor" title="Eliminar" onClick={() => setModal({ delPain: e })}>🗑</button></div>)}</div>)}
    {tab === 'seguimiento' && (!i.entries.length ? <Empty title="Sin entradas de seguimiento">Pulsa «+ Seguimiento» para registrar la primera sesión.</Empty> :
      <div className="list">{i.entries.map(e => <ListRow key={e.id} onClick={() => setModal({ entry: e })} title={fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}
        sub={[e.exercises.map(x => x.name).join(', '), e.response].filter(Boolean).join(' · ') || 'Sin detalle'}
        right={<>{e.pain !== null ? <span className="tag warn">Dolor {e.pain}</span> : null}<button className="btn sm ghost del" aria-label="Eliminar seguimiento" title="Eliminar" onClick={ev => { ev.stopPropagation(); setModal({ delEntry: e }); }}>🗑</button></>} />)}</div>)}
    {tab === 'docs' && <div className="stack">
      <div className="row"><span className="small muted">Archivos privados, solo accesibles con tu sesión.</span><span className="spacer" /><FileButton className="btn" accept="image/*,.pdf,.doc,.docx,.txt" onFile={uploadDoc}>Adjuntar</FileButton></div>
      {!i.files.length ? <Empty title="Sin documentos" /> : <div className="list">{i.files.map(f => <div key={f.id} className="lrow" style={{ cursor: 'default' }}>
        <span className="lrow-main"><span className="lrow-t">{f.original_name}</span><span className="lrow-s">{Math.round(f.size / 1024)} KB · {fmtDate(f.uploaded_at.slice(0, 10))}</span></span>
        <button className="btn sm" onClick={async () => { try { const res = await api.raw('GET', '/files/' + f.id); await saveBlob(await res.blob(), f.original_name); } catch (e) { toast(e.message, 'err'); } }}>Descargar</button>
        <MoreMenu items={[{ label: 'Eliminar', danger: true, onClick: () => setModal({ delFile: f }) }]} /></div>)}</div>}
    </div>}
    {tab === 'historial' && <div className="card"><div className="timeline">{i.history.map(h => <div key={h.id} className="it"><b className="small">{fmtDateTime(h.at)}</b>
      <div className="small">{h.from_status ? `${INJ_STATUS[h.from_status]} → ` : ''}{INJ_STATUS[h.to_status]}{h.to_phase && <> · {h.from_phase && h.from_phase !== h.to_phase ? `${h.from_phase} → ` : ''}{h.to_phase}</>}</div>
      {h.note && <div className="small muted">«{h.note}»</div>}</div>)}</div>
      {i.otherInjuries.length > 0 && <><div className="section-title">Otras lesiones del jugador</div>{i.otherInjuries.map(o => <div key={o.id} className="small"><a href="#" onClick={e => { e.preventDefault(); nav('/lesiones/' + o.id); }}>{fmtDate(o.injury_date)} · {o.zone || 'Lesión'}</a> — {INJ_STATUS[o.status]}</div>)}</>}
    </div>}
    {modal === 'phase' && <PhaseModal i={i} phases={phases.data || []} onClose={() => setModal(null)} onSaved={r.reload} />}
    {modal === 'edit' && <EditInjury i={i} onClose={() => setModal(null)} onSaved={r.reload} />}
    {(modal === 'entry' || modal?.entry) && <EntryModal i={i} entry={modal?.entry} phases={phases.data || []} pain={pain} onClose={() => setModal(null)} onSaved={r.reload} />}
    {modal === 'finish' && <FinishModal i={i} onClose={() => setModal(null)} onSaved={r.reload} />}
    {modal?.delEntry && <Confirm title="Eliminar seguimiento" danger confirmText="Eliminar" message={`¿Eliminar el seguimiento del ${fmtDate(modal.delEntry.date)}? No se puede deshacer.`}
      onConfirm={async () => { await api.del('/injuries/entries/' + modal.delEntry.id); toast('Seguimiento eliminado'); r.reload(); }} onClose={() => setModal(null)} />}
    {modal?.delPain && <Confirm title="Eliminar registro de dolor" danger confirmText="Eliminar" message={`¿Eliminar el EVA ${modal.delPain.eva} del ${fmtDate(modal.delPain.date)}? No se puede deshacer.`}
      onConfirm={async () => { await api.del('/injuries/pain/' + modal.delPain.id); toast('Registro eliminado'); r.reload(); }} onClose={() => setModal(null)} />}
    {modal?.delFile && <Confirm title="Eliminar documento" danger confirmText="Eliminar" message={`¿Eliminar «${modal.delFile.original_name}»? No se puede deshacer.`}
      onConfirm={async () => { await api.del('/injuries/files/' + modal.delFile.id); toast('Documento eliminado'); r.reload(); }} onClose={() => setModal(null)} />}
    {modal === 'delete' && <Confirm title="Eliminar proceso de lesión" danger requireText="ELIMINAR" confirmText="Eliminar" message="Se eliminará el proceso, su seguimiento, el historial y los documentos adjuntos."
      onConfirm={async t => { await api.del('/injuries/' + id, { confirm: t }); toast('Proceso eliminado'); nav('/lesiones'); }} onClose={() => setModal(null)} />}
  </div>;
}

export const evaColor = v => v <= 2 ? 'var(--verde)' : v <= 4 ? 'var(--amarillo)' : v <= 6 ? 'var(--naranja)' : 'var(--rojo)';
const Dl = ({ items }) => <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>{items.map(([k, v]) => <React.Fragment key={k}><dt className="small muted">{k}</dt><dd style={{ margin: 0, fontWeight: 500 }}>{show(v)}</dd></React.Fragment>)}</dl>;
const Txt = ({ k, v }) => <div style={{ marginBottom: 10 }}><div className="small muted">{k}</div><div style={{ whiteSpace: 'pre-wrap' }}>{v || <Pending />}</div></div>;

function FinishModal({ i, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({ date: todayISO(), note: '' });
  const [err, setErr] = useState(null);
  return <Modal title="Finalizar recuperación" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { await api.post(`/injuries/${i.id}/finish`, v); toast('Recuperación finalizada'); onSaved(); onClose(); } catch (e) { setErr(e.message); }
  }}>Finalizar y guardar en el historial</button></>}>
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>El proceso se cierra, el jugador deja de figurar como lesionado y deja de ver el cuestionario de dolor (EVA). Todo el seguimiento queda guardado en su historial.</p>
      <Field label="Fecha de alta" required><input type="date" value={v.date} min={i.injury_date} max={todayISO()} onChange={e => setV({ ...v, date: e.target.value })} /></Field>
      <Field label="Observaciones del alta"><textarea value={v.note} onChange={e => setV({ ...v, note: e.target.value })} placeholder="Criterios cumplidos, recomendaciones…" /></Field>
      <ErrorBox error={err} />
    </div>
  </Modal>;
}

function PhaseModal({ i, phases, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({ phase_id: i.phase_id || '', status: i.status, note: '' });
  const [err, setErr] = useState(null);
  return <Modal title="Actualizar fase / estado" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { await api.post(`/injuries/${i.id}/phase`, v); toast('Fase actualizada'); onSaved(); onClose(); } catch (e) { setErr(e.message); }
  }}>Guardar cambio</button></>}>
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Actualiza la fase cuando se cumplan los criterios de progresión establecidos y conforme a las indicaciones de los profesionales sanitarios. El cambio queda registrado en el historial.</p>
      <Field label="Fase"><select value={v.phase_id} onChange={e => setV({ ...v, phase_id: Number(e.target.value) })}>{phases.map((f, k) => <option key={f.id} value={f.id}>{k + 1}. {f.name}</option>)}</select></Field>
      <Field label="Estado del proceso"><select value={v.status} onChange={e => setV({ ...v, status: e.target.value })}>{Object.entries(INJ_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Motivo / criterios cumplidos"><textarea value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /></Field>
      <ErrorBox error={err} />
    </div>
  </Modal>;
}

const EDIT_FIELDS = [
  ['injury_date', 'Fecha de lesión', 'date'], ['zone', 'Zona anatómica'], ['laterality', 'Lateralidad', 'lat'], ['injury_type', 'Tipo de lesión'], ['mechanism', 'Mecanismo de lesión'],
  ['return_training_date', 'Vuelta al entrenamiento colectivo', 'date'], ['return_match_date', 'Vuelta a la competición', 'date'],
  ['diagnosis', 'Diagnóstico o descripción exacta disponible', 'area'], ['diagnostics', 'Pruebas diagnósticas y valoración del profesional sanitario', 'area'],
  ['previous_injuries', 'Antecedentes de lesiones', 'area'], ['symptoms', 'Síntomas y evolución', 'area'], ['restrictions', 'Restricciones o recomendaciones médicas', 'area'],
  ['phase_objectives', 'Objetivos de la fase actual', 'area'], ['pending_criteria', 'Criterios pendientes para progresar', 'area'], ['coach_notes', 'Observaciones del preparador físico', 'area'],
];
function EditInjury({ i, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState(Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, i[k] || ''])));
  const [err, setErr] = useState(null);
  return <Modal wide title="Datos de la lesión" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { await api.put('/injuries/' + i.id, { ...v, laterality: v.laterality || null }); toast('Datos guardados'); onSaved(); onClose(); } catch (e) { setErr(e.message); }
  }}>Guardar</button></>}>
    <div className="inline-fields">{EDIT_FIELDS.filter(f => f[2] !== 'area').map(([k, l, t]) => <Field key={k} label={l}>{t === 'lat' ?
      <select value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })}><option value="">Pendiente</option><option value="derecha">Derecha</option><option value="izquierda">Izquierda</option><option value="bilateral">Bilateral</option></select> :
      <input type={t === 'date' ? 'date' : 'text'} value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} />}</Field>)}</div>
    <div className="grid g2" style={{ marginTop: 12 }}>{EDIT_FIELDS.filter(f => f[2] === 'area').map(([k, l]) => <Field key={k} label={l}><textarea value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} /></Field>)}</div>
    <ErrorBox error={err} />
  </Modal>;
}

function EntryModal({ i, entry, phases, pain, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState(() => entry ? { ...entry, exercises: entry.exercises.length ? entry.exercises : [{ name: '' }], pain: entry.pain ?? '', review_date: entry.review_date || '' } :
    { date: todayISO(), phase_id: i.phase_id || '', exercises: [{ name: '', sets: '', reps: '', load: '', other: '' }], pain: '', response: '', incidents: '', review_date: '', pending_criteria: '', notes: '' });
  const [err, setErr] = useState(null);
  const [del, setDel] = useState(false);
  const setEx = (k, f, val) => setV(o => ({ ...o, exercises: o.exercises.map((x, j) => (j === k ? { ...x, [f]: val } : x)) }));
  const save = async () => {
    try {
      const body = { ...v, pain: v.pain === '' ? null : v.pain, review_date: v.review_date || null, phase_id: v.phase_id || null };
      if (entry) await api.put('/injuries/entries/' + entry.id, body); else await api.post(`/injuries/${i.id}/entries`, body);
      toast('Seguimiento guardado'); onSaved(); onClose();
    } catch (e) { setErr(e.message); }
  };
  return <Modal wide title={entry ? 'Editar entrada de seguimiento' : 'Nueva entrada de seguimiento'} onClose={onClose} footer={<>
    {entry && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setDel(true)}>Eliminar</button>}
    <button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
    <div className="stack" style={{ gap: 14 }}>
      <div className="inline-fields">
        <Field label="Fecha" required><input type="date" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></Field>
        <Field label="Fase"><select value={v.phase_id || ''} onChange={e => setV({ ...v, phase_id: e.target.value })}><option value="">—</option>{phases.map((f, k) => <option key={f.id} value={f.id}>{k + 1}. {f.name}</option>)}</select></Field>
        <Field label="Fecha de revisión"><input type="date" value={v.review_date} onChange={e => setV({ ...v, review_date: e.target.value })} /></Field>
      </div>
      <div><h3 style={{ marginBottom: 8 }}>Ejercicios realizados</h3>
        <div className="table-wrap"><table className="t"><thead><tr><th>Ejercicio</th><th>Series</th><th>Repeticiones</th><th>Carga</th><th>Otros parámetros</th><th /></tr></thead>
          <tbody>{v.exercises.map((x, k) => <tr key={k}>{['name', 'sets', 'reps', 'load', 'other'].map(f => <td key={f}><input type="text" value={x[f] || ''} onChange={e => setEx(k, f, e.target.value)} placeholder={f === 'load' ? 'p. ej. 20 kg' : f === 'other' ? 'tempo, descanso, RIR…' : ''} /></td>)}
            <td><button className="btn sm ghost" onClick={() => setV(o => ({ ...o, exercises: o.exercises.filter((_, j) => j !== k) }))} aria-label="Quitar">×</button></td></tr>)}</tbody></table></div>
        <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setV(o => ({ ...o, exercises: [...o.exercises, { name: '' }] }))}>+ Añadir ejercicio</button>
      </div>
      <div className="grid g2">
        <Field label="Respuesta a la sesión"><textarea value={v.response || ''} onChange={e => setV({ ...v, response: e.target.value })} /></Field>
        <Field label="Incidencias"><textarea value={v.incidents || ''} onChange={e => setV({ ...v, incidents: e.target.value })} /></Field>
        <Field label="Criterios pendientes para progresar"><textarea value={v.pending_criteria || ''} onChange={e => setV({ ...v, pending_criteria: e.target.value })} /></Field>
        <Field label="Observaciones"><textarea value={v.notes || ''} onChange={e => setV({ ...v, notes: e.target.value })} /></Field>
      </div>
      <ErrorBox error={err} />
    </div>
    {del && <Confirm title="Eliminar entrada" danger confirmText="Eliminar" message="¿Eliminar esta entrada de seguimiento?" onConfirm={async () => { await api.del('/injuries/entries/' + entry.id); onSaved(); onClose(); }} onClose={() => setDel(false)} />}
  </Modal>;
}
