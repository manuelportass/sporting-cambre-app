'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, settings, setSetting, DEFAULT_SETTINGS, audit, nameKey, backup, DATA_DIR } = require('../db');
const A = require('../auth');
const { h, bad, notFound, reqText, optText, optDate, num, oneOf, HttpError } = require('../lib/util');

const r = express.Router();
const UPLOADS = path.join(DATA_DIR, 'uploads');

// ---------- Configuración inicial y sesión ----------
r.get('/setup/status', (req, res) => res.json({ needsSetup: A.needsSetup() }));
r.post('/setup', h((req, res) => {
  if (!A.needsSetup()) throw new HttpError(409, 'La aplicación ya está configurada.');
  const code = A.ensureSetupCode();
  if (String(req.body.code || '').trim() !== code) throw new HttpError(403, 'Código de configuración incorrecto. Consúltalo en la consola del servidor.');
  const name = reqText(req.body.name, 'Nombre completo', 120);
  const pin = String(req.body.pin || '');
  if (!A.validPin(pin) || pin.length < 6) throw bad('El PIN del administrador debe tener al menos 6 caracteres (letras o números).');
  const info = db.prepare("INSERT INTO users(username_key,display_name,pin_hash,role) VALUES (?,?,?, 'admin')").run(nameKey(name), name, A.hashPin(pin));
  audit('user', info.lastInsertRowid, 'setup_admin', null, { name }, info.lastInsertRowid);
  A.ensureSetupCode();
  A.createSession(res, info.lastInsertRowid);
  res.json({ ok: true });
}));
r.post('/auth/login', A.login);
r.post('/auth/logout', A.logout);
r.get('/auth/me', (req, res) => res.json({ user: req.user ? A.publicUser(req.user) : null }));
r.post('/auth/change-pin', A.requireAuth, h((req, res) => {
  const bcrypt = require('bcryptjs');
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ''), req.user.pin_hash)) throw new HttpError(403, 'El PIN actual no es correcto.');
  const min = req.user.role === 'admin' ? 6 : 4;
  if (!A.validPin(String(next || '')) || String(next).length < min) throw bad(`El nuevo PIN debe tener al menos ${min} caracteres (letras o números).`);
  db.prepare('UPDATE users SET pin_hash=?, must_change_pin=0 WHERE id=?').run(A.hashPin(String(next)), req.user.id);
  audit('user', req.user.id, 'change_pin', null, null, req.user.id);
  res.json({ ok: true });
}));

// Configuración pública mínima (logo y nombre en pantalla de acceso)
const DEFAULT_CREST = path.join(__dirname, '..', 'assets', 'escudo.png');
r.get('/public/club', (req, res) => {
  const s = settings();
  res.json({ name: s.club.name, primary: s.club.primary, accent: s.club.accent, hasCrest: !!s.club.crestFileId || fs.existsSync(DEFAULT_CREST), crestSource: s.club.crestFileId ? 'subido' : 'predeterminado' });
});
r.get('/public/crest', (req, res) => {
  const id = settings().club.crestFileId;
  const f = id && db.prepare('SELECT * FROM files WHERE id=?').get(id);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (f) return res.type(f.mime).sendFile(path.join(UPLOADS, f.stored_name));
  if (fs.existsSync(DEFAULT_CREST)) return res.type('image/png').sendFile(DEFAULT_CREST);
  res.status(404).end();
});
// Volver al escudo oficial incluido en la app
r.delete('/club/crest', A.requireAdmin, h((req, res) => {
  const s = settings();
  if (s.club.crestFileId) removeFile(s.club.crestFileId);
  setSetting('club', { ...s.club, crestFileId: null });
  res.json({ ok: true });
}));

// ---------- A partir de aquí: sesión obligatoria ----------
r.use(A.requireAuth);

