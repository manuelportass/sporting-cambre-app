'use strict';
// MÓDULO 2 · Lesiones y readaptación (privado: solo preparador físico)
// Las fases NO avanzan automáticamente: solo cambian por acción explícita del preparador.
// La aplicación no genera diagnósticos ni recomendaciones clínicas.
const express = require('express');
const fs = require('fs');
const { db, audit } = require('../db');
const A = require('../auth');
const { h, bad, notFound, reqDate, optDate, optText, num, oneOf, today } = require('../lib/util');
const { diffDays } = require('../lib/load');
const core = require('./core');

const r = express.Router();
r.use(A.requireAdmin);

const STATUS = ['activa', 'readaptacion', 'reincorporacion', 'completada'];
const STATUS_LABEL = { activa: 'Lesión activa', readaptacion: 'En readaptación', reincorporacion: 'Reincorporación al entrenamiento', completada: 'Proceso completado' };

// ----- Fases configurables -----
r.get('/phases', (req, res) => res.json(db.prepare('SELECT * FROM rehab_phases WHERE active=1 ORDER BY sort').all()));
r.put('/phases', h((req, res) => {
  const list = req.body.phases;
  if (!Array.isArray(list) || !list.length) throw bad('Debe haber al menos una fase.');
  const before = db.prepare('SELECT * FROM rehab_phases').all();
  db.transaction(() => {
    const keep = new Set();
    list.forEach((p, i) => {
      const name = String(p.name || '').trim();
      if (!name) throw bad('Cada fase necesita un nombre.');
      if (p.id && db.prepare('SELECT 1 FROM rehab_phases WHERE id=?').get(p.id)) {
        db.prepare('UPDATE rehab_phases SET sort=?, name=?, objectives=?, active=1 WHERE id=?').run(i + 1, name, optText(p.objectives), p.id);
        keep.add(Number(p.id));
      } else {
        const info = db.prepare('INSERT INTO rehab_phases(sort,name,objectives) VALUES (?,?,?)').run(i + 1, name, optText(p.objectives));
        keep.add(Number(info.lastInsertRowid));
      }
    });
    // Las fases eliminadas se desactivan (se conservan en el historial)
    for (const b of before) if (!keep.has(b.id)) db.prepare('UPDATE rehab_phases SET active=0 WHERE id=?').run(b.id);
  })();
  audit('rehab_phases', null, 'update', before, list, req.user.id);
  res.json({ ok: true });
}));

function age(birth, at = today()) {
  if (!birth) return null;
  const [y, m, d] = birth.split('-').map(Number);
  const [Y, M, D] = at.split('-').map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}

const LIST_SQL = `SELECT i.*, p.first_name, p.last_name, p.photo_file_id, c.name AS category_name, c.code AS category_code, f.name AS phase_name, f.sort AS phase_sort
  FROM injuries i JOIN players p ON p.id=i.player_id LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN rehab_phases f ON f.id=i.phase_id`;
function decorate(i) {
  const t = today();
  return {
    ...i, player_name: `${i.first_name} ${i.last_name}`.trim(), status_label: STATUS_LABEL[i.status],
    days_elapsed: diffDays(i.injury_date, i.closed_at || t),
    review_overdue: !!(i.next_review && i.next_review < t && i.status !== 'completada'),
  };
}

r.get('/', h((req, res) => {
  const { player_id, status, type, from, to, q } = req.query;
  let sql = LIST_SQL + ' WHERE 1=1';
  const p = {};
  if (player_id) { sql += ' AND i.player_id=@player_id'; p.player_id = Number(player_id); }
  if (status === 'abiertas') sql += " AND i.status!='completada'";
  else if (status) { sql += ' AND i.status=@status'; p.status = status; }
  if (type) { sql += ' AND (i.injury_type LIKE @type OR i.zone LIKE @type)'; p.type = '%' + type + '%'; }
  if (from) { sql += ' AND i.injury_date >= @from'; p.from = from; }
  if (to) { sql += ' AND i.injury_date <= @to'; p.to = to; }
  if (q) { sql += ' AND (p.first_name || \' \' || p.last_name) LIKE @q'; p.q = '%' + q + '%'; }
  sql += ' ORDER BY (i.status=\'completada\'), i.injury_date DESC';
  const lastPain = db.prepare('SELECT date, eva FROM injury_pain WHERE injury_id=? ORDER BY date DESC, id DESC LIMIT 1');
  res.json(db.prepare(sql).all(p).map(decorate).map(i => ({ ...i, last_pain: lastPain.get(i.id) || null })));
}));

