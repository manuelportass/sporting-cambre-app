'use strict';
// Suscripción a avisos (jugadores) y envío manual/prueba (preparador)
const express = require('express');
const { db, audit } = require('../db');
const A = require('../auth');
const P = require('../lib/push');
const { h, bad, oneOf } = require('../lib/util');

const r = express.Router();
r.get('/key', A.requireAuth, (req, res) => res.json({ publicKey: P.publicKey() }));
r.get('/status', A.requireAuth, (req, res) => res.json({ subscriptions: db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?').get(req.user.id).n }));
r.post('/subscribe', A.requireAuth, h((req, res) => {
  const s = req.body?.subscription || {};
  if (typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw bad('Suscripción no válida.');
  db.prepare(`INSERT INTO push_subscriptions(user_id,endpoint,keys,user_agent) VALUES (?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, keys=excluded.keys, failures=0`).run(req.user.id, s.endpoint, JSON.stringify({ p256dh: s.keys.p256dh, auth: s.keys.auth }), String(req.get('user-agent') || '').slice(0, 200));
  res.json({ ok: true });
}));
r.post('/unsubscribe', A.requireAuth, h((req, res) => {
  if (req.body?.endpoint) db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(req.body.endpoint, req.user.id);
  else db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
}));
r.post('/test', A.requireAuth, h(async (req, res) => {
  const sent = await P.sendToUser(req.user.id, { title: 'Avisos activados', body: 'Así te llegarán los recordatorios de wellness y RPE.', url: '/', tag: 'prueba' });
  res.json({ ok: true, sent });
}));
// Preparador: quién tiene avisos activos y envío inmediato a quien le falte el registro de hoy
r.get('/overview', A.requireAdmin, (req, res) => {
  const date = P.madridNow().date;
  const players = db.prepare(`SELECT u.id, u.display_name, (SELECT COUNT(*) FROM push_subscriptions s WHERE s.user_id=u.id) AS devices FROM users u WHERE u.role='player' AND u.active=1 ORDER BY u.display_name`).all();
  const log = db.prepare('SELECT kind, date, sent, created_at FROM push_log WHERE user_id IS NULL ORDER BY id DESC LIMIT 10').all();
  res.json({ date, players, active: players.filter(p => p.devices).length, pending: Object.fromEntries(['wellness', 'rpe', 'eva'].map(k => [k, P.pendingUsers(k, date).length])), log });
});
r.post('/send', A.requireAdmin, h(async (req, res) => {
  const kind = oneOf(req.body?.kind, ['wellness', 'rpe', 'eva'], 'Tipo de aviso');
  const out = await P.sendReminder(kind, P.madridNow().date, { force: true });
  audit('push', null, 'send', null, { kind, ...out }, req.user.id);
  res.json({ ok: true, ...out });
}));
module.exports = { router: r };