r.get('/settings', (req, res) => {
  const s = settings();
  if (req.user.role === 'admin') return res.json(s);
  // Los jugadores solo reciben lo necesario para sus formularios
  res.json({ club: { name: s.club.name, primary: s.club.primary, accent: s.club.accent, hasCrest: true }, wellness: s.wellness, rpeScale: s.rpeScale, collectiveDays: s.collectiveDays });
});
r.put('/settings/:key', A.requireAdmin, h((req, res) => {
  const key = req.params.key;
  if (!(key in DEFAULT_SETTINGS)) throw notFound('Clave desconocida.');
  const before = settings()[key];
  const value = req.body.value;
  if (value === undefined) throw bad('Falta el valor.');
  validateSetting(key, value);
  setSetting(key, value);
  audit('settings', null, 'update:' + key, before, value, req.user.id);
  res.json({ ok: true, value });
}));
r.post('/settings/:key/reset', A.requireAdmin, h((req, res) => {
  const key = req.params.key;
  if (!(key in DEFAULT_SETTINGS)) throw notFound('Clave desconocida.');
  setSetting(key, DEFAULT_SETTINGS[key]);
  audit('settings', null, 'reset:' + key, null, null, req.user.id);
  res.json({ ok: true, value: DEFAULT_SETTINGS[key] });
}));
function validateSetting(key, v) {
  if (key === 'load') {
    oneOf(v.method, ['rolling', 'ewma'], 'Método');
    for (const k of ['acuteDays', 'chronicDays', 'minChronicDays', 'ewmaAcuteDays', 'ewmaChronicDays']) num(v[k], k, { min: 1, max: 120, required: true, int: true });
    num(v.maxMissingChronic, 'Registros pendientes tolerados', { min: 0, max: 28, int: true, required: true });
    if (v.minChronicDays > v.chronicDays) throw bad('La exposición mínima no puede superar la ventana crónica.');
    if (v.acuteDays >= v.chronicDays) throw bad('La ventana aguda debe ser menor que la crónica.');
    num(v.matchRpe ?? 10, 'RPE de los partidos', { min: 0, max: 10, required: true });
  }
  if (key === 'wellness') {
    num(v.min, 'Mínimo', { required: true }); num(v.max, 'Máximo', { required: true });
    if (v.max <= v.min) throw bad('El máximo debe ser mayor que el mínimo.');
    if (!Array.isArray(v.items) || !v.items.length) throw bad('Debe haber al menos un ítem.');
    const keys = new Set();
    v.items.forEach(it => { reqText(it.label, 'Nombre del ítem', 80); if (!it.key || keys.has(it.key)) throw bad('Claves de ítem duplicadas.'); keys.add(it.key); });
  }
  if (key === 'notifications') {
    for (const k of ['wellness', 'rpe', 'eva']) if (v[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v[k].time || '')) throw bad('Hora no válida (HH:MM).');
  }
  if (key === 'collectiveDays' && (!Array.isArray(v) || v.some(d => !Number.isInteger(d) || d < 1 || d > 7))) throw bad('Días no válidos.');
}

// ---------- Categorías ----------
r.get('/categories', (req, res) => res.json(db.prepare('SELECT * FROM categories ORDER BY sort').all()));

// ---------- Ficheros protegidos (sin enlaces públicos) ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_q, f, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(f.originalname).toLowerCase().slice(0, 8)),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_q, f, cb) => {
    const ok = /^(image\/(png|jpe?g|webp|gif|svg\+xml)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|text\/plain)$/.test(f.mimetype);
    cb(ok ? null : bad('Tipo de archivo no permitido.'), ok);
  },
});

