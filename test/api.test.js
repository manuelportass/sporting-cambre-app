'use strict';
// Pruebas de extremo a extremo de la API: permisos, persistencia y flujos principales.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scpf-'));
process.env.DATA_DIR = dir;
process.env.SETUP_CODE = '123456';
const { createApp } = require('../server/index');
const { today, isoWeekday } = require('../server/lib/util');
const { addDays } = require('../server/lib/load');
const mondayOf = d => addDays(d, 1 - isoWeekday(d));

let base, server;
function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'content-type': 'application/json', 'x-requested-with': 'scpf', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
  const upload = async (url, name, type, buf) => {
    const form = new FormData(); form.append('file', new Blob([buf], { type }), name);
    const res = await fetch(base + url, { method: 'POST', headers: { 'x-requested-with': 'scpf', ...(cookie ? { cookie } : {}) }, body: form });
    return { status: res.status, data: await res.json() };
  };
  const raw = url => fetch(base + url, { headers: cookie ? { cookie } : {} });
  return { upload, raw, get: u => call('GET', u), post: (u, b) => call('POST', u, b), put: (u, b) => call('PUT', u, b), del: (u, b) => call('DELETE', u, b), patch: (u, b) => call('PATCH', u, b) };
}
const admin = client(), player = client(), player2 = client(), anon = client();
// Fecha pasada que sea martes (día colectivo y de gimnasio)
let tue = today(); while (isoWeekday(tue) !== 2) tue = addDays(tue, -1);

