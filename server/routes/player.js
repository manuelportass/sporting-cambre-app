'use strict';
// Pantalla del jugador del primer equipo: solo sus propios datos.
// El player_id se toma SIEMPRE de la sesión, nunca de la petición.
const express = require('express');
const { db, settings, audit } = require('../db');
const A = require('../auth');
const L = require('../lib/load');
const T = require('../lib/team');
const { h, bad, notFound, reqDate, reqText, optText, num, oneOf, today, isoWeekday, HttpError } = require('../lib/util');
const team = require('./team');

const r = express.Router();
r.use(A.requirePlayer);
const pid = req => req.user.player_id;
const WD = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function notFuture(date) { if (date > today()) throw bad('No se pueden registrar fechas futuras.'); }
function notTooOld(date, days = 14) { if (L.diffDays(date, today()) > days) throw bad(`Solo se pueden registrar sesiones de los últimos ${days} días. Si necesitas registrar algo anterior, habla con el preparador físico.`); }

r.get('/profile', h((req, res) => {
  const p = db.prepare('SELECT p.id, p.first_name, p.last_name, p.position, p.dominant_leg, p.photo_file_id, c.name AS category_name FROM players p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?').get(pid(req));
  if (!p) throw notFound();
  const s = settings();
  res.json({ ...p, full_name: `${p.first_name} ${p.last_name}`.trim(), view: s.playerView });
}));

// Estado del día: sesiones programadas y si ya registró RPE/wellness
r.get('/today', h((req, res) => {
  const t = req.query.date ? reqDate(req.query.date) : today();
  const s = settings();
  const sessions = db.prepare('SELECT id, date, session_type, planned_minutes FROM team_sessions WHERE date=?').all(t);
  const match = db.prepare('SELECT id, date, opponent, home_away FROM matches WHERE date=?').get(t) || null;
  const rpe = db.prepare("SELECT * FROM load_entries WHERE player_id=? AND date=? AND status='valido' ORDER BY id").all(pid(req), t);
  const wellness = db.prepare("SELECT * FROM wellness_entries WHERE player_id=? AND date=? AND status='valido'").get(pid(req), t) || null;
  res.json({
    date: t, weekday: WD[isoWeekday(t)], isCollectiveDay: s.collectiveDays.includes(isoWeekday(t)), sessions, match,
    rpe, wellness: wellness ? { ...wellness, scores: JSON.parse(wellness.scores) } : null,
    sessionTypes: s.sessionTypes.filter(t => !/^partido|amistoso/i.test(t)), extraTypes: s.extraTypes, collectiveDays: s.collectiveDays.map(d => WD[d]),
  });
}));

// Sesiones semanales para el RPE: el último martes, jueves y viernes (por defecto) hasta hoy
r.get('/rpe-sessions', h((req, res) => {
  const s = settings(); const t = today();
  const out = s.collectiveDays.slice().sort().map(wd => {
    let d = t; for (let i = 0; i < 7 && isoWeekday(d) !== wd; i++) d = L.addDays(d, -1);
    const ses = db.prepare("SELECT planned_minutes FROM team_sessions WHERE date=? AND session_type!='Partido' LIMIT 1").get(d);
    const done = db.prepare("SELECT session_type, rpe, duration_min, load_au FROM load_entries WHERE player_id=? AND date=? AND kind='colectivo' AND status='valido'").get(pid(req), d) || null;
    return { weekday: WD[wd], date: d, planned_minutes: ses?.planned_minutes || null, done };
  });
  res.json(out);
}));

