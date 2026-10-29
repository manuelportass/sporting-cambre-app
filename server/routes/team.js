'use strict';
// MÓDULO 3 · Preparación física del primer equipo (vistas del preparador físico)
const express = require('express');
const { db, settings, audit, nameKey } = require('../db');
const A = require('../auth');
const L = require('../lib/load');
const T = require('../lib/team');
const { h, bad, notFound, reqDate, optText, reqText, num, oneOf, today, isoWeekday, HttpError } = require('../lib/util');
const { STATUS_LABEL } = require('./injuries');

const r = express.Router();
r.use(A.requireAdmin);

const ATT = ['presente', 'ausente', 'justificada', 'lesionado'];
const fullName = p => `${p.first_name} ${p.last_name}`.trim();

// ================= Sesiones colectivas =================
r.get('/sessions', h((req, res) => {
  const from = reqDate(req.query.from), to = reqDate(req.query.to);
  res.json(db.prepare(`SELECT s.* FROM team_sessions s WHERE s.date BETWEEN ? AND ? ORDER BY s.date`).all(from, to).map(sessionStats));
}));
function cleanSession(b) {
  return { date: reqDate(b.date), session_type: reqText(b.session_type || 'Entrenamiento', 'Tipo', 60), planned_minutes: num(b.planned_minutes, 'Duración prevista', { min: 0, max: 400, int: true }), notes: optText(b.notes, 2000) };
}
r.post('/sessions', h((req, res) => {
  const s = cleanSession(req.body);
  try {
    const info = db.prepare('INSERT INTO team_sessions(date,session_type,planned_minutes,notes) VALUES (@date,@session_type,@planned_minutes,@notes)').run(s);
    audit('team_session', info.lastInsertRowid, 'create', null, s, req.user.id);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Ya existe una sesión de ese tipo en esa fecha.'); throw e; }
}));
r.post('/sessions/generate', h((req, res) => {
  const from = reqDate(req.body.from), to = reqDate(req.body.to);
  if (L.diffDays(from, to) > 200 || to < from) throw bad('Rango no válido (máx. 200 días).');
  const days = settings().collectiveDays;
  const minutes = num(req.body.planned_minutes, 'Duración', { min: 0, max: 400, int: true });
  let n = 0;
  for (let d = from; d <= to; d = L.addDays(d, 1)) {
    if (!days.includes(isoWeekday(d))) continue;
    n += db.prepare("INSERT OR IGNORE INTO team_sessions(date,session_type,planned_minutes) VALUES (?, 'Entrenamiento', ?)").run(d, minutes).changes;
  }
  audit('team_session', null, 'generate', null, { from, to, n }, req.user.id);
  res.json({ ok: true, created: n });
}));
r.put('/sessions/:id', h((req, res) => {
  const before = db.prepare('SELECT * FROM team_sessions WHERE id=?').get(req.params.id);
  if (!before) throw notFound();
  const s = cleanSession(req.body);
  db.prepare('UPDATE team_sessions SET date=@date, session_type=@session_type, planned_minutes=@planned_minutes, notes=@notes WHERE id=@id').run({ ...s, id: before.id });
  audit('team_session', before.id, 'update', before, s, req.user.id);
  res.json({ ok: true });
}));
r.delete('/sessions/:id', h((req, res) => {
  const s = db.prepare('SELECT * FROM team_sessions WHERE id=?').get(req.params.id);
  if (!s) throw notFound();
  db.prepare('DELETE FROM team_sessions WHERE id=?').run(s.id);
  audit('team_session', s.id, 'delete', s, null, req.user.id);
  res.json({ ok: true });
}));
r.get('/sessions/:id', h((req, res) => {
  const s = db.prepare('SELECT * FROM team_sessions WHERE id=?').get(req.params.id);
  if (!s) throw notFound();
  const players = T.seniorPlayers().map(p => {
    const a = db.prepare('SELECT * FROM team_attendance WHERE session_id=? AND player_id=?').get(s.id, p.id);
    const rpe = db.prepare("SELECT * FROM load_entries WHERE player_id=? AND status='valido' AND kind='colectivo' AND (team_session_id=? OR (team_session_id IS NULL AND date=?))").get(p.id, s.id, s.date);
    return { player_id: p.id, name: fullName(p), photo_file_id: p.photo_file_id, attendance: a?.status || null, note: a?.note || null, availability: T.availability(p, s.date), rpe };
  });
  res.json({ session: sessionStats(s), players });
}));
r.post('/sessions/:id/attendance', h((req, res) => {
  const s = db.prepare('SELECT * FROM team_sessions WHERE id=?').get(req.params.id);
  if (!s) throw notFound();
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
  db.transaction(() => {
    for (const it of items) {
      const pid = num(it.player_id, 'Jugador', { required: true, int: true });
      if (it.status === null || it.status === '') { db.prepare('DELETE FROM team_attendance WHERE session_id=? AND player_id=?').run(s.id, pid); continue; }
      const st = oneOf(it.status, ATT, 'Estado');
      const before = db.prepare('SELECT * FROM team_attendance WHERE session_id=? AND player_id=?').get(s.id, pid);
      db.prepare(`INSERT INTO team_attendance(session_id,player_id,status,note) VALUES (?,?,?,?)
        ON CONFLICT(session_id,player_id) DO UPDATE SET status=excluded.status, note=excluded.note`).run(s.id, pid, st, optText(it.note, 1000));
      audit('team_attendance', s.id, 'set', before || null, { player_id: pid, status: st }, req.user.id);
    }
  })();
  res.json({ ok: true });
}));

// Medias de la sesión (RPE, minutos y carga) con los registros válidos
const sessionEntries = s => db.prepare(`SELECT * FROM load_entries l WHERE l.status='valido' AND l.kind=? AND (l.team_session_id=? OR (l.team_session_id IS NULL AND l.date=?))`)
  .all(s.session_type === 'Partido' ? 'partido' : 'colectivo', s.id, s.date);
function sessionStats(s) {
  const e = sessionEntries(s);
  const avg = k => (e.length ? Math.round((e.reduce((a, x) => a + Number(x[k]), 0) / e.length) * 10) / 10 : null);
  return { ...s, rpe_count: e.length, avg_rpe: s.session_type === 'Partido' ? null : avg('rpe'), avg_minutes: avg('duration_min'), avg_load: avg('load_au'),
    presentes: db.prepare("SELECT COUNT(*) n FROM team_attendance WHERE session_id=? AND status='presente'").get(s.id).n };
}

// ================= Registros de carga =================
r.get('/load', h((req, res) => {
  const from = reqDate(req.query.from), to = reqDate(req.query.to);
  let sql = `SELECT l.*, p.first_name, p.last_name FROM load_entries l JOIN players p ON p.id=l.player_id WHERE l.date BETWEEN ? AND ?`;
  const args = [from, to];
  if (req.query.player_id) { sql += ' AND l.player_id=?'; args.push(Number(req.query.player_id)); }
  if (req.query.include_void !== '1') sql += " AND l.status='valido'";
  sql += ' ORDER BY l.date DESC, l.id DESC';
  res.json(db.prepare(sql).all(...args).map(x => ({ ...x, player_name: fullName(x) })));
}));

function insertLoad(o, userId) {
  const load = L.sessionLoad(o.duration_min, o.rpe);
  if (load === null) throw bad('Duración o RPE no válidos.');
  const info = db.prepare(`INSERT INTO load_entries(player_id,date,kind,session_type,description,duration_min,rpe,load_au,notes,team_session_id,match_id,created_by)
    VALUES (@player_id,@date,@kind,@session_type,@description,@duration_min,@rpe,@load_au,@notes,@team_session_id,@match_id,@created_by)`)
    .run({ description: null, team_session_id: null, match_id: null, ...o, load_au: load, created_by: userId });
  return info.lastInsertRowid;
}
// Carga de partido automática: RPE fijo (10 por defecto) × minutos jugados según el acta/estadísticas.
// Sustituye cualquier carga de partido previa de ese jugador en esa fecha (p. ej. del histórico del formulario).
function syncMatchLoad(matchId, userId) {
  const m = db.prepare('SELECT * FROM matches WHERE id=?').get(matchId);
  if (!m) return;
  const rpe = settings().load.matchRpe ?? 10;
  db.prepare("INSERT OR IGNORE INTO team_sessions(date,session_type,track_missing) VALUES (?, 'Partido', 0)").run(m.date);
  const ts = db.prepare("SELECT id FROM team_sessions WHERE date=? AND session_type='Partido'").get(m.date);
  // anula las cargas automáticas anteriores de este partido
  db.prepare("UPDATE load_entries SET status='anulado' WHERE match_id=? AND kind='partido' AND status='valido'").run(m.id);
  for (const s of db.prepare('SELECT * FROM match_stats WHERE match_id=?').all(m.id)) {
    db.prepare("UPDATE load_entries SET status='anulado' WHERE player_id=? AND date=? AND kind='partido' AND status='valido'").run(s.player_id, m.date);
    if (!s.minutes) continue;
    insertLoad({ player_id: s.player_id, date: m.date, kind: 'partido', session_type: 'Partido', description: `vs ${m.opponent}`,
      duration_min: s.minutes, rpe, notes: `Automático: RPE ${rpe} × ${s.minutes} min jugados (${s.source === 'manual' ? 'estadísticas' : 'acta'})`, team_session_id: ts.id, match_id: m.id }, userId);
  }
}

function cleanLoad(b) {
  return {
    player_id: num(b.player_id, 'Jugador', { required: true, int: true }),
    date: reqDate(b.date),
    kind: oneOf(b.kind || 'colectivo', ['colectivo', 'adicional', 'partido'], 'Tipo'),
    session_type: reqText(b.session_type || 'Entrenamiento', 'Tipo de sesión', 80),
    description: optText(b.description, 500),
    duration_min: num(b.duration_min, 'Duración', { required: true, min: 0, max: 400 }),
    rpe: num(b.rpe, 'RPE', { required: true, min: 0, max: 10 }),
    notes: reqText(b.notes, 'Observaciones', 2000),
    team_session_id: b.team_session_id ? Number(b.team_session_id) : null,
    match_id: b.match_id ? Number(b.match_id) : null,
  };
}
r.post('/load', h((req, res) => {
  const o = cleanLoad(req.body);
  const id = insertLoad(o, req.user.id);
  audit('load_entry', id, 'create_admin', null, o, req.user.id);
  res.json({ ok: true, id });
}));
// Corrección trazable: el registro original se anula y se crea uno nuevo enlazado
r.post('/load/:id/correct', h((req, res) => {
  const old = db.prepare('SELECT * FROM load_entries WHERE id=?').get(req.params.id);
  if (!old || old.status !== 'valido') throw notFound('Registro no encontrado o ya anulado.');
  const reason = reqText(req.body.reason, 'Motivo de la corrección', 500);
  let newId = null;
  db.transaction(() => {
    if (!req.body.voidOnly) newId = insertLoad({ ...cleanLoad({ ...old, ...req.body.changes, player_id: old.player_id }) }, req.user.id);
    db.prepare("UPDATE load_entries SET status='anulado', superseded_by=? WHERE id=?").run(newId, old.id);
  })();
  audit('load_entry', old.id, req.body.voidOnly ? 'void' : 'correct', old, { newId, reason }, req.user.id);
  res.json({ ok: true, id: newId });
}));

r.get('/wellness', h((req, res) => {
  const from = reqDate(req.query.from), to = reqDate(req.query.to);
  const cfg = settings().wellness;
  let sql = "SELECT w.*, p.first_name, p.last_name FROM wellness_entries w JOIN players p ON p.id=w.player_id WHERE w.status='valido' AND w.date BETWEEN ? AND ?";
  const args = [from, to];
  if (req.query.player_id) { sql += ' AND w.player_id=?'; args.push(Number(req.query.player_id)); }
  sql += ' ORDER BY w.date DESC';
  res.json(db.prepare(sql).all(...args).map(w => {
    const scores = JSON.parse(w.scores);
    return { ...w, scores, player_name: fullName(w), summary: L.wellnessSummary(scores, cfg) };
  }));
}));
r.post('/wellness/:id/void', h((req, res) => {
  const w = db.prepare('SELECT * FROM wellness_entries WHERE id=?').get(req.params.id);
  if (!w || w.status !== 'valido') throw notFound();
  const reason = reqText(req.body.reason, 'Motivo', 500);
  db.prepare("UPDATE wellness_entries SET status='anulado' WHERE id=?").run(w.id);
  audit('wellness_entry', w.id, 'void', w, { reason }, req.user.id);
  res.json({ ok: true });
}));

// ================= Solicitudes de corrección de jugadores =================
r.get('/corrections', h((req, res) => {
  const rows = db.prepare(`SELECT c.*, p.first_name, p.last_name FROM correction_requests c JOIN players p ON p.id=c.player_id
    WHERE (? = '' OR c.status = ?) ORDER BY c.id DESC`).all(req.query.status || '', req.query.status || '');
  res.json(rows.map(c => {
    const orig = c.entity === 'load' ? db.prepare('SELECT * FROM load_entries WHERE id=?').get(c.entity_id) : db.prepare('SELECT * FROM wellness_entries WHERE id=?').get(c.entity_id);
    return { ...c, player_name: fullName(c), proposed: JSON.parse(c.proposed), original: orig ? { ...orig, scores: orig.scores ? JSON.parse(orig.scores) : undefined } : null };
  }));
}));
r.post('/corrections/:id/resolve', h((req, res) => {
  const c = db.prepare('SELECT * FROM correction_requests WHERE id=?').get(req.params.id);
  if (!c || c.status !== 'pendiente') throw notFound('Solicitud no encontrada o ya resuelta.');
  const approve = !!req.body.approve;
  db.transaction(() => {
    if (approve) {
      const prop = JSON.parse(c.proposed);
      if (c.entity === 'load') {
        const old = db.prepare('SELECT * FROM load_entries WHERE id=?').get(c.entity_id);
        if (!old || old.status !== 'valido') throw bad('El registro original ya no es válido.');
        let newId = null;
        if (!prop.delete) newId = insertLoad(cleanLoad({ ...old, ...prop, player_id: old.player_id }), req.user.id);
        db.prepare("UPDATE load_entries SET status='anulado', superseded_by=? WHERE id=?").run(newId, old.id);
      } else {
        const old = db.prepare('SELECT * FROM wellness_entries WHERE id=?').get(c.entity_id);
        if (!old || old.status !== 'valido') throw bad('El registro original ya no es válido.');
        let newId = null;
        if (!prop.delete) {
          const scores = { ...JSON.parse(old.scores), ...(prop.scores || {}) };
          newId = db.prepare('INSERT INTO wellness_entries(player_id,date,scores,notes,created_by) VALUES (?,?,?,?,?)')
            .run(old.player_id, old.date, JSON.stringify(scores), prop.notes || old.notes, req.user.id).lastInsertRowid;
        }
        db.prepare("UPDATE wellness_entries SET status='anulado', superseded_by=? WHERE id=?").run(newId, old.id);
      }
    }
    db.prepare("UPDATE correction_requests SET status=?, resolved_by=?, resolved_at=datetime('now') WHERE id=?").run(approve ? 'aprobada' : 'rechazada', req.user.id, c.id);
  })();
  audit('correction', c.id, approve ? 'approve' : 'reject', c, null, req.user.id);
  res.json({ ok: true });
}));

// ================= Dashboard =================
function seasonOf(date) { const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)); return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`; }

function lastTests(playerId) {
  return db.prepare(`SELECT t.name, t.fields, r.values_json, r.date FROM test_results r JOIN test_types t ON t.id=r.test_type_id
    WHERE r.player_id=? AND r.id IN (SELECT MAX(id) FROM test_results WHERE player_id=? GROUP BY test_type_id) ORDER BY t.id`).all(playerId, playerId)
    .map(x => ({ name: x.name, date: x.date, fields: JSON.parse(x.fields), values: JSON.parse(x.values_json) }));
}
// Entrenamientos asistidos / totales en la temporada (hasta la fecha). Cuenta como asistido el RPE enviado
// (o registrado por el preparador) o la asistencia marcada «presente»; los RPE de relleno no cuentan.
const FILL = 'Relleno automático';
function seasonStart(date) { const [a] = seasonOf(date).split('/'); return `${a}-07-01`; }
function trainingAttendance(playerId, date, detail = false) {
  const to = date < today() ? date : today(), from = seasonStart(date);
  const ses = db.prepare("SELECT id, date FROM team_sessions WHERE session_type!='Partido' AND date BETWEEN ? AND ?").all(from, to);
  const real = new Set(db.prepare("SELECT date FROM load_entries WHERE player_id=? AND kind='colectivo' AND status='valido' AND COALESCE(description,'')!=? AND date BETWEEN ? AND ?").all(playerId, FILL, from, to).map(x => x.date));
  const att = new Map(db.prepare("SELECT a.session_id, a.status FROM team_attendance a JOIN team_sessions t ON t.id=a.session_id WHERE a.player_id=? AND t.date BETWEEN ? AND ?").all(playerId, from, to).map(x => [x.session_id, x.status]));
  const attended = ses.filter(x => real.has(x.date) || att.get(x.id) === 'presente').length;
  const justified = ses.filter(x => !real.has(x.date) && ['justificada', 'lesionado'].includes(att.get(x.id))).length;
  const out = { attended, total: ses.length, justified, pct: ses.length ? Math.round((attended / ses.length) * 100) : null, from };
  if (detail) {
    const fill = new Set(db.prepare("SELECT date FROM load_entries WHERE player_id=? AND kind='colectivo' AND status='valido' AND description=? AND date BETWEEN ? AND ?").all(playerId, FILL, from, to).map(x => x.date));
    out.list = ses.sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ date: x.date,
      status: real.has(x.date) || att.get(x.id) === 'presente' ? 'asistio' : ['justificada', 'lesionado'].includes(att.get(x.id)) ? 'justificada' : att.get(x.id) === 'ausente' ? 'ausente' : fill.has(x.date) ? 'relleno' : 'sin_dato' }));
  }
  return out;
}
// Partidos jugados en la temporada: oficiales (con acta) y amistosos (histórico), según las cargas de partido
function matchCount(playerId, date) {
  const to = date < today() ? date : today(), from = seasonStart(date);
  const rows = db.prepare("SELECT l.date, l.duration_min, l.session_type, l.match_id FROM load_entries l WHERE l.player_id=? AND l.kind='partido' AND l.status='valido' AND l.date BETWEEN ? AND ? ORDER BY l.date").all(playerId, from, to);
  const off = rows.filter(r => r.match_id || r.session_type !== 'Amistoso');
  return { played: rows.length, official: off.length, friendly: rows.length - off.length, minutes: rows.reduce((a, r) => a + (r.duration_min || 0), 0),
    list: rows.map(r => ({ date: r.date, minutes: r.duration_min, type: r.session_type === 'Amistoso' ? 'Amistoso' : 'Oficial' })) };
}
function seasonStats(playerId, season) {
  return db.prepare(`SELECT COUNT(*) AS convocatorias, SUM(CASE WHEN COALESCE(ms.minutes,0)>0 THEN 1 ELSE 0 END) AS partidos, SUM(COALESCE(ms.minutes,0)) AS minutos,
      SUM(CASE WHEN ms.started=1 THEN 1 ELSE 0 END) AS titularidades, SUM(CASE WHEN ms.started IS NULL THEN 1 ELSE 0 END) AS tit_sin_dato,
      SUM(COALESCE(ms.goals,0)) AS goles, SUM(ms.assists) AS asistencias, SUM(COALESCE(ms.yellow,0)) AS amarillas, SUM(COALESCE(ms.red,0)) AS rojas
    FROM match_stats ms JOIN matches m ON m.id=ms.match_id WHERE ms.player_id=? AND m.season=?`).get(playerId, season);
}

r.get('/dashboard', h((req, res) => {
  const date = req.query.date ? reqDate(req.query.date) : today();
  const s = settings();
  const season = seasonOf(date);
  const from28 = L.addDays(date, -27);
  const players = T.seniorPlayers();
  const sessions28 = db.prepare('SELECT * FROM team_sessions WHERE date BETWEEN ? AND ? AND date <= ?').all(from28, date, today());
  const isTrainingDay = !!db.prepare("SELECT 1 FROM team_sessions WHERE date=? AND session_type!='Partido'").get(date);
  const pm = postMatch(date);
  const pmBy = new Map(pm.groups.flatMap(g => g.players.map(x => [x.player_id, { minutes: x.minutes, called: x.called, group: g.key, focus: g.focus }])));
  const rows = players.map(p => {
    const series = T.playerSeries(p.id, L.addDays(date, -13), date);
    const ind = T.indicators(series, s);
    const att = db.prepare(`SELECT a.status FROM team_attendance a JOIN team_sessions t ON t.id=a.session_id WHERE a.player_id=? AND t.date BETWEEN ? AND ?`).all(p.id, from28, date);
    const marked = att.length;
    const presentes = att.filter(a => a.status === 'presente').length;
    const lastRpe = db.prepare("SELECT date, rpe, duration_min, load_au, kind FROM load_entries WHERE player_id=? AND status='valido' AND date<=? ORDER BY date DESC, id DESC LIMIT 1").get(p.id, date);
    const lw = db.prepare("SELECT date, scores FROM wellness_entries WHERE player_id=? AND status='valido' AND date<=? ORDER BY date DESC, id DESC LIMIT 1").get(p.id, date);
    const wellness = lw ? { date: lw.date, ...L.wellnessSummary(JSON.parse(lw.scores), s.wellness) } : null;
    const todayWell = !!db.prepare("SELECT 1 FROM wellness_entries WHERE player_id=? AND status='valido' AND date=?").get(p.id, date);
    const missing = T.missingDates(p.id, from28, date);
    return {
      player_id: p.id, name: fullName(p), photo_file_id: p.photo_file_id, position: p.position,
      availability: T.availability(p, date),
      attendance: { sessions: sessions28.length, marked, presentes, pct: marked ? Math.round((presentes / marked) * 100) : null },
      lastRpe, wellness, wellnessToday: todayWell,
      indicators: ind, trend: series.map(x => ({ date: x.date, dayLoad: x.dayLoad, acwr: x.acwr })),
      missing,
      stats: seasonStats(p.id, season),
      postMatch: pmBy.get(p.id) || null,
      trainings: trainingAttendance(p.id, date), matchesPlayed: (({ list, ...m }) => m)(matchCount(p.id, date)),
      tests: lastTests(p.id),
    };
  });
  const nextMatch = db.prepare('SELECT * FROM matches WHERE date >= ? ORDER BY date LIMIT 1').get(date) || null;
  const lastMatch = db.prepare('SELECT * FROM matches WHERE date < ? AND goals_for IS NOT NULL ORDER BY date DESC LIMIT 1').get(date) || null;
  const alerts = [];
  for (const x of rows) {
    if (x.missing.length) alerts.push({ level: 'warn', player_id: x.player_id, text: `${x.name}: ${x.missing.length} RPE pendiente(s) en los últimos 28 días (${x.missing.slice(-3).join(', ')})` });
    if (isTrainingDay && !x.wellnessToday && x.availability.code !== 'no_disponible') alerts.push({ level: 'info', player_id: x.player_id, text: `${x.name}: wellness de hoy sin registrar` });
    if (!x.tests.length) alerts.push({ level: 'info', player_id: x.player_id, text: `${x.name}: sin tests físicos registrados` });
  }
  const pendingCorrections = db.prepare("SELECT COUNT(*) n FROM correction_requests WHERE status='pendiente'").get().n;
  if (pendingCorrections) alerts.unshift({ level: 'warn', text: `${pendingCorrections} solicitud(es) de corrección pendiente(s) de revisar` });
  if (!players.length) alerts.unshift({ level: 'info', text: 'No hay jugadores en el primer equipo. Añádelos en Jugadores (categoría «Primer equipo sénior»).' });
  const sessionsWeek = db.prepare('SELECT * FROM team_sessions WHERE date BETWEEN ? AND ? ORDER BY date').all(L.addDays(date, -6), L.addDays(date, 7));
  res.json({ date, season, rows, nextMatch, lastMatch, alerts, sessionsWeek, postMatch: { match: pm.match && { date: pm.match.date, opponent: pm.match.opponent, matchday: pm.match.matchday, goals_for: pm.match.goals_for, goals_against: pm.match.goals_against }, missingActa: pm.missingActa }, settings: { acwrBands: s.acwrBands, load: s.load, weeklyChangeBands: s.weeklyChangeBands } });
}));

// Serie de carga y ficha completa de un jugador
r.get('/players/:id/load', h((req, res) => {
  const to = req.query.to ? reqDate(req.query.to) : today();
  const from = req.query.from ? reqDate(req.query.from) : L.addDays(to, -55);
  if (L.diffDays(from, to) > 400) throw bad('Rango máximo de 400 días.');
  const series = T.playerSeries(Number(req.params.id), from, to);
  const s = settings();
  res.json({ series: series.map(x => ({ ...x, acwrColor: L.acwrColor(x.acwr, s.acwrBands) })), indicators: T.indicators(series, s), settings: { load: s.load, acwrBands: s.acwrBands } });
}));

r.get('/players/:id/summary', h((req, res) => {
  const p = db.prepare('SELECT * FROM players WHERE id=?').get(req.params.id);
  if (!p) throw notFound();
  const priv = db.prepare('SELECT * FROM player_private WHERE player_id=?').get(p.id) || {};
  const { age } = require('./injuries');
  const painStats = db.prepare('SELECT COUNT(*) n, ROUND(AVG(eva),1) avg, MAX(eva) max FROM injury_pain WHERE injury_id=?');
  const lastPain = db.prepare('SELECT eva, date FROM injury_pain WHERE injury_id=? ORDER BY date DESC, id DESC LIMIT 1');
  const injuries = db.prepare(`SELECT i.id, i.injury_date, i.zone, i.diagnosis, i.laterality, i.injury_type, i.mechanism, i.status, i.closed_at, i.return_training_date, i.return_match_date, f.name AS phase_name
    FROM injuries i LEFT JOIN rehab_phases f ON f.id=i.phase_id WHERE i.player_id=? ORDER BY i.injury_date DESC`).all(p.id)
    .map(i => ({ ...i, status_label: STATUS_LABEL[i.status], days: L.diffDays(i.injury_date, i.closed_at || today()), pain: { ...painStats.get(i.id), last: lastPain.get(i.id) || null },
      entries: db.prepare('SELECT COUNT(*) n FROM injury_entries WHERE injury_id=?').get(i.id).n }));
  const att = db.prepare(`SELECT t.date, t.session_type, a.status FROM team_sessions t LEFT JOIN team_attendance a ON a.session_id=t.id AND a.player_id=? WHERE t.date <= ? ORDER BY t.date DESC LIMIT 60`).all(p.id, today());
  const matches = db.prepare(`SELECT m.*, ms.minutes, ms.started, ms.goals, ms.assists, ms.yellow, ms.red, ms.called_up, ms.source AS stat_source
    FROM match_stats ms JOIN matches m ON m.id=ms.match_id WHERE ms.player_id=? ORDER BY m.date DESC`).all(p.id);
  const tests = db.prepare(`SELECT r.*, t.name, t.fields FROM test_results r JOIN test_types t ON t.id=r.test_type_id WHERE r.player_id=? ORDER BY r.date DESC`).all(p.id)
    .map(x => ({ ...x, fields: JSON.parse(x.fields), values: JSON.parse(x.values_json) }));
  res.json({
    player: { ...p, custom: JSON.parse(p.custom || '{}'), full_name: fullName(p), age: priv.birth_date ? age(priv.birth_date) : (priv.age ?? null), age_input: priv.age ?? null, birth_date: priv.birth_date || null, weight_kg: priv.weight_kg ?? null },
    availability: T.availability(p), injuries, attendance: att, matches, tests,
    trainings: trainingAttendance(p.id, today(), true), matchesPlayed: matchCount(p.id, today()), stats: seasonStats(p.id, seasonOf(today())),
    seasons: [...new Set(matches.map(m => m.season))],
  });
}));

// ================= Partidos =================
r.get('/matches', h((req, res) => {
  const season = req.query.season;
  const rows = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM match_stats s WHERE s.match_id=m.id) AS stat_rows FROM matches m WHERE (? IS NULL OR m.season=?) ORDER BY m.date DESC`).all(season || null, season || null);
  res.json(rows);
}));
r.get('/seasons', (req, res) => res.json(db.prepare('SELECT DISTINCT season FROM matches ORDER BY season DESC').all().map(x => x.season)));
function cleanMatch(b) {
  const date = reqDate(b.date);
  return {
    season: (b.season && /^\d{4}\/\d{4}$/.test(b.season)) ? b.season : seasonOf(date),
    competition: optText(b.competition, 120), matchday: optText(b.matchday, 40), date,
    opponent: reqText(b.opponent, 'Rival', 120),
    home_away: b.home_away ? oneOf(b.home_away, ['local', 'visitante'], 'Local/visitante') : null,
    goals_for: num(b.goals_for, 'Goles a favor', { min: 0, max: 99, int: true }),
    goals_against: num(b.goals_against, 'Goles en contra', { min: 0, max: 99, int: true }),
    duration_min: num(b.duration_min, 'Duración', { min: 1, max: 150, int: true }) || 90,
    notes: optText(b.notes, 2000),
  };
}
r.post('/matches', h((req, res) => {
  const m = cleanMatch(req.body);
  const dup = db.prepare('SELECT id FROM matches WHERE season=? AND date=? AND opponent=?').get(m.season, m.date, m.opponent);
  if (dup) throw new HttpError(409, 'Ya existe ese partido (misma fecha y rival).');
  const info = db.prepare(`INSERT INTO matches(season,competition,matchday,date,opponent,home_away,goals_for,goals_against,duration_min,notes,source)
    VALUES (@season,@competition,@matchday,@date,@opponent,@home_away,@goals_for,@goals_against,@duration_min,@notes,'manual')`).run(m);
  audit('match', info.lastInsertRowid, 'create', null, m, req.user.id);
  res.json({ ok: true, id: info.lastInsertRowid });
}));
r.put('/matches/:id', h((req, res) => {
  const before = db.prepare('SELECT * FROM matches WHERE id=?').get(req.params.id);
  if (!before) throw notFound();
  const m = cleanMatch(req.body);
  db.prepare(`UPDATE matches SET season=@season,competition=@competition,matchday=@matchday,date=@date,opponent=@opponent,home_away=@home_away,
    goals_for=@goals_for,goals_against=@goals_against,duration_min=@duration_min,notes=@notes,updated_at=datetime('now') WHERE id=@id`).run({ ...m, id: before.id });
  audit('match', before.id, 'update', before, m, req.user.id);
  if (before.date !== m.date) syncMatchLoad(before.id, req.user.id);
  res.json({ ok: true });
}));
r.delete('/matches/:id', h((req, res) => {
  const m = db.prepare('SELECT * FROM matches WHERE id=?').get(req.params.id);
  if (!m) throw notFound();
  db.prepare("SELECT id FROM files WHERE owner_type='match' AND owner_id=?").all(m.id).forEach(f => require('./core').removeFile(f.id));
  db.prepare('DELETE FROM matches WHERE id=?').run(m.id);
  audit('match', m.id, 'delete', m, null, req.user.id);
  res.json({ ok: true });
}));
r.get('/matches/:id', h((req, res) => {
  const m = db.prepare('SELECT * FROM matches WHERE id=?').get(req.params.id);
  if (!m) throw notFound();
  const stats = db.prepare('SELECT s.*, p.first_name, p.last_name FROM match_stats s JOIN players p ON p.id=s.player_id WHERE match_id=?').all(m.id).map(x => ({ ...x, name: fullName(x) }));
  const squad = T.seniorPlayers().map(p => ({ id: p.id, name: fullName(p) }));
  const files = db.prepare("SELECT id, original_name, mime, size, uploaded_at FROM files WHERE owner_type='match' AND owner_id=? ORDER BY id DESC").all(m.id);
  res.json({ match: m, stats, squad, files });
}));
function cleanStat(s) {
  return {
    player_id: num(s.player_id, 'Jugador', { required: true, int: true }),
    called_up: s.called_up === false || s.called_up === 0 ? 0 : 1,
    started: s.started === null || s.started === undefined || s.started === '' ? null : (s.started ? 1 : 0),
    minutes: num(s.minutes, 'Minutos', { min: 0, max: 150, int: true }),
    goals: num(s.goals, 'Goles', { min: 0, max: 20, int: true }) || 0,
    assists: num(s.assists, 'Asistencias', { min: 0, max: 20, int: true }),
    yellow: num(s.yellow, 'Amarillas', { min: 0, max: 2, int: true }) || 0,
    red: num(s.red, 'Rojas', { min: 0, max: 1, int: true }) || 0,
  };
}
// Edición manual de estadísticas de un partido
r.put('/matches/:id/stats', h((req, res) => {
  const m = db.prepare('SELECT * FROM matches WHERE id=?').get(req.params.id);
  if (!m) throw notFound();
  const list = Array.isArray(req.body.stats) ? req.body.stats.map(cleanStat) : [];
  db.transaction(() => {
    const keep = new Set(list.map(x => x.player_id));
    for (const old of db.prepare('SELECT * FROM match_stats WHERE match_id=?').all(m.id)) if (!keep.has(old.player_id)) {
      db.prepare('DELETE FROM match_stats WHERE id=?').run(old.id);
      audit('match_stat', old.id, 'delete', old, null, req.user.id);
    }
    for (const s of list) {
      const before = db.prepare('SELECT * FROM match_stats WHERE match_id=? AND player_id=?').get(m.id, s.player_id);
      db.prepare(`INSERT INTO match_stats(match_id,player_id,called_up,started,minutes,goals,assists,yellow,red,source) VALUES (@match_id,@player_id,@called_up,@started,@minutes,@goals,@assists,@yellow,@red,'manual')
        ON CONFLICT(match_id,player_id) DO UPDATE SET called_up=excluded.called_up, started=excluded.started, minutes=excluded.minutes, goals=excluded.goals, assists=excluded.assists, yellow=excluded.yellow, red=excluded.red, source='manual', updated_at=datetime('now')`)
        .run({ ...s, match_id: m.id });
      audit('match_stat', m.id, before ? 'update' : 'create', before || null, s, req.user.id);
    }
    syncMatchLoad(m.id, req.user.id);
  })();
  res.json({ ok: true });
}));