function canReadFile(user, f) {
  if (user.role === 'admin') return true;
  if (f.owner_type === 'player_photo' && f.owner_id === user.player_id) return true;
  if (f.owner_type === 'club') return true;
  return false;
}
r.get('/files/:id', h((req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if (!f) throw notFound();
  if (!canReadFile(req.user, f)) throw new HttpError(403, 'Sin permiso para este archivo.');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.original_name || 'archivo')}`);
  res.type(f.mime).sendFile(path.join(UPLOADS, f.stored_name));
}));
function removeFile(id) {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(id);
  if (!f) return;
  try { fs.unlinkSync(path.join(UPLOADS, f.stored_name)); } catch { /* ya no existe */ }
  db.prepare('DELETE FROM files WHERE id=?').run(id);
}
function saveFile(file, ownerType, ownerId, userId) {
  const info = db.prepare('INSERT INTO files(owner_type,owner_id,original_name,mime,size,stored_name,uploaded_by) VALUES (?,?,?,?,?,?,?)')
    .run(ownerType, ownerId, file.originalname, file.mimetype, file.size, file.filename, userId);
  return info.lastInsertRowid;
}

r.post('/club/crest', A.requireAdmin, upload.single('file'), h((req, res) => {
  if (!req.file) throw bad('Selecciona una imagen.');
  if (!req.file.mimetype.startsWith('image/')) { fs.unlinkSync(req.file.path); throw bad('El escudo debe ser una imagen.'); }
  const s = settings();
  if (s.club.crestFileId) removeFile(s.club.crestFileId);
  const id = saveFile(req.file, 'club', null, req.user.id);
  setSetting('club', { ...s.club, crestFileId: id });
  res.json({ ok: true, id });
}));

// ---------- Jugadores (registro único) ----------
const PLAYER_FIELDS = ['first_name', 'last_name', 'category_id', 'position', 'dominant_leg', 'joined_at', 'notes', 'availability', 'custom', 'active'];
const PRIVATE_FIELDS = ['birth_date', 'weight_kg', 'height_cm', 'anthropometry', 'sports_history'];

function playerRow(p) {
  if (!p) return p;
  return { ...p, custom: JSON.parse(p.custom || '{}'), full_name: `${p.first_name} ${p.last_name}`.trim() };
}
function cleanPlayer(b, partial) {
  const o = {};
  if (!partial || b.first_name !== undefined) o.first_name = reqText(b.first_name, 'Nombre', 80);
  if (!partial || b.last_name !== undefined) o.last_name = optText(b.last_name, 120) || '';
  if (b.category_id !== undefined) {
    o.category_id = b.category_id ? num(b.category_id, 'Categoría', { int: true }) : null;
    if (o.category_id && !db.prepare('SELECT 1 FROM categories WHERE id=?').get(o.category_id)) throw bad('Categoría no válida.');
  }
  if (b.position !== undefined) o.position = optText(b.position, 60);
  if (b.dominant_leg !== undefined) o.dominant_leg = b.dominant_leg ? oneOf(b.dominant_leg, ['derecha', 'izquierda', 'ambas'], 'Pierna dominante') : null;
  if (b.joined_at !== undefined) o.joined_at = optDate(b.joined_at, 'Fecha de incorporación');
  if (b.notes !== undefined) o.notes = optText(b.notes);
  if (b.availability !== undefined) o.availability = oneOf({ no_disponible: 'lesionado', pendiente: 'disponible' }[b.availability] || b.availability, ['disponible', 'limitado', 'lesionado'], 'Disponibilidad');
  if (b.custom !== undefined) o.custom = JSON.stringify(b.custom && typeof b.custom === 'object' ? b.custom : {});
  if (b.active !== undefined) o.active = b.active ? 1 : 0;
  return o;
}
function cleanPrivate(b) {
  const o = {};
  if (b.birth_date !== undefined) o.birth_date = optDate(b.birth_date, 'Fecha de nacimiento');
  if (b.weight_kg !== undefined) o.weight_kg = b.weight_kg === '' || b.weight_kg === null ? null : num(b.weight_kg, 'Peso', { min: 15, max: 200 });
  if (b.age !== undefined) o.age = b.age === '' || b.age === null ? null : num(b.age, 'Edad', { min: 8, max: 60, int: true });
  if (b.height_cm !== undefined) o.height_cm = num(b.height_cm, 'Altura', { min: 80, max: 230 });
  if (b.anthropometry !== undefined) o.anthropometry = optText(b.anthropometry);
  if (b.sports_history !== undefined) o.sports_history = optText(b.sports_history);
  return o;
}
function upsertPrivate(id, priv) {
  if (!Object.keys(priv).length) return;
  db.prepare('INSERT OR IGNORE INTO player_private(player_id) VALUES (?)').run(id);
  const sets = Object.keys(priv).map(k => `${k}=@${k}`).join(',');
  db.prepare(`UPDATE player_private SET ${sets} WHERE player_id=@id`).run({ ...priv, id });
}

r.get('/players', A.requireAdmin, (req, res) => {
  const { category, q, active } = req.query;
  let sql = `SELECT p.*, c.code AS category_code, c.name AS category_name,
      (SELECT GROUP_CONCAT(slot_id) FROM gym_assignments a WHERE a.player_id=p.id) AS slot_ids,
      (SELECT id FROM users u WHERE u.player_id=p.id) AS user_id,
      (SELECT COUNT(*) FROM injuries i WHERE i.player_id=p.id AND i.status!='completada') AS open_injuries
    FROM players p LEFT JOIN categories c ON c.id=p.category_id WHERE 1=1`;
  const params = {};
  if (category) { sql += ' AND c.code=@category'; params.category = category; }
  if (active !== 'all') sql += ' AND p.active=1';
  if (q) { sql += ' AND p.name_key LIKE @q'; params.q = '%' + nameKey(q) + '%'; }
  sql += ' ORDER BY p.last_name, p.first_name';
  res.json(db.prepare(sql).all(params).map(p => ({ ...playerRow(p), slot_ids: p.slot_ids ? String(p.slot_ids).split(',').map(Number) : [] })));
});

r.get('/players/:id', A.requireAdmin, h((req, res) => {
  const p = db.prepare('SELECT p.*, c.code AS category_code, c.name AS category_name FROM players p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?').get(req.params.id);
  if (!p) throw notFound('Jugador no encontrado.');
  const priv = db.prepare('SELECT * FROM player_private WHERE player_id=?').get(p.id) || {};
  const slots = db.prepare('SELECT s.* FROM gym_assignments a JOIN gym_slots s ON s.id=a.slot_id WHERE a.player_id=?').all(p.id);
  const user = db.prepare('SELECT id, display_name, active, last_login, must_change_pin FROM users WHERE player_id=?').get(p.id) || null;
  res.json({ ...playerRow(p), private: priv, slots, user });
}));

function findDuplicate(first, last, exceptId) {
  const key = nameKey(`${first} ${last}`);
  return db.prepare('SELECT id, first_name, last_name FROM players WHERE name_key=? AND id != ?').get(key, exceptId || 0);
}

r.post('/players', A.requireAdmin, h((req, res) => {
  const o = cleanPlayer(req.body, false);
  const dup = findDuplicate(o.first_name, o.last_name);
  if (dup && !req.body.allowDuplicate) throw new HttpError(409, `Ya existe un jugador con ese nombre (${dup.first_name} ${dup.last_name}).`);
  o.name_key = nameKey(`${o.first_name} ${o.last_name}`);
  const cols = Object.keys(o);
  const info = db.prepare(`INSERT INTO players(${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`).run(o);
  const id = info.lastInsertRowid;
  upsertPrivate(id, cleanPrivate(req.body.private || {}));
  if (Array.isArray(req.body.slot_ids)) setAssignments(id, req.body.slot_ids);
  audit('player', id, 'create', null, o, req.user.id);
  res.json({ ok: true, id });
}));

r.put('/players/:id', A.requireAdmin, h((req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM players WHERE id=?').get(id);
  if (!before) throw notFound('Jugador no encontrado.');
  const o = cleanPlayer(req.body, true);
  if (o.first_name !== undefined || o.last_name !== undefined) {
    const f = o.first_name ?? before.first_name, l = o.last_name ?? before.last_name;
    const dup = findDuplicate(f, l, id);
    if (dup && !req.body.allowDuplicate) throw new HttpError(409, `Ya existe otro jugador con ese nombre.`);
    o.name_key = nameKey(`${f} ${l}`);
  }
  if (Object.keys(o).length) {
    o.updated_at = new Date().toISOString();
    db.prepare(`UPDATE players SET ${Object.keys(o).map(k => `${k}=@${k}`).join(',')} WHERE id=@id`).run({ ...o, id });
  }
  if (req.body.private) upsertPrivate(id, cleanPrivate(req.body.private));
  if (Array.isArray(req.body.slot_ids)) setAssignments(id, req.body.slot_ids);
  // Si cambia el nombre, mantenemos el nombre de usuario sincronizado
  if (o.name_key) {
    const u = db.prepare('SELECT id FROM users WHERE player_id=?').get(id);
    if (u) {
      const full = `${o.first_name ?? before.first_name} ${o.last_name ?? before.last_name}`.trim();
      db.prepare('UPDATE users SET username_key=?, display_name=? WHERE id=?').run(nameKey(full), full, u.id);
    }
  }
  audit('player', id, 'update', before, o, req.user.id);
  res.json({ ok: true });
}));

function setAssignments(playerId, slotIds) {
  db.prepare('DELETE FROM gym_assignments WHERE player_id=?').run(playerId);
  const ins = db.prepare('INSERT OR IGNORE INTO gym_assignments(player_id,slot_id) VALUES (?,?)');
  slotIds.map(Number).filter(Boolean).forEach(s => ins.run(playerId, s));
}

// Eliminación definitiva (derecho de supresión RGPD) con confirmación explícita
r.delete('/players/:id', A.requireAdmin, h((req, res) => {
  const p = db.prepare('SELECT * FROM players WHERE id=?').get(req.params.id);
  if (!p) throw notFound('Jugador no encontrado.');
  if (nameKey(req.body?.confirm) !== p.name_key) throw bad('Para eliminar, escribe el nombre completo del jugador como confirmación.');
  const injIds = db.prepare('SELECT id FROM injuries WHERE player_id=?').all(p.id).map(x => x.id);
  const fileIds = [
    ...db.prepare("SELECT id FROM files WHERE owner_type='player_photo' AND owner_id=?").all(p.id),
    ...injIds.flatMap(i => db.prepare("SELECT id FROM files WHERE owner_type='injury' AND owner_id=?").all(i)),
  ].map(x => x.id);
  db.transaction(() => {
    fileIds.forEach(removeFile);
    db.prepare('DELETE FROM players WHERE id=?').run(p.id);
    db.prepare('DELETE FROM player_aliases WHERE player_id=?').run(p.id);
  })();
  audit('player', p.id, 'delete', { name: `${p.first_name} ${p.last_name}` }, null, req.user.id);
  res.json({ ok: true });
}));

// Exportación de todos los datos de un jugador (derecho de acceso RGPD)
r.get('/players/:id/export', A.requireAdmin, h((req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM players WHERE id=?').get(id);
  if (!p) throw notFound();
  const all = (sql) => db.prepare(sql).all(id);
  const data = {
    exportado: new Date().toISOString(),
    jugador: playerRow(p),
    datos_personales: db.prepare('SELECT * FROM player_private WHERE player_id=?').get(id) || null,
    asignaciones_gimnasio: all('SELECT * FROM gym_assignments WHERE player_id=?'),
    asistencia_gimnasio: all('SELECT a.*, s.date FROM gym_attendance a JOIN gym_sessions s ON s.id=a.session_id WHERE a.player_id=?'),
    lesiones: all('SELECT * FROM injuries WHERE player_id=?'),
    seguimiento_lesiones: all('SELECT e.* FROM injury_entries e JOIN injuries i ON i.id=e.injury_id WHERE i.player_id=?'),
    asistencia_equipo: all('SELECT * FROM team_attendance WHERE player_id=?'),
    cargas: all('SELECT * FROM load_entries WHERE player_id=?'),
    wellness: all('SELECT * FROM wellness_entries WHERE player_id=?'),
    estadisticas_partido: all('SELECT * FROM match_stats WHERE player_id=?'),
    tests: all('SELECT * FROM test_results WHERE player_id=?'),
  };
  res.setHeader('Content-Disposition', `attachment; filename="datos-jugador-${id}.json"`);
  res.json(data);
}));

// Fotografía de perfil
r.post('/players/:id/photo', A.requireAdmin, upload.single('file'), h((req, res) => {
  const p = db.prepare('SELECT * FROM players WHERE id=?').get(req.params.id);
  if (!p) throw notFound();
  if (!req.file || !req.file.mimetype.startsWith('image/')) { if (req.file) fs.unlinkSync(req.file.path); throw bad('Selecciona una imagen.'); }
  if (p.photo_file_id) removeFile(p.photo_file_id);
  const fid = saveFile(req.file, 'player_photo', p.id, req.user.id);
  db.prepare('UPDATE players SET photo_file_id=? WHERE id=?').run(fid, p.id);
  audit('player', p.id, 'photo_upload', null, { fid }, req.user.id);
  res.json({ ok: true, photo_file_id: fid });
}));
r.delete('/players/:id/photo', A.requireAdmin, h((req, res) => {
  const p = db.prepare('SELECT * FROM players WHERE id=?').get(req.params.id);
  if (!p) throw notFound();
  if (p.photo_file_id) removeFile(p.photo_file_id);
  db.prepare('UPDATE players SET photo_file_id=NULL WHERE id=?').run(p.id);
  audit('player', p.id, 'photo_delete', null, null, req.user.id);
  res.json({ ok: true });
}));

// ---------- Importación de jugadores (CSV/Excel → filas analizadas en cliente) ----------
// Cada fila: { full_name | first_name+last_name, category, weekday, start_time, joined_at, notes }
function analyseImport(rows) {
  const cats = db.prepare('SELECT * FROM categories').all();
  const slots = db.prepare('SELECT * FROM gym_slots WHERE active=1').all();
  const seen = new Map();
  return rows.map((raw, idx) => {
    const issues = [];
    let first = String(raw.first_name || '').trim(), last = String(raw.last_name || '').trim();
    if (!first && raw.full_name) {
      const parts = String(raw.full_name).trim().split(/\s+/);
      first = parts.shift() || ''; last = parts.join(' ');
      if (parts.length >= 2) issues.push({ level: 'info', msg: 'Nombre y apellidos separados automáticamente: revisa si el nombre es compuesto.' });
    }
    if (!first) issues.push({ level: 'error', msg: 'Falta el nombre.' });
    const key = nameKey(`${first} ${last}`);
    let category_id = null;
    if (raw.category) {
      const ck = nameKey(raw.category);
      const c = cats.find(c => nameKey(c.code) === ck || nameKey(c.name) === ck || ck.startsWith(nameKey(c.code)) || (c.code === 'senior' && /senior|primer/.test(ck)));
      if (c) category_id = c.id; else issues.push({ level: 'warn', msg: `Categoría «${raw.category}» no reconocida: selecciónala.` });
    } else issues.push({ level: 'warn', msg: 'Categoría pendiente de introducir.' });
    let slot_id = null;
    if (raw.weekday || raw.start_time) {
      const wd = parseWeekday(raw.weekday);
      const st = normTime(raw.start_time);
      const s = slots.find(s => (!wd || s.weekday === wd) && (!st || s.start_time === st));
      if (s) slot_id = s.id;
      else issues.push({ level: 'warn', msg: `No existe una franja configurada para «${raw.weekday || ''} ${raw.start_time || ''}». Créala en Configuración o asígnala a mano.` });
    } else if (cats.find(c => c.id === category_id)?.code !== 'senior') issues.push({ level: 'info', msg: 'Horario pendiente de asignar.' });
    const existing = key ? db.prepare('SELECT id, first_name, last_name FROM players WHERE name_key=?').get(key) : null;
    if (existing) issues.push({ level: 'warn', msg: 'Ya existe en la base de datos: se actualizará en lugar de duplicarse.' });
    if (seen.has(key)) issues.push({ level: 'warn', msg: `Repetido en el archivo (fila ${seen.get(key) + 1}). Se unificarán sus horarios.` });
    else seen.set(key, idx);
    return { row: idx + 1, first_name: first, last_name: last, category_id, slot_id, joined_at: raw.joined_at || null, notes: raw.notes || null, existing_id: existing?.id || null, issues };
  });
}
const WD = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };
function parseWeekday(v) {
  if (!v) return null;
  const k = nameKey(v);
  for (const [n, i] of Object.entries(WD)) if (k.startsWith(n.slice(0, 3))) return i;
  const n = Number(v); return n >= 1 && n <= 7 ? n : null;
}
function normTime(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' && v < 1) { const m = Math.round(v * 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  const m = String(v).match(/(\d{1,2})[:.h]?(\d{2})?/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${(m[2] || '00')}`;
}
r.post('/players/import/preview', A.requireAdmin, h((req, res) => {
  if (!Array.isArray(req.body.rows) || !req.body.rows.length) throw bad('El archivo no contiene filas.');
  if (req.body.rows.length > 2000) throw bad('Máximo 2000 filas por importación.');
  res.json({ rows: analyseImport(req.body.rows) });
}));
r.post('/players/import/commit', A.requireAdmin, h((req, res) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows)) throw bad('Datos no válidos.');
  let created = 0, updated = 0, skipped = 0;
  db.transaction(() => {
    for (const r0 of rows) {
      if (r0.skip || !String(r0.first_name || '').trim()) { skipped++; continue; }
      const first = String(r0.first_name).trim(), last = String(r0.last_name || '').trim();
      const key = nameKey(`${first} ${last}`);
      let p = db.prepare('SELECT * FROM players WHERE name_key=?').get(key);
      if (!p) {
        const info = db.prepare('INSERT INTO players(first_name,last_name,name_key,category_id,joined_at,notes) VALUES (?,?,?,?,?,?)')
          .run(first, last, key, r0.category_id || null, optDate(r0.joined_at, 'Fecha de incorporación'), optText(r0.notes));
        p = { id: info.lastInsertRowid }; created++;
        audit('player', p.id, 'import_create', null, r0, req.user.id);
      } else {
        const upd = {};
        if (r0.category_id && !p.category_id) upd.category_id = r0.category_id;
        if (r0.category_id && p.category_id !== r0.category_id) upd.category_id = r0.category_id;
        if (Object.keys(upd).length) db.prepare(`UPDATE players SET ${Object.keys(upd).map(k => `${k}=@${k}`)} WHERE id=@id`).run({ ...upd, id: p.id });
        updated++;
        audit('player', p.id, 'import_update', null, r0, req.user.id);
      }
      if (r0.slot_id) db.prepare('INSERT OR IGNORE INTO gym_assignments(player_id,slot_id) VALUES (?,?)').run(p.id, r0.slot_id);
    }
  })();
  res.json({ ok: true, created, updated, skipped });
}));