// A. RPE de sesión colectiva (martes, jueves y viernes por defecto) o de partido
r.post('/rpe', h((req, res) => {
  const s = settings();
  const date = reqDate(req.body.date);
  notFuture(date); notTooOld(date);
  const session_type = reqText(req.body.session_type, 'Tipo de sesión', 80);
  if (/^partido|amistoso/i.test(session_type)) throw bad('La carga de los partidos se calcula automáticamente: RPE 10 × minutos jugados según el acta. No hace falta registrarla.');
  const isMatch = false;
  let match = null, teamSession = null;
  {
    if (!s.collectiveDays.includes(isoWeekday(date))) throw bad(`El RPE solo se registra para las sesiones de ${s.collectiveDays.map(d => WD[d]).join(', ')}. Elige el día de la sesión que hiciste; para otros días usa «Entreno adicional».`);
    if (db.prepare("SELECT 1 FROM load_entries WHERE player_id=? AND date=? AND kind='colectivo' AND status='valido'").get(pid(req), date)) throw new HttpError(409, `Ya registraste el RPE de la sesión del ${WD[isoWeekday(date)]}. Si hay un error, pídele una corrección desde Perfil → Mis registros enviados.`);
    teamSession = db.prepare("SELECT * FROM team_sessions WHERE date=? AND session_type!='Partido' ORDER BY (session_type=?) DESC LIMIT 1").get(date, session_type) || null;
  }
  const o = {
    player_id: pid(req), date, kind: isMatch ? 'partido' : 'colectivo', session_type,
    duration_min: num(req.body.duration_min, 'Duración real', { required: true, min: 1, max: 300 }),
    rpe: num(req.body.rpe, 'RPE', { required: true, min: 0, max: 10, int: true }),
    notes: reqText(req.body.notes, 'Observaciones', 2000),
    team_session_id: teamSession?.id || null, match_id: match?.id || null,
  };
  const dup = db.prepare("SELECT id FROM load_entries WHERE player_id=? AND date=? AND kind=? AND session_type=? AND status='valido'").get(o.player_id, date, o.kind, session_type);
  if (dup) throw new HttpError(409, 'Ya registraste el RPE de esta sesión. Si hay un error, pídele una corrección desde Perfil → Mis registros enviados.');
  const id = team.insertLoad(o, req.user.id);
  audit('load_entry', id, 'create_player', null, o, req.user.id);
  const saved = db.prepare('SELECT * FROM load_entries WHERE id=?').get(id);
  res.json({ ok: true, entry: saved });
}));

// C. Entrenamiento adicional
r.post('/extra', h((req, res) => {
  const date = reqDate(req.body.date);
  notFuture(date); notTooOld(date);
  const o = {
    player_id: pid(req), date, kind: 'adicional',
    session_type: reqText(req.body.session_type, 'Tipo de entrenamiento', 80),
    description: optText(req.body.description, 500),
    duration_min: num(req.body.duration_min, 'Duración', { required: true, min: 1, max: 300 }),
    rpe: num(req.body.rpe, 'RPE', { required: true, min: 0, max: 10, int: true }),
    notes: reqText(req.body.notes, 'Observaciones', 2000),
  };
  const dup = db.prepare("SELECT id FROM load_entries WHERE player_id=? AND date=? AND kind='adicional' AND session_type=? AND duration_min=? AND status='valido'").get(o.player_id, date, o.session_type, o.duration_min);
  if (dup) throw new HttpError(409, 'Ya existe un entrenamiento adicional idéntico ese día (mismo tipo y duración).');
  const id = team.insertLoad(o, req.user.id);
  audit('load_entry', id, 'create_player', null, o, req.user.id);
  res.json({ ok: true, entry: db.prepare('SELECT * FROM load_entries WHERE id=?').get(id) });
}));

// D. Dolor durante la sesión (EVA 0-10) mientras haya un proceso de lesión abierto.
// El jugador solo ve que tiene un proceso abierto y su fase; el resto de la ficha clínica es privada.
const openInjury = playerId => db.prepare(`SELECT i.id, i.injury_date, i.zone, f.name AS phase_name FROM injuries i LEFT JOIN rehab_phases f ON f.id=i.phase_id
  WHERE i.player_id=? AND i.status!='completada' ORDER BY i.injury_date DESC LIMIT 1`).get(playerId) || null;
r.get('/injury', h((req, res) => {
  const i = openInjury(pid(req));
  if (!i) return res.json({ injury: null, pain: [] });
  const pain = db.prepare('SELECT id, date, eva, notes FROM injury_pain WHERE injury_id=? ORDER BY date DESC, id DESC LIMIT 30').all(i.id);
  res.json({ injury: { id: i.id, since: i.injury_date, zone: i.zone, phase: i.phase_name }, pain, today: pain.find(x => x.date === today()) || null });
}));
r.post('/pain', h((req, res) => {
  const i = openInjury(pid(req));
  if (!i) throw bad('No tienes ningún proceso de lesión abierto. Si te has lesionado, avisa al preparador físico.');
  const date = reqDate(req.body.date);
  notFuture(date); notTooOld(date, 7);
  if (date < i.injury_date) throw bad('La fecha es anterior a la lesión.');
  const o = { injury_id: i.id, player_id: pid(req), date, eva: num(req.body.eva, 'Dolor (EVA)', { required: true, min: 0, max: 10, int: true }), notes: reqText(req.body.notes, 'Observaciones sobre el dolor', 2000) };
  if (db.prepare('SELECT 1 FROM injury_pain WHERE injury_id=? AND date=?').get(i.id, date)) throw new HttpError(409, 'Ya registraste el dolor de ese día. Si hay un error, avisa al preparador físico.');
  const id = db.prepare('INSERT INTO injury_pain(injury_id,player_id,date,eva,notes) VALUES (@injury_id,@player_id,@date,@eva,@notes)').run(o).lastInsertRowid;
  audit('injury_pain', id, 'create_player', null, o, req.user.id);
  res.json({ ok: true, id });
}));

