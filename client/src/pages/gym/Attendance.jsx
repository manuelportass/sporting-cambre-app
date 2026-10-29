import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { Empty, ErrorBox, Loading, PageHead, Seg, useApi, useToast } from '../../components/ui';
import { WEEKDAYS, addDays, fmtDate, isoWeekday, todayISO } from '../../lib/format';

const weekdayIn = (d, wd) => addDays(d, wd - isoWeekday(d));

// Pantalla 1 del gimnasio: elegir día y franja
export default function Attendance() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const allSlots = useApi('/gym/slots');
  const gymDays = useMemo(() => [...new Set((allSlots.data || []).map(s => s.weekday))].sort(), [allSlots.data]);
  const date = sp.get('date') || todayISO();
  const setDate = d => setSp({ date: d }, { replace: true });
  // Al entrar sin fecha: hoy si hay gimnasio; si no, el último día de gimnasio de la semana
  useEffect(() => {
    if (sp.get('date') || !gymDays.length) return;
    const t = todayISO(), wd = isoWeekday(t);
    if (!gymDays.includes(wd)) { const past = gymDays.filter(d => d < wd); setDate(weekdayIn(t, past.length ? past[past.length - 1] : gymDays[0])); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymDays]);
  const wd = isoWeekday(date);
  const day = useApi('/gym/day?date=' + date);
  return <div>
    <PageHead title="Gimnasio" sub="Elige el día y la franja para pasar lista" actions={<button className="btn" onClick={() => nav('/gimnasio/informe?week=' + date)}>Informe semanal</button>} />
    <div className="row" style={{ marginBottom: 16, gap: 12 }}>
      <button className="btn sm" onClick={() => setDate(addDays(date, -7))} aria-label="Semana anterior">‹</button>
      <b style={{ minWidth: 150, textAlign: 'center' }}>{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</b>
      <button className="btn sm" onClick={() => setDate(addDays(date, 7))} aria-label="Semana siguiente">›</button>
      {gymDays.length > 1 && <Seg value={wd} onChange={d => setDate(weekdayIn(date, d))} options={gymDays.map(d => ({ value: d, label: WEEKDAYS[d] }))} />}
      {date !== todayISO() && <button className="btn sm ghost" onClick={() => setDate(todayISO())}>Hoy</button>}
    </div>
    <ErrorBox error={day.error} retry={day.reload} />
    {day.loading && !day.data ? <Loading /> : !allSlots.data?.length ? <Empty title="No hay franjas configuradas">Carga el listado de la temporada en Jugadores o crea las franjas en Configuración.</Empty> :
      !day.data?.slots.length ? <Empty title={`No hay gimnasio los ${WEEKDAYS[wd].toLowerCase()}`}>Elige otro día.</Empty> :
      <div className="tiles">{day.data.slots.map(s => {
        const st = s.stats, marked = st.previstos - st.pendientes;
        const status = s.session?.cancelled ? 'Cancelada' : !st.previstos ? 'Sin jugadores asignados' : marked === 0 ? 'Sin pasar lista' : st.pendientes ? `${st.pendientes} por marcar` : 'Lista completa';
        return <button key={s.slot.id} className="tile" onClick={() => nav(`/gimnasio/franja/${s.slot.id}?date=${date}`)}>
          <span className="tile-t">{s.slot.start_time}–{s.slot.end_time}</span>
          <span className="tile-h" style={{ textTransform: 'capitalize' }}>{s.slot.label || s.slot.category_name || 'Mixta'}</span>
          <span className="tile-v" style={{ fontSize: 28 }}>{st.presentes}<span className="muted" style={{ fontSize: 18 }}> / {st.previstos}</span></span>
          <span className="tile-h">{status}</span>
          <span className="tile-go" aria-hidden="true">›</span>
        </button>;
      })}</div>}
    <Unassigned slots={allSlots.data || []} onDone={() => { day.reload(); allSlots.reload(); }} />
  </div>;
}

// Jugadores de base sin franja: se asignan con un toque
function Unassigned({ slots, onDone }) {
  const toast = useToast();
  const u = useApi('/gym/unassigned');
  if (!u.data?.length) return null;
  const cats = [...new Set(u.data.map(x => x.category))];
  const assign = async (p, s) => { try { await api.post('/gym/assign', { player_id: p.id, slot_id: s.id }); toast(`${p.name} → ${WEEKDAYS[s.weekday].toLowerCase()} ${s.start_time}`); u.reload(); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return <div className="card unas">
    <div className="row between"><h3 style={{ margin: 0 }}>Sin franja asignada <span className="unas-n">{u.data.length}</span></h3><span className="small muted">Toca la franja a la que va cada jugador</span></div>
    {cats.map(c => { const cs = slots.filter(s => s.category_code === c); const list = u.data.filter(x => x.category === c);
      return <div key={c} className="unas-cat"><div className="unas-h">{list[0].category_name} · {list.length}</div>
        {list.map(p => <div key={p.id} className="unas-row"><span>{p.name}</span><span className="unas-b">{(cs.length ? cs : slots).map(s => <button key={s.id} className="btn sm" onClick={() => assign(p, s)}>{WEEKDAYS[s.weekday].slice(0, 3)} {s.start_time}{s.label ? ` · ${s.label.replace(/^Juvenil /, '')}` : ''}</button>)}</span></div>)}
      </div>; })}
  </div>;
}