// ---------- Importación de partidos (CSV/Excel) ----------
// Filas: { fecha, rival, competicion, jornada, local_visitante, goles_favor, goles_contra, jugador, titular, minutos, goles, asistencias, amarillas, rojas }
function matchPlayer(name, squad) {
  const key = nameKey(name);
  if (!key) return { player_id: null, how: 'vacío' };
  const alias = db.prepare('SELECT player_id FROM player_aliases WHERE alias_key=?').get(key);
  if (alias) return { player_id: alias.player_id, how: 'alias guardado' };
  const exact = squad.filter(p => p.key === key);
  if (exact.length === 1) return { player_id: exact[0].id, how: 'nombre exacto' };
  const tokens = key.split(' ');
  // Un token de una letra (inicial, p. ej. «Miguel A.») coincide con cualquier palabra que empiece igual
  const has = (words, t) => words.some(w => w === t || (t.length === 1 && w.startsWith(t)) || (w.length === 1 && t.startsWith(w)));
  let cands = squad.filter(p => tokens.every(t => has(p.key.split(' '), t)));
  if (cands.length === 1) return { player_id: cands[0].id, how: 'coincidencia parcial', check: true };
  // Las actas usan nombre y dos apellidos: el perfil (nombre + un apellido) está contenido en el nombre del acta
  const rev = squad.filter(p => p.key.split(' ').every(t => has(tokens, t)));
  const revSenior = rev.filter(p => p.senior);
  const pick = rev.length === 1 ? rev : revSenior.length === 1 ? revSenior : null;
  if (pick) {
    const initials = pick[0].key.split(' ').some(t => t.length === 1);
    return { player_id: pick[0].id, how: 'nombre del acta', check: initials };
  }
  if (rev.length > 1) cands = rev;
  return { player_id: null, how: cands.length > 1 ? `ambiguo (${cands.length} posibles)` : 'sin coincidencia', candidates: cands.map(c => c.id) };
}
const toBool = v => { if (v === undefined || v === null || v === '') return null; const k = nameKey(v); return ['si', 's', '1', 'true', 'x', 'titular'].includes(k) ? true : ['no', 'n', '0', 'false', 'suplente'].includes(k) ? false : null; };
function excelDate(v) {
  if (typeof v === 'number') return L.iso(new Date(Date.UTC(1899, 11, 30) + v * 864e5));
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
r.post('/matches/import/preview', h((req, res) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows) || !rows.length) throw bad('El archivo no contiene filas.');
  const sid = T.seniorId();
  const squadAll = db.prepare('SELECT id, first_name, last_name, category_id FROM players WHERE active=1 ORDER BY (category_id = ?) DESC, last_name').all(sid)
    .map(p => ({ id: p.id, name: fullName(p), key: nameKey(fullName(p)), senior: p.category_id === sid }));
  const groups = new Map();
  const errors = [];
  rows.forEach((row, i) => {
    const date = excelDate(row.fecha);
    const opponent = String(row.rival || '').trim();
    if (!date || !opponent) { errors.push(`Fila ${i + 2}: falta la fecha o el rival.`); return; }
    const k = date + '|' + nameKey(opponent);
    if (!groups.has(k)) {
      const season = row.temporada && /^\d{4}\/\d{4}$/.test(row.temporada) ? row.temporada : (req.body.season || seasonOf(date));
      const existing = db.prepare('SELECT * FROM matches WHERE date=? AND opponent=?').get(date, opponent);
      groups.set(k, {
        key: k, date, opponent, season, competition: row.competicion || req.body.competition || null, matchday: row.jornada ? String(row.jornada) : null,
        home_away: row.local_visitante ? (nameKey(row.local_visitante).startsWith('v') ? 'visitante' : 'local') : null,
        goals_for: row.goles_favor === undefined || row.goles_favor === '' ? null : Number(row.goles_favor),
        goals_against: row.goles_contra === undefined || row.goles_contra === '' ? null : Number(row.goles_contra),
        existing_id: existing?.id || null, stats: [],
      });
    }
    const g = groups.get(k);
    if (row.jugador) {
      const mp = matchPlayer(row.jugador, squadAll);
      const stat = {
        source_name: String(row.jugador).trim(), ...mp,
        started: toBool(row.titular), minutes: row.minutos === '' || row.minutos === undefined ? null : Number(row.minutos),
        goals: Number(row.goles || 0), assists: row.asistencias === '' || row.asistencias === undefined ? null : Number(row.asistencias),
        yellow: Number(row.amarillas || 0), red: Number(row.rojas || 0),
      };
      if (g.stats.some(x => x.player_id && x.player_id === stat.player_id)) stat.duplicate = true;
      if (g.existing_id && mp.player_id) {
        const cur = db.prepare('SELECT * FROM match_stats WHERE match_id=? AND player_id=?').get(g.existing_id, mp.player_id);
        if (cur) {
          const diff = ['minutes', 'goals', 'assists', 'yellow', 'red'].filter(f => stat[f] !== null && cur[f] !== null && Number(cur[f]) !== Number(stat[f]));
          stat.existing = cur; stat.conflict = cur.source === 'manual' && diff.length > 0; stat.diff = diff;
        }
      }
      g.stats.push(stat);
    }
  });
  res.json({ matches: [...groups.values()], errors, squad: squadAll.map(({ id, name }) => ({ id, name })) });
}));
r.post('/matches/import/commit', h((req, res) => {
  const list = req.body.matches;
  if (!Array.isArray(list)) throw bad('Datos no válidos.');
  const sourceLabel = optText(req.body.source, 200) || 'importación de archivo';
  let createdM = 0, updatedM = 0, statsW = 0, statsSkipped = 0;
  const matchIds = [];
  db.transaction(() => {
    for (const g of list) {
      if (g.skip) continue;
      const m = cleanMatch(g);
      let id = g.existing_id;
      if (id) {
        const cur = db.prepare('SELECT * FROM matches WHERE id=?').get(id);
        const upd = {};
        for (const f of ['competition', 'matchday', 'home_away', 'goals_for', 'goals_against']) if (m[f] !== null && m[f] !== undefined && (cur[f] === null || g.overwriteMatch)) upd[f] = m[f];
        if (Object.keys(upd).length) db.prepare(`UPDATE matches SET ${Object.keys(upd).map(k => `${k}=@${k}`)}, source_ref=@ref, updated_at=datetime('now') WHERE id=@id`).run({ ...upd, ref: sourceLabel, id });
        updatedM++;
      } else {
        id = db.prepare(`INSERT INTO matches(season,competition,matchday,date,opponent,home_away,goals_for,goals_against,duration_min,source,source_ref)
          VALUES (@season,@competition,@matchday,@date,@opponent,@home_away,@goals_for,@goals_against,@duration_min,'importacion',@ref)`).run({ ...m, ref: sourceLabel }).lastInsertRowid;
        createdM++;
      }
      for (const s of g.stats || []) {
        if (!s.player_id || s.skip || s.duplicate) { statsSkipped++; continue; }
        // Guardamos el alias si el preparador corrigió/confirmó la asociación
        if (s.source_name) db.prepare('INSERT OR REPLACE INTO player_aliases(alias_key,player_id) VALUES (?,?)').run(nameKey(s.source_name), s.player_id);
        const cur = db.prepare('SELECT * FROM match_stats WHERE match_id=? AND player_id=?').get(id, s.player_id);
        if (cur && cur.source === 'manual' && !s.overwrite) { statsSkipped++; continue; } // nunca se sobrescribe lo manual sin confirmar
        const st = cleanStat(s);
        db.prepare(`INSERT INTO match_stats(match_id,player_id,called_up,started,minutes,goals,assists,yellow,red,source) VALUES (@match_id,@player_id,1,@started,@minutes,@goals,@assists,@yellow,@red,'importacion')
          ON CONFLICT(match_id,player_id) DO UPDATE SET started=excluded.started, minutes=excluded.minutes, goals=excluded.goals, assists=excluded.assists, yellow=excluded.yellow, red=excluded.red, source='importacion', updated_at=datetime('now')`)
          .run({ ...st, match_id: id });
        statsW++;
      }
      audit('match', id, 'import', null, { source: sourceLabel }, req.user.id);
      syncMatchLoad(id, req.user.id);
      matchIds.push(Number(id));
    }
  })();
  res.json({ ok: true, createdMatches: createdM, updatedMatches: updatedM, statsWritten: statsW, statsSkipped, matchIds });
}));

