import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useClub } from '../../App';
import { DEMO } from '../../api';
import { Empty, ErrorBox, Loading, MoreMenu, PageHead, useApi, useToast } from '../../components/ui';
import { Crest } from '../Login';
import { exportCSV, exportPDF, exportXLSX } from '../../lib/files';
import { addDays, fmtDate, mondayOf, todayISO } from '../../lib/format';

const STATUS = { pendiente: 'Pendiente', cancelada: 'Sesión cancelada', sin_lista: 'Sin pasar lista' };
const COLS = [{ key: 'weekday', label: 'Día' }, { key: 'time', label: 'Franja' }, { key: 'group', label: 'Grupo' }, { key: 'asis', label: '% asistencia', align: 'right' }, { key: 'aus', label: '% ausencia', align: 'right' }];
const pctTxt = v => (v === undefined || v === null ? null : v.toLocaleString('es-ES') + ' %');
const PST = { presente: ['Presente', '#0ca30c'], ausente: ['Ausente', '#d03b3b'], justificada: ['Ausente (justificada)', '#d03b3b'], pendiente: ['Sin marcar', '#9a9b95'] };
const color = v => (v >= 80 ? 'var(--verde)' : v >= 60 ? 'var(--amarillo)' : 'var(--rojo)');

// Informe semanal del gimnasio: porcentaje de asistencia y ausencia de cada franja
export default function GymReport() {
  const [sp] = useSearchParams();
  const club = useClub();
  const toast = useToast();
  const [week, setWeek] = useState(mondayOf(sp.get('week') || todayISO()));
  const settings = useApi('/settings');
  const r = useApi(`/gym/report?week=${week}`);
  const coach = settings.data?.club?.coachName || 'José Manuel Portas Vázquez';
  const d = r.data;
  const rows = (d?.slotSummary || []).map(x => ({ ...x, asis: pctTxt(x.asistencia) || STATUS[x.status], aus: pctTxt(x.ausencia) || '—' }));
  const days = [...new Set(rows.map(x => x.weekday))];
  const fname = `informe-gimnasio-${week}`;
  const semana = d ? `${fmtDate(d.monday)} – ${fmtDate(d.sunday)}` : '';
  const pdf = async () => {
    try {
      await exportPDF({
        title: 'Informe semanal de asistencia al gimnasio', subtitle: club.name, club: club.name, accent: club.accent,
        meta: [['Semana', semana], ['Preparador físico', coach]],
        sections: [{ title: 'Asistencia por franja horaria', columns: COLS, rows, note: 'Porcentajes sobre los jugadores con la lista pasada en cada franja. Ausencia incluye las ausencias justificadas.' },
          { title: 'Jugadores por franja', text: 'Verde: presente · Rojo: ausente.' },
          ...rows.filter(x => x.players?.length).map(x => ({ small: true, title: `${x.weekday} · ${x.group} · ${x.time}${x.asistencia !== undefined ? ` — ${pctTxt(x.asistencia)} asistencia` : ` — ${STATUS[x.status] || ''}`}`,
            columns: [{ key: 'name', label: 'Jugador' }, { key: 'estado', label: 'Asistencia', colored: true }],
            rows: x.players.map(p => ({ name: p.name, estado: PST[p.status]?.[0] || p.status, _color: PST[p.status]?.[1] })) }))],
        filename: fname + '.pdf',
      });
    } catch (e) { toast('No se pudo generar el PDF: ' + e.message, 'err'); }
  };
  const num = rows.map(x => ({ ...x, asis: x.asistencia ?? STATUS[x.status], aus: x.ausencia ?? '' }));
  return <div style={{ maxWidth: 980 }}>
    <div className="noprint"><PageHead back="/gimnasio" title="Informe semanal" actions={<>
      <MoreMenu items={[
        { label: 'Descargar Excel', onClick: () => exportXLSX([{ name: 'Asistencia por franja', columns: COLS, rows: num }], fname + '.xlsx') },
        { label: 'Descargar CSV', onClick: () => exportCSV(num, COLS, fname + '.csv') },
        !DEMO && { label: 'Imprimir', onClick: () => window.print() },
      ].filter(Boolean)} />
      <button className="btn primary" disabled={!d} onClick={pdf}>Descargar PDF</button></>} /></div>
    <div className="row noprint" style={{ marginBottom: 14, gap: 12 }}>
      <button className="btn sm" onClick={() => setWeek(addDays(week, -7))} aria-label="Semana anterior">‹</button>
      <b>{fmtDate(week, { day: 'numeric', month: 'short' })} – {fmtDate(addDays(week, 6), { day: 'numeric', month: 'short', year: 'numeric' })}</b>
      <button className="btn sm" onClick={() => setWeek(addDays(week, 7))} aria-label="Semana siguiente">›</button>
    </div>
    <ErrorBox error={r.error} />
    {r.loading ? <Loading /> : d && <div className="card gr" style={{ padding: 0 }}>
      <div className="club-band"><Crest size={64} /><div><div className="sub">{club.name}</div><h2 style={{ fontSize: 24 }}>Informe semanal de asistencia al gimnasio</h2></div></div>
      <div className="gr-meta"><div><span>Semana</span><b>{semana}</b></div><div><span>Preparador físico</span><b>{coach}</b></div></div>
      {!rows.length ? <div style={{ padding: 20 }}><Empty title="No hay franjas de gimnasio configuradas" /></div> :
        <div className="gr-days">{days.map(day => <div key={day} className="gr-day"><h3>{day}</h3>
          {rows.filter(x => x.weekday === day).map(x => <div key={x.slot_id} className="gr-slot">
            <div className="gr-h"><b>{x.group}</b><span>{x.time}</span></div>
            {x.asistencia === undefined ? <div className="gr-st">{STATUS[x.status]}</div> : <>
              <div className="gr-bar"><i style={{ width: x.asistencia + '%', background: color(x.asistencia) }} /></div>
              <div className="gr-p"><span><b style={{ color: color(x.asistencia) }}>{pctTxt(x.asistencia)}</b> asistencia</span><span><b>{pctTxt(x.ausencia)}</b> ausencia</span></div>
              {x.status === 'incompleta' && <div className="gr-st small">Lista incompleta</div>}</>}
            {x.players?.length > 0 && <div className="gr-pl">{x.players.map(p => <span key={p.player_id} className={'gr-pp s-' + p.status} title={PST[p.status]?.[0]}><i />{p.name}{p.status === 'justificada' ? ' (J)' : ''}</span>)}</div>}
          </div>)}</div>)}</div>}
      <p className="small muted" style={{ margin: 0, padding: '0 20px 18px' }}><span className="gr-leg s-presente"><i />Presente</span> <span className="gr-leg s-ausente"><i />Ausente</span> <span className="gr-leg s-pendiente"><i />Sin marcar</span> · (J) = ausencia justificada. Porcentajes sobre los jugadores con la lista pasada; la ausencia incluye las justificadas.</p>
    </div>}
  </div>;
}