r.get('/dashboard', h((req, res) => {
  const t = today();
  const lastPain = db.prepare('SELECT date, eva FROM injury_pain WHERE injury_id=? ORDER BY date DESC, id DESC LIMIT 1');
  const all = db.prepare(LIST_SQL).all().map(decorate).map(i => ({ ...i, last_pain: lastPain.get(i.id) || null }));
  const open = all.filter(i => i.status !== 'completada');
  const counts = Object.fromEntries(STATUS.map(s => [s, all.filter(i => i.status === s).length]));
  const injuredPlayers = new Set(open.map(i => i.player_id)).size;
  const upcoming = open.filter(i => i.next_review).sort((a, b) => a.next_review.localeCompare(b.next_review));
  // Evolución mensual (últimos 12 meses): nuevas lesiones y procesos completados
  const months = [];
  const base = t.slice(0, 7) + '-01';
  for (let k = 11; k >= 0; k--) {
    const d = new Date(base + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - k);
    const m = d.toISOString().slice(0, 7);
    months.push({ month: m, nuevas: all.filter(i => i.injury_date.startsWith(m)).length, completadas: all.filter(i => (i.closed_at || '').startsWith(m)).length });
  }
  res.json({ counts, injuredPlayers, activeTotal: open.length, open, upcoming, months, statusLabels: STATUS_LABEL });
}));

r.get('/calendar', h((req, res) => {
  const month = String(req.query.month || today().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) throw bad('Mes no válido.');
  const ev = [];
  for (const i of db.prepare(LIST_SQL + " WHERE i.next_review LIKE ?").all(month + '%').map(decorate))
    ev.push({ date: i.next_review, type: 'revision', injury_id: i.id, player_name: i.player_name, text: `Revisión · ${i.zone || i.diagnosis || 'lesión'}`, overdue: i.review_overdue });
  for (const e of db.prepare(`SELECT e.review_date, e.injury_id, p.first_name, p.last_name FROM injury_entries e JOIN injuries i ON i.id=e.injury_id JOIN players p ON p.id=i.player_id WHERE e.review_date LIKE ?`).all(month + '%'))
    ev.push({ date: e.review_date, type: 'revision_seguimiento', injury_id: e.injury_id, player_name: `${e.first_name} ${e.last_name}`.trim(), text: 'Revisión (seguimiento)' });
  for (const i of db.prepare(LIST_SQL + " WHERE i.injury_date LIKE ?").all(month + '%').map(decorate))
    ev.push({ date: i.injury_date, type: 'lesion', injury_id: i.id, player_name: i.player_name, text: `Lesión · ${i.zone || ''}` });
  res.json(ev.sort((a, b) => a.date.localeCompare(b.date)));
}));

const FIELDS = ['injury_date', 'zone', 'diagnosis', 'laterality', 'injury_type', 'mechanism', 'diagnostics', 'previous_injuries', 'symptoms', 'restrictions', 'coach_notes', 'phase_objectives', 'pending_criteria', 'next_review', 'return_training_date', 'return_match_date'];
function clean(b, partial) {
  const o = {};
  for (const f of FIELDS) {
    if (b[f] === undefined) continue;
    if (f === 'injury_date') o[f] = reqDate(b[f], 'Fecha de lesión');
    else if (['next_review', 'return_training_date', 'return_match_date'].includes(f)) o[f] = optDate(b[f], 'Fecha');
    else if (f === 'laterality') o[f] = b[f] ? oneOf(b[f], ['derecha', 'izquierda', 'bilateral'], 'Lateralidad') : null;
    else o[f] = optText(b[f]);
  }
  if (!partial && !o.injury_date) throw bad('La fecha de lesión es obligatoria.');
  return o;
}