// ---------- Fotos de los jugadores (carpeta «Fotos con edit» facilitada por el preparador) ----------
// El nombre del archivo identifica al jugador: todas las palabras de su nombre deben aparecer en el nombre del archivo.
const fullName = p => `${p.first_name} ${p.last_name}`.trim();
const PHOTO_DIR = path.join(__dirname, '..', 'seed', 'fotos');
function matchPhotoNames(files, players) {
  const toks = x => nameKey(x).split(/\s+/).filter(Boolean);
  return files.map(f => {
    const ft = new Set(toks(f.replace(/\.[a-z]+$/i, '')));
    const hits = players.filter(p => { const pt = toks(`${p.first_name} ${p.last_name}`); return pt.length && pt.every(t => ft.has(t)); });
    return { file: f, player: hits.length === 1 ? hits[0] : null };
  });
}
r.get('/seed/photos', A.requireAdmin, h((req, res) => {
  const files = fs.existsSync(PHOTO_DIR) ? fs.readdirSync(PHOTO_DIR).filter(f => /\.(jpe?g|png)$/i.test(f)) : [];
  const players = db.prepare('SELECT id, first_name, last_name, photo_file_id FROM players').all();
  res.json(matchPhotoNames(files, players).map(x => ({ file: x.file, player_id: x.player?.id || null, name: x.player ? fullName(x.player) : null, hasPhoto: !!x.player?.photo_file_id })));
}));
r.post('/seed/photos', A.requireAdmin, h((req, res) => {
  const files = fs.existsSync(PHOTO_DIR) ? fs.readdirSync(PHOTO_DIR).filter(f => /\.(jpe?g|png)$/i.test(f)) : [];
  const players = db.prepare('SELECT id, first_name, last_name, photo_file_id FROM players').all();
  let done = 0; const unmatched = [];
  for (const { file, player } of matchPhotoNames(files, players)) {
    if (!player) { unmatched.push(file); continue; }
    if (player.photo_file_id && !req.body?.replace) continue;
    const stored = crypto.randomBytes(16).toString('hex') + path.extname(file).toLowerCase();
    fs.copyFileSync(path.join(PHOTO_DIR, file), path.join(UPLOADS, stored));
    if (player.photo_file_id) removeFile(player.photo_file_id);
    const fid = saveFile({ originalname: file, mimetype: 'image/jpeg', size: fs.statSync(path.join(PHOTO_DIR, file)).size, filename: stored }, 'player_photo', player.id, req.user.id);
    db.prepare('UPDATE players SET photo_file_id=? WHERE id=?').run(fid, player.id); done++;
  }
  audit('player', null, 'seed_photos', null, { done, unmatched }, req.user.id);
  res.json({ ok: true, done, unmatched });
}));