// B. Wellness previo al entrenamiento
r.post('/wellness', h((req, res) => {
  const cfg = settings().wellness;
  const date = reqDate(req.body.date);
  notFuture(date); notTooOld(date, 3);
  const scores = {};
  for (const it of cfg.items) scores[it.key] = num(req.body.scores?.[it.key], it.label, { required: true, min: cfg.min, max: cfg.max, int: true });
  const notes = reqText(req.body.notes, 'Observaciones', 2000);
  if (db.prepare("SELECT 1 FROM wellness_entries WHERE player_id=? AND date=? AND status='valido'").get(pid(req), date))
    throw new HttpError(409, 'Ya registraste el wellness de ese día. Si hay un error, solicita una corrección.');
  const id = db.prepare('INSERT INTO wellness_entries(player_id,date,scores,notes,created_by) VALUES (?,?,?,?,?)').run(pid(req), date, JSON.stringify(scores), notes, req.user.id).lastInsertRowid;
  audit('wellness_entry', id, 'create_player', null, { date, scores }, req.user.id);
  res.json({ ok: true, entry: { id, date, scores, notes }, summary: L.wellnessSummary(scores, cfg) });
}));

// D. Historial propio
r.get('/history', h((req, res) => {
  const to = req.query.to ? reqDate(req.query.to) : today();
  const from = req.query.from ? reqDate(req.query.from) : L.addDays(to, -41);
  const cfg = settings().wellness;
  const loads = db.prepare('SELECT id, date, kind, session_type, description, duration_min, rpe, load_au, notes, status, created_at FROM load_entries WHERE player_id=? AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC').all(pid(req), from, to);
  const wells = db.prepare('SELECT id, date, scores, notes, status, created_at FROM wellness_entries WHERE player_id=? AND date BETWEEN ? AND ? ORDER BY date DESC').all(pid(req), from, to)
    .map(w => { const sc = JSON.parse(w.scores); return { ...w, scores: sc, summary: L.wellnessSummary(sc, cfg) }; });
  const corrections = db.prepare('SELECT id, entity, entity_id, reason, status, created_at, resolved_at FROM correction_requests WHERE player_id=? ORDER BY id DESC LIMIT 50').all(pid(req));
  res.json({ from, to, loads, wellness: wells, corrections });
}));

r.get('/load', h((req, res) => {
  const s = settings();
  if (!s.playerView.showLoad) throw new HttpError(403, 'El preparador físico no ha habilitado esta vista.');
  const to = today();
  const series = T.playerSeries(pid(req), L.addDays(to, -41), to);
  // Carga semanal (lunes–domingo) y diaria; el ACWR solo si está habilitado
  res.json({
    series: series.map(x => ({ date: x.date, dayLoad: x.dayLoad, state: x.state, acute: x.acute, ...(s.playerView.showAcwr ? { acwr: x.acwr, acwrColor: L.acwrColor(x.acwr, s.acwrBands) } : {}) })),
    showAcwr: s.playerView.showAcwr, unit: series[0]?.unit,
  });
}));

r.get('/tests', h((req, res) => {
  if (!settings().playerView.showTests) throw new HttpError(403, 'Vista no habilitada.');
  res.json(db.prepare('SELECT r.id, r.date, r.values_json, r.device, t.name, t.fields FROM test_results r JOIN test_types t ON t.id=r.test_type_id WHERE r.player_id=? ORDER BY r.date DESC').all(pid(req))
    .map(x => ({ id: x.id, date: x.date, name: x.name, device: x.device, fields: JSON.parse(x.fields), values: JSON.parse(x.values_json) })));
}));
r.get('/stats', h((req, res) => {
  if (!settings().playerView.showStats) throw new HttpError(403, 'Vista no habilitada.');
  const season = team.seasonOf(today());
  const matches = db.prepare(`SELECT m.date, m.opponent, m.home_away, m.goals_for, m.goals_against, m.competition, ms.minutes, ms.started, ms.goals, ms.assists, ms.yellow, ms.red
    FROM match_stats ms JOIN matches m ON m.id=ms.match_id WHERE ms.player_id=? AND m.season=? ORDER BY m.date DESC`).all(pid(req), season);
  res.json({ season, totals: team.seasonStats(pid(req), season), matches });
}));

