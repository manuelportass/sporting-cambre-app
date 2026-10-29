import React, { useState } from 'react';
import { api } from '../../api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { PageHead, Tile, useApi, useToast } from '../../components/ui';
import { fmtDateLong, todayISO } from '../../lib/format';

export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const players = useApi('/players');
  const inj = useApi('/injuries/dashboard');
  const team = useApi('/team/dashboard');
  const empty = players.data && players.data.length === 0;
  const pending = team.data?.rows.reduce((n, r) => n + r.missing.length, 0);
  return <div>
    <PageHead eyebrow={fmtDateLong(todayISO())} title={`Hola, ${user.name.split(' ')[0]}`} />
    {empty && <Bootstrap onDone={() => { players.reload(); team.reload(); }} onManual={() => nav('/jugadores?cargar=1')} />}
    <div className="tiles">
      <Tile to="/gimnasio" title="Gimnasio" value={players.data ? players.data.filter(p => ['infantil', 'cadete', 'juvenil'].includes(p.category_code)).length : '—'} hint="jugadores de base · asistencia" />
      <Tile to="/lesiones" title="Lesiones" value={inj.data ? inj.data.activeTotal : '—'} hint="procesos abiertos" color={inj.data?.activeTotal ? 'naranja' : undefined} />
      <Tile to="/primer-equipo" title="Primer equipo" value={team.data ? team.data.rows.length : '—'} hint={pending ? `${pending} RPE pendientes` : 'carga, wellness y partidos'} />
      <Tile to="/jugadores" title="Jugadores" value={players.data ? players.data.length : '—'} hint="fichas de todos los equipos" />
    </div>
  </div>;
}

// Puesta en marcha de la versión publicada: carga en un paso los datos ya preparados de la temporada
function Bootstrap({ onDone, onManual }) {
  const toast = useToast();
  const [step, setStep] = useState(null);
  const run = async () => {
    try {
      setStep('Franjas del gimnasio…'); await api.post('/seed/season/slots');
      setStep('Jugadores…'); const seed = await api.get('/seed/season');
      const pv = await api.post('/players/import/preview', { rows: seed.players }); await api.post('/players/import/commit', { rows: pv.rows });
      setStep('Fotos…'); await api.post('/seed/photos', {});
      setStep('Histórico de RPE y acta J1…'); await api.post('/team/seed/rpe-history');
      setStep('Entrenamientos sin RPE (5 × 90′)…'); await api.post('/team/fill-missing', { rpe: 5, minutes: 90 });
      setStep(null); toast('Datos de la temporada cargados'); onDone();
    } catch (e) { setStep(null); toast(e.message, 'err'); }
  };
  return <div className="alert info" style={{ marginBottom: 16, alignItems: 'center' }}><span>ℹ</span><div style={{ flex: 1 }}>
    <b>Puesta en marcha.</b> Carga de una vez los datos preparados: franjas del gimnasio, los 105 jugadores, las fotos del primer equipo, el histórico de RPE con el acta de la J1 y el relleno de entrenamientos sin RPE.
    {step && <div className="small" style={{ marginTop: 4 }}>Cargando: {step}</div>}</div>
    <button className="btn sm primary" disabled={!!step} onClick={run}>{step ? 'Cargando…' : 'Cargar datos de la temporada'}</button>
    <button className="btn sm ghost" disabled={!!step} onClick={onManual}>Solo el listado</button></div>;
}
