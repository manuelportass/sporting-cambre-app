import React from 'react';
import { Loading, PageHead, Tile, useApi } from '../../components/ui';
import { useReadOnly } from '../../App';
import { addDays, fmtDate, todayISO } from '../../lib/format';

// Portada del primer equipo: un acceso por apartado
export default function TeamHub() {
  const d = useApi('/team/dashboard');
  const ro = useReadOnly();
  const users = useApi(ro ? null : '/users');
  const fines = useApi('/team/fines');
  const today0 = todayISO();
  const wToday = useApi(`/team/wellness?from=${today0}&to=${today0}`);
  const rpeOv = useApi(`/team/rpe-overview?from=${addDays(today0, -13)}&to=${today0}`);
  const lastSes = rpeOv.data?.find(d => d.n > 0) || rpeOv.data?.[0];
  const wAvg = wToday.data?.length ? Math.round(wToday.data.filter(x => x.summary.total != null).reduce((a, x, _, l) => a + x.summary.total / l.length, 0)) : null;
  const finePend = (fines.data?.list || []).filter(f => f.status === 'pendiente');
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
    <PageHead title="Primer equipo" sub={x ? `Temporada ${x.season}${ro ? ' · solo consulta' : ''}` : null} />
    <div className="tiles">
      <Tile to="/primer-equipo/jugadores" title="Jugadores" value={x?.rows.length ?? '—'}
        hint={[pending ? `${pending} RPE pendientes` : 'Sin RPE pendientes', unavailable ? `${unavailable} no disponibles` : null].filter(Boolean).join(' · ')} color={pending ? 'naranja' : undefined} />
      <Tile to="/primer-equipo/martes" title="Sesión post-partido" value={x?.postMatch?.match ? `J${x.postMatch.match.matchday}` : '—'}
        hint={x?.postMatch?.missingActa ? `Falta el acta de la J${x.postMatch.missingActa.matchday}` : 'Grupos del martes: recuperación o compensación'} color={x?.postMatch?.missingActa ? 'naranja' : undefined} />
      <Tile to="/primer-equipo/wellness" title="Wellness" value={wAvg != null ? `${wAvg} %` : '—'} hint={wToday.data ? `Hoy: ${wToday.data.length} de ${x?.rows.length ?? '—'} jugadores han respondido` : 'Respuestas diarias'} />
      <Tile to="/primer-equipo/rpe" title="RPE" value={lastSes?.avg_rpe != null ? String(lastSes.avg_rpe).replace('.', ',') : '—'} hint={lastSes ? `RPE medio · ${fmtDate(lastSes.date, { weekday: 'short', day: 'numeric' })} (${lastSes.n} resp.)` : 'RPE medio de cada sesión'} />
      <Tile to="/primer-equipo/sesiones" title="Sesiones" value={nextSession ? fmtDate(nextSession.date, { weekday: 'short', day: 'numeric' }) : '—'}
        hint={corrections ? 'Hay correcciones por revisar' : nextSession ? `Próxima: ${nextSession.session_type}` : 'Programa los entrenamientos'} />
      <Tile to="/primer-equipo/partidos" title="Partidos" value={rec ? `${rec.V}/${rec.E}/${rec.D}` : '—'} hint={rec ? `ganados / empatados / perdidos (${rec.n} partido${rec.n === 1 ? '' : 's'})` : 'Resultados y estadísticas'} />
      <Tile to="/primer-equipo/tests" title="Tests físicos" hint={ro ? "Resultados y evolución" : "Registrar y comparar"} />
      <Tile to="/primer-equipo/multas" title="Multas" value={fines.data ? `${finePend.reduce((a, f) => a + f.amount, 0).toLocaleString('es-ES')} €` : '—'}
        hint={fines.data ? (finePend.length ? `${finePend.length} pendiente${finePend.length === 1 ? '' : 's'} de pago · RPE fuera de plazo` : 'Sin multas pendientes · RPE fuera de plazo') : 'RPE fuera de plazo'} color={finePend.length ? 'naranja' : undefined} />
      {!ro && <Tile to="/primer-equipo/cuentas" title="Cuentas" value={accounts} hint="jugadores con acceso a la app" />}
      <Tile to="/primer-equipo/metodologia" title="Cómo se calcula" hint="Fórmulas y colores" />
    </div>
  </div>;
}