// ================= Histórico de RPE (formulario de Google, 27/07–25/10/2026) =================
const RPE_SEED = require('path').join(__dirname, '..', 'seed', 'rpe-historico-2026.json');
function readRpeSeed() { return JSON.parse(require('fs').readFileSync(RPE_SEED, 'utf8')); }
function rosterIds(names) {
  const map = new Map(db.prepare('SELECT id, first_name, last_name FROM players').all().map(p => [nameKey(fullName(p)), p.id]));
  return Object.fromEntries(names.map(n => [n, map.get(nameKey(n)) || null]));
}
r.get('/seed/rpe-history', h((req, res) => {
  const seed = readRpeSeed();
  const names = [...new Set([...seed.entries.map(e => e.player), ...seed.match.stats.map(s => s.player)])];
  const ids = rosterIds(names);
  const imported = db.prepare("SELECT COUNT(*) n FROM load_entries WHERE description LIKE 'Histórico formulario%'").get().n;
  res.json({ source: seed.source, sessions: seed.sessions.length, entries: seed.entries.length, players: names.length, missing: names.filter(n => !ids[n]), imported,
    rules: seed.rules || [], incidents: seed.incidents || [], match: { date: seed.match.date, opponent: seed.match.opponent } });
}));
r.post('/seed/rpe-history', h((req, res) => {
  const seed = readRpeSeed();
  const ids = rosterIds([...new Set([...seed.entries.map(e => e.player), ...seed.match.stats.map(s => s.player)])]);
  if (!Object.values(ids).some(Boolean)) throw bad('Primero carga el listado de jugadores (Jugadores → Cargar listado 2026/27).');
  let sessions = 0, entries = 0, skipped = 0;
  db.transaction(() => {
    for (const s of seed.sessions) sessions += db.prepare('INSERT OR IGNORE INTO team_sessions(date,session_type,planned_minutes,notes,track_missing) VALUES (?,?,?,?,1)')
      .run(s.date, s.type, s.type === 'Entrenamiento' ? Math.round(s.planned_minutes || 90) : null, s.label === 'Amistoso' ? 'Amistoso' : 'Importada del formulario').changes;
    // Partido J1 con el acta oficial
    const a = seed.match;
    let m = db.prepare('SELECT * FROM matches WHERE date=? AND opponent=?').get(a.date, a.opponent);
    if (!m) {
      const id = db.prepare(`INSERT INTO matches(season,competition,matchday,date,opponent,home_away,goals_for,goals_against,source,source_ref) VALUES (?,?,?,?,?,?,?,?,'importacion','Acta Futgal J1')`)
        .run(a.season, a.competition, a.matchday, a.date, a.opponent, a.home_away, a.goals_for, a.goals_against).lastInsertRowid;
      m = { id };
    }
    for (const st of a.stats) {
      const pid = ids[st.player]; if (!pid) continue;
      const cur = db.prepare('SELECT * FROM match_stats WHERE match_id=? AND player_id=?').get(m.id, pid);
      if (cur && cur.source === 'manual') continue;
      db.prepare(`INSERT INTO match_stats(match_id,player_id,called_up,started,minutes,goals,assists,yellow,red,source) VALUES (?,?,1,?,?,?,NULL,?,?,'importacion')
        ON CONFLICT(match_id,player_id) DO UPDATE SET started=excluded.started, minutes=excluded.minutes, goals=excluded.goals, yellow=excluded.yellow, red=excluded.red`)
        .run(m.id, pid, st.started, st.minutes, st.goals, st.yellow, st.red);
    }
    syncMatchLoad(m.id, req.user.id);
    for (const e of seed.entries) {
      const pid = ids[e.player]; if (!pid) { skipped++; continue; }
      const kind = e.type === 'Partido' ? 'partido' : e.type === 'Adicional' ? 'adicional' : 'colectivo';
      if (db.prepare("SELECT 1 FROM load_entries WHERE player_id=? AND date=? AND kind=? AND status='valido'").get(pid, e.date, kind)) { skipped++; continue; }
      // Si hay acta del partido, mandan sus minutos (aunque el jugador no jugara)
      if (kind === 'partido' && db.prepare('SELECT 1 FROM match_stats ms JOIN matches m ON m.id=ms.match_id WHERE ms.player_id=? AND m.date=?').get(pid, e.date)) { skipped++; continue; }
      const ts = kind === 'adicional' ? null : db.prepare('SELECT id FROM team_sessions WHERE date=? AND session_type=?').get(e.date, e.type);
      insertLoad({ player_id: pid, date: e.date, kind, session_type: e.label || e.type, description: 'Histórico formulario', duration_min: e.minutes, rpe: e.rpe, notes: e.notes, team_session_id: ts?.id || null }, req.user.id);
      entries++;
    }
  })();
  audit('load_entry', null, 'import_history', null, { sessions, entries, skipped }, req.user.id);
  res.json({ ok: true, sessions, entries, skipped });
}));