r.post('/', h((req, res) => {
  const player_id = num(req.body.player_id, 'Jugador', { required: true, int: true });
  if (!db.prepare('SELECT 1 FROM players WHERE id=?').get(player_id)) throw notFound('Jugador no encontrado.');
  const o = clean(req.body, false);
  const firstPhase = db.prepare('SELECT id FROM rehab_phases WHERE active=1 ORDER BY sort LIMIT 1').get();
  o.player_id = player_id;
  o.status = 'activa';
  o.phase_id = req.body.phase_id ? Number(req.body.phase_id) : firstPhase?.id || null;
  const cols = Object.keys(o);
  const info = db.prepare(`INSERT INTO injuries(${cols}) VALUES (${cols.map(c => '@' + c)})`).run(o);
  db.prepare('INSERT INTO injury_phase_history(injury_id,to_phase_id,to_status,note,user_id) VALUES (?,?,?,?,?)').run(info.lastInsertRowid, o.phase_id, 'activa', 'Apertura del proceso', req.user.id);
  audit('injury', info.lastInsertRowid, 'create', null, o, req.user.id);
  res.json({ ok: true, id: info.lastInsertRowid });
}));

r.get('/:id', h((req, res) => {
  const i = db.prepare(LIST_SQL + ' WHERE i.id=?').get(req.params.id);
  if (!i) throw notFound('Lesión no encontrada.');
  const p = db.prepare('SELECT p.*, c.name AS category_name FROM players p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?').get(i.player_id);
  const priv = db.prepare('SELECT * FROM player_private WHERE player_id=?').get(i.player_id) || {};
  const entries = db.prepare('SELECT e.*, f.name AS phase_name FROM injury_entries e LEFT JOIN rehab_phases f ON f.id=e.phase_id WHERE injury_id=? ORDER BY date DESC, id DESC').all(i.id)
    .map(e => ({ ...e, exercises: JSON.parse(e.exercises || '[]') }));
  const history = db.prepare(`SELECT h.*, a.name AS from_phase, b.name AS to_phase, u.display_name AS user_name FROM injury_phase_history h
    LEFT JOIN rehab_phases a ON a.id=h.from_phase_id LEFT JOIN rehab_phases b ON b.id=h.to_phase_id LEFT JOIN users u ON u.id=h.user_id WHERE injury_id=? ORDER BY h.id DESC`).all(i.id);
  const files = db.prepare("SELECT id, original_name, mime, size, uploaded_at FROM files WHERE owner_type='injury' AND owner_id=? ORDER BY id DESC").all(i.id);
  const others = db.prepare("SELECT id, injury_date, zone, diagnosis, status FROM injuries WHERE player_id=? AND id!=? ORDER BY injury_date DESC").all(i.player_id, i.id);
  const pain = db.prepare('SELECT id, date, eva, notes, created_at FROM injury_pain WHERE injury_id=? ORDER BY date DESC, id DESC').all(i.id);
  res.json({
    ...decorate(i), player: { ...core.playerRow(p), private: priv, age: age(priv.birth_date) },
    entries, history, files, otherInjuries: others, pain,
  });
}));

r.put('/:id', h((req, res) => {
  const before = db.prepare('SELECT * FROM injuries WHERE id=?').get(req.params.id);
  if (!before) throw notFound();
  const o = clean(req.body, true);
  if (!Object.keys(o).length) return res.json({ ok: true });
  o.updated_at = new Date().toISOString();
  db.prepare(`UPDATE injuries SET ${Object.keys(o).map(k => `${k}=@${k}`)} WHERE id=@id`).run({ ...o, id: before.id });
  audit('injury', before.id, 'update', before, o, req.user.id);
  res.json({ ok: true });
}));

