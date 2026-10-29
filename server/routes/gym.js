'use strict';
// MÓDULO 1 · Gimnasio y control de asistencia (solo preparador físico)
const express = require('express');
const { db, audit } = require('../db');
const A = require('../auth');
const { h, bad, notFound, reqDate, optText, num, oneOf, today, isoWeekday } = require('../lib/util');
const { addDays } = require('../lib/load');

const r = express.Router();
r.use(A.requireAdmin);

const STATUSES = ['presente', 'ausente', 'justificada', 'pendiente'];
const WEEKDAYS = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };

// ----- Franjas horarias (configurables) -----
r.get('/slots', (req, res) => {
  res.json(db.prepare(`SELECT s.*, c.name AS category_name, c.code AS category_code,
    (SELECT COUNT(*) FROM gym_assignments a JOIN players p ON p.id=a.player_id WHERE a.slot_id=s.id AND p.active=1) AS assigned
    FROM gym_slots s LEFT JOIN categories c ON c.id=s.category_id
    WHERE s.active=1 ORDER BY s.weekday, s.start_time`).all());
});
function cleanSlot(b) {
  const weekday = num(b.weekday, 'Día', { required: true, int: true, min: 1, max: 7 });
  const t = v => { if (!/^\d{2}:\d{2}$/.test(v || '')) throw bad('Hora no válida (HH:MM).'); return v; };
  const start_time = t(b.start_time), end_time = t(b.end_time);
  if (end_time <= start_time) throw bad('La hora de fin debe ser posterior a la de inicio.');
  return { weekday, start_time, end_time, label: optText(b.label, 80), category_id: b.category_id ? Number(b.category_id) : null };
}
r.post('/slots', h((req, res) => {
  const s = cleanSlot(req.body);
  const info = db.prepare('INSERT INTO gym_slots(weekday,start_time,end_time,label,category_id) VALUES (@weekday,@start_time,@end_time,@label,@category_id)').run(s);
  audit('gym_slot', info.lastInsertRowid, 'create', null, s, req.user.id);
  res.json({ ok: true, id: info.lastInsertRowid });
}));
r.put('/slots/:id', h((req, res) => {
  const before = db.prepare('SELECT * FROM gym_slots WHERE id=?').get(req.params.id);
  if (!before) throw notFound();
  const s = cleanSlot(req.body);
  db.prepare('UPDATE gym_slots SET weekday=@weekday,start_time=@start_time,end_time=@end_time,label=@label,category_id=@category_id WHERE id=@id').run({ ...s, id: before.id });
  audit('gym_slot', before.id, 'update', before, s, req.user.id);
  res.json({ ok: true });
}));
r.delete('/slots/:id', h((req, res) => {
  const s = db.prepare('SELECT * FROM gym_slots WHERE id=?').get(req.params.id);
  if (!s) throw notFound();
  const used = db.prepare('SELECT 1 FROM gym_sessions WHERE slot_id=? LIMIT 1').get(s.id);
  // Si tiene historial se desactiva para conservar los registros
  if (used) db.prepare('UPDATE gym_slots SET active=0 WHERE id=?').run(s.id);
  else db.prepare('DELETE FROM gym_slots WHERE id=?').run(s.id);
  db.prepare('DELETE FROM gym_assignments WHERE slot_id=?').run(s.id);
  audit('gym_slot', s.id, used ? 'deactivate' : 'delete', s, null, req.user.id);
  res.json({ ok: true, deactivated: !!used });
}));

// ----- Plantilla de una sesión concreta -----
function ensureSession(date, slotId) {
  db.prepare('INSERT OR IGNORE INTO gym_sessions(date,slot_id) VALUES (?,?)').run(date, slotId);
  return db.prepare('SELECT * FROM gym_sessions WHERE date=? AND slot_id=?').get(date, slotId);
}
function slotLabel(s) { return s ? `${WEEKDAYS[s.weekday]} ${s.start_time}–${s.end_time}${s.label ? ' · ' + s.label : ''}` : ''; }

