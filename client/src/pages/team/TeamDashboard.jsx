import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, ErrorBox, Loading, PageHead, Seg, useApi } from '../../components/ui';
import { fileUrl } from '../../api';
import { COLOR_HEX, POS_ORDER, fmtNum, posGroup, todayISO } from '../../lib/format';

const AV = { disponible: ['Disponible', '#0ca30c'], limitado: ['Limitado', '#e5a10e'], lesionado: ['Lesionado', '#d03b3b'] };
const initials = n => n.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

// Jugadores del primer equipo: foto, nombre, estado y ACWR. El detalle, al entrar en cada uno.
export default function TeamDashboard() {
  const nav = useNavigate();
  const r = useApi('/team/dashboard?date=' + todayISO());
  const [filter, setFilter] = useState('todos');
  const [order, setOrder] = useState(() => { try { return localStorage.getItem('scpf-order') || 'posicion'; } catch { return 'posicion'; } });
  const setO = v => { setOrder(v); try { localStorage.setItem('scpf-order', v); } catch { /* sin almacenamiento */ } };
  const d = r.data;
  const all = useMemo(() => (d?.rows || []).map(x => ({ ...x, av: x.availability.value || 'disponible' })), [d]);
  const rows = (filter === 'todos' ? all : all.filter(x => x.av === filter)).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const card = x => {
    const a = x.indicators?.acwr; const [al, ac] = AV[x.av];
    return <button key={x.player_id} className="pg" onClick={() => nav('/primer-equipo/jugador/' + x.player_id)}>
      <span className="pg-wrap"><span className="pg-ph">{x.photo_file_id ? <img src={fileUrl(x.photo_file_id)} alt="" /> : <span className="pg-ini">{initials(x.name)}</span>}</span>
        <span className="pg-st" style={{ background: ac }} title={al} /></span>
      <span className="pg-name">{x.name}</span>
      <span className="pg-pos">{posGroup(x.position) || '\u00a0'}</span>
      <span className="pg-acwr" style={{ color: a?.value != null ? COLOR_HEX[a.color] : COLOR_HEX.gris, background: a?.value != null ? COLOR_HEX[a.color] + '18' : '#f1f1ee' }}>ACWR {a?.value != null ? fmtNum(a.value, 2) : 'n/c'}</span>
    </button>;
  };
  return <div style={{ maxWidth: 1200 }}>
    <PageHead back="/primer-equipo" title="Jugadores" actions={<Seg value={order} onChange={setO} options={[{ value: 'posicion', label: 'Por posición' }, { value: 'nombre', label: 'Por nombre' }]} />} />
    <ErrorBox error={r.error} retry={r.reload} />
    {r.loading && !d ? <Loading /> : !all.length ? <Empty title="No hay jugadores en el primer equipo">Carga el listado en Jugadores.</Empty> : <>
      <div className="fpills">
        <button className={filter === 'todos' ? 'on' : ''} onClick={() => setFilter('todos')}>Todos <b>{all.length}</b></button>
        {Object.entries(AV).map(([k, [l, c]]) => <button key={k} className={filter === k ? 'on' : ''} style={{ '--c': c }} onClick={() => setFilter(filter === k ? 'todos' : k)}><i />{l} <b>{all.filter(x => x.av === k).length}</b></button>)}
      </div>
      {!rows.length ? <Empty title="Nadie en este grupo" /> : order === 'nombre' ? <div className="pgrid">{rows.map(card)}</div> :
        [...POS_ORDER, [null, 'Sin posición']].map(([k, label]) => { const l = rows.filter(x => posGroup(x.position) === k); return l.length ? <section key={label} className="psec">
          <h3 className="psec-h">{label}</h3><div className="pgrid">{l.map(card)}</div></section> : null; })}
      <p className="small muted" style={{ marginTop: 14 }}>Punto de color: disponible, limitado o lesionado. ACWR en verde = carga dentro de la zona habitual (0,8–1,3). Toca un jugador para ver su asistencia, partidos, carga y ficha.</p>
    </>}
  </div>;
}
