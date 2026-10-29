'use strict';
// Carga del listado de la temporada 2026/27 (datos facilitados por el preparador)
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scpf-season-'));
process.env.SETUP_CODE = '222222';
const { createApp } = require('../server/index');

let base, server, cookie = '';
const call = async (m, u, b) => {
  const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'scpf', cookie }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, data: await r.json() };
};
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.on('listening', r)); base = `http://127.0.0.1:${server.address().port}/api`; });
test.after(() => server.close());

test('listado 2026/27: franjas, jugadores y sin duplicados', async () => {
  await call('POST', '/setup', { code: '222222', name: 'José Manuel Portas Vázquez', pin: 'cambre2026' });
  const seed = (await call('GET', '/seed/season')).data;
  assert.equal(seed.slots.length, 6);
  assert.equal(seed.players.length, 105);
  assert.equal((await call('POST', '/seed/season/slots')).data.created, 6);
  assert.equal((await call('POST', '/seed/season/slots')).data.created, 0);
  const prev = (await call('POST', '/players/import/preview', { rows: seed.players })).data.rows;
  assert.ok(prev.every(r => !r.issues.some(i => i.level === 'error')));
  assert.ok(prev.filter(r => r.slot_id).length === 67);           // 8 + 8 + 17 + 14 + 13 (A) + 7 (B) con horario
  const c1 = (await call('POST', '/players/import/commit', { rows: prev })).data;
  assert.equal(c1.created, 105);
  const prev2 = (await call('POST', '/players/import/preview', { rows: seed.players })).data.rows;
  const c2 = (await call('POST', '/players/import/commit', { rows: prev2 })).data;
  assert.equal(c2.created, 0); assert.equal(c2.updated, 105);
  const players = (await call('GET', '/players')).data;
  assert.equal(players.length, 105);
  const count = c => players.filter(p => p.category_code === c).length;
  assert.deepEqual([count('infantil'), count('cadete'), count('juvenil'), count('senior')], [26, 32, 25, 22]);
  // Martes 18:00 infantil: 8 · Jueves 18:00 cadete: 17
  const slots = (await call('GET', '/gym/slots')).data;
  const n = (wd, t) => slots.find(s => s.weekday === wd && s.start_time === t).assigned;
  assert.deepEqual([n(2, '18:00'), n(2, '19:00'), n(2, '20:00'), n(4, '18:00'), n(4, '19:00'), n(4, '20:00')], [8, 7, 8, 17, 13, 14]);
  assert.ok(players.find(p => p.first_name === 'José' && p.last_name === 'Ares').notes.includes('Chema'));
  // Jugadores de base sin franja (listado completo) y asignación rápida
  const un = (await call('GET', '/gym/unassigned')).data;
  assert.equal(un.length, 16); assert.equal(un.filter(x => x.category === 'juvenil').length, 5);
  const jb = slots.find(s => s.weekday === 2 && s.start_time === '19:00');
  assert.equal((await call('POST', '/gym/assign', { player_id: un.find(x => x.category === 'juvenil').id, slot_id: jb.id })).status, 200);
  assert.equal((await call('GET', '/gym/unassigned')).data.length, 15);
});

