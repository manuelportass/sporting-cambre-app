'use strict';
// Avisos push: suscripción, recordatorios solo a quien le falta el registro, limpieza de dispositivos caducados.
// Un servidor https local hace de «servicio push» (como el de Google o Apple) y recibe las notificaciones cifradas.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path'), https = require('https'), crypto = require('crypto');
const { execFileSync } = require('child_process');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scpf-push-'));
process.env.SETUP_CODE = '333333';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // solo para el servicio push simulado con certificado autofirmado
const { createApp } = require('../server/index');
const P = require('../server/lib/push');

const jars = {};
const mk = name => async (m, u, b) => {
  const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'scpf', cookie: jars[name] || '' }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jars[name] = sc.split(';')[0];
  return { status: r.status, data: await r.json().catch(() => null) };
};
const admin = mk('admin'), ana = mk('ana'), beto = mk('beto');
let base, server, push, pushUrl; const received = []; let gone = new Set();
const fakeSub = id => { const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return { endpoint: `${pushUrl}/send/${id}`, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') } }; };

test.before(async () => {
  server = createApp().listen(0); await new Promise(r => server.on('listening', r)); base = `http://127.0.0.1:${server.address().port}/api`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scpf-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', dir + '/k.pem', '-out', dir + '/c.pem', '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  push = https.createServer({ key: fs.readFileSync(dir + '/k.pem'), cert: fs.readFileSync(dir + '/c.pem') }, (req, res) => {
    let n = 0; req.on('data', c => { n += c.length; }); req.on('end', () => {
      const id = req.url.split('/').pop(); received.push({ id, headers: req.headers, bytes: n });
      res.statusCode = gone.has(id) ? 410 : 201; res.end();
    });
  }).listen(0);
  await new Promise(r => push.on('listening', r)); pushUrl = `https://127.0.0.1:${push.address().port}`;
});
test.after(() => { server.close(); push.close(); });

test('avisos push: suscripción, envío cifrado y solo a quien le falta el registro', async () => {
  await admin('POST', '/setup', { code: '333333', name: 'José Manuel Portas Vázquez', pin: 'cambre2026' });
  const cats = Object.fromEntries((await admin('GET', '/categories')).data.map(c => [c.code, c.id]));
  const a = (await admin('POST', '/players', { first_name: 'Ana', last_name: 'Prueba', category_id: cats.senior })).data.id;
  const b = (await admin('POST', '/players', { first_name: 'Beto', last_name: 'Prueba', category_id: cats.senior })).data.id;
  const pa = (await admin('POST', '/users', { player_id: a })).data.pin, pb = (await admin('POST', '/users', { player_id: b })).data.pin;
  assert.equal((await ana('POST', '/auth/login', { name: 'Ana Prueba', pin: pa })).status, 200);
  assert.equal((await beto('POST', '/auth/login', { name: 'Beto Prueba', pin: pb })).status, 200);
  // La clave pública se entrega; la privada nunca
  const k = (await ana('GET', '/push/key')).data;
  assert.ok(k.publicKey && !('privateKey' in k));
  assert.equal((await admin('GET', '/settings')).data.notifications.rpe.time, '22:00');
  assert.ok(!JSON.stringify((await admin('GET', '/settings')).data).includes(JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'vapid.json'))).privateKey));
  // Suscripciones
  assert.equal((await ana('POST', '/push/subscribe', { subscription: { endpoint: 'http://inseguro', keys: {} } })).status, 400);
  assert.equal((await ana('POST', '/push/subscribe', { subscription: fakeSub('ana') })).status, 200);
  assert.equal((await beto('POST', '/push/subscribe', { subscription: fakeSub('beto') })).status, 200);
  assert.equal((await ana('POST', '/push/send', { kind: 'rpe' })).status, 403); // solo el preparador
  // Prueba: llega cifrada (aes128gcm) con firma VAPID
  assert.equal((await ana('POST', '/push/test')).data.sent, 1);
  const t = received.find(x => x.id === 'ana');
  assert.equal(t.headers['content-encoding'], 'aes128gcm'); assert.ok(/^vapid t=/.test(t.headers.authorization)); assert.ok(t.bytes > 0);
  // Ana registra su RPE de hoy → el recordatorio de RPE solo le llega a Beto
  const date = P.madridNow().date;
  await admin('POST', '/team/load', { player_id: a, date, kind: 'colectivo', session_type: 'Entrenamiento', duration_min: 90, rpe: 5, notes: 'x' });
  received.length = 0;
  const r = (await admin('POST', '/push/send', { kind: 'rpe' })).data;
  assert.equal(r.users, 1); assert.deepEqual(received.map(x => x.id), ['beto']);
  // Programación: a la hora configurada un día de entrenamiento, una sola vez
  const s = (await admin('GET', '/settings')).data;
  await admin('PUT', '/settings/collectiveDays', { value: [1, 2, 3, 4, 5, 6, 7] });
  await admin('PUT', '/settings/notifications', { value: { ...s.notifications, wellness: { enabled: true, time: '09:15' } } });
  received.length = 0;
  const out = await P.tick({ date, time: '09:15' });
  assert.equal(out.find(x => x.kind === 'wellness').users, 2);
  assert.deepEqual((await P.tick({ date, time: '09:15' })).find(x => x.kind === 'wellness').skipped, true); // no se repite
  assert.deepEqual((await P.tick({ date, time: '09:16' })), []);
  assert.equal((await admin('PUT', '/settings/notifications', { value: { ...s.notifications, rpe: { enabled: true, time: '25:00' } } })).status, 400);
  // Día sin entrenamiento: el wellness sí se recuerda; el RPE no
  await admin('PUT', '/settings/collectiveDays', { value: [] });
  await admin('PUT', '/settings/notifications', { value: { ...s.notifications, wellness: { enabled: true, time: '08:00' }, rpe: { enabled: true, time: '08:00' } } });
  const free = await P.tick({ date: '2030-01-07', time: '08:00' });
  assert.deepEqual(free.map(x => x.kind), ['wellness']);
  // Un móvil que ya no acepta avisos (410) se elimina
  gone.add('beto');
  await P.sendToUser((await admin('GET', '/push/overview')).data.players.find(p => p.display_name === 'Beto Prueba').id, { title: 'x' });
  const ov = (await admin('GET', '/push/overview')).data;
  assert.equal(ov.active, 1);
  // Lesionado: no recibe wellness/RPE, sí EVA
  await admin('POST', '/injuries', { player_id: a, injury_date: date, zone: 'Tobillo' });
  assert.equal(P.pendingUsers('wellness', date).length, 0);
  assert.equal(P.pendingUsers('eva', date).length, 1);
  // Desactivar
  assert.equal((await ana('POST', '/push/unsubscribe', {})).status, 200);
  assert.equal((await admin('GET', '/push/overview')).data.active, 0);
});