// Cambio manual de fase/estado (con historial)
r.post('/:id/phase', h((req, res) => {
  const i = db.prepare('SELECT * FROM injuries WHERE id=?').get(req.params.id);
  if (!i) throw notFound();
  const phase_id = req.body.phase_id ? num(req.body.phase_id, 'Fase', { int: true }) : i.phase_id;
  if (phase_id && !db.prepare('SELECT 1 FROM rehab_phases WHERE id=?').get(phase_id)) throw bad('Fase no válida.');
  const status = req.body.status ? oneOf(req.body.status, STATUS, 'Estado') : i.status;
  const note = optText(req.body.note, 2000);
  if (phase_id === i.phase_id && status === i.status) throw bad('No hay cambios de fase ni de estado.');
  const closed_at = status === 'completada' ? (i.closed_at || today()) : null;
  db.prepare("UPDATE injuries SET phase_id=?, status=?, closed_at=?, updated_at=datetime('now') WHERE id=?").run(phase_id, status, closed_at, i.id);
  db.prepare('INSERT INTO injury_phase_history(injury_id,from_phase_id,to_phase_id,from_status,to_status,note,user_id) VALUES (?,?,?,?,?,?,?)')
    .run(i.id, i.phase_id, phase_id, i.status, status, note, req.user.id);
  audit('injury', i.id, 'phase', { phase_id: i.phase_id, status: i.status }, { phase_id, status, note }, req.user.id);
  res.json({ ok: true });
}));

// Finalizar la recuperación (alta): cierra el proceso y lo deja en el historial del jugador
r.post('/:id/finish', h((req, res) => {
  const i = db.prepare('SELECT * FROM injuries WHERE id=?').get(req.params.id);
  if (!i) throw notFound();
  if (i.status === 'completada') throw bad('Este proceso ya está finalizado.');
  const date = req.body.date ? reqDate(req.body.date, 'Fecha de alta') : today();
  if (date < i.injury_date) throw bad('La fecha de alta no puede ser anterior a la lesión.');
  const note = optText(req.body.note, 2000);
  const last = db.prepare('SELECT id FROM rehab_phases WHERE active=1 ORDER BY sort DESC LIMIT 1').get();
  db.prepare("UPDATE injuries SET status='completada', closed_at=?, phase_id=?, return_training_date=COALESCE(return_training_date, ?), next_review=NULL, updated_at=datetime('now') WHERE id=?")
    .run(date, last?.id || i.phase_id, date, i.id);
  db.prepare('INSERT INTO injury_phase_history(injury_id,from_phase_id,to_phase_id,from_status,to_status,note,user_id) VALUES (?,?,?,?,?,?,?)')
    .run(i.id, i.phase_id, last?.id || i.phase_id, i.status, 'completada', `Recuperación finalizada (alta el ${date.split('-').reverse().join('/')})${note ? ': ' + note : ''}`, req.user.id);
  audit('injury', i.id, 'finish', { status: i.status }, { status: 'completada', closed_at: date, note }, req.user.id);
  res.json({ ok: true });
}));
// Eliminar un registro de dolor (EVA) enviado por el jugador
r.delete('/pain/:pid', h((req, res) => {
  const before = db.prepare('SELECT * FROM injury_pain WHERE id=?').get(req.params.pid);
  if (!before) throw notFound();
  db.prepare('DELETE FROM injury_pain WHERE id=?').run(before.id);
  audit('injury_pain', before.id, 'delete', before, null, req.user.id);
  res.json({ ok: true });
}));

r.delete('/:id', h((req, res) => {
  const i = db.prepare('SELECT * FROM injuries WHERE id=?').get(req.params.id);
  if (!i) throw notFound();
  if (req.body?.confirm !== 'ELIMINAR') throw bad('Confirma escribiendo ELIMINAR.');
  db.prepare("SELECT id FROM files WHERE owner_type='injury' AND owner_id=?").all(i.id).forEach(f => core.removeFile(f.id));
  db.prepare('DELETE FROM injuries WHERE id=?').run(i.id);
  audit('injury', i.id, 'delete', i, null, req.user.id);
  res.json({ ok: true });
}));

