'use strict';
// Notificaciones push (Web Push / VAPID). La clave privada se guarda solo en el servidor (variable de entorno o
// archivo en la carpeta de datos) y nunca se envía al navegador.
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { db, settings, DATA_DIR } = require('../db');
const { isoWeekday } = require('./util');

let keys = null;
function vapid() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  else {
    const f = path.join(DATA_DIR, 'vapid.json');
    try { keys = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {
      keys = webpush.generateVAPIDKeys();
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(f, JSON.stringify(keys), { mode: 0o600 });
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:preparador@sportingcambre.es', keys.publicKey, keys.privateKey);
  return keys;
}
const publicKey = () => vapid().publicKey;

// Hora y fecha en Madrid (el servidor puede estar en otra zona horaria)
function madridNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

async function sendToUser(userId, payload) {
  vapid();
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(userId);
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, JSON.stringify(payload), { TTL: 6 * 3600 });
      db.prepare("UPDATE push_subscriptions SET last_ok=datetime('now'), failures=0 WHERE id=?").run(s.id); ok++;
    } catch (e) {
      // 404/410: el móvil ya no acepta avisos (permiso retirado o app desinstalada) → se borra la suscripción
      if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(s.id);
      else db.prepare('UPDATE push_subscriptions SET failures=failures+1 WHERE id=?').run(s.id);
    }
  }
  return ok;
}

const MSG = {
  wellness: { title: 'Wellness de hoy', body: '¿Cómo te encuentras hoy? Rellena tu wellness (1 minuto).', url: '/?v=wellness' },
  rpe: { title: 'RPE de la sesión', body: '¿Qué tal el entrenamiento? Registra tu RPE de hoy.', url: '/?v=rpe' },
  eva: { title: 'EVA tras la sesión', body: 'Registra el dolor que has notado hoy (EVA 0–10).', url: '/?v=dolor' },
};
// Jugadores con cuenta y avisos activos a los que les falta el registro de hoy
function pendingUsers(kind, date) {
  const rows = db.prepare(`SELECT u.id AS user_id, u.player_id FROM users u WHERE u.role='player' AND u.active=1 AND u.player_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id=u.id)`).all();
  const openInj = pid => db.prepare("SELECT id FROM injuries WHERE player_id=? AND status!='completada' LIMIT 1").get(pid);
  return rows.filter(r => {
    const inj = openInj(r.player_id);
    if (kind === 'eva') return inj && !db.prepare('SELECT 1 FROM injury_pain WHERE injury_id=? AND date=?').get(inj.id, date);
    if (inj) return false; // lesionado: solo recibe el aviso de EVA
    const p = db.prepare('SELECT availability FROM players WHERE id=?').get(r.player_id);
    if (p?.availability === 'lesionado') return false;
    if (kind === 'wellness') return !db.prepare("SELECT 1 FROM wellness_entries WHERE player_id=? AND date=? AND status='valido'").get(r.player_id, date);
    if (kind === 'rpe') return !db.prepare("SELECT 1 FROM load_entries WHERE player_id=? AND date=? AND kind='colectivo' AND status='valido'").get(r.player_id, date);
    return false;
  });
}
async function sendReminder(kind, date, { force = false } = {}) {
  if (!force && db.prepare('SELECT 1 FROM push_log WHERE kind=? AND date=? AND user_id IS NULL').get(kind, date)) return { skipped: true, sent: 0 };
  let sent = 0, users = 0;
  for (const u of pendingUsers(kind, date)) { users++; sent += await sendToUser(u.user_id, { ...MSG[kind], tag: `${kind}-${date}` }); }
  db.prepare('INSERT INTO push_log(kind,date,user_id,sent) VALUES (?,?,NULL,?)').run(kind, date, sent);
  return { users, sent };
}
// Comprobación cada minuto: wellness todos los días; RPE y EVA solo los días de entrenamiento colectivo
async function tick(now = madridNow()) {
  const s = settings(); const n = s.notifications;
  if (!n?.enabled) return [];
  const training = s.collectiveDays.includes(isoWeekday(now.date)) || !!db.prepare("SELECT 1 FROM team_sessions WHERE date=? AND session_type!='Partido'").get(now.date);
  const out = [];
  for (const kind of ['wellness', 'rpe', 'eva']) {
    if (kind !== 'wellness' && !training) continue;
    if (n[kind]?.enabled && n[kind].time === now.time) out.push({ kind, ...(await sendReminder(kind, now.date)) });
  }
  return out;
}
function start() {
  vapid();
  const t = setInterval(() => { tick().catch(e => console.error('Avisos push', e)); }, 60 * 1000);
  t.unref();
}
module.exports = { publicKey, sendToUser, sendReminder, pendingUsers, tick, start, madridNow, MSG };