test.before(async () => {
  server = createApp().listen(0);
  await new Promise(r => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => server.close());

test('configuración inicial protegida por código', async () => {
  assert.equal((await anon.get('/setup/status')).data.needsSetup, true);
  assert.equal((await anon.post('/setup', { code: '000000', name: 'X', pin: '123456' })).status, 403);
  const r = await admin.post('/setup', { code: '123456', name: 'José Manuel Portas Vázquez', pin: 'cambre2026' });
  assert.equal(r.status, 200);
  assert.equal((await anon.post('/setup', { code: '123456', name: 'Otro', pin: '123456' })).status, 409);
});

test('inicio de sesión por nombre completo sin distinguir tildes ni mayúsculas', async () => {
  const c = client();
  assert.equal((await c.post('/auth/login', { name: 'jose manuel portas vazquez', pin: 'mal' })).status, 401);
  assert.equal((await c.post('/auth/login', { name: 'JOSE MANUEL PORTAS VÁZQUEZ', pin: 'cambre2026' })).status, 200);
  assert.equal((await c.get('/auth/me')).data.user.role, 'admin');
});

test('sin sesión no hay acceso a datos', async () => {
  assert.equal((await anon.get('/players')).status, 401);
  assert.equal((await anon.get('/injuries')).status, 401);
  assert.equal((await anon.get('/team/dashboard')).status, 401);
});

let cats, slotA, slotB, pInf, pCad, pSen1, pSen2, pin1, pin2;
test('jugadores, importación y franjas', async () => {
  cats = Object.fromEntries((await admin.get('/categories')).data.map(c => [c.code, c.id]));
  slotA = (await admin.post('/gym/slots', { weekday: 2, start_time: '17:00', end_time: '18:00', category_id: cats.infantil })).data.id;
  slotB = (await admin.post('/gym/slots', { weekday: 2, start_time: '18:00', end_time: '19:00', category_id: cats.cadete })).data.id;
  const prev = await admin.post('/players/import/preview', { rows: [
    { full_name: 'Ana Pérez López', category: 'Infantil', weekday: 'Martes', start_time: '17:00' },
    { full_name: 'Luis Gómez', category: 'cadete', weekday: 'martes', start_time: '18:00' },
    { full_name: 'ana perez lopez', category: 'Infantil' },
    { full_name: 'Sin Categoria' },
  ] });
  assert.equal(prev.status, 200);
  assert.equal(prev.data.rows[0].slot_id, slotA);
  assert.ok(prev.data.rows[2].issues.some(i => /Repetido/.test(i.msg)));
  assert.ok(prev.data.rows[3].issues.some(i => /Categoría pendiente/.test(i.msg)));
  const com = await admin.post('/players/import/commit', { rows: prev.data.rows });
  assert.equal(com.data.created, 3); // el repetido no se duplica
  const list = (await admin.get('/players')).data;
  pInf = list.find(p => p.first_name === 'Ana').id;
  pCad = list.find(p => p.first_name === 'Luis').id;
  assert.equal((await admin.post('/players', { first_name: 'Ana', last_name: 'Pérez López' })).status, 409);
  pSen1 = (await admin.post('/players', { first_name: 'Carlos', last_name: 'Senior Uno', category_id: cats.senior, position: 'Defensa' })).data.id;
  pSen2 = (await admin.post('/players', { first_name: 'David', last_name: 'Senior Dos', category_id: cats.senior })).data.id;
});

test('asistencia: marcar, puntual, cambio de franja sin alterar la asignación habitual', async () => {
  assert.equal((await admin.post('/gym/attendance', { date: tue, slot_id: slotA, player_id: pInf, status: 'presente' })).status, 200);
  assert.equal((await admin.post('/gym/attendance', { date: tue, slot_id: slotA, player_id: pCad, status: 'presente' })).status, 400);
  assert.equal((await admin.post('/gym/attendance/add', { date: tue, slot_id: slotA, player_id: pCad })).status, 200); // otra categoría, puntual
  assert.equal((await admin.post('/gym/attendance/move', { date: tue, from_slot_id: slotA, to_slot_id: slotB, player_id: pInf })).status, 200);
  const day = (await admin.get('/gym/day?date=' + tue)).data;
  const a = day.slots.find(s => s.slot.id === slotA), b = day.slots.find(s => s.slot.id === slotB);
  assert.equal(a.list.find(x => x.player_id === pInf).status, 'movido');
  assert.equal(b.list.find(x => x.player_id === pInf).status, 'presente');
  assert.equal(a.stats.previstos, 1); // solo el puntual
  const p = (await admin.get('/players/' + pInf)).data;
  assert.deepEqual(p.slots.map(s => s.id), [slotA]); // asignación habitual intacta
  const nextTue = addDays(tue, 7);
  const d2 = (await admin.get('/gym/day?date=' + nextTue)).data;
  assert.ok(d2.slots.find(s => s.slot.id === slotA).list.some(x => x.player_id === pInf && x.status === 'pendiente'));
  // historial de cambios
  const att = b.list.find(x => x.player_id === pInf);
  assert.equal((await admin.post('/gym/attendance', { date: tue, slot_id: slotB, player_id: pInf, status: 'justificada', note: 'Examen' })).status, 200);
  const hist = (await admin.get(`/gym/attendance/${att.attendance_id}/history`)).data;
  assert.ok(hist.length >= 1);
  const rep = (await admin.get('/gym/report?week=' + tue)).data;
  const ana = rep.rows.find(r => r.player_id === pInf);
  assert.equal(ana.previstas, 1); assert.equal(ana.justificada, 1);
  assert.ok(rep.observations.some(o => /Examen/.test(o.text)));
  // Una franja de la semana con fecha posterior a hoy y la lista ya pasada también entra en el informe
  {
    const slotsAll = (await admin.get('/gym/slots')).data, t0 = today();
    const fut = [1, 2, 3, 4, 5, 6].map(k => addDays(t0, k)).find(d => mondayOf(d) === mondayOf(t0) && slotsAll.some(s => s.weekday === (new Date(d + 'T12:00:00Z').getUTCDay() || 7)));
    if (fut) {
      const sl = slotsAll.find(s => s.weekday === (new Date(fut + 'T12:00:00Z').getUTCDay() || 7));
      const dd = (await admin.get('/gym/day?date=' + fut)).data.slots.find(x => x.slot.id === sl.id);
      if (dd.list.length) {
        assert.equal((await admin.post('/gym/attendance', { date: fut, slot_id: sl.id, player_id: dd.list[0].player_id, status: 'presente' })).status, 200);
        const rf = (await admin.get('/gym/report?week=' + t0)).data.slotSummary.find(x => x.slot_id === sl.id);
        assert.equal(rf.asistencia, 100);
      }
    }
  }
  // Resumen por franja: solo porcentajes (asistencia + ausencia = 100 %)
  const sb = rep.slotSummary.find(x => x.slot_id === slotB);
  assert.ok(sb && sb.asistencia !== undefined && Math.round(sb.asistencia + sb.ausencia) === 100, JSON.stringify(rep.slotSummary));
});

test('cuentas de jugador: solo primer equipo, PIN generado, acceso limitado', async () => {
  assert.equal((await admin.post('/users', { player_id: pInf })).status, 400);
  const u1 = await admin.post('/users', { player_id: pSen1 });
  const u2 = await admin.post('/users', { player_id: pSen2 });
  pin1 = u1.data.pin; pin2 = u2.data.pin;
  assert.match(pin1, /^\d{6}$/);
  assert.equal((await player.post('/auth/login', { name: 'carlos senior uno', pin: pin1 })).status, 200);
  assert.equal((await player2.post('/auth/login', { name: 'David Senior Dos', pin: pin2 })).status, 200);
  for (const u of ['/players', '/injuries', '/gym/day?date=' + tue, '/team/dashboard', '/users', '/audit', `/players/${pSen2}`])
    assert.equal((await player.get(u)).status, 403, u);
});

test('RPE: observaciones obligatorias, carga calculada en servidor, sin duplicados, días colectivos', async () => {
  const s = (await admin.post('/team/sessions', { date: tue, session_type: 'Entrenamiento', planned_minutes: 90 })).data.id;
  assert.ok(s);
  assert.equal((await player.post('/me/rpe', { date: tue, session_type: 'Entrenamiento', duration_min: 90, rpe: 7, notes: '' })).status, 400);
  const ok = await player.post('/me/rpe', { date: tue, session_type: 'Entrenamiento', duration_min: 90, rpe: 7, notes: 'Bien', load_au: 99999, player_id: pSen2 });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.entry.load_au, 630);
  assert.equal(ok.data.entry.player_id, pSen1); // ignora player_id enviado
  assert.equal((await player.post('/me/rpe', { date: tue, session_type: 'Entrenamiento', duration_min: 80, rpe: 6, notes: 'x' })).status, 409);
  assert.equal((await player.post('/me/rpe', { date: tue, session_type: 'Recuperación', duration_min: 80, rpe: 6, notes: 'x' })).status, 409); // una sola sesión por día
  const days = (await player.get('/me/rpe-sessions')).data;
  assert.deepEqual(days.map(d => d.weekday), ['martes', 'jueves', 'viernes']);
  assert.ok(days.every(d => d.date <= today()));
  assert.ok(days.find(d => d.date === tue)?.done || !days.some(d => d.date === tue));
  const mon = addDays(tue, -1);
  assert.equal((await player.post('/me/rpe', { date: mon, session_type: 'Entrenamiento', duration_min: 60, rpe: 5, notes: 'x' })).status, 400);
  assert.equal((await player.post('/me/rpe', { date: addDays(today(), 3), session_type: 'Entrenamiento', duration_min: 60, rpe: 5, notes: 'x' })).status, 400);
  assert.equal((await player.post('/me/extra', { date: mon, session_type: 'Fuerza / gimnasio', duration_min: 45, rpe: 6, notes: 'Pierna' })).status, 200);
  assert.equal((await player.post('/me/extra', { date: mon, session_type: 'Fuerza / gimnasio', duration_min: 45, rpe: 6, notes: 'Pierna' })).status, 409);
  // El jugador 2 no envió RPE → pendiente (no se interpreta como cero)
  const dash = (await admin.get('/team/dashboard?date=' + tue)).data;
  const d2 = dash.rows.find(r => r.player_id === pSen2);
  assert.ok(d2.missing.includes(tue));
  assert.equal(d2.indicators.acwr.color, 'gris');
});

test('wellness: obligatorio completo, uno por día, coherencia de color', async () => {
  const sc = { sueno: 5, fatiga: 4, dolor: 4, estres: 5, animo: 5, recuperacion: 4 };
  assert.equal((await player.post('/me/wellness', { date: today(), scores: sc, notes: '' })).status, 400);
  assert.equal((await player.post('/me/wellness', { date: today(), scores: { sueno: 5 }, notes: 'ok' })).status, 400);
  const r = await player.post('/me/wellness', { date: today(), scores: sc, notes: 'Bien' });
  assert.equal(r.status, 200);
  assert.equal(r.data.summary.color, 'verde');
  assert.equal((await player.post('/me/wellness', { date: today(), scores: sc, notes: 'Bien' })).status, 409);
});

test('corrección trazable: el jugador solicita, el preparador aprueba', async () => {
  const hist = (await player.get('/me/history')).data;
  const e = hist.loads.find(l => l.kind === 'colectivo');
  const cr = await player.post('/me/corrections', { entity: 'load', entity_id: e.id, reason: 'Fueron 75 min', proposed: { duration_min: 75 } });
  assert.equal(cr.status, 200);
  assert.equal((await player2.post('/me/corrections', { entity: 'load', entity_id: e.id, reason: 'x', proposed: { rpe: 1 } })).status, 404); // ajeno
  const pend = (await admin.get('/team/corrections?status=pendiente')).data;
  assert.equal(pend.length, 1);
  assert.equal((await admin.post(`/team/corrections/${pend[0].id}/resolve`, { approve: true })).status, 200);
  const h2 = (await player.get('/me/history')).data;
  const valid = h2.loads.filter(l => l.kind === 'colectivo' && l.status === 'valido');
  assert.equal(valid.length, 1); assert.equal(valid[0].load_au, 525);
  assert.ok(h2.loads.some(l => l.id === e.id && l.status === 'anulado'));
});

test('lesiones: privadas, fases manuales con historial, adjuntos protegidos', async () => {
  const i = await admin.post('/injuries', { player_id: pSen2, injury_date: tue, zone: 'Isquiotibiales', laterality: 'derecha', next_review: addDays(today(), 3) });
  assert.equal(i.status, 200);
  const det = (await admin.get('/injuries/' + i.data.id)).data;
  assert.equal(det.status, 'activa');
  assert.ok(det.phase_id);
  const phases = (await admin.get('/injuries/phases')).data;
  assert.equal((await admin.post(`/injuries/${i.data.id}/phase`, { phase_id: phases[1].id, status: 'readaptacion', note: 'Criterios cumplidos' })).status, 200);
  assert.equal((await admin.post(`/injuries/${i.data.id}/entries`, { date: today(), pain: 3, exercises: [{ name: 'Puente', sets: '3', reps: '10' }] })).status, 200);
  const det2 = (await admin.get('/injuries/' + i.data.id)).data;
  assert.equal(det2.history.length, 2); assert.equal(det2.entries[0].exercises[0].name, 'Puente');
  assert.equal((await player.get('/injuries/' + i.data.id)).status, 403);
  // El jugador lesionado registra su dolor (EVA); el resto no puede
  const mi = (await player2.get('/me/injury')).data;
  assert.equal(mi.injury.id, i.data.id); assert.equal(mi.injury.diagnosis, undefined);
  assert.equal((await player2.post('/me/pain', { date: today(), eva: 11, notes: 'x' })).status, 400);
  assert.equal((await player2.post('/me/pain', { date: today(), eva: 4, notes: '' })).status, 400);
  assert.equal((await player2.post('/me/pain', { date: today(), eva: 4, notes: 'Molestia al esprintar' })).status, 200);
  assert.equal((await player2.post('/me/pain', { date: today(), eva: 2, notes: 'otra' })).status, 409);
  assert.equal((await player.post('/me/pain', { date: today(), eva: 2, notes: 'x' })).status, 400);
  assert.equal((await player.get('/me/injury')).data.injury, null);
  const det3 = (await admin.get('/injuries/' + i.data.id)).data;
  assert.equal(det3.pain[0].eva, 4); assert.equal(det3.pain[0].notes, 'Molestia al esprintar');
  // El preparador puede eliminar registros de dolor y seguimientos
  assert.equal((await admin.del('/injuries/pain/' + det3.pain[0].id)).status, 200);
  assert.equal((await admin.get('/injuries/' + i.data.id)).data.pain.length, 0);
  const dash = (await admin.get('/injuries/dashboard')).data;
  assert.equal(dash.counts.readaptacion, 1);
  // Lesionado → no se le esperan RPE durante la lesión y figura como no disponible
  const td = (await admin.get('/team/dashboard?date=' + tue)).data;
  const d2 = td.rows.find(r => r.player_id === pSen2);
  assert.equal(d2.availability.code, 'no_disponible');
  assert.ok(!d2.missing.includes(tue));
  // Finalizar la recuperación: se cierra, queda en el historial y el jugador deja de ver el EVA
  assert.equal((await admin.post(`/injuries/${i.data.id}/finish`, { date: today(), note: 'Alta médica' })).status, 200);
  const fin = (await admin.get('/injuries/' + i.data.id)).data;
  assert.equal(fin.status, 'completada'); assert.equal(fin.closed_at, today()); assert.ok(/Recuperación finalizada/.test(fin.history[0].note));
  assert.equal((await admin.post(`/injuries/${i.data.id}/finish`, {})).status, 400);
  assert.equal((await player2.get('/me/injury')).data.injury, null);
  const hist2 = (await admin.get(`/team/players/${pSen2}/summary`)).data.injuries;
  assert.equal(hist2[0].status, 'completada'); assert.ok(hist2[0].days >= 0);
});

test('partidos: importación con vista previa, asociación y protección de datos manuales', async () => {
  const m = await admin.post('/team/matches', { date: tue, opponent: 'Rival FC', season: '2026/2027', home_away: 'local', goals_for: 2, goals_against: 1 });
  assert.equal(m.status, 200);
  assert.equal((await admin.put(`/team/matches/${m.data.id}/stats`, { stats: [{ player_id: pSen1, minutes: 90, started: true, goals: 1 }] })).status, 200);
  const prev = await admin.post('/team/matches/import/preview', { rows: [
    { fecha: tue.split('-').reverse().join('/'), rival: 'Rival FC', jugador: 'Carlos Senior Uno', minutos: 80, goles: 1, titular: 'Sí' },
    { fecha: tue, rival: 'Rival FC', jugador: 'D. Senior Dos', minutos: 10 },
    { fecha: tue, rival: 'Otro CF', jugador: 'Senior Dos David', minutos: 90 },
  ] });
  assert.equal(prev.status, 200);
  const g1 = prev.data.matches.find(x => x.opponent === 'Rival FC');
  assert.equal(g1.existing_id, m.data.id);
  assert.equal(g1.stats[0].conflict, true);   // difiere de lo introducido a mano
  assert.equal(g1.stats[1].player_id, pSen2); // «D. Senior Dos»: inicial + apellidos, marcado para verificar
  assert.equal(g1.stats[1].check, true);
  const g2 = prev.data.matches.find(x => x.opponent === 'Otro CF');
  assert.equal(g2.stats[0].player_id, pSen2); // coincidencia parcial
  g1.stats[1].player_id = pSen2;              // corrección manual de la asociación
  const com = await admin.post('/team/matches/import/commit', { matches: prev.data.matches, source: 'CSV prueba' });
  assert.equal(com.status, 200);
  const det = (await admin.get('/team/matches/' + m.data.id)).data;
  assert.equal(det.stats.find(s => s.player_id === pSen1).minutes, 90); // manual intacto
  // Mi temporada (jugador): minutos, convocatorias, titularidad, goles y entrenamientos
  const ms = (await player.get('/me/season')).data;
  assert.ok(ms.matchesTotal >= 1 && ms.called >= 1 && ms.minutes >= 90 && ms.minutesTotal === ms.matchesTotal * 90 && ms.goals >= 1, JSON.stringify(ms));
  assert.ok(ms.trainings.total >= ms.trainings.attended);
  const pr = (await player.get('/me/progress')).data;
  assert.equal(pr.load.weeks.length, 8); assert.ok(pr.load.message.title);
  const nm = (await player.get('/me/next-match')).data;
  if (nm) { assert.ok(nm.date >= today() && nm.opponent && nm.matchday && ['local', 'visitante'].includes(nm.home_away)); assert.ok(!/SPORTING CAMBRE/.test(nm.opponent)); }
  assert.deepEqual(ms.next, nm);
  assert.equal(det.stats.find(s => s.player_id === pSen2).minutes, 10);
  const prev2 = await admin.post('/team/matches/import/preview', { rows: [{ fecha: tue, rival: 'Rival FC', jugador: 'D. Senior Dos', minutos: 10 }] });
  assert.equal(prev2.data.matches[0].stats[0].player_id, pSen2); // alias recordado
  const stats = (await admin.get('/team/stats?season=2026/2027')).data;
  assert.equal(stats.find(s => s.player_id === pSen1).goles, 1);
});

test('tests físicos ampliables', async () => {
  const types = (await admin.get('/team/test-types')).data;
  assert.equal(types.length, 7); assert.ok(types.some(t => t.name === 'Peso corporal' && t.fields[0].unit === 'kg'));
  const nt = await admin.post('/team/test-types', { name: 'Yo-Yo IR1', family: 'resistencia', fields: [{ label: 'Distancia', unit: 'm', decimals: 0, better: 'higher' }] });
  assert.equal(nt.status, 200);
  const cmj = types.find(t => t.name === 'CMJ bilateral');
  assert.equal((await admin.post('/team/tests', { items: [{ test_type_id: cmj.id, player_id: pSen1, date: tue, values: { altura: 38.2 }, device: 'Plataforma' }] })).status, 200);
  assert.equal((await player.get('/me/tests')).data[0].values.altura, 38.2);
  assert.equal((await player.get('/team/tests')).status, 403);
});

test('persistencia y RGPD: exportar y eliminar jugador', async () => {
  const exp = await admin.get(`/players/${pCad}/export`);
  assert.equal(exp.status, 200);
  assert.ok(exp.data.asistencia_gimnasio.length >= 1);
  assert.equal((await admin.del(`/players/${pCad}`, { confirm: 'otro' })).status, 400);
  assert.equal((await admin.del(`/players/${pCad}`, { confirm: 'luis gomez' })).status, 200);
  assert.equal((await admin.get(`/players/${pCad}`)).status, 404);
  // Reabrir la base de datos desde disco
  const Database = require('better-sqlite3');
  const d = new Database(path.join(dir, 'app.db'), { readonly: true });
  assert.ok(d.prepare('SELECT COUNT(*) n FROM load_entries').get().n >= 3);
  d.close();
});

test('CSRF: sin cabecera propia se rechaza', async () => {
  const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test('fotos y documentos: solo accesibles con permiso', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const ph = await admin.upload(`/players/${pSen1}/photo`, 'foto.png', 'image/png', png);
  assert.equal(ph.status, 200);
  const fid = ph.data.photo_file_id;
  assert.equal((await player.raw('/files/' + fid)).status, 200);   // su propia foto
  assert.equal((await player2.raw('/files/' + fid)).status, 403);  // foto de otro
  assert.equal((await anon.raw('/files/' + fid)).status, 401);
  const inj = (await admin.get('/injuries')).data[0];
  const doc = await admin.upload(`/injuries/${inj.id}/files`, 'informe.pdf', 'application/pdf', Buffer.from('%PDF-1.4 prueba'));
  assert.equal(doc.status, 200);
  assert.equal((await player2.raw('/files/' + doc.data.id)).status, 403); // documento médico de su propia lesión: tampoco
  assert.equal((await admin.raw('/files/' + doc.data.id)).status, 200);
  const exe = await admin.upload(`/injuries/${inj.id}/files`, 'x.exe', 'application/x-msdownload', Buffer.from('MZ'));
  assert.equal(exe.status, 400);
});

test('actas: nombres «APELLIDOS, NOMBRE» y adjuntos del partido', async () => {
  const mk = async (f, l) => (await admin.post('/players', { first_name: f, last_name: l, category_id: cats.senior })).data.id;
  const miguelA = await mk('Miguel A.', 'Eiriz'), dan = await mk('Dan', 'Mallo'), gonzalo = await mk('Gonzalo', 'Mallo');
  const prev = await admin.post('/team/matches/import/preview', { rows: [
    { fecha: '2026-09-06', rival: 'S.D. Cacheiras', temporada: '2026/2027', jugador: 'Miguel Angel Eiriz Fernandez', titular: 'si', minutos: 81 },
    { fecha: '2026-09-06', rival: 'S.D. Cacheiras', jugador: 'Dan Mallo Suarez', titular: 'si', minutos: 90 },
    { fecha: '2026-09-06', rival: 'S.D. Cacheiras', jugador: 'Gonzalo Mallo Ponte', titular: 'no', minutos: 3, goles: 1 },
    { fecha: '2026-09-06', rival: 'S.D. Cacheiras', jugador: 'Miguel Miras Diaz', titular: 'no', minutos: 0 },
  ] });
  const st = prev.data.matches[0].stats;
  assert.deepEqual(st.map(x => x.player_id), [miguelA, dan, gonzalo, null]);
  st[3].skip = true;
  const com = await admin.post('/team/matches/import/commit', { matches: prev.data.matches, source: 'Acta Futgal J1' });
  assert.equal(com.data.matchIds.length, 1);
  const up = await admin.upload(`/team/matches/${com.data.matchIds[0]}/files`, 'acta.pdf', 'application/pdf', Buffer.from('%PDF-1.4 acta'));
  assert.equal(up.status, 200);
  const det = (await admin.get('/team/matches/' + com.data.matchIds[0])).data;
  assert.equal(det.files.length, 1);
  assert.equal(det.stats.find(x => x.player_id === gonzalo).goals, 1);
  assert.equal((await player.raw('/files/' + up.data.id)).status, 403);
});