// Sesión post-partido (martes): grupos según los minutos del último partido con acta.
// 70–90′ → recuperación · 30–69′ → compensación parcial · 0–29′ (o no convocado) → compensación.
const CAL = require('../seed/calendario-2026-2027.json');
const PM_GROUPS = [
  { key: 'alto', range: '70–90 min', min: 70, max: 999, focus: 'Recuperación', text: 'Han soportado la carga completa del partido: sesión regenerativa, volumen y densidad bajos, sin estímulos de alta intensidad.' },
  { key: 'medio', range: '30–70 min', min: 30, max: 69, focus: 'Compensación parcial', text: 'Carga de partido incompleta: recuperación activa al inicio y una parte de compensación de volumen moderado.' },
  { key: 'bajo', range: '0–30 min', min: 0, max: 29, focus: 'Compensación', text: 'Apenas han tenido carga competitiva: compensar con trabajo de alta intensidad y volumen (esfuerzos de alta velocidad, juego reducido).' },
];
function postMatch(date) {
  const m = db.prepare('SELECT m.* FROM matches m WHERE m.date <= ? AND EXISTS (SELECT 1 FROM match_stats s WHERE s.match_id=m.id) ORDER BY m.date DESC LIMIT 1').get(date);
  const lastFixture = [...CAL.fixtures].reverse().find(f => f.date <= date) || null;
  const missingActa = lastFixture && (!m || m.date < lastFixture.date) ? lastFixture : null;
  if (!m) return { match: null, missingActa, groups: [], excluded: [] };
  const stats = new Map(db.prepare('SELECT * FROM match_stats WHERE match_id=?').all(m.id).map(x => [x.player_id, x]));
  const groups = PM_GROUPS.map(g => ({ ...g, players: [] }));
  const excluded = [];
  for (const p of T.seniorPlayers()) {
    const st = stats.get(p.id);
    const av = T.availability(p, date);
    const row = { player_id: p.id, name: fullName(p), photo_file_id: p.photo_file_id, position: p.position, minutes: st?.minutes || 0, called: !!st && st.called_up !== 0, started: st?.started ?? null, availability: av };
    if (av.value === 'lesionado') { excluded.push({ ...row, reason: 'Lesionado' }); continue; }
    groups.find(g => row.minutes >= g.min && row.minutes <= g.max).players.push(row);
  }
  for (const g of groups) g.players.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
  const fx = CAL.fixtures.find(f => f.date === m.date);
  return { match: { ...m, matchday: fx?.matchday || m.matchday }, missingActa, groups, excluded, daysSince: L.diffDays(m.date, date) };
}
r.get('/post-match', h((req, res) => res.json(postMatch(req.query.date ? reqDate(req.query.date) : today()))));

