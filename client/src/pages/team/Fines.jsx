import React, { useMemo, useState } from 'react';
import { api } from '../../api';
import { Avatar, Empty, ErrorBox, Field, Loading, Modal, PageHead, Seg, useApi, useToast } from '../../components/ui';
import { exportXLSX } from '../../lib/files';
import { useReadOnly } from '../../App';
import { WEEKDAYS, fmtDate } from '../../lib/format';

const ST = { pendiente: ['Pendiente', 'var(--rojo)'], pagada: ['Pagada', 'var(--verde)'], anulada: ['Anulada', 'var(--gris, #9a9b95)'] };
const eur = n => `${(Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
// Hora resultante de sumar h horas a «HH:MM» y en qué día cae (0 = mismo día, 1 = día siguiente…)
const plusH = (t, h) => { const [a, b] = t.split(':').map(Number), tot = a * 60 + b + Math.round(h * 60); return { time: `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`, day: Math.floor(tot / 1440) }; };
const dayTxt = d => (d === 0 ? 'El mismo día' : d === 1 ? 'Al día siguiente' : `${d} días después`);
const hTxt = h => `${String(h).replace('.', ',')} h`;

// Multas del primer equipo: RPE no registrado en las 24 h siguientes al aviso
export default function Fines() {
  const d = useApi('/team/fines');
  const s = useApi('/settings');
  const toast = useToast();
  const ro = useReadOnly();
  const [st, setSt] = useState('pendiente');
  const [player, setPlayer] = useState(null);
  const [act, setAct] = useState(null); // { f, status }
  const [cfg, setCfg] = useState(false);
  const list = d.data?.list || [];
  const byPlayer = useMemo(() => {
    const m = new Map();
    for (const f of list) {
      if (!m.has(f.player_id)) m.set(f.player_id, { id: f.player_id, name: f.player_name, photo: f.photo_file_id, n: 0, pend: 0, paid: 0 });
      const x = m.get(f.player_id);
      if (f.status !== 'anulada') x.n++;
      if (f.status === 'pendiente') x.pend += f.amount;
      if (f.status === 'pagada') x.paid += f.amount;
    }
    return [...m.values()].filter(x => x.n).sort((a, b) => b.pend - a.pend || b.n - a.n || a.name.localeCompare(b.name));
  }, [list]);
  if (d.loading && !d.data) return <Loading />;
  if (d.error) return <ErrorBox error={d.error} retry={d.reload} />;
  const c = d.data.config;
  const days = (s.data?.collectiveDays || []).map(x => WEEKDAYS[x].toLowerCase()).join(', ');
  const tot = k => list.filter(f => f.status === k).reduce((a, f) => a + f.amount, 0);
  const shown = list.filter(f => (!st || f.status === st) && (!player || f.player_id === player));
  const exportX = () => exportXLSX([{ name: 'Multas', columns: [{ key: 'date', label: 'Entrenamiento' }, { key: 'player_name', label: 'Jugador' }, { key: 'reason', label: 'Motivo' }, { key: 'amount', label: 'Importe (€)' }, { key: 'status', label: 'Estado' }, { key: 'note', label: 'Nota' }], rows: list }], 'multas-primer-equipo.xlsx');

  return <div>
    <PageHead back="/primer-equipo" title="Multas" sub={c.enabled ? `En vigor desde el ${fmtDate(c.startDate)}` : 'Desactivadas'} actions={<>
      {list.length > 0 && <button className="btn" onClick={exportX}>Excel</button>}
      {!ro && <button className="btn" onClick={() => setCfg(true)}>Ajustes</button>}</>} />

    <div className="card fine-rule">
      <div className="fr-steps">
        <div><b>{c.rpeTime} h</b><span>Aviso de RPE</span><small>Días de entrenamiento ({days})</small></div>
        {c.reminder !== false && <><i>→</i>
        <div><b>{plusH(c.rpeTime, c.reminderHours).time} h</b><span>{dayTxt(plusH(c.rpeTime, c.reminderHours).day)} · +{hTxt(c.reminderHours)}</span><small>«Te queda{c.fineHours - c.reminderHours === 1 ? ' 1 hora' : `n ${hTxt(c.fineHours - c.reminderHours)}`} para el RPE»</small></div></>}
        <i>→</i>
        <div className="fr-fine"><b>{plusH(c.rpeTime, c.fineHours).time} h</b><span>{dayTxt(plusH(c.rpeTime, c.fineHours).day)} · +{hTxt(c.fineHours)}</span><small>Sin RPE: multa de {eur(c.amount)}</small></div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Solo cuenta el RPE (el wellness no genera multas). Se aplica a jugadores del primer equipo con cuenta en la app; no se multa a quien tenga una lesión abierta ni a quien esté marcado como ausente, justificado o lesionado en ese entrenamiento. Las multas se acumulan y puedes anularlas o marcarlas como pagadas.</p>
      {!c.notificationsEnabled && <div className="alert warn small"><span>⚠</span><div>Los avisos automáticos están desactivados (Configuración → Avisos): las multas se siguen generando, pero los jugadores no reciben los recordatorios.</div></div>}
    </div>

    <div className="tiles fine-kpis">
      <div className="card kpi" style={{ borderTop: '4px solid var(--rojo)' }}><span className="v">{eur(tot('pendiente'))}</span><span className="l">Pendiente de pago</span><span className="s">{list.filter(f => f.status === 'pendiente').length} multas</span></div>
      <div className="card kpi" style={{ borderTop: '4px solid var(--verde)' }}><span className="v">{eur(tot('pagada'))}</span><span className="l">Pagado</span><span className="s">{list.filter(f => f.status === 'pagada').length} multas</span></div>
      <div className="card kpi"><span className="v">{eur(tot('pendiente') + tot('pagada'))}</span><span className="l">Total acumulado</span><span className="s">{list.filter(f => f.status !== 'anulada').length} multas · {list.filter(f => f.status === 'anulada').length} anuladas</span></div>
    </div>

    {!list.length ? <Empty title="Sin multas">{c.enabled ? `Se generarán solas cuando un jugador no registre el RPE en las 24 h siguientes al aviso (a partir del ${fmtDate(c.startDate)}).` : 'Las multas están desactivadas. Actívalas en «Ajustes».'}</Empty> :
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="card"><h3>Por jugador</h3>
        <div className="fine-pl">{byPlayer.map(x => <button key={x.id} className={player === x.id ? 'on' : ''} onClick={() => setPlayer(player === x.id ? null : x.id)}>
          <Avatar name={x.name} fileId={x.photo} /><span className="fp-n">{x.name}<small>{x.n} multa{x.n === 1 ? '' : 's'}{x.paid ? ` · pagado ${eur(x.paid)}` : ''}</small></span>
          <b className={x.pend ? 'due' : ''}>{eur(x.pend)}</b></button>)}</div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>Importe pendiente de cada jugador. Toca uno para ver solo sus multas.</p></div>
      <div className="card"><div className="row between" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>{player ? byPlayer.find(x => x.id === player)?.name : 'Detalle'}</h3>
        <Seg value={st} onChange={setSt} options={[{ value: 'pendiente', label: 'Pendientes' }, { value: 'pagada', label: 'Pagadas' }, { value: 'anulada', label: 'Anuladas' }, { value: '', label: 'Todas' }]} /></div>
        {!shown.length ? <p className="muted small">No hay multas en esta vista.</p> : <div className="list">{shown.map(f => <div key={f.id} className="lrow fine-row" style={{ cursor: 'default' }}>
          <span className="lrow-main"><span className="lrow-t">{player ? fmtDate(f.date, { weekday: 'long', day: 'numeric', month: 'short' }) : f.player_name}</span>
            <span className="lrow-s">{player ? f.reason : `${fmtDate(f.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${f.reason}`}{f.note ? ` · ${f.note}` : ''}</span></span>
          <b className="fine-amt">{eur(f.amount)}</b>
          <span className="fine-st" style={{ '--c': ST[f.status][1] }}>{ST[f.status][0]}</span>
          {!ro && <span className="fine-act">{f.status === 'pendiente' ? <><button className="btn sm" onClick={() => setAct({ f, status: 'pagada' })}>Pagada</button><button className="btn sm ghost" onClick={() => setAct({ f, status: 'anulada' })}>Anular</button></>
            : <button className="btn sm ghost" onClick={() => setAct({ f, status: 'pendiente' })}>Reabrir</button>}</span>}
        </div>)}</div>}
      </div>
    </div>}

    {act && <FineAction {...act} onClose={() => setAct(null)} onDone={() => { d.reload(); toast(act.status === 'pagada' ? 'Multa marcada como pagada' : act.status === 'anulada' ? 'Multa anulada' : 'Multa reabierta'); }} />}
    {cfg && s.data && <FineCfg v0={s.data.fines} rpeTime={c.rpeTime} onClose={() => setCfg(false)} onSaved={() => { s.reload(); d.reload(); }} />}
  </div>;
}

function FineAction({ f, status, onClose, onDone }) {
  const [note, setNote] = useState(f.note || '');
  const [err, setErr] = useState(null);
  const title = { pagada: 'Marcar como pagada', anulada: 'Anular multa', pendiente: 'Reabrir multa' }[status];
  return <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className={'btn ' + (status === 'anulada' ? 'danger' : 'primary')} onClick={async () => {
    try { await api.put('/team/fines/' + f.id, { status, note }); onDone(); onClose(); } catch (e) { setErr(e.message); }
  }}>{title}</button></>}>
    <p style={{ marginTop: 0 }}><b>{f.player_name}</b> · entrenamiento del {fmtDate(f.date)} · {eur(f.amount)}</p>
    <Field label={status === 'anulada' ? 'Motivo de la anulación' : 'Nota (opcional)'}><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={status === 'anulada' ? 'p. ej. no entrenó, problema con la app…' : ''} /></Field>
    <ErrorBox error={err} />
  </Modal>;
}

function FineCfg({ v0, rpeTime, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({ enabled: true, reminder: true, amount: 2, startDate: '', reminderHours: 23, fineHours: 24, ...v0 });
  const [err, setErr] = useState(null);
  return <Modal title="Ajustes de multas" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { await api.put('/settings/fines', { value: { ...v, amount: Number(v.amount), reminderHours: Number(String(v.reminderHours).replace(',', '.')), fineHours: Number(String(v.fineHours).replace(',', '.')) } }); toast('Ajustes guardados'); onSaved(); onClose(); } catch (e) { setErr(e.message); }
  }}>Guardar</button></>}>
    <div className="stack">
      <label className="check"><input type="checkbox" checked={v.enabled} onChange={e => setV({ ...v, enabled: e.target.checked })} /> Generar multas por RPE no registrado</label>
      <label className="check"><input type="checkbox" checked={v.reminder} onChange={e => setV({ ...v, reminder: e.target.checked })} /> Enviar un último aviso antes de la multa</label>
      <div className="inline-fields">
        <Field label="En vigor desde"><input type="date" value={v.startDate} onChange={e => setV({ ...v, startDate: e.target.value })} /></Field>
        <Field label="Importe por multa (€)"><input type="number" min="0" step="0.5" value={v.amount} onChange={e => setV({ ...v, amount: e.target.value })} /></Field>
      </div>
      <div className="inline-fields">
        <Field label="Último aviso" hint="horas después del aviso de RPE"><input type="number" min="0.5" max="168" step="0.5" value={v.reminderHours} disabled={!v.reminder} onChange={e => setV({ ...v, reminderHours: e.target.value })} /></Field>
        <Field label="Multa" hint="horas después del aviso de RPE"><input type="number" min="1" max="168" step="0.5" value={v.fineHours} onChange={e => setV({ ...v, fineHours: e.target.value })} /></Field>
      </div>
      {(() => { const rh = Number(String(v.reminderHours).replace(',', '.')), fh = Number(String(v.fineHours).replace(',', '.')); const t = rpeTime || '22:00';
        return fh > 0 && <p className="small" style={{ margin: 0 }}>Con el aviso de RPE a las <b>{t}</b>: {v.reminder && rh > 0 && rh < fh ? <>último aviso a las <b>{plusH(t, rh).time}</b> ({dayTxt(plusH(t, rh).day).toLowerCase()}) y </> : null}multa a las <b>{plusH(t, fh).time}</b> ({dayTxt(plusH(t, fh).day).toLowerCase()}) si sigue sin RPE.{v.reminder && rh >= fh ? <span style={{ color: 'var(--rojo)' }}> El último aviso tiene que ser antes que la multa.</span> : null}</p>; })()}
      <p className="small muted" style={{ margin: 0 }}>La hora del aviso de RPE se cambia en Configuración → Avisos. Los cambios de importe solo afectan a las multas nuevas.</p>
      <ErrorBox error={err} />
    </div>
  </Modal>;
}
