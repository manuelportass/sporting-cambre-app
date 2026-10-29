import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { normalizePlayerPhoto } from '../../lib/files';
import { api } from '../../api';
import { Avatar, Confirm, Empty, ErrorBox, ListRow, Loading, MoreMenu, PageHead, Tabs, useApi, useToast, ColorBadge } from '../../components/ui';
import PlayerForm from '../../components/PlayerForm';
import { saveBlob } from '../../lib/files';
import { ATT_LABEL, INJ_COLOR, INJ_STATUS, WEEKDAYS, age, fmtDate, fmtDateTime } from '../../lib/format';

const ATT_COLOR = { presente: 'verde', ausente: 'rojo', justificada: 'amarillo', pendiente: 'gris', movido: 'gris' };

export default function PlayerProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const p = useApi('/players/' + id);
  const hist = useApi('/gym/player/' + id + '/history');
  const inj = useApi('/injuries?player_id=' + id);
  const audit = useApi('/audit?entity=player&entity_id=' + id);
  const settings = useApi('/settings');
  const [tab, setTab] = useState('ficha');
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  if (p.loading) return <Loading />;
  if (p.error) return <ErrorBox error={p.error} />;
  const d = p.data;
  const reload = () => { p.reload(); audit.reload(); };
  const uploadPhoto = async f => { try { await api.upload(`/players/${id}/photo`, await normalizePlayerPhoto(f)); toast('Fotografía actualizada'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const removePhoto = async () => { try { await api.del(`/players/${id}/photo`); toast('Fotografía eliminada'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const toggleActive = async () => { try { await api.put('/players/' + id, { active: !d.active }); toast(d.active ? 'Jugador desactivado' : 'Jugador reactivado'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const exportData = async () => {
    const res = await api.raw('GET', `/players/${id}/export`);
    await saveBlob(await res.blob(), `datos-${d.full_name}.json`);
  };
  const custom = settings.data?.playerCustomFields || [];
  const fields = [
    ['Categoría', d.category_name], ['Posición', d.position], ['Pierna dominante', d.dominant_leg],
    ['Horario de gimnasio', d.category_code === 'senior' ? '—' : d.slots.map(x => `${WEEKDAYS[x.weekday]} ${x.start_time}`).join(' · ')],
    ['Incorporación', d.joined_at && fmtDate(d.joined_at)], ['Fecha de nacimiento', d.private.birth_date && `${fmtDate(d.private.birth_date)} (${age(d.private.birth_date)} años)`],
    ['Peso', d.private.weight_kg && d.private.weight_kg + ' kg'], ['Altura', d.private.height_cm && d.private.height_cm + ' cm'],
    ...custom.map(f => [f.label, d.custom?.[f.key]]),
  ];
  const filled = fields.filter(([, v]) => v), missing = fields.length - filled.length;
  return <div>
    <PageHead back="/jugadores" eyebrow={d.category_name || 'Sin categoría'} title={d.full_name} actions={<>
      <MoreMenu items={[
        { label: d.photo_file_id ? 'Sustituir foto' : 'Subir foto', onClick: () => document.getElementById('photo-input').click() },
        d.photo_file_id && { label: 'Eliminar foto', onClick: removePhoto },
        d.category_code === 'senior' && { label: 'Ver en primer equipo', onClick: () => nav('/primer-equipo/jugador/' + id) },
        { label: 'Registrar lesión', onClick: () => nav('/lesiones?player=' + id) },
        { label: 'Exportar sus datos (RGPD)', onClick: exportData },
        { label: d.active ? 'Desactivar' : 'Reactivar', onClick: toggleActive },
        { label: 'Eliminar definitivamente', danger: true, onClick: () => setDel(true) },
      ]} />
      <button className="btn primary" onClick={() => setEdit(true)}>Editar</button></>} />
    <input id="photo-input" type="file" accept="image/*" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadPhoto(f); }} />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'ficha', label: 'Ficha' }, { key: 'gym', label: 'Asistencia' }, { key: 'lesiones', label: 'Lesiones' }, { key: 'historial', label: 'Cambios' }]} />
    {tab === 'ficha' && <div className="card row" style={{ alignItems: 'flex-start', gap: 20 }}>
      <Avatar name={d.full_name} fileId={d.photo_file_id} size="lg" />
      <div className="stack" style={{ flex: 1, minWidth: 220 }}>
        <dl className="grid g2" style={{ margin: 0, gap: 12 }}>{filled.map(([k, v]) => <Item key={k} k={k}>{v}</Item>)}</dl>
        {d.notes && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.notes}</p>}
        {missing > 0 && <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setEdit(true)}>{missing} datos pendientes de introducir · Completar</button>}
        {!d.active && <span className="tag">Desactivado</span>}
      </div>
    </div>}
    {tab === 'gym' && (hist.loading ? <Loading /> : <div className="stack">
      <div className="row" style={{ gap: 18 }}>{['presente', 'ausente', 'justificada'].map(st => <span key={st} className="row" style={{ gap: 6 }}><span className="sdot" style={{ background: `var(--${ATT_COLOR[st]})` }} /><b>{hist.data.summary[st]}</b> <span className="muted">{ATT_LABEL[st].toLowerCase()}</span></span>)}</div>
      {!hist.data.rows.length ? <Empty title="Sin registros de asistencia" /> : <div className="list">{hist.data.rows.map(r => <div key={r.id} className="lrow" style={{ cursor: 'default' }}>
        <span className="lrow-main"><span className="lrow-t">{fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className="lrow-s">{r.slot}{r.note ? ' · ' + r.note : ''}</span></span>
        <ColorBadge color={r.cancelled ? 'gris' : ATT_COLOR[r.status]}>{r.cancelled ? 'Cancelada' : ATT_LABEL[r.status]}</ColorBadge></div>)}</div>}
    </div>)}
    {tab === 'lesiones' && (inj.loading ? <Loading /> : !inj.data.length ? <Empty title="Sin lesiones registradas" /> :
      <div className="list">{inj.data.map(i => <ListRow key={i.id} onClick={() => nav('/lesiones/' + i.id)} title={`${i.zone || 'Lesión'}${i.laterality ? ' · ' + i.laterality : ''}`} sub={fmtDate(i.injury_date)} right={<ColorBadge color={INJ_COLOR[i.status]}>{INJ_STATUS[i.status]}</ColorBadge>} />)}</div>)}
    {tab === 'historial' && (audit.loading ? <Loading /> : <AuditList rows={audit.data} />)}
    {edit && <PlayerForm player={d} onClose={() => setEdit(false)} onSaved={reload} />}
    {del && <Confirm title="Eliminar jugador" danger confirmText="Eliminar definitivamente" requireText={d.full_name}
      message={<>Esta acción <b>no se puede deshacer</b>. Se eliminarán todos los datos de {d.full_name} en los tres módulos.</>}
      onConfirm={async txt => { await api.del('/players/' + id, { confirm: txt }); toast('Jugador eliminado'); nav('/jugadores'); }} onClose={() => setDel(false)} />}
  </div>;
}

const Item = ({ k, children }) => <div><dt className="small muted">{k}</dt><dd style={{ margin: 0, fontWeight: 500 }}>{children}</dd></div>;

const ACTION = { create: 'Creación', update: 'Modificación', import_create: 'Alta por importación', import_update: 'Actualización por importación', photo_upload: 'Foto subida', photo_delete: 'Foto eliminada' };
export function AuditList({ rows }) {
  if (!rows?.length) return <Empty title="Sin cambios registrados" />;
  return <div className="table-wrap"><table className="t"><thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Detalle</th></tr></thead>
    <tbody>{rows.map(a => <tr key={a.id}><td className="small">{fmtDateTime(a.at)}</td><td>{ACTION[a.action] || a.action}</td><td className="small">{a.user_name || '—'}</td>
      <td className="small" style={{ maxWidth: 420, wordBreak: 'break-word' }}>{summarize(a)}</td></tr>)}</tbody></table></div>;
}
function summarize(a) {
  try {
    const before = a.before_json ? JSON.parse(a.before_json) : null, after = a.after_json ? JSON.parse(a.after_json) : null;
    if (before && after) return Object.keys(after).filter(k => k !== 'updated_at' && k !== 'name_key' && String(before[k] ?? '') !== String(after[k] ?? '')).map(k => `${k}: ${before[k] ?? '—'} → ${after[k] ?? '—'}`).join(' · ') || '—';
    if (after) return Object.entries(after).filter(([k]) => k !== 'name_key').slice(0, 6).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
    return '—';
  } catch { return '—'; }
}