function rosterFor(date, slot) {
  const session = db.prepare('SELECT * FROM gym_sessions WHERE date=? AND slot_id=?').get(date, slot.id) || null;
  const habitual = db.prepare(`SELECT p.id, p.first_name, p.last_name, p.photo_file_id, c.code AS category_code, c.name AS category_name
    FROM gym_assignments a JOIN players p ON p.id=a.player_id LEFT JOIN categories c ON c.id=p.category_id
    WHERE a.slot_id=? AND p.active=1 AND (p.joined_at IS NULL OR p.joined_at <= ?)`).all(slot.id, date);
  const rows = session ? db.prepare(`SELECT a.*, p.first_name, p.last_name, p.photo_file_id, c.code AS category_code, c.name AS category_name
    FROM gym_attendance a JOIN players p ON p.id=a.player_id LEFT JOIN categories c ON c.id=p.category_id WHERE a.session_id=?`).all(session.id) : [];
  const byPlayer = new Map(rows.map(x => [x.player_id, x]));
  const list = [];
  for (const p of habitual) {
    const a = byPlayer.get(p.id);
    list.push({ player_id: p.id, name: `${p.first_name} ${p.last_name}`.trim(), photo_file_id: p.photo_file_id, category_code: p.category_code, category_name: p.category_name,
      attendance_id: a?.id || null, status: a?.status || 'pendiente', origin: 'habitual', moved_slot_id: a?.moved_slot_id || null, note: a?.note || null, updated_at: a?.updated_at || null });
    byPlayer.delete(p.id);
  }
  for (const a of byPlayer.values()) {
    list.push({ player_id: a.player_id, name: `${a.first_name} ${a.last_name}`.trim(), photo_file_id: a.photo_file_id, category_code: a.category_code, category_name: a.category_name,
      attendance_id: a.id, status: a.status, origin: a.origin, moved_slot_id: a.moved_slot_id, note: a.note, updated_at: a.updated_at });
  }
  list.sort((x, y) => x.name.localeCompare(y.name, 'es'));
  const counted = list.filter(x => x.status !== 'movido');
  const stats = {
    previstos: counted.length,
    presentes: counted.filter(x => x.status === 'presente').length,
    ausentes: counted.filter(x => x.status === 'ausente').length,
    justificadas: counted.filter(x => x.status === 'justificada').length,
    pendientes: counted.filter(x => x.status === 'pendiente').length,
  };
  stats.porcentaje = stats.previstos ? Math.round((stats.presentes / stats.previstos) * 1000) / 10 : null;
  return { session, list, stats };
}

// Jugadores de base (infantil, cadete, juvenil) sin franja de gimnasio asignada
r.get('/unassigned', h((req, res) => {
  const rows = db.prepare(`SELECT p.id, p.first_name, p.last_name, c.code AS category, c.name AS category_name FROM players p JOIN categories c ON c.id=p.category_id
    WHERE p.active=1 AND c.code IN ('infantil','cadete','juvenil') AND NOT EXISTS (SELECT 1 FROM gym_assignments a JOIN gym_slots s ON s.id=a.slot_id WHERE a.player_id=p.id AND s.active=1)
    ORDER BY c.id, p.first_name, p.last_name`).all();
  res.json(rows.map(x => ({ ...x, name: `${x.first_name} ${x.last_name}`.trim() })));
}));
r.post('/assign', h((req, res) => {
  const pid = num(req.body.player_id, 'Jugador', { required: true, int: true }), sid = num(req.body.slot_id, 'Franja', { required: true, int: true });
  if (!db.prepare('SELECT 1 FROM players WHERE id=?').get(pid) || !db.prepare('SELECT 1 FROM gym_slots WHERE id=? AND active=1').get(sid)) throw notFound();
  db.prepare('INSERT OR IGNORE INTO gym_assignments(player_id,slot_id) VALUES (?,?)').run(pid, sid);
  audit('gym_assignment', pid, 'assign', null, { slot_id: sid }, req.user.id);
  res.json({ ok: true });
}));

r.get('/day', h((req, res) => {
  const date = reqDate(req.query.date);
  const wd = req.query.weekday ? Number(req.query.weekday) : isoWeekday(date);
  const slots = db.prepare(`SELECT s.*, c.name AS category_name FROM gym_slots s LEFT JOIN categories c ON c.id=s.category_id
    WHERE s.active=1 AND s.weekday=? ORDER BY s.start_time`).all(wd);
  const slotNames = Object.fromEntries(db.prepare('SELECT * FROM gym_slots').all().map(s => [s.id, slotLabel(s)]));
  const out = slots.map(s => {
    const r0 = rosterFor(date, s);
    r0.list.forEach(x => { if (x.moved_slot_id) x.moved_slot_label = slotNames[x.moved_slot_id]; });
    return { slot: { ...s, display: slotLabel(s) }, ...r0 };
  });
  res.json({ date, weekday: wd, weekdayName: WEEKDAYS[wd], slots: out, matchesWeekday: isoWeekday(date) === wd });
}));