// Mi temporada: lo esencial, en datos que el jugador entiende (partidos oficiales con acta y entrenamientos)
r.get('/season', h((req, res) => {
  const t = today(), season = team.seasonOf(t);
  const matches = db.prepare(`SELECT m.id, m.date, m.opponent, m.home_away, m.goals_for, m.goals_against FROM matches m
    WHERE m.season=? AND m.date<=? AND EXISTS (SELECT 1 FROM match_stats s WHERE s.match_id=m.id) ORDER BY m.date DESC`).all(season, t);
  const mine = new Map(db.prepare('SELECT ms.* FROM match_stats ms JOIN matches m ON m.id=ms.match_id WHERE ms.player_id=? AND m.season=?').all(pid(req), season).map(x => [x.match_id, x]));
  const rows = matches.map(m => { const x = mine.get(m.id); return { date: m.date, opponent: m.opponent, home_away: m.home_away, result: m.goals_for !== null ? `${m.goals_for}–${m.goals_against}` : null,
    outcome: m.goals_for === null || m.goals_against === null ? null : m.goals_for > m.goals_against ? 'V' : m.goals_for < m.goals_against ? 'D' : 'E',
    called: !!x && x.called_up !== 0, started: x ? x.started : null, minutes: x?.minutes || 0, goals: x?.goals || 0, yellow: x?.yellow || 0, red: x?.red || 0 }; });
  const called = rows.filter(x => x.called);
  const tr = team.trainingAttendance(pid(req), t);
  res.json({
    season, matchesTotal: rows.length,
    called: called.length, played: rows.filter(x => x.minutes > 0).length,
    starter: called.filter(x => x.started === 1).length, sub: called.filter(x => x.started === 0).length,
    minutes: rows.reduce((a, x) => a + x.minutes, 0), minutesTotal: rows.length * 90,
    goals: rows.reduce((a, x) => a + x.goals, 0), yellow: rows.reduce((a, x) => a + x.yellow, 0), red: rows.reduce((a, x) => a + x.red, 0),
    trainings: { attended: tr.attended, total: tr.total, pct: tr.pct },
    matches: rows.map(m => ({ ...m, matchday: CAL.fixtures.find(f => f.date === m.date)?.matchday || null })),
    next: nextFixture(t),
  });
}));

// Próximo partido según el calendario oficial (solo los del Sporting Cambre). El domingo se muestra el del día;
// desde el lunes, el de la jornada siguiente.
const CAL = require('../seed/calendario-2026-2027.json');
function nextFixture(t) {
  const f = CAL.fixtures.find(x => x.date >= t);
  return f ? { ...f, competition: CAL.competition } : null;
}
r.get('/next-match', h((req, res) => res.json(nextFixture(today()))));