// Relleno de RPE: cada entrenamiento colectivo sin RPE se completa como si el jugador hubiera participado
// (por defecto RPE 5 × 90′). No toca a quien está marcado ausente, justificado o lesionado. Se puede deshacer.
r.get('/fill-missing', h((req, res) => {
  const n = db.prepare("SELECT COUNT(*) n FROM load_entries WHERE description=? AND status='valido'").get(FILL).n;
  res.json({ filled: n, pending: fillCandidates().length });
}));
function fillCandidates() {
  // Mismo criterio que los «RPE pendientes»: sesiones colectivas sin RPE, sin ausencia marcada ni lesión en curso
  const out = [];
  for (const p of T.seniorPlayers()) for (const date of T.missingDates(p.id, '2000-01-01', today())) {
    const ses = db.prepare("SELECT * FROM team_sessions WHERE date=? AND session_type!='Partido' ORDER BY id LIMIT 1").get(date);
    if (ses) out.push({ p, ses });
  }
  return out;
}
r.post('/fill-missing', h((req, res) => {
  const rpe = num(req.body.rpe ?? 5, 'RPE', { min: 0, max: 10, int: true }), minutes = num(req.body.minutes ?? 90, 'Duración', { min: 1, max: 300 });
  let created = 0;
  db.transaction(() => {
    for (const { p, ses } of fillCandidates()) {
      insertLoad({ player_id: p.id, date: ses.date, kind: 'colectivo', session_type: ses.session_type, description: FILL, duration_min: minutes, rpe,
        notes: `Sin registro del jugador: se asume que entrenó (RPE ${rpe} × ${minutes}′).`, team_session_id: ses.id }, req.user.id);
      created++;
    }
  })();
  audit('load_entry', null, 'fill_missing', null, { rpe, minutes, created }, req.user.id);
  res.json({ ok: true, created });
}));
r.post('/fill-missing/undo', h((req, res) => {
  const n = db.prepare("UPDATE load_entries SET status='anulado' WHERE description=? AND status='valido'").run(FILL).changes;
  audit('load_entry', null, 'fill_missing_undo', null, { voided: n }, req.user.id);
  res.json({ ok: true, voided: n });
}));