test('histórico de RPE: sesiones, cargas y partido J1 con RPE 10 × minutos', async () => {
  const info = (await call('GET', '/team/seed/rpe-history')).data;
  assert.equal(info.missing.length, 0);
  const r1 = (await call('POST', '/team/seed/rpe-history')).data;
  assert.ok(r1.entries > 600, String(r1.entries));
  const r2 = (await call('POST', '/team/seed/rpe-history')).data;
  assert.equal(r2.entries, 0); // no se duplica
  const players = (await call('GET', '/players?category=senior')).data;
  const bruno = players.find(p => p.first_name === 'Bruno').id;
  const loads = (await call('GET', `/team/load?player_id=${bruno}&from=2026-09-06&to=2026-09-06`)).data;
  const m = loads.find(l => l.kind === 'partido');
  assert.equal(m.rpe, 10); assert.equal(m.duration_min, 87); assert.equal(m.load_au, 870);
  const ses = (await call('GET', '/team/sessions?from=2026-07-27&to=2026-07-27')).data;
  assert.equal(ses.length, 1); assert.ok(ses[0].avg_rpe > 0 && ses[0].avg_load > 0);
  assert.equal(ses[0].track_missing, 1);
  // Desde la J1 solo cuentan los partidos con acta y los entrenamientos son martes, jueves o viernes
  const all = (await call('GET', '/team/sessions?from=2026-09-07&to=2026-10-31')).data;
  assert.ok(all.filter(x => x.session_type !== 'Partido').every(x => [2, 4, 5].includes(new Date(x.date + 'T12:00:00Z').getUTCDay())));
  assert.equal(all.filter(x => x.session_type === 'Partido').length, 0);
  const pre = (await call('GET', '/team/sessions?from=2026-07-27&to=2026-09-05')).data;
  assert.ok(pre.some(x => x.date === '2026-07-29') && pre.some(x => x.notes === 'Amistoso')); // pretemporada intacta
  // Relleno de entrenamientos sin RPE (RPE 5 × 90′): el ACWR pasa a ser calculable y la asistencia real no cambia
  const before = (await call('GET', '/team/dashboard?date=2026-10-25')).data.rows;
  const f = (await call('POST', '/team/fill-missing', {})).data;
  assert.ok(f.created > 100, String(f.created));
  assert.equal((await call('POST', '/team/fill-missing', {})).data.created, 0);
  const after = (await call('GET', '/team/dashboard?date=2026-10-25')).data.rows;
  assert.ok(after.every(x => x.missing.length === 0));
  assert.ok(after.every(x => x.indicators.acwr.value !== null), after.filter(x => x.indicators.acwr.value === null).map(x => x.name).join());
  for (const x of after) { const b = before.find(y => y.player_id === x.player_id); assert.deepEqual(x.trainings, b.trainings); assert.ok(x.trainings.total >= 30 && x.trainings.attended <= x.trainings.total); }
  const fl = (await call('GET', `/team/load?player_id=${bruno}&from=2026-10-20&to=2026-10-23`)).data.filter(l => l.description === 'Relleno automático');
  assert.ok(fl.every(l => l.rpe === 5 && l.duration_min === 90 && l.load_au === 450));
  // Martes post-partido: grupos por minutos del acta
  const pm = (await call('GET', '/team/post-match?date=2026-09-08')).data;
  assert.equal(pm.match.date, '2026-09-06'); assert.equal(pm.match.matchday, 1);
  assert.ok(pm.groups.find(g => g.key === 'alto').players.some(p => p.name === 'Bruno González' && p.minutes === 87));
  assert.equal(pm.groups.reduce((a, g) => a + g.players.length, 0) + pm.excluded.length, 22);
  const pm2 = (await call('GET', '/team/post-match?date=2026-10-27')).data;
  assert.equal(pm2.missingActa.matchday, 8);
  // Editar los minutos del partido recalcula la carga automáticamente
  const match = (await call('GET', '/team/matches')).data[0];
  const det = (await call('GET', '/team/matches/' + match.id)).data;
  const stats = det.stats.map(s => ({ ...s, minutes: s.player_id === bruno ? 70 : s.minutes }));
  assert.equal((await call('PUT', `/team/matches/${match.id}/stats`, { stats })).status, 200);
  const l2 = (await call('GET', `/team/load?player_id=${bruno}&from=2026-09-06&to=2026-09-06`)).data.filter(l => l.kind === 'partido');
  assert.equal(l2.length, 1); assert.equal(l2[0].load_au, 700);
});

test('fotos de los jugadores: se asocian por nombre de archivo', async () => {
  const pre = (await call('GET', '/seed/photos')).data;
  assert.equal(pre.length, 21);
  assert.equal(pre.filter(x => !x.player_id).length, 0, pre.filter(x => !x.player_id).map(x => x.file).join());
  assert.equal(pre.find(x => x.file.startsWith('Jose Ares')).name, 'José Ares');
  const r = (await call('POST', '/seed/photos', {})).data;
  assert.equal(r.done, 21);
  assert.equal((await call('POST', '/seed/photos', {})).data.done, 0);
});