// Mi progreso: carga por semanas comparada con lo habitual, en palabras sencillas
r.get('/progress', h((req, res) => {
  const s = settings(), t = today();
  const out = { view: s.playerView };
  if (s.playerView.showLoad) {
    // Bloques de 7 días hacia atrás desde hoy (el último = los últimos 7 días, como la carga aguda)
    const start = L.addDays(t, -7 * 8 + 1);
    const series = T.playerSeries(pid(req), start, t);
    const weeks = [];
    for (let k = 7; k >= 0; k--) weeks.push({ week: L.addDays(t, -7 * k - 6), end: L.addDays(t, -7 * k), load: 0, sessions: 0 });
    for (const x of series) { const w = weeks.find(k => x.date >= k.week && x.date <= k.end); if (w && x.dayLoad) { w.load += x.dayLoad; w.sessions++; } }
    const cur = weeks[weeks.length - 1], prev = weeks.slice(-5, -1);
    const avg = prev.length ? prev.reduce((a, w) => a + w.load, 0) / prev.length : null;
    const last = series[series.length - 1];
    const ratio = last?.acwr ?? (avg ? cur.load / avg : null);
    // Mensaje según el ACWR (o la semana actual frente a la media de las 4 anteriores si no es calculable)
    const b = s.acwrBands;
    const msg = ratio === null ? { code: 'sin_datos', title: 'Aún no hay datos suficientes', text: 'Registra tu RPE después de cada entrenamiento para ver cómo vas.' }
      : ratio < (b.green?.[0] ?? 0.8) ? { code: 'baja', title: 'Semana más suave de lo habitual', text: 'Estás entrenando menos que en las últimas semanas.' }
      : ratio <= (b.green?.[1] ?? 1.3) ? { code: 'ok', title: 'Carga equilibrada', text: 'Estás entrenando en tu nivel habitual. ¡Sigue así!' }
      : { code: 'alta', title: 'Semana más exigente de lo habitual', text: 'Estás acumulando más carga que en las últimas semanas. Descansa bien y cuéntale al preparador cómo te sientes.' };
    out.load = { weeks, current: cur.load, average: avg, message: msg, ...(s.playerView.showAcwr ? { acwr: last?.acwr ?? null } : {}) };
  }
  // Wellness: media de los últimos 7 días frente a los 7 anteriores
  const cfg = s.wellness;
  const w = db.prepare("SELECT date, scores FROM wellness_entries WHERE player_id=? AND status='valido' AND date BETWEEN ? AND ? ORDER BY date").all(pid(req), L.addDays(t, -27), t)
    .map(x => ({ date: x.date, total: L.wellnessSummary(JSON.parse(x.scores), cfg).total }));
  out.wellness = w;
  if (s.playerView.showTests) {
    const res2 = db.prepare('SELECT r.date, r.values_json, t.id AS tid, t.name, t.fields FROM test_results r JOIN test_types t ON t.id=r.test_type_id WHERE r.player_id=? ORDER BY r.date DESC').all(pid(req));
    const by = new Map();
    for (const x of res2) { if (!by.has(x.tid)) by.set(x.tid, []); by.get(x.tid).push(x); }
    out.tests = [...by.values()].map(list => {
      const f = JSON.parse(list[0].fields)[0]; const v = l => l ? JSON.parse(l.values_json)[f.key] : null;
      return { name: list[0].name, unit: f.unit, decimals: f.decimals, better: f.better || null, date: list[0].date, value: v(list[0]), previous: v(list[1]) ?? null, history: list.slice(0, 6).reverse().map(l => ({ date: l.date, value: v(l) })) };
    });
  }
  res.json(out);
}));

// Corrección controlada y trazable: el jugador la solicita, el preparador la aprueba
r.post('/corrections', h((req, res) => {
  const entity = oneOf(req.body.entity, ['load', 'wellness'], 'Tipo de registro');
  const entity_id = num(req.body.entity_id, 'Registro', { required: true, int: true });
  const row = entity === 'load' ? db.prepare("SELECT * FROM load_entries WHERE id=? AND status='valido'").get(entity_id) : db.prepare("SELECT * FROM wellness_entries WHERE id=? AND status='valido'").get(entity_id);
  if (!row || row.player_id !== pid(req)) throw notFound('Registro no encontrado.');
  if (db.prepare("SELECT 1 FROM correction_requests WHERE entity=? AND entity_id=? AND status='pendiente'").get(entity, entity_id)) throw new HttpError(409, 'Ya hay una corrección pendiente para este registro.');
  const reason = reqText(req.body.reason, 'Motivo', 500);
  const p = req.body.proposed || {};
  const proposed = {};
  if (p.delete) proposed.delete = true;
  if (entity === 'load') {
    if (p.duration_min !== undefined && p.duration_min !== '') proposed.duration_min = num(p.duration_min, 'Duración', { min: 1, max: 300 });
    if (p.rpe !== undefined && p.rpe !== '') proposed.rpe = num(p.rpe, 'RPE', { min: 0, max: 10, int: true });
    if (p.notes) proposed.notes = reqText(p.notes, 'Observaciones', 2000);
  } else {
    const cfg = settings().wellness;
    if (p.scores) { proposed.scores = {}; for (const it of cfg.items) if (p.scores[it.key] !== undefined && p.scores[it.key] !== '') proposed.scores[it.key] = num(p.scores[it.key], it.label, { min: cfg.min, max: cfg.max, int: true }); }
    if (p.notes) proposed.notes = reqText(p.notes, 'Observaciones', 2000);
  }
  if (!Object.keys(proposed).length) throw bad('Indica qué valor debe corregirse.');
  const id = db.prepare('INSERT INTO correction_requests(entity,entity_id,player_id,reason,proposed) VALUES (?,?,?,?,?)').run(entity, entity_id, pid(req), reason, JSON.stringify(proposed)).lastInsertRowid;
  audit('correction', id, 'request', null, { entity, entity_id, proposed, reason }, req.user.id);
  res.json({ ok: true, id });
}));

r.get('/photo', h((req, res) => {
  const p = db.prepare('SELECT photo_file_id FROM players WHERE id=?').get(pid(req));
  res.json({ photo_file_id: p?.photo_file_id || null });
}));

module.exports = { router: r };