// ---------- Listado inicial de la temporada (datos facilitados por el preparador) ----------
const SEED_FILE = path.join(__dirname, '..', 'seed', 'temporada-2026-2027.json');
const readSeed = () => JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
r.get('/seed/season', A.requireAdmin, h((req, res) => {
  if (!fs.existsSync(SEED_FILE)) throw notFound('No hay listado inicial incluido.');
  const seed = readSeed();
  const slots = seed.slots.map(sl => ({ ...sl, exists: !!db.prepare('SELECT 1 FROM gym_slots WHERE active=1 AND weekday=? AND start_time=?').get(sl.weekday, sl.start_time) }));
  res.json({ ...seed, slots });
}));
r.post('/seed/season/slots', A.requireAdmin, h((req, res) => {
  const seed = readSeed();
  let created = 0;
  db.transaction(() => {
    for (const sl of seed.slots) {
      if (db.prepare('SELECT 1 FROM gym_slots WHERE active=1 AND weekday=? AND start_time=?').get(sl.weekday, sl.start_time)) continue;
      const cat = db.prepare('SELECT id FROM categories WHERE code=?').get(sl.category);
      const info = db.prepare('INSERT INTO gym_slots(weekday,start_time,end_time,label,category_id) VALUES (?,?,?,?,?)').run(sl.weekday, sl.start_time, sl.end_time, sl.label, cat?.id || null);
      audit('gym_slot', info.lastInsertRowid, 'create_seed', null, sl, req.user.id);
      created++;
    }
  })();
  res.json({ ok: true, created });
}));

