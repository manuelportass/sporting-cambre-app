import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Field, Modal, useApi, useToast } from './ui';
import { WEEKDAYS } from '../lib/format';

// Alta / edición de jugador (registro único)
export default function PlayerForm({ player, onClose, onSaved }) {
  const toast = useToast();
  const cats = useApi('/categories');
  const slots = useApi('/gym/slots');
  const settings = useApi('/settings');
  const [v, setV] = useState(() => ({
    first_name: player?.first_name || '', last_name: player?.last_name || '', category_id: player?.category_id || '',
    position: player?.position || '', dominant_leg: player?.dominant_leg || '', joined_at: player?.joined_at || '', notes: player?.notes || '',
    slot_ids: player?.slots?.map(s => s.id) || player?.slot_ids || [],
    custom: player?.custom || {},
    private: { birth_date: player?.private?.birth_date || '', weight_kg: player?.private?.weight_kg ?? '', height_cm: player?.private?.height_cm ?? '', anthropometry: player?.private?.anthropometry || '', sports_history: player?.private?.sports_history || '' },
  }));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(false);
  const set = (k, val) => setV(o => ({ ...o, [k]: val }));
  const setP = (k, val) => setV(o => ({ ...o, private: { ...o.private, [k]: val } }));
  const catCode = cats.data?.find(c => String(c.id) === String(v.category_id))?.code;
  useEffect(() => setDup(false), [v.first_name, v.last_name]);

  const save = async allowDuplicate => {
    setBusy(true); setErr(null);
    const body = { ...v, category_id: v.category_id || null, dominant_leg: v.dominant_leg || null, joined_at: v.joined_at || null, allowDuplicate };
    try {
      const r = player ? await api.put('/players/' + player.id, body) : await api.post('/players', body);
      toast(player ? 'Jugador actualizado' : 'Jugador creado');
      onSaved?.(r.id || player.id);
      onClose();
    } catch (e) { if (e.status === 409) setDup(true); setErr(e.message); setBusy(false); }
  };
  const fields = settings.data?.playerCustomFields || [];
  return <Modal title={player ? 'Editar jugador' : 'Nuevo jugador'} onClose={onClose} wide footer={<>
    <button className="btn" onClick={onClose}>Cancelar</button>
    {dup && <button className="btn" disabled={busy} onClick={() => save(true)}>Es otra persona: guardar igualmente</button>}
    <button className="btn primary" disabled={busy || !v.first_name.trim()} onClick={() => save(false)}>Guardar</button></>}>
    <div className="stack" style={{ gap: 16 }}>
      <div className="inline-fields">
        <Field label="Nombre" required><input type="text" value={v.first_name} onChange={e => set('first_name', e.target.value)} autoFocus /></Field>
        <Field label="Apellidos"><input type="text" value={v.last_name} onChange={e => set('last_name', e.target.value)} /></Field>
        <Field label="Categoría"><select value={v.category_id} onChange={e => set('category_id', e.target.value)}><option value="">Pendiente</option>{cats.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Fecha de incorporación"><input type="date" value={v.joined_at} onChange={e => set('joined_at', e.target.value)} /></Field>
        <Field label="Posición habitual"><input type="text" value={v.position} onChange={e => set('position', e.target.value)} placeholder="p. ej. Lateral derecho" /></Field>
        <Field label="Pierna dominante"><select value={v.dominant_leg} onChange={e => set('dominant_leg', e.target.value)}><option value="">Pendiente</option><option value="derecha">Derecha</option><option value="izquierda">Izquierda</option><option value="ambas">Ambas</option></select></Field>
      </div>
      {catCode !== 'senior' && <div>
        <h3 style={{ marginBottom: 8 }}>Horario habitual de gimnasio</h3>
        {!slots.data?.length ? <p className="muted small">No hay franjas configuradas. Créalas en Configuración → Gimnasio.</p> :
          <div className="row">{slots.data.map(s => <label key={s.id} className="check badge plain" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={v.slot_ids.includes(s.id)} onChange={e => set('slot_ids', e.target.checked ? [...v.slot_ids, s.id] : v.slot_ids.filter(x => x !== s.id))} />
            {WEEKDAYS[s.weekday]} {s.start_time}–{s.end_time}{s.category_name ? ` · ${s.category_name}` : ''}</label>)}</div>}
      </div>}
      <div>
        <h3 style={{ marginBottom: 8 }}>Datos personales <span className="muted small" style={{ textTransform: 'none', fontFamily: 'var(--body)' }}>· solo visibles para el preparador físico</span></h3>
        <div className="inline-fields">
          <Field label="Fecha de nacimiento"><input type="date" value={v.private.birth_date} onChange={e => setP('birth_date', e.target.value)} /></Field>
          <Field label="Peso (kg)"><input type="number" step="0.1" value={v.private.weight_kg} onChange={e => setP('weight_kg', e.target.value)} /></Field>
          <Field label="Altura (cm)"><input type="number" step="0.5" value={v.private.height_cm} onChange={e => setP('height_cm', e.target.value)} /></Field>
        </div>
        <div className="grid g2" style={{ marginTop: 12 }}>
          <Field label="Otros datos antropométricos"><textarea value={v.private.anthropometry} onChange={e => setP('anthropometry', e.target.value)} /></Field>
          <Field label="Historial deportivo relevante"><textarea value={v.private.sports_history} onChange={e => setP('sports_history', e.target.value)} /></Field>
        </div>
      </div>
      {fields.length > 0 && <div className="inline-fields">{fields.map(f => <Field key={f.key} label={f.label}>
        <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={v.custom[f.key] ?? ''} onChange={e => set('custom', { ...v.custom, [f.key]: e.target.value })} /></Field>)}</div>}
      <Field label="Observaciones para la organización del entrenamiento"><textarea value={v.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrorBox error={err} />
    </div>
  </Modal>;
}
