import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { Avatar, Empty, ErrorBox, Field, Loading, Modal, MoreMenu, PageHead, PlayerPicker, useApi, useToast } from '../../components/ui';
import { ATT_LABEL, WEEKDAYS, fmtDate, fmtDateTime, isoWeekday, todayISO } from '../../lib/format';

const STATUS = [['presente', 'P', 'Presente'], ['ausente', 'A', 'Ausente'], ['justificada', 'J', 'Ausencia justificada']];

// Pantalla 2 del gimnasio: pasar lista de una franja
export default function SlotAttendance() {
  const { slotId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const date = sp.get('date') || todayISO();
  const day = useApi('/gym/day?date=' + date);
  const players = useApi('/players');
  const [modal, setModal] = useState(null);
  const s = day.data?.slots.find(x => String(x.slot.id) === slotId);
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); day.reload(); } catch (e) { toast(e.message, 'err'); } };
  const mark = (x, status) => act(() => api.post('/gym/attendance', { date, slot_id: s.slot.id, player_id: x.player_id, status: x.status === status ? 'pendiente' : status }));

  if (day.loading && !day.data) return <Loading />;
  if (day.error) return <ErrorBox error={day.error} />;
  if (!s) return <div><PageHead back={`/gimnasio?date=${date}`} title="Franja no encontrada" /></div>;
  const st = s.stats;
  const title = `${WEEKDAYS[isoWeekday(date)]} ${s.slot.start_time}`;
  return <div style={{ maxWidth: 820 }}>
    <PageHead back={`/gimnasio?date=${date}`} eyebrow={s.slot.label || s.slot.category_name || 'Gimnasio'} title={title} sub={fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })} actions={<>
      <MoreMenu items={[
        { label: 'Añadir jugador puntual', onClick: () => setModal({ type: 'add' }) },
        { label: 'Observaciones de la sesión', onClick: () => setModal({ type: 'session' }) },
        { label: s.session?.cancelled ? 'Reactivar sesión' : 'Marcar sesión como cancelada', onClick: () => act(() => api.post('/gym/session', { date, slot_id: s.slot.id, cancelled: !s.session?.cancelled, notes: s.session?.notes || '' }), s.session?.cancelled ? 'Sesión reactivada' : 'Sesión cancelada') },
      ]} />
      <button className="btn primary" disabled={!st.pendientes} onClick={() => act(() => api.post('/gym/attendance/bulk', { date, slot_id: s.slot.id, status: 'presente' }), 'Pendientes marcados como presentes')}>Todos presentes</button></>} />
    {s.session?.cancelled ? <div className="alert warn" style={{ marginBottom: 12 }}><span>⚠</span><div>Sesión cancelada{s.session.notes ? ': ' + s.session.notes : ''}.</div></div> : null}
    <div className="row" style={{ marginBottom: 12, gap: 16 }}>
      <span><b>{st.presentes}</b> <span className="muted">presentes</span></span>
      <span><b>{st.ausentes + st.justificadas}</b> <span className="muted">ausentes</span></span>
      <span><b>{st.pendientes}</b> <span className="muted">por marcar</span></span>
    </div>
    {!s.list.length ? <Empty title="No hay jugadores en esta franja">Asígnalos desde su ficha en Jugadores o añade un jugador puntual (⋯).</Empty> :
      <div className="list">{s.list.map(x => {
        const moved = x.status === 'movido';
        return <div key={x.player_id} className="lrow" style={{ cursor: 'default', opacity: moved ? 0.5 : 1 }}>
          <Avatar name={x.name} fileId={x.photo_file_id} />
          <span className="lrow-main">
            <span className="lrow-t">{x.name}</span>
            {(x.origin !== 'habitual' || moved || x.note) && <span className="lrow-s">{[moved ? `Cambiado a ${x.moved_slot_label?.split(' ')[1] || 'otra franja'}` : null, x.origin === 'puntual' ? 'Puntual' : null, x.origin === 'cambio_franja' ? 'Cambio de franja' : null, x.note].filter(Boolean).join(' · ')}</span>}
          </span>
          {!moved && <span className="statusbtns big-status" role="group" aria-label={'Asistencia de ' + x.name}>{STATUS.map(([k, l, t]) => <button key={k} data-s={k} title={t} aria-pressed={x.status === k} className={x.status === k ? 'on' : ''} onClick={() => mark(x, k)}>{l}</button>)}</span>}
          <MoreMenu items={[
            !moved && { label: x.note ? 'Editar observación' : 'Añadir observación', onClick: () => setModal({ type: 'note', x }) },
            !moved && x.origin === 'habitual' && day.data.slots.length > 1 && { label: 'Cambiar de franja (solo hoy)', onClick: () => setModal({ type: 'move', x }) },
            (x.origin !== 'habitual' || moved) && x.attendance_id && { label: 'Deshacer cambio', onClick: () => act(() => api.del('/gym/attendance/' + x.attendance_id), 'Cambio deshecho') },
            x.attendance_id && { label: 'Historial de cambios', onClick: () => setModal({ type: 'history', x }) },
            { label: 'Ver ficha', onClick: () => nav('/jugadores/' + x.player_id) },
          ]} />
        </div>;
      })}</div>}
    <p className="small muted">P presente · A ausente · J ausencia justificada. Pulsa otra vez para desmarcar.</p>

    {modal?.type === 'add' && <Modal title="Añadir jugador puntual" onClose={() => setModal(null)}>
      <p className="muted small" style={{ marginTop: 0 }}>Solo para esta sesión. Su horario habitual no cambia.</p>
      <PlayerPicker players={(players.data || []).filter(p => p.category_code !== 'senior')} exclude={s.list.map(x => x.player_id)}
        onChange={p => { act(() => api.post('/gym/attendance/add', { date, slot_id: s.slot.id, player_id: p.id }), `${p.full_name} añadido`); setModal(null); }} />
    </Modal>}
    {modal?.type === 'move' && <Modal title={`Cambiar de franja · ${modal.x.name}`} onClose={() => setModal(null)}>
      <p className="muted small" style={{ marginTop: 0 }}>Solo para esta sesión. Su horario habitual no cambia.</p>
      <div className="stack">{day.data.slots.filter(o => o.slot.id !== s.slot.id).map(o => <button key={o.slot.id} className="btn" onClick={() => {
        act(() => api.post('/gym/attendance/move', { date, from_slot_id: s.slot.id, to_slot_id: o.slot.id, player_id: modal.x.player_id }), 'Cambio registrado'); setModal(null);
      }}>{o.slot.start_time}–{o.slot.end_time} · {o.slot.label || o.slot.category_name}</button>)}</div>
    </Modal>}
    {modal?.type === 'note' && <TextModal title={`Observación · ${modal.x.name}`} initial={modal.x.note || ''} onClose={() => setModal(null)}
      onSave={note => act(() => api.post('/gym/attendance', { date, slot_id: s.slot.id, player_id: modal.x.player_id, status: modal.x.status, note }), 'Observación guardada')} />}
    {modal?.type === 'session' && <TextModal title="Observaciones de la sesión" initial={s.session?.notes || ''} onClose={() => setModal(null)}
      onSave={notes => act(() => api.post('/gym/session', { date, slot_id: s.slot.id, cancelled: !!s.session?.cancelled, notes }), 'Observaciones guardadas')} />}
    {modal?.type === 'history' && <HistoryModal x={modal.x} onClose={() => setModal(null)} />}
  </div>;
}

function TextModal({ title, initial, onSave, onClose }) {
  const [v, setV] = useState(initial);
  return <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={() => { onSave(v); onClose(); }}>Guardar</button></>}>
    <Field label="Texto"><textarea value={v} onChange={e => setV(e.target.value)} autoFocus /></Field>
  </Modal>;
}

function HistoryModal({ x, onClose }) {
  const h = useApi('/gym/attendance/' + x.attendance_id + '/history');
  return <Modal title={'Historial · ' + x.name} onClose={onClose}>
    {h.loading ? <Loading /> : !h.data.length ? <p className="muted">Sin cambios registrados.</p> :
      <div className="timeline">{h.data.map(a => { const b = a.before_json ? JSON.parse(a.before_json) : null, af = a.after_json ? JSON.parse(a.after_json) : null; return <div className="it" key={a.id}>
        <b>{fmtDateTime(a.at)}</b>
        <div className="small">{b?.status ? ATT_LABEL[b.status] : 'Sin marcar'} → {af?.status ? ATT_LABEL[af.status] : '—'}{af?.note ? ` · «${af.note}»` : ''}</div></div>; })}</div>}
  </Modal>;
}