// ---------- Cuentas de usuario ----------
r.get('/users', A.requireAdmin, (req, res) => {
  res.json(db.prepare(`SELECT u.id, u.display_name, u.role, u.player_id, u.active, u.last_login, u.must_change_pin, c.code AS category_code
    FROM users u LEFT JOIN players p ON p.id=u.player_id LEFT JOIN categories c ON c.id=p.category_id ORDER BY u.role, u.display_name`).all());
});
r.post('/users', A.requireAdmin, h((req, res) => {
  const pid = num(req.body.player_id, 'Jugador', { required: true, int: true });
  const p = db.prepare('SELECT p.*, c.code FROM players p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?').get(pid);
  if (!p) throw notFound('Jugador no encontrado.');
  if (p.code !== 'senior') throw bad('Solo los jugadores del primer equipo tienen cuenta (los módulos de gimnasio y readaptación son privados).');
  if (db.prepare('SELECT 1 FROM users WHERE player_id=?').get(pid)) throw new HttpError(409, 'Este jugador ya tiene cuenta.');
  const full = `${p.first_name} ${p.last_name}`.trim();
  if (db.prepare('SELECT 1 FROM users WHERE username_key=?').get(nameKey(full))) throw new HttpError(409, 'Ya existe un usuario con ese nombre completo. Diferencia los nombres antes de crear la cuenta.');
  const pin = A.generatePin();
  const info = db.prepare("INSERT INTO users(username_key,display_name,pin_hash,role,player_id,must_change_pin) VALUES (?,?,?,'player',?,1)").run(nameKey(full), full, A.hashPin(pin), pid);
  audit('user', info.lastInsertRowid, 'create', null, { player_id: pid }, req.user.id);
  res.json({ ok: true, id: info.lastInsertRowid, username: full, pin });
}));
r.post('/users/:id/reset-pin', A.requireAdmin, h((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u || u.role !== 'player') throw notFound('Usuario no encontrado.');
  const pin = A.generatePin();
  db.prepare('UPDATE users SET pin_hash=?, must_change_pin=1 WHERE id=?').run(A.hashPin(pin), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  audit('user', u.id, 'reset_pin', null, null, req.user.id);
  res.json({ ok: true, username: u.display_name, pin });
}));
r.patch('/users/:id', A.requireAdmin, h((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u || u.role !== 'player') throw notFound('Usuario no encontrado.');
  const active = req.body.active ? 1 : 0;
  db.prepare('UPDATE users SET active=? WHERE id=?').run(active, u.id);
  if (!active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  audit('user', u.id, active ? 'activate' : 'deactivate', null, null, req.user.id);
  res.json({ ok: true });
}));
r.delete('/users/:id', A.requireAdmin, h((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u || u.role !== 'player') throw notFound('Usuario no encontrado.');
  db.prepare('DELETE FROM users WHERE id=?').run(u.id);
  audit('user', u.id, 'delete', { name: u.display_name }, null, req.user.id);
  res.json({ ok: true });
}));

// ---------- Historial de cambios ----------
r.get('/audit', A.requireAdmin, (req, res) => {
  const { entity, entity_id, limit } = req.query;
  let sql = 'SELECT a.*, u.display_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE 1=1';
  const p = {};
  if (entity) { sql += ' AND a.entity=@entity'; p.entity = entity; }
  if (entity_id) { sql += ' AND a.entity_id=@entity_id'; p.entity_id = Number(entity_id); }
  sql += ' ORDER BY a.id DESC LIMIT ' + Math.min(Number(limit) || 200, 1000);
  res.json(db.prepare(sql).all(p));
});

// ---------- Copias de seguridad ----------
r.post('/admin/backup', A.requireAdmin, h(async (req, res) => {
  const f = await backup();
  audit('backup', null, 'manual', null, { file: path.basename(f) }, req.user.id);
  res.download(f, path.basename(f));
}));
r.get('/admin/backups', A.requireAdmin, (req, res) => {
  const dir = path.join(DATA_DIR, 'backups');
  res.json(fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort().reverse().map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size })));
});

module.exports = { router: r, upload, saveFile, removeFile, playerRow };
