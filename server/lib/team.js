'use strict';
// Lógica compartida del primer equipo: series de carga, disponibilidad e indicadores.
const { db, settings } = require('../db');
const L = require('./load');
const { today } = require('./util');
const es = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: d }));

const seniorId = () => db.prepare("SELECT id FROM categories WHERE code='senior'").get()?.id;

function seniorPlayers() {
  return db.prepare(`SELECT p.* FROM players p WHERE p.category_id=? AND p.active=1 ORDER BY p.last_name, p.first_name`).all(seniorId());
}

// Periodos de lesión en los que no se espera RPE colectivo
function injuryPeriods(playerId) {
  return db.prepare("SELECT injury_date, return_training_date, closed_at, status FROM injuries WHERE player_id=?").all(playerId)
    .map(i => ({ from: i.injury_date, to: i.return_training_date || i.closed_at || '9999-12-31' }));
}

// Sesiones colectivas a las que el jugador debía asistir y de las que no consta su RPE
function missingDates(playerId, from, to) {
  const t = today();
  const limit = to < t ? to : t;
  const p = db.prepare('SELECT joined_at FROM players WHERE id=?').get(playerId);
  const periods = injuryPeriods(playerId);
  const sessions = db.prepare(`SELECT s.*, a.status AS att FROM team_sessions s
    LEFT JOIN team_attendance a ON a.session_id=s.id AND a.player_id=? WHERE s.date BETWEEN ? AND ?`).all(playerId, from, limit);
  const out = [];
  for (const s of sessions) {
    if (s.session_type === 'Partido') continue; // los partidos se calculan con los minutos del acta
    if (s.track_missing === 0) continue;         // sesiones del histórico importado: la asistencia no consta
    if (p?.joined_at && s.date < p.joined_at) continue;
    if (['ausente', 'justificada', 'lesionado'].includes(s.att)) continue;
    if (periods.some(x => s.date >= x.from && s.date <= x.to)) continue;
    const has = db.prepare("SELECT 1 FROM load_entries WHERE player_id=? AND status='valido' AND kind='colectivo' AND (team_session_id=? OR (team_session_id IS NULL AND date=?))").get(playerId, s.id, s.date);
    if (!has) out.push(s.date);
  }
  return [...new Set(out)];
}

function playerSeries(playerId, from, to) {
  const cfg = settings().load;
  const startNeeded = L.addDays(from, -(cfg.chronicDays + 7));
  const entries = db.prepare("SELECT date, load_au FROM load_entries WHERE player_id=? AND status='valido' AND date <= ? ORDER BY date").all(playerId, to);
  const first = entries[0]?.date;
  const miss = missingDates(playerId, first && first < startNeeded ? first : startNeeded, to);
  return L.computeSeries({ entries, expectedDates: miss, from, to, cfg });
}

function availability(player, date = today()) {
  const inj = db.prepare("SELECT * FROM injuries WHERE player_id=? AND status!='completada' AND injury_date <= ? ORDER BY injury_date DESC LIMIT 1").get(player.id, date);
  if (inj) {
    if (inj.status === 'reincorporacion') return { code: 'limitado', value: 'limitado', label: 'Limitado', source: 'lesion' };
    return { code: 'no_disponible', value: 'lesionado', label: 'Lesionado', source: 'lesion' };
  }
  const v = player.availability === 'lesionado' || player.availability === 'no_disponible' ? 'lesionado' : player.availability === 'limitado' ? 'limitado' : 'disponible';
  return { code: v === 'lesionado' ? 'no_disponible' : v, value: v, label: { disponible: 'Disponible', limitado: 'Limitado', lesionado: 'Lesionado' }[v], source: 'manual' };
}

// Indicadores normalizados para la interfaz (valor, unidad, periodo, color, explicación, evolución)
function indicators(series, s = settings()) {
  const last = series[series.length - 1];
  if (!last) return null;
  const prev = series.length > 7 ? series[series.length - 8] : null;
  const c = s.load;
  const method = c.method === 'ewma' ? `EWMA (λ = 2/(N+1), N = ${c.ewmaAcuteDays} y ${c.ewmaChronicDays} días)` : `Ventanas móviles de ${c.acuteDays} y ${c.chronicDays} días`;
  const pct = (a, b) => (a !== null && b !== null && b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  const weekly = pct(last.acute, prev?.acute ?? null);
  return {
    date: last.date,
    method,
    acute: {
      value: last.acute, unit: last.unit,
      period: c.method === 'ewma' ? `EWMA ${c.ewmaAcuteDays} d` : `${L.addDays(last.date, -(c.acuteDays - 1))} → ${last.date}`,
      color: L.changeColor(weekly, s.weeklyChangeBands),
      change: weekly, previous: prev?.acute ?? null,
      explain: last.acute === null ? last.reasons.join(' · ') : `Variación del ${weekly === null ? '—' : es(weekly) + ' %'} respecto a los 7 días anteriores (color según umbrales de variación semanal).`,
    },
    chronic: {
      value: last.chronic, unit: last.unit, partial: !!last.chronicPartial,
      period: c.method === 'ewma' ? `EWMA ${c.ewmaChronicDays} d` : `${L.addDays(last.date, -(Math.min(last.exposure, c.chronicDays) - 1))} → ${last.date}`,
      color: last.chronic === null ? 'gris' : 'neutro',
      previous: prev?.chronic ?? null,
      explain: last.chronic === null ? last.reasons.join(' · ') : (last.chronicPartial ? `Media semanal calculada con ${last.exposure} días de exposición disponibles.` : 'Media semanal de los últimos 28 días.'),
    },
    acwr: {
      value: last.acwr, unit: 'ratio', period: `${last.date}`,
      color: L.acwrColor(last.acwr, s.acwrBands),
      previous: prev?.acwr ?? null,
      explain: last.acwr === null ? (last.reasons.join(' · ') || 'No calculable') : `Aguda / crónica (${last.unit}). Banda verde configurada: ${s.acwrBands.green.map(x => es(x, 2)).join('–')}.`,
    },
    dayLoad: { value: last.dayLoad, state: last.state, unit: 'UA' },
    missingAcute: last.missingAcute, missingChronic: last.missingChronic,
    computedAt: new Date().toISOString(),
  };
}

module.exports = { seniorId, seniorPlayers, missingDates, playerSeries, availability, indicators, injuryPeriods };