// ----- Seguimiento cronológico -----
function cleanEntry(b) {
  const exercises = Array.isArray(b.exercises) ? b.exercises.filter(x => x && String(x.name || '').trim()).map(x => ({
    name: String(x.name).trim().slice(0, 200), sets: optText(x.sets, 20), reps: optText(x.reps, 40), load: optText(x.load, 60), other: optText(x.other, 300),
  })) : [];
  return {
    date: reqDate(b.date),
    phase_id: b.phase_id ? Number(b.phase_id) : null,
    exercises: JSON.stringify(exercises),
    pain: num(b.pain, 'Dolor', { min: 0, max: 100 }),
    response: optText(b.response), incidents: optText(b.incidents), notes: optText(b.notes),
    review_date: optDate(b.review_date, 'Fecha de revisión'), pending_criteria: optText(b.pending_criteria),
  };
}
r.post('/:id/entries', h((req, res) => {
  const i = db.prepare('SELECT * FROM injuries WHERE id=?').get(req.params.id);
  if (!i) throw notFound();
  const e = cleanEntry({ phase_id: i.phase_id, ...req.body });
  const info = db.prepare(`INSERT INTO injury_entries(injury_id,date,phase_id,exercises,pain,response,incidents,notes,review_date,pending_criteria)
    VALUES (@injury_id,@date,@phase_id,@exercises,@pain,@response,@incidents,@notes,@review_date,@pending_criteria)`).run({ ...e, injury_id: i.id });
  if (e.review_date && (!i.next_review || i.next_review < today() || e.review_date < i.next_review)) db.prepare('UPDATE injuries SET next_review=? WHERE id=?').run(e.review_date, i.id);
  if (e.pending_criteria) db.prepare('UPDATE injuries SET pending_criteria=? WHERE id=?').run(e.pending_criteria, i.id);
  audit('injury_entry', info.lastInsertRowid, 'create', null, e, req.user.id);
  res.json({ ok: true, id: info.lastInsertRowid });
}));
r.put('/entries/:eid', h((req, res) => {
  const before = db.prepare('SELECT * FROM injury_entries WHERE id=?').get(req.params.eid);
  if (!before) throw notFound();
  const e = cleanEntry(req.body);
  db.prepare(`UPDATE injury_entries SET date=@date,phase_id=@phase_id,exercises=@exercises,pain=@pain,response=@response,incidents=@incidents,notes=@notes,review_date=@review_date,pending_criteria=@pending_criteria WHERE id=@id`).run({ ...e, id: before.id });
  audit('injury_entry', before.id, 'update', before, e, req.user.id);
  res.json({ ok: true });
}));
r.delete('/entries/:eid', h((req, res) => {
  const before = db.prepare('SELECT * FROM injury_entries WHERE id=?').get(req.params.eid);
  if (!before) throw notFound();
  db.prepare('DELETE FROM injury_entries WHERE id=?').run(before.id);
  audit('injury_entry', before.id, 'delete', before, null, req.user.id);
  res.json({ ok: true });
}));

// ----- Documentos adjuntos (privados) -----
r.post('/:id/files', core.upload.single('file'), h((req, res) => {
  const i = db.prepare('SELECT * FROM injuries WHERE id=?').get(req.params.id);
  if (!i) { if (req.file) fs.unlinkSync(req.file.path); throw notFound(); }
  if (!req.file) throw bad('Selecciona un archivo.');
  const id = core.saveFile(req.file, 'injury', i.id, req.user.id);
  audit('injury', i.id, 'file_upload', null, { file: req.file.originalname }, req.user.id);
  res.json({ ok: true, id });
}));
r.delete('/files/:fid', h((req, res) => {
  const f = db.prepare("SELECT * FROM files WHERE id=? AND owner_type='injury'").get(req.params.fid);
  if (!f) throw notFound();
  core.removeFile(f.id);
  audit('injury', f.owner_id, 'file_delete', { file: f.original_name }, null, req.user.id);
  res.json({ ok: true });
}));

module.exports = { router: r, age, STATUS_LABEL };
