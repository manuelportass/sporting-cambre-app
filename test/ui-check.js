'use strict';
// Recorrido visual con Playwright sobre una base de datos temporal con datos de PRUEBA
// (nombres ficticios). Uso: node test/ui-check.js <carpeta-capturas>
const os = require('os');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const out = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(out, { recursive: true });
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scpf-ui-'));
process.env.SETUP_CODE = '111111';
const { createApp } = require('../server/index');
const { today, isoWeekday } = require('../server/lib/util');
const { addDays } = require('../server/lib/load');

(async () => {
  const server = createApp().listen(0);
  await new Promise(r => server.on('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (m, u, b) => {
    const r = await fetch(base + '/api' + u, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'scpf', cookie }, body: b ? JSON.stringify(b) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${m} ${u} → ${r.status} ${d?.error}`);
    return d;
  };
  const browser = await chromium.launch();
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); };
  const watch = page => { page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`)); page.on('console', m => m.type() === 'error' && errors.push(`[console] ${m.text()}`)); };

  // 1) Configuración inicial por la interfaz
  let ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  let page = await ctx.newPage(); watch(page);
  await page.goto(base);
  await shot(page, '00-setup');
  await page.fill('input[inputmode=numeric]', '111111');
  const pins = page.locator('input[type=password]');
  await pins.nth(0).fill('cambre2026'); await pins.nth(1).fill('cambre2026');
  await page.click('button:has-text("Crear cuenta")');
  await page.waitForSelector('.tile');
  await shot(page, '01-inicio-vacio');

  // 2) Datos de prueba vía API (sesión del admin)
  await call('POST', '/auth/login', { name: 'José Manuel Portas Vázquez', pin: 'cambre2026' });
  const cats = Object.fromEntries((await call('GET', '/categories')).map(c => [c.code, c.id]));
  const s1 = (await call('POST', '/gym/slots', { weekday: 2, start_time: '17:00', end_time: '18:00', category_id: cats.infantil })).id;
  await call('POST', '/gym/slots', { weekday: 2, start_time: '18:00', end_time: '19:00', category_id: cats.cadete });
  await call('POST', '/gym/slots', { weekday: 3, start_time: '18:00', end_time: '19:00', category_id: cats.juvenil });
  const rows = [];
  const N = ['Prueba Uno', 'Prueba Dos', 'Prueba Tres', 'Prueba Cuatro', 'Prueba Cinco', 'Prueba Seis'];
  N.forEach((n, i) => rows.push({ full_name: 'Infantil ' + n, category: 'Infantil', weekday: 'Martes', start_time: '17:00' }));
  N.slice(0, 4).forEach(n => rows.push({ full_name: 'Cadete ' + n, category: 'Cadete', weekday: 'Martes', start_time: '18:00' }));
  N.slice(0, 4).forEach(n => rows.push({ full_name: 'Juvenil ' + n, category: 'Juvenil', weekday: 'Miércoles', start_time: '18:00' }));
  const prev = await call('POST', '/players/import/preview', { rows });
  await call('POST', '/players/import/commit', { rows: prev.rows });
  const seniors = [];
  for (const n of ['Senior Alfa Prueba', 'Senior Beta Prueba', 'Senior Gamma Prueba', 'Senior Delta Prueba']) {
    const [f, ...l] = n.split(' ');
    seniors.push((await call('POST', '/players', { first_name: f + ' ' + l[0], last_name: l.slice(1).join(' '), category_id: cats.senior, position: 'Centrocampista' })).id);
  }
  let tue = today(); while (isoWeekday(tue) !== 2) tue = addDays(tue, -1);
  const players = await call('GET', '/players');
  const inf = players.filter(p => p.category_code === 'infantil');
  for (const [i, p] of inf.entries()) if (i < 4) await call('POST', '/gym/attendance', { date: tue, slot_id: s1, player_id: p.id, status: ['presente', 'presente', 'ausente', 'justificada'][i], note: i === 3 ? 'Examen' : undefined });
  await call('POST', '/gym/attendance/add', { date: tue, slot_id: s1, player_id: players.find(p => p.category_code === 'cadete').id });
  // Carga: 5 semanas de sesiones colectivas para el primer equipo
  const from = addDays(today(), -35);
  await call('POST', '/team/sessions/generate', { from, to: addDays(today(), 7), planned_minutes: 90 });
  const sess = await call('GET', `/team/sessions?from=${from}&to=${today()}`);
  for (const [k, pid] of seniors.entries()) {
    for (const [j, s] of sess.entries()) {
      if (k === 1 && j === sess.length - 2) continue; // un RPE pendiente
      await call('POST', '/team/load', { player_id: pid, date: s.date, kind: 'colectivo', session_type: 'Entrenamiento', duration_min: 80 + ((j * 7 + k * 3) % 25), rpe: 4 + ((j + k) % 5), notes: 'Dato de prueba', team_session_id: s.id });
    }
  }
  const m = await call('POST', '/team/matches', { date: addDays(today(), -2), opponent: 'Rival de prueba', home_away: 'local', goals_for: 2, goals_against: 1 });
  await call('PUT', `/team/matches/${m.id}/stats`, { stats: seniors.map((pid, i) => ({ player_id: pid, minutes: 90 - i * 15, started: i < 3, goals: i === 0 ? 1 : 0 })) });
  await call('POST', '/team/matches', { date: addDays(today(), 5), opponent: 'Próximo rival de prueba', home_away: 'visitante' });
  const cmj = (await call('GET', '/team/test-types')).find(t => t.name === 'CMJ bilateral');
  await call('POST', '/team/tests', { items: seniors.map((pid, i) => ({ test_type_id: cmj.id, player_id: pid, date: addDays(today(), -30), values: { altura: 33 + i }, device: 'Plataforma' })) });
  await call('POST', '/team/tests', { items: seniors.map((pid, i) => ({ test_type_id: cmj.id, player_id: pid, date: addDays(today(), -3), values: { altura: 34.5 + i * 0.8 }, device: 'Plataforma' })) });
  const inj = await call('POST', '/injuries', { player_id: seniors[3], injury_date: addDays(today(), -12), zone: 'Tobillo', laterality: 'derecha', injury_type: 'Ligamentosa', next_review: addDays(today(), 2) });
  await call('POST', `/injuries/${inj.id}/entries`, { date: addDays(today(), -8), pain: 6, exercises: [{ name: 'Movilidad de tobillo', sets: '3', reps: '15' }] });
  await call('POST', `/injuries/${inj.id}/entries`, { date: addDays(today(), -2), pain: 3, exercises: [{ name: 'Elevación de talones', sets: '3', reps: '12', load: 'Peso corporal' }] });
  const inj0 = await call('POST', '/injuries', { player_id: seniors[0], injury_date: addDays(today(), -5), zone: 'Isquiotibiales', laterality: 'izquierda' });
  const acct = await call('POST', '/users', { player_id: seniors[0] });

  // 3) Pantallas del preparador
  await page.reload();
  const shots = [['/', '02-inicio'], ['/jugadores', '03-jugadores'], ['/gimnasio?x', '04-asistencia'], [`/gimnasio/informe?week=${tue}`, '05-informe'],
    ['/lesiones', '06-lesiones'], [`/lesiones/${inj.id}`, '07-lesion-ficha'], ['/primer-equipo', '08a-primer-equipo'], ['/primer-equipo/jugadores', '08-panel-carga'], ['/primer-equipo/martes', '08b-martes'], [`/primer-equipo/jugador/${seniors[0]}`, '09-jugador-carga'],
    ['/primer-equipo/sesiones', '10-sesiones'], ['/primer-equipo/partidos', '11-partidos'], ['/primer-equipo/tests', '12-tests'], ['/primer-equipo/cuentas', '13-cuentas'],
    ['/primer-equipo/metodologia', '14-metodologia'], ['/configuracion', '15-configuracion'], [`/jugadores/${inf[0].id}`, '16-ficha-jugador']];
  for (const [u, n] of shots) { await page.goto(base + u); await page.waitForLoadState('networkidle'); await shot(page, n); }
  // Asistencia: navegar a la fecha con datos
  await page.goto(base + '/gimnasio?date=' + tue); await page.waitForLoadState('networkidle'); await shot(page, '04b-gimnasio-martes');
  await page.goto(base + `/gimnasio/franja/${s1}?date=${tue}`); await page.waitForLoadState('networkidle'); await shot(page, '04c-franja');
  await page.goto(base + '/jugadores'); await page.click('button[aria-label="Más opciones"]'); await page.click('button:has-text("Importar CSV")'); await shot(page, '17-importar'); await page.keyboard.press('Escape');
  await page.goto(base + '/primer-equipo/tests'); await page.click('button:has-text("Evolución")'); await shot(page, '18-tests-comparar');
  await page.goto(base + '/primer-equipo/jugador/' + seniors[0]); await page.click('.tabs button:has-text("Partidos")'); await shot(page, '19-jugador-competicion');
  // Móvil admin
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
  const mp = await mctx.newPage(); watch(mp);
  await mp.goto(base + '/primer-equipo'); await mp.waitForLoadState('networkidle'); await shot(mp, '20-admin-movil');

  // 4) Pantalla del jugador (móvil vertical)
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage(); watch(pp);
  await pp.goto(base); await shot(pp, '30-login-movil');
  await pp.fill('input[autocomplete=username]', 'senior alfa prueba');
  await pp.fill('input[type=password]', acct.pin); await pp.click('button:has-text("Entrar")');
  await pp.waitForSelector('text=Crea tu PIN'); await shot(pp, '31-cambiar-pin');
  const pw = pp.locator('input[type=password]');
  await pw.nth(0).fill(acct.pin); await pw.nth(1).fill('2468'); await pw.nth(2).fill('2468');
  await pp.click('button:has-text("Guardar PIN")');
  await pp.waitForSelector('.qtile'); await shot(pp, '32-jugador-inicio');
  await pp.click('button.qtile:has-text("EVA lesión")'); await pp.waitForSelector('.eva-grid'); await pp.locator('.eva-grid button').nth(4).click(); await shot(pp, '32b-dolor');
  if (await pp.locator('text=Indica la fecha').count() === 0) errors.push('El formulario de dolor debería pedir observaciones');
  await pp.fill('textarea', 'Molestia al esprintar, menos que ayer'); await pp.click('button:has-text("Enviar")');
  await pp.waitForSelector('text=guardado'); await pp.click('button:has-text("Volver al inicio")'); await pp.waitForSelector('button.qtile:has-text("Hoy: 4")'); await shot(pp, '32c-dolor-ok');
  await page.goto(base + '/lesiones/' + inj0.id); await page.waitForLoadState('networkidle'); await page.click('.tabs button:has-text("Dolor EVA")'); await shot(page, '32d-lesion-dolor-admin');
  if (!(await page.locator('text=Molestia al esprintar').count())) errors.push('El preparador no ve el dolor registrado por el jugador');
  await pp.click('button.qtile:has-text("Wellness")'); await shot(pp, '33-wellness');
  for (const g of await pp.locator('.scale').all()) await g.locator('button').nth(3).click();
  await pp.fill('textarea', 'Me encuentro bien'); await pp.click('button:has-text("Enviar")');
  await pp.waitForSelector('text=Wellness guardado'); await shot(pp, '34-wellness-ok');
  await pp.click('button:has-text("Volver al inicio")');
  await pp.click('button.qtile:has-text("RPE")'); await pp.waitForSelector('.day-pick button'); await shot(pp, '35a-rpe-dia');
  if (await pp.locator('.day-pick button:not([disabled])').count()) {
    await pp.locator('.day-pick button:not([disabled])').first().click(); await pp.fill('input[type=number]', '90');
    await pp.locator('.rpe-grid button').nth(5).click(); await pp.fill('textarea', 'Sesión dura'); await pp.click('button:has-text("Enviar")');
    await pp.waitForSelector('text=guardado'); await pp.click('button:has-text("Volver al inicio")');
    await pp.click('button.qtile:has-text("RPE")'); await pp.waitForSelector('.day-pick button'); await shot(pp, '35b-rpe-dia-enviado');
  }
  await pp.click('button:has-text("← Volver")');
  await pp.click('button.qtile:has-text("Adicional")');
  await pp.fill('input[type=number]', '45'); await pp.locator('.rpe-grid button').nth(6).click();
  await shot(pp, '35-adicional-sin-obs');
  await pp.fill('textarea', 'Gimnasio tren superior'); await pp.click('button:has-text("Enviar")');
  await pp.waitForSelector('text=guardado'); await shot(pp, '36-adicional-ok');
  await pp.click(".pl-nav button:has-text(\"Mi temporada\")"); await pp.waitForSelector(".ring"); await shot(pp, "37-temporada");
  await pp.click('.pl-nav button:has-text("Mi progreso")'); await pp.waitForLoadState('networkidle'); await shot(pp, '38-progreso');
  // Comprobación de permisos desde el navegador del jugador
  const st = await pp.evaluate(async () => (await fetch('/api/players')).status);
  if (st !== 403) errors.push('El jugador puede acceder a /api/players: ' + st);

  // 5) PDF del informe
  await page.goto(base + `/gimnasio/informe?week=${tue}`); await page.waitForLoadState('networkidle');
  for (const [btn, file] of [['Descargar PDF', 'informe.pdf'], ['Descargar Excel', 'informe.xlsx'], ['Descargar CSV', 'informe.csv']]) {
    try {
      if (btn !== 'Descargar PDF') await page.click('button[aria-label="Más opciones"]');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`button:has-text("${btn}")`)]);
      await dl.saveAs(path.join(out, file));
    } catch (e) { errors.push(`Descarga ${btn} fallida: ${e.message.split('\n')[0]}`); await shot(page, 'err-' + file); }
  }

  await browser.close(); server.close();
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'Sin errores de consola.');
  console.log('Capturas en', out);
})().catch(e => { console.error(e); process.exit(1); });
