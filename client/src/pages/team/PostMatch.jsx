import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Empty, ErrorBox, Loading, PageHead, useApi } from '../../components/ui';
import { Crest } from '../Login';
import { crestOf, teamName } from '../../lib/crests';
import { fmtDate, todayISO } from '../../lib/format';

const STYLE = { alto: { c: '#2a78d6', bg: '#eaf2fc', ic: '↺' }, medio: { c: '#e38b1c', bg: '#fdf3e4', ic: '⇄' }, bajo: { c: '#dc0b11', bg: '#fdeaea', ic: '↑' } };

// Sesión del martes: grupos según los minutos del último partido con acta
export default function PostMatch() {
  const nav = useNavigate();
  const r = useApi('/team/post-match?date=' + todayISO());
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const d = r.data, m = d.match;
  return <div style={{ maxWidth: 1100 }}>
    <PageHead back="/primer-equipo" title="Sesión post-partido" sub="Grupos para el entrenamiento del martes según los minutos jugados" actions={<button className="btn" onClick={() => window.print()}>Imprimir</button>} />
    {d.missingActa && <div className="alert warn" style={{ marginBottom: 14 }}><span>⚠</span><div style={{ flex: 1 }}>Falta el acta de la <b>jornada {d.missingActa.matchday}</b> ({fmtDate(d.missingActa.date)}, {d.missingActa.home_away === 'local' ? 'vs' : 'en'} {teamName(d.missingActa.opponent)}). {m ? <>Los grupos de abajo son del último partido con acta (J{m.matchday}).</> : null}</div>
      <button className="btn sm primary" onClick={() => nav('/primer-equipo/partidos')}>Subir acta</button></div>}
    {!m ? <Empty title="Aún no hay partidos con acta">Sube el acta en Partidos para ver los grupos.</Empty> : <>
      {(() => { const away = m.home_away === 'visitante';
        const us = <div className="pm-team"><Crest size={48} /><b>Sporting Cambre</b></div>;
        const them = <div className="pm-team">{crestOf(m.opponent) ? <img src={crestOf(m.opponent)} alt="" /> : null}<b>{teamName(m.opponent)}</b></div>;
        return <div className="pm-match card">{away ? them : us}
          <div className="pm-score"><small>Jornada {m.matchday} · {fmtDate(m.date, { weekday: 'short', day: 'numeric', month: 'short' })}</small>
            <span>{away ? `${m.goals_against ?? '–'} – ${m.goals_for ?? '–'}` : `${m.goals_for ?? '–'} – ${m.goals_against ?? '–'}`}</span></div>
          {away ? us : them}</div>; })()}
      <div className="pm-groups">{d.groups.map(g => { const st = STYLE[g.key]; return <div key={g.key} className="pm-g card" style={{ borderTopColor: st.c }}>
        <div className="pm-gh"><span className="pm-ic" style={{ background: st.c }}>{st.ic}</span><div><span className="pm-range">{g.range}</span><b style={{ color: st.c }}>{g.focus}</b></div><span className="pm-n" style={{ background: st.bg, color: st.c }}>{g.players.length}</span></div>
        <p className="small muted" style={{ margin: '6px 0 10px' }}>{g.text}</p>
        {!g.players.length ? <p className="small muted">Nadie en este grupo.</p> : <div className="pm-list">{g.players.map(p => <button key={p.player_id} className="pm-p" onClick={() => nav('/primer-equipo/jugador/' + p.player_id)}>
          <Avatar name={p.name} fileId={p.photo_file_id} /><span className="pm-pn">{p.name}<small>{p.called ? (p.started ? 'Titular' : p.started === 0 ? 'Suplente' : 'Convocado') : 'No convocado'}{p.availability.value === 'limitado' ? ' · limitado' : ''}</small></span>
          <span className="pm-min" style={{ color: st.c }}>{p.minutes}′</span></button>)}</div>}
      </div>; })}</div>
      {d.excluded.length > 0 && <div className="card small" style={{ marginTop: 14 }}><b>Fuera de los grupos (lesionados):</b> {d.excluded.map(x => x.name).join(', ')}</div>}
      <p className="small muted" style={{ marginTop: 10 }}>Criterio: 70–90′ recuperación · 30–69′ compensación parcial · 0–29′ o no convocado compensación. Orientativo: ajústalo según el estado de cada jugador.</p>
    </>}
  </div>;
}