// Actas y documentos del partido (privados)
const core = require('./core');
r.post('/matches/:id/files', core.upload.single('file'), h((req, res) => {
  const m = db.prepare('SELECT * FROM matches WHERE id=?').get(req.params.id);
  if (!m) throw notFound();
  if (!req.file) throw bad('Selecciona un archivo.');
  const id = core.saveFile(req.file, 'match', m.id, req.user.id);
  audit('match', m.id, 'file_upload', null, { file: req.file.originalname }, req.user.id);
  res.json({ ok: true, id });
}));
r.delete('/matches/files/:fid', h((req, res) => {
  const f = db.prepare("SELECT * FROM files WHERE id=? AND owner_type='match'").get(req.params.fid);
  if (!f) throw notFound();
  core.removeFile(f.id);
  audit('match', f.owner_id, 'file_delete', { file: f.original_name }, null, req.user.id);
  res.json({ ok: true });
}));

// Estadísticas agregadas por jugador (partido, mes, temporada)
r.get('/stats', h((req, res) => {
  const { season, month, player_id } = req.query;
  let where = 'WHERE 1=1';
  const p = {};
  if (season) { where += ' AND m.season=@season'; p.season = season; }
  if (month) { where += " AND substr(m.date,1,7)=@month"; p.month = month; }
  if (player_id) { where += ' AND ms.player_id=@pid'; p.pid = Number(player_id); }
  const rows = db.prepare(`SELECT ms.player_id, pl.first_name, pl.last_name, COUNT(*) AS convocatorias,
      SUM(CASE WHEN COALESCE(ms.minutes,0)>0 THEN 1 ELSE 0 END) AS partidos, SUM(COALESCE(ms.minutes,0)) AS minutos,
      SUM(CASE WHEN ms.started=1 THEN 1 ELSE 0 END) AS titularidades, SUM(CASE WHEN ms.started IS NULL THEN 1 ELSE 0 END) AS tit_sin_dato,
      SUM(COALESCE(ms.goals,0)) AS goles, SUM(ms.assists) AS asistencias, SUM(CASE WHEN ms.assists IS NULL THEN 1 ELSE 0 END) AS asis_sin_dato,
      SUM(COALESCE(ms.yellow,0)) AS amarillas, SUM(COALESCE(ms.red,0)) AS rojas
    FROM match_stats ms JOIN matches m ON m.id=ms.match_id JOIN players pl ON pl.id=ms.player_id ${where}
    GROUP BY ms.player_id ORDER BY minutos DESC`).all(p);
  res.json(rows.map(x => ({ ...x, name: fullName(x) })));
}));