function getSlot(id) { const s = db.prepare('SELECT * FROM gym_slots WHERE id=?').get(id); if (!s) throw notFound('Franja no encontrada.'); return s; }
function assertDateMatches(date, slot) {
  if (isoWeekday(date) !== slot.weekday) throw bad(`La fecha seleccionada no es ${WEEKDAYS[slot.weekday].toLowerCase()}.`);
}

// Marcar estado (uno o pocos clics)
r.post('/attendance', h((req, res) => {
  const date = reqDate(req.body.date);
  const slot = getSlot(req.body.slot_id);
  assertDateMatches(date, slot);
  const player_id = num(req.body.player_id, 'Jugador', { required: true, int: true });
  const status = oneOf(req.body.status, STATUSES, 'Estado');
  const s = ensureSession(date, slot.id);
  const before = db.prepare('SELECT * FROM gym_attendance WHERE session_id=? AND player_id=?').get(s.id, player_id);
  const isHabitual = !!db.prepare('SELECT 1 FROM gym_assignments WHERE slot_id=? AND player_id=?').get(slot.id, player_id);
  if (!before && !isHabitual) throw bad('El jugador no está en esta franja. Añádelo como incorporación puntual.');
  if (before?.status === 'movido') throw bad('El jugador fue cambiado a otra franja en esta sesión. Deshaz el cambio para marcarlo aquí.');
  const note = req.body.note !== undefined ? optText(req.body.note, 1000) : before?.note ?? null;
  db.prepare(`INSERT INTO gym_attendance(session_id,player_id,status,origin,note,updated_by,updated_at) VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(session_id,player_id) DO UPDATE SET status=excluded.status, note=excluded.note, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .run(s.id, player_id, status, before?.origin || 'habitual', note, req.user.id);
  const after = db.prepare('SELECT * FROM gym_attendance WHERE session_id=? AND player_id=?').get(s.id, player_id);
  audit('gym_attendance', after.id, before ? 'update' : 'create', before || null, after, req.user.id);
  res.json({ ok: true, attendance: after });
}));

// Marcar en bloque los pendientes de una franja
r.post('/attendance/bulk', h((req, res) => {
  const date = reqDate(req.body.date);
  const slot = getSlot(req.body.slot_id);
  assertDateMatches(date, slot);
  const status = oneOf(req.body.status, STATUSES, 'Estado');
  const { list } = rosterFor(date, slot);
  const s = ensureSession(date, slot.id);
  let n = 0;
  db.transaction(() => {
    for (const x of list) {
      if (x.status !== 'pendiente') continue;
      db.prepare(`INSERT INTO gym_attendance(session_id,player_id,status,origin,updated_by) VALUES (?,?,?,?,?)
        ON CONFLICT(session_id,player_id) DO UPDATE SET status=excluded.status, updated_by=excluded.updated_by, updated_at=datetime('now')`)
        .run(s.id, x.player_id, status, x.origin, req.user.id);
      const a = db.prepare('SELECT * FROM gym_attendance WHERE session_id=? AND player_id=?').get(s.id, x.player_id);
      audit('gym_attendance', a.id, 'bulk', { status: 'pendiente' }, a, req.user.id);
      n++;
    }
  })();
  res.json({ ok: true, updated: n });
}));

// Incorporación puntual (jugador existente, de cualquier categoría; no se duplica el perfil)
r.post('/attendance/add', h((req, res) => {
  const date = reqDate(req.body.date);
  const slot = getSlot(req.body.slot_id);
  assertDateMatches(date, slot);
  const player_id = num(req.body.player_id, 'Jugador', { required: true, int: true });
  if (!db.prepare('SELECT 1 FROM players WHERE id=?').get(player_id)) throw notFound('Jugador no encontrado.');
  const s = ensureSession(date, slot.id);
  const existing = db.prepare('SELECT * FROM gym_attendance WHERE session_id=? AND player_id=?').get(s.id, player_id);
  const isHabitual = db.prepare('SELECT 1 FROM gym_assignments WHERE slot_id=? AND player_id=?').get(slot.id, player_id);
  if (existing || isHabitual) throw bad('El jugador ya figura en esta franja.');
  const status = req.body.status ? oneOf(req.body.status, STATUSES, 'Estado') : 'presente';
  const info = db.prepare("INSERT INTO gym_attendance(session_id,player_id,status,origin,note,updated_by) VALUES (?,?,?,'puntual',?,?)")
    .run(s.id, player_id, status, optText(req.body.note, 1000), req.user.id);
  audit('gym_attendance', info.lastInsertRowid, 'add_puntual', null, { date, slot_id: slot.id, player_id, status }, req.user.id);
  res.json({ ok: true });
}));

// Cambio de franja solo para esta sesión (no altera la asignación habitual)
r.post('/attendance/move', h((req, res) => {
  const date = reqDate(req.body.date);
  const from = getSlot(req.body.from_slot_id), to = getSlot(req.body.to_slot_id);
  if (from.id === to.id) throw bad('Selecciona una franja distinta.');
  assertDateMatches(date, to);
  if (from.weekday !== to.weekday) throw bad('Para cambiar a una franja de otro día, añade al jugador como incorporación puntual en esa fecha.');
  const player_id = num(req.body.player_id, 'Jugador', { required: true, int: true });
  const sf = ensureSession(date, from.id), st = ensureSession(date, to.id);
  const cur = db.prepare('SELECT * FROM gym_attendance WHERE session_id=? AND player_id=?').get(sf.id, player_id);
  const isHabitual = db.prepare('SELECT 1 FROM gym_assignments WHERE slot_id=? AND player_id=?').get(from.id, player_id);
  if (!cur && !isHabitual) throw bad('El jugador no está en la franja de origen.');
  if (db.prepare('SELECT 1 FROM gym_attendance WHERE session_id=? AND player_id=?').get(st.id, player_id) || db.prepare('SELECT 1 FROM gym_assignments WHERE slot_id=? AND player_id=?').get(to.id, player_id))
    throw bad('El jugador ya figura en la franja de destino.');
  db.transaction(() => {
    if (cur && cur.origin !== 'habitual') {
      db.prepare('DELETE FROM gym_attendance WHERE id=?').run(cur.id); // era puntual: simplemente se traslada
    } else {
      db.prepare(`INSERT INTO gym_attendance(session_id,player_id,status,origin,moved_slot_id,updated_by) VALUES (?,?,'movido','habitual',?,?)
        ON CONFLICT(session_id,player_id) DO UPDATE SET status='movido', moved_slot_id=excluded.moved_slot_id, updated_by=excluded.updated_by, updated_at=datetime('now')`)
        .run(sf.id, player_id, to.id, req.user.id);
    }
    const wasPuntual = cur && cur.origin === 'puntual';
    db.prepare("INSERT INTO gym_attendance(session_id,player_id,status,origin,moved_slot_id,note,updated_by) VALUES (?,?,?,?,?,?,?)")
      .run(st.id, player_id, cur && cur.status !== 'movido' ? cur.status : 'pendiente', wasPuntual ? 'puntual' : 'cambio_franja', wasPuntual ? null : from.id, cur?.note || null, req.user.id);
  })();
  audit('gym_attendance', null, 'move', { date, slot_id: from.id, player_id }, { date, slot_id: to.id, player_id }, req.user.id);
  res.json({ ok: true });
}));

// Deshacer incorporación puntual o cambio de franja
r.delete('/attendance/:id', h((req, res) => {
  const a = db.prepare('SELECT a.*, s.date, s.slot_id FROM gym_attendance a JOIN gym_sessions s ON s.id=a.session_id WHERE a.id=?').get(req.params.id);
  if (!a) throw notFound();
  db.transaction(() => {
    if (a.origin === 'cambio_franja' && a.moved_slot_id) {
      const sf = db.prepare('SELECT * FROM gym_sessions WHERE date=? AND slot_id=?').get(a.date, a.moved_slot_id);
      if (sf) db.prepare("UPDATE gym_attendance SET status=?, moved_slot_id=NULL, updated_at=datetime('now') WHERE session_id=? AND player_id=? AND status='movido'")
        .run(a.status === 'movido' ? 'pendiente' : a.status, sf.id, a.player_id);
      db.prepare('DELETE FROM gym_attendance WHERE id=?').run(a.id);
    } else if (a.origin === 'puntual') {
      db.prepare('DELETE FROM gym_attendance WHERE id=?').run(a.id);
    } else if (a.status === 'movido') {
      // deshacer desde el origen
      const st = db.prepare('SELECT * FROM gym_sessions WHERE date=? AND slot_id=?').get(a.date, a.moved_slot_id);
      let status = 'pendiente';
      if (st) {
        const dest = db.prepare("SELECT * FROM gym_attendance WHERE session_id=? AND player_id=? AND origin='cambio_franja'").get(st.id, a.player_id);
        if (dest) { status = dest.status; db.prepare('DELETE FROM gym_attendance WHERE id=?').run(dest.id); }
      }
      db.prepare("UPDATE gym_attendance SET status=?, moved_slot_id=NULL, updated_at=datetime('now') WHERE id=?").run(status, a.id);
    } else throw bad('Solo se pueden deshacer incorporaciones puntuales o cambios de franja.');
  })();
  audit('gym_attendance', a.id, 'undo', a, null, req.user.id);
  res.json({ ok: true });
}));

// Datos de la sesión (cancelada / observaciones)
r.post('/session', h((req, res) => {
  const date = reqDate(req.body.date);
  const slot = getSlot(req.body.slot_id);
  assertDateMatches(date, slot);
  const s = ensureSession(date, slot.id);
  const upd = { cancelled: req.body.cancelled ? 1 : 0, notes: optText(req.body.notes, 2000) };
  db.prepare('UPDATE gym_sessions SET cancelled=@cancelled, notes=@notes WHERE id=@id').run({ ...upd, id: s.id });
  audit('gym_session', s.id, 'update', s, upd, req.user.id);
  res.json({ ok: true });
}));

r.get('/attendance/:id/history', h((req, res) => {
  res.json(db.prepare(`SELECT a.*, u.display_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
    WHERE a.entity='gym_attendance' AND a.entity_id=? ORDER BY a.id DESC`).all(req.params.id));
}));

// Historial de asistencia de un jugador
r.get('/player/:id/history', h((req, res) => {
  const rows = db.prepare(`SELECT a.id, a.status, a.origin, a.note, s.date, s.slot_id, s.cancelled, g.weekday, g.start_time, g.end_time, g.label
    FROM gym_attendance a JOIN gym_sessions s ON s.id=a.session_id JOIN gym_slots g ON g.id=s.slot_id
    WHERE a.player_id=? ORDER BY s.date DESC, g.start_time`).all(req.params.id);
  const counted = rows.filter(r0 => r0.status !== 'movido' && !r0.cancelled);
  const summary = { registros: counted.length };
  for (const st of STATUSES) summary[st] = counted.filter(x => x.status === st).length;
  res.json({ rows: rows.map(x => ({ ...x, slot: slotLabel(x) })), summary });
}));

// ----- Informe semanal -----
function mondayOf(d) { const wd = isoWeekday(d); return addDays(d, 1 - wd); }
function weeklyReport(weekStart, categoryCode) {
  const monday = mondayOf(weekStart), sunday = addDays(monday, 6);
  const limit = today() < sunday ? today() : sunday;
  const slots = db.prepare('SELECT s.*, c.name AS category_name FROM gym_slots s LEFT JOIN categories c ON c.id=s.category_id').all();
  const players = new Map();
  const bySlot = new Map();
  const observations = [];
  let sessionsHeld = 0;
  // Toda la semana: un día posterior a hoy solo cuenta si ya tiene la lista pasada (p. ej. registrada por adelantado)
  for (let d = monday; d <= sunday; d = addDays(d, 1)) {
    const wd = isoWeekday(d);
    for (const slot of slots.filter(s => s.weekday === wd && (s.active || db.prepare('SELECT 1 FROM gym_sessions WHERE date=? AND slot_id=?').get(d, s.id)))) {
      const { session, list } = rosterFor(d, slot);
      if (d > limit && !session?.cancelled && !list.some(x => x.status !== 'pendiente' && x.status !== 'movido')) continue;
      if (session?.cancelled) { observations.push({ date: d, slot: slotLabel(slot), text: 'Sesión cancelada' + (session.notes ? ': ' + session.notes : '') }); continue; }
      if (session?.notes) observations.push({ date: d, slot: slotLabel(slot), text: session.notes });
      sessionsHeld++;
      for (const x of list) {
        if (x.status === 'movido') continue;
        if (categoryCode && x.category_code !== categoryCode) continue;
        const p = players.get(x.player_id) || { player_id: x.player_id, name: x.name, category: x.category_name || 'Pendiente', category_code: x.category_code, previstas: 0, presente: 0, ausente: 0, justificada: 0, pendiente: 0 };
        p.previstas++; p[x.status]++;
        players.set(x.player_id, p);
        const key = slot.id;
        const sl = bySlot.get(key) || { slot: slotLabel(slot), previstas: 0, presente: 0, ausente: 0, justificada: 0, pendiente: 0 };
        sl.previstas++; sl[x.status]++;
        bySlot.set(key, sl);
        if (x.note) observations.push({ date: d, slot: slotLabel(slot), text: `${x.name}: ${x.note}` });
        if (x.origin !== 'habitual') observations.push({ date: d, slot: slotLabel(slot), text: `${x.name}: ${x.origin === 'puntual' ? 'incorporación puntual' : 'cambio de franja'}` });
      }
    }
  }
  const pct = o => (o.previstas ? Math.round((o.presente / o.previstas) * 1000) / 10 : null);
  const rows = [...players.values()].map(p => ({ ...p, porcentaje: pct(p) })).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'es'));
  const byCat = new Map();
  for (const p of rows) {
    const c = byCat.get(p.category) || { category: p.category, jugadores: 0, previstas: 0, presente: 0, ausente: 0, justificada: 0, pendiente: 0 };
    c.jugadores++; for (const k of ['previstas', 'presente', 'ausente', 'justificada', 'pendiente']) c[k] += p[k];
    byCat.set(p.category, c);
  }
  // Resumen por franja (informe semanal): solo porcentajes de asistencia y ausencia sobre los jugadores con lista pasada
  const PL = { infantil: 'Infantiles', cadete: 'Cadetes', juvenil: 'Juveniles', senior: 'Primer equipo' };
  const slotSummary = slots.filter(sl => sl.active).sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)).map(sl => {
    const date = addDays(monday, sl.weekday - 1);
    const cat = db.prepare('SELECT code FROM categories WHERE id=?').get(sl.category_id)?.code;
    const base = { slot_id: sl.id, date, weekday: WEEKDAYS[sl.weekday], time: `${sl.start_time}–${sl.end_time}`, group: sl.label || PL[cat] || sl.category_name || 'Mixta' };
    const roster = rosterFor(date, sl).list.filter(x => x.status !== 'movido').map(x => ({ player_id: x.player_id, name: x.name, status: x.status }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    base.players = roster;
    if (date > limit && !bySlot.get(sl.id) && !db.prepare('SELECT cancelled FROM gym_sessions WHERE date=? AND slot_id=?').get(date, sl.id)?.cancelled) return { ...base, status: 'pendiente' };
    const sess = db.prepare('SELECT * FROM gym_sessions WHERE date=? AND slot_id=?').get(date, sl.id);
    if (sess?.cancelled) return { ...base, status: 'cancelada' };
    const b = bySlot.get(sl.id);
    const marked = b ? b.presente + b.ausente + b.justificada : 0;
    if (!marked) return { ...base, status: 'sin_lista' };
    const r1 = x => Math.round(x * 1000) / 10;
    return { ...base, status: b.pendiente ? 'incompleta' : 'realizada', asistencia: r1(b.presente / marked), ausencia: r1((b.ausente + b.justificada) / marked) };
  });
  return {
    monday, sunday, until: limit, category: categoryCode || null, sessionsHeld, slotSummary,
    rows,
    byCategory: [...byCat.values()].map(c => ({ ...c, porcentaje: pct(c) })),
    bySlot: [...bySlot.values()].map(s => ({ ...s, porcentaje: pct(s) })),
    observations,
    formula: 'Porcentaje de asistencia = asistencias / sesiones previstas × 100. Las sesiones previstas incluyen la asignación habitual, las incorporaciones puntuales y los cambios de franja; excluyen las sesiones canceladas.',
  };
}
r.get('/report', h((req, res) => {
  const week = reqDate(req.query.week, 'Semana');
  res.json(weeklyReport(week, req.query.category || null));
}));

module.exports = { router: r, rosterFor, weeklyReport };
