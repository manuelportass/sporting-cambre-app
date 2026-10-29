import React from 'react';
import { Loading, PageHead, Tile, useApi } from '../../components/ui';
import { fmtDate, todayISO } from '../../lib/format';

// Portada del primer equipo: un acceso por apartado
export default function TeamHub() {
  const d = useApi('/team/dashboard');
  const users = useApi('/users');
  const ms = useApi(d.data ? '/team/matches?season=' + encodeURIComponent(d.data.season) : null);
  const played = (ms.data || []).filter(m => m.goals_for !== null && m.goals_against !== null);
  const rec = ms.data ? { V: played.filter(m => m.goals_for > m.goals_against).length, E: played.filter(m => m.goals_for === m.goals_against).length, D: played.filter(m => m.goals_for < m.goals_against).length, n: played.length } : null;
  if (d.loading && !d.data) return <Loading />;
  const x = d.data;
  const pending = x?.rows.reduce((n, r) => n + r.missing.length, 0) || 0;
  const unavailable = x?.rows.filter(r => r.availability.code === 'no_disponible').length || 0;
  const nextSession = x?.sessionsWeek.find(s => s.date >= todayISO());
  const corrections = x?.alerts.find(a => /corrección/.test(a.text));
  const accounts = (users.data || []).filter(u => u.role === 'player' && u.active).length;
  return <div>
    <PageHead title="Primer equipo" sub={x ? `Temporada ${x.season}` : null} />
    <div className="tiles">
      <Tile to="/primer-equipo/jugadores" title="Jugadores" value={x?.rows.length ?? '—'}
        hint={[pending ? `${pending} RPE pendientes` : 'Sin RPE pendientes', unavailable ? `${unavailable} no disponibles` : null].filter(Boolean).join(' · ')} color={pending ? 'naranja' : undefined} />
      <Tile to="/primer-equipo/martes" title="Sesión post-partido" value={x?.postMatch?.match ? `J${x.postMatch.match.matchday}` : '—'}
        hint={x?.postMatch?.missingActa ? `Falta el acta de la J${x.postMatch.missingActa.matchday}` : 'Grupos del martes: recuperación o compensación'} color={x?.postMatch?.missingActa ? 'naranja' : undefined} />
      <Tile to="/primer-equipo/sesiones" title="Sesiones" value={nextSession ? fmtDate(nextSession.date, { weekday: 'short', day: 'numeric' }) : '—'}
        hint={corrections ? 'Hay correcciones por revisar' : nextSession ? `Próxima: ${nextSession.session_type}` : 'Programa los entrenamientos'} />
      <Tile to="/primer-equipo/partidos" title="Partidos" value={rec ? `${rec.V}/${rec.E}/${rec.D}` : '—'} hint={rec ? `ganados / empatados / perdidos (${rec.n} partido${rec.n === 1 ? '' : 's'})` : 'Resultados y estadísticas'} />
      <Tile to="/primer-equipo/tests" title="Tests físicos" hint="Registrar y comparar" />
      <Tile to="/primer-equipo/cuentas" title="Cuentas" value={accounts} hint="jugadores con acceso a la app" />
      <Tile to="/primer-equipo/metodologia" title="Cómo se calcula" hint="Fórmulas y colores" />
    </div>
  </div>;
}
