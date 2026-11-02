'use strict';
// MULTAS del primer equipo por no registrar el RPE a tiempo.
// Regla: los días de entrenamiento colectivo se envía el aviso de RPE a la hora configurada (Configuración → Avisos).
// Si pasadas 24 h desde ese aviso el jugador no ha registrado el RPE de ese día → multa (2 € por defecto).
// 23 h después del aviso se envía un último recordatorio («tienes 1 hora»).
// Las multas se generan de forma idempotente (una por jugador y día) al consultar el apartado y cada minuto en el servidor.
const { db, settings, audit } = require('../db');
const { isoWeekday } = require('./util');

const HOUR = 3600e3;

// Fecha y hora de Madrid para un instante
function madridParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, sec: Number(p.second) };
}
// Instante (Date) correspondiente a una fecha y hora de Madrid
function madridToDate(date, time) {
  const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = madridParts(new Date(guess));
  const [py, pm, pd] = p.date.split('-').map(Number), [ph, pmin] = p.time.split(':').map(Number);
  const off = Date.UTC(py, pm - 1, pd, ph, pmin) - guess;
  return new Date(guess - off);
}
const sqlUtc = d => d.toISOString().slice(0, 19).replace('T', ' '); // formato de datetime('now')
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

function cfg(s = settings()) { return { ...s.fines, rpeTime: s.notifications?.rpe?.time || '22:00' }; }

// Día de entrenamiento: hay sesión programada (no partido) o es día colectivo habitual sin partido ese día
function isTrainingDay(date, s = settings()) {
  if (db.prepare("SELECT 1 FROM team_sessions WHERE date=? AND session_type!='Partido'").get(date)) return true;
  if (db.prepare("SELECT 1 FROM team_sessions WHERE date=? AND session_type='Partido'").get(date)) return false;
  return (s.collectiveDays || []).includes(isoWeekday(date));
}

// Jugadores del primer equipo obligados a registrar el RPE ese día (con cuenta activa, sin lesión, sin ausencia marcada)
function eligible(date, noticeAt) {
  return db.prepare(`SELECT p.id AS player_id, u.id AS user_id, p.first_name, p.last_name FROM users u
      JOIN players p ON p.id=u.player_id JOIN categories c ON c.id=p.category_id
    WHERE u.role='player' AND u.active=1 AND p.active=1 AND c.code='senior' AND u.created_at <= @notice
      AND NOT EXISTS (SELECT 1 FROM injuries i WHERE i.player_id=p.id AND i.injury_date <= @d
        AND (i.status!='completada' OR (i.closed_at IS NOT NULL AND substr(i.closed_at,1,10) >= @d)))
      AND NOT EXISTS (SELECT 1 FROM team_attendance a JOIN team_sessions t ON t.id=a.session_id
        WHERE a.player_id=p.id AND t.date=@d AND a.status IN ('ausente','justificada','lesionado'))`).all({ d: date, notice: sqlUtc(noticeAt) });
}
// Primer registro de RPE de la sesión de ese día (los rellenos automáticos no cuentan)
const firstRpe = (pid, date) => db.prepare(`SELECT MIN(created_at) AS at FROM load_entries WHERE player_id=? AND date=? AND kind='colectivo' AND notes!='Relleno automático'`).get(pid, date).at;

// Genera las multas vencidas. Devuelve cuántas se han creado.
function settle(now = new Date()) {
  const s = settings(), c = cfg(s);
  if (!c.enabled || !c.startDate) return 0;
  const today = madridParts(now).date;
  let created = 0;
  for (let d = c.startDate; d <= today; d = addDays(d, 1)) {
    if (!isTrainingDay(d, s)) continue;
    const notice = madridToDate(d, c.rpeTime), deadline = new Date(notice.getTime() + 24 * HOUR);
    if (now < deadline) continue;
    for (const pl of eligible(d, notice)) {
      if (db.prepare("SELECT 1 FROM fines WHERE player_id=? AND date=? AND kind='rpe'").get(pl.player_id, d)) continue;
      const at = firstRpe(pl.player_id, d);
      if (at && at <= sqlUtc(deadline)) continue;
      const id = db.prepare("INSERT INTO fines(player_id,date,kind,reason,amount,deadline) VALUES (?,?,'rpe',?,?,?)")
        .run(pl.player_id, d, 'RPE no registrado en las 24 h siguientes al aviso', Number(c.amount) || 2, sqlUtc(deadline)).lastInsertRowid;
      audit('fine', id, 'auto_create', null, { player_id: pl.player_id, date: d }, null);
      created++;
    }
  }
  return created;
}

// Jugadores (con avisos activados) a los que hay que recordar que queda 1 hora para el RPE del día `date`
function reminderTargets(date) {
  const notice = madridToDate(date, cfg().rpeTime);
  return eligible(date, notice).filter(pl => !firstRpe(pl.player_id, date)
    && db.prepare('SELECT 1 FROM push_subscriptions WHERE user_id=?').get(pl.user_id));
}
// ¿Toca enviar ahora el recordatorio de multa? Devuelve la fecha del entrenamiento (ayer) o null.
function reminderDue(now = new Date()) {
  const s = settings(), c = cfg(s);
  if (!c.enabled || c.reminder === false) return null;
  const m = madridParts(now);
  const date = addDays(m.date, -1);
  if (date < c.startDate || !isTrainingDay(date, s)) return null;
  const at = new Date(madridToDate(date, c.rpeTime).getTime() + 23 * HOUR);
  return madridParts(at).date === m.date && madridParts(at).time === m.time ? date : null;
}

module.exports = { settle, reminderTargets, reminderDue, isTrainingDay, madridParts, madridToDate };