// ================= Tests físicos =================
r.get('/test-types', (req, res) => res.json(db.prepare('SELECT * FROM test_types WHERE active=1 ORDER BY family, id').all().map(t => ({ ...t, fields: JSON.parse(t.fields) }))));
function cleanType(b) {
  const fields = Array.isArray(b.fields) ? b.fields.map((f, i) => ({
    key: String(f.key || `campo${i + 1}`).replace(/[^a-z0-9_]/gi, '').toLowerCase() || `campo${i + 1}`,
    label: reqText(f.label, 'Nombre del campo', 80), unit: optText(f.unit, 20) || '',
    decimals: num(f.decimals, 'Decimales', { min: 0, max: 4, int: true }) ?? 2,
    better: ['higher', 'lower'].includes(f.better) ? f.better : null,
  })) : [];
  if (!fields.length) throw bad('El test necesita al menos un campo.');
  if (new Set(fields.map(f => f.key)).size !== fields.length) throw bad('Claves de campo duplicadas.');
  return { name: reqText(b.name, 'Nombre del test', 120), family: optText(b.family, 40) || 'otro', fields: JSON.stringify(fields), protocol: optText(b.protocol, 2000) };
}
r.post('/test-types', h((req, res) => {
  const t = cleanType(req.body);
  try {
    const info = db.prepare('INSERT INTO test_types(name,family,fields,protocol) VALUES (@name,@family,@fields,@protocol)').run(t);
    audit('test_type', info.lastInsertRowid, 'create', null, t, req.user.id);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Ya existe un test con ese nombre.'); throw e; }
}));
r.put('/test-types/:id', h((req, res) => {
  const before = db.prepare('SELECT * FROM test_types WHERE id=?').get(req.params.id);
  if (!before) throw notFound();
  const t = cleanType(req.body);
  db.prepare('UPDATE test_types SET name=@name, family=@family, fields=@fields, protocol=@protocol WHERE id=@id').run({ ...t, id: before.id });
  audit('test_type', before.id, 'update', before, t, req.user.id);
  res.json({ ok: true });
}));
r.delete('/test-types/:id', h((req, res) => {
  const t = db.prepare('SELECT * FROM test_types WHERE id=?').get(req.params.id);
  if (!t) throw notFound();
  db.prepare('UPDATE test_types SET active=0 WHERE id=?').run(t.id); // se conserva el historial
  audit('test_type', t.id, 'deactivate', t, null, req.user.id);
  res.json({ ok: true });
}));
r.get('/tests', h((req, res) => {
  let sql = `SELECT r.*, t.name AS test_name, t.fields, p.first_name, p.last_name FROM test_results r JOIN test_types t ON t.id=r.test_type_id JOIN players p ON p.id=r.player_id WHERE 1=1`;
  const p = {};
  if (req.query.type_id) { sql += ' AND r.test_type_id=@t'; p.t = Number(req.query.type_id); }
  if (req.query.player_id) { sql += ' AND r.player_id=@p'; p.p = Number(req.query.player_id); }
  if (req.query.from) { sql += ' AND r.date >= @from'; p.from = req.query.from; }
  if (req.query.to) { sql += ' AND r.date <= @to'; p.to = req.query.to; }
  sql += ' ORDER BY r.date DESC, p.last_name';
  res.json(db.prepare(sql).all(p).map(x => ({ ...x, fields: JSON.parse(x.fields), values: JSON.parse(x.values_json), player_name: fullName(x) })));
}));
function cleanResult(b) {
  const type = db.prepare('SELECT * FROM test_types WHERE id=?').get(b.test_type_id);
  if (!type) throw bad('Test no válido.');
  const fields = JSON.parse(type.fields);
  const values = {};
  for (const f of fields) values[f.key] = num(b.values?.[f.key], f.label, { min: -1e6, max: 1e6 });
  if (Object.values(values).every(v => v === null)) throw bad('Introduce al menos un resultado.');
  return {
    test_type_id: type.id, player_id: num(b.player_id, 'Jugador', { required: true, int: true }), date: reqDate(b.date),
    values_json: JSON.stringify(values), device: optText(b.device, 200), protocol: optText(b.protocol, 2000), conditions: optText(b.conditions, 2000), notes: optText(b.notes, 2000),
  };
}
r.post('/tests', h((req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
  const ids = [];
  db.transaction(() => {
    for (const it of items) {
      const o = cleanResult(it);
      const id = db.prepare(`INSERT INTO test_results(test_type_id,player_id,date,values_json,device,protocol,conditions,notes) VALUES (@test_type_id,@player_id,@date,@values_json,@device,@protocol,@conditions,@notes)`).run(o).lastInsertRowid;
      audit('test_result', id, 'create', null, o, req.user.id);
      ids.push(id);
    }
  })();
  res.json({ ok: true, ids });
}));
r.put('/tests/:id', h((req, res) => {
  const before = db.prepare('SELECT * FROM test_results WHERE id=?').get(req.params.id);
  if (!before) throw notFound();
  const o = cleanResult({ ...req.body, test_type_id: before.test_type_id });
  db.prepare('UPDATE test_results SET player_id=@player_id, date=@date, values_json=@values_json, device=@device, protocol=@protocol, conditions=@conditions, notes=@notes WHERE id=@id').run({ ...o, id: before.id });
  audit('test_result', before.id, 'update', before, o, req.user.id);
  res.json({ ok: true });
}));
r.delete('/tests/:id', h((req, res) => {
  const before = db.prepare('SELECT * FROM test_results WHERE id=?').get(req.params.id);
  if (!before) throw notFound();
  db.prepare('DELETE FROM test_results WHERE id=?').run(before.id);
  audit('test_result', before.id, 'delete', before, null, req.user.id);
  res.json({ ok: true });
}));

module.exports = { postMatch, router: r, seasonOf, seasonStart, insertLoad, cleanLoad, seasonStats, lastTests, syncMatchLoad, trainingAttendance, matchCount };
