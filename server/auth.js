'use strict';
// Autenticación: nombre completo + PIN. Sesiones en servidor con cookie httpOnly.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, nameKey } = require('./db');

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const COOKIE = 'scpf_sid';
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1';

const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// Código de configuración inicial: se imprime en la consola del servidor
// mientras no exista ningún administrador (evita que un tercero cree la cuenta).
let setupCode = null;
function ensureSetupCode() {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get();
  if (hasAdmin) { setupCode = null; return null; }
  if (!setupCode) setupCode = process.env.SETUP_CODE || crypto.randomInt(100000, 999999).toString();
  return setupCode;
}
function needsSetup() { return !db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get(); }

function validPin(pin) { return typeof pin === 'string' && /^[0-9A-Za-z]{4,32}$/.test(pin); }
function hashPin(pin) { return bcrypt.hashSync(pin, 10); }
function generatePin() { return crypto.randomInt(0, 1000000).toString().padStart(6, '0'); }

// Limitador de intentos de acceso (en memoria)
const attempts = new Map();
function tooMany(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter(t => now - t < 15 * 60 * 1000);
  attempts.set(key, a);
  return a.length >= 8;
}
function fail(key) { (attempts.get(key) || attempts.set(key, []).get(key)).push(Date.now()); }

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(sha(token), userId, expires);
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(userId);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIE, maxAge: SESSION_DAYS * 864e5, path: '/' });
}

function login(req, res) {
  const { name, pin } = req.body || {};
  const key = nameKey(name);
  const ipKey = (req.ip || '') + '|' + key;
  if (tooMany(ipKey)) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  const u = db.prepare('SELECT * FROM users WHERE username_key=? AND active=1').get(key);
  if (!u || !pin || !bcrypt.compareSync(String(pin), u.pin_hash)) {
    fail(ipKey);
    return res.status(401).json({ error: 'Nombre o PIN incorrectos.' });
  }
  attempts.delete(ipKey);
  createSession(res, u.id);
  res.json({ ok: true, user: publicUser(u) });
}

function logout(req, res) {
  const t = req.cookies?.[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(t));
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}

function publicUser(u) {
  return { id: u.id, name: u.display_name, role: u.role, playerId: u.player_id, mustChangePin: !!u.must_change_pin };
}

// Middleware: carga el usuario de la sesión
function loadUser(req, _res, next) {
  const t = req.cookies?.[COOKIE];
  if (t) {
    const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at > ? AND u.active=1`).get(sha(t), new Date().toISOString());
    if (row) req.user = row;
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sesión no iniciada.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sesión no iniciada.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso restringido al preparador físico.' });
  next();
}
function requirePlayer(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sesión no iniciada.' });
  if (req.user.role !== 'player' || !req.user.player_id) return res.status(403).json({ error: 'Solo para jugadores.' });
  next();
}

function purgeSessions() { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString()); }

module.exports = {
  login, logout, loadUser, requireAuth, requireAdmin, requirePlayer, createSession, publicUser,
  hashPin, validPin, generatePin, ensureSetupCode, needsSetup, purgeSessions, COOKIE,
  getSetupCode: () => setupCode,
};
