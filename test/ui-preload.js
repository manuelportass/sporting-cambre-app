'use strict';
// Versión de prueba con datos precargados: Primer equipo (Jugadores, post-partido, ficha, sesión del martes)
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const out = path.resolve(process.argv[2] || '/tmp/shots-pre'); fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'dist-demo', 'demo.html'), 'utf8');
const s = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es-ES' })).newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const shot = async n => { await p.waitForTimeout(700); await p.screenshot({ path: path.join(out, n + '.png'), fullPage: true }); };
  await p.goto(`http://127.0.0.1:${s.address().port}/artifact`); await p.waitForSelector('.tile', { timeout: 90000 });
  await p.click('nav >> text=Primer equipo'); await shot('2-hub');
  await p.click('.tile:has-text("Jugadores")'); await p.waitForSelector('.pg'); await shot('3-jugadores');
  await p.click('nav >> text=Primer equipo'); await p.click('.tile:has-text("post-partido")'); await p.waitForSelector('.pm-g'); await shot('4-martes');
  await p.locator('.pm-p').first().click(); await p.waitForSelector('.stats'); await p.click('.tabs button:has-text("Ficha")'); await p.waitForSelector('.segpick'); await shot('5-ficha');
  await p.locator('.segpick.avail button:has-text("Limitado")').click(); await p.click('button:has-text("Guardar ficha")'); await p.waitForTimeout(500); for (const [w, dt] of [['74.2', '2026-08-01'], ['73.1', '2026-09-15'], ['72.6', '2026-10-20']]) { await p.fill('.wbox input[type=number]', w); await p.fill('.wbox input[type=date]', dt); await p.click('.wbox button:has-text("Registrar")'); await p.waitForTimeout(600); } await shot('6-ficha-guardada');
  await p.click('nav >> text=Primer equipo'); await p.click('.tile:has-text("Sesiones")'); for (let i = 0; i < 3; i++) { await p.click('button[aria-label="Anteriores"]'); await p.waitForTimeout(300); }
  const tue = p.locator('.list > * >> text=/martes, 8 sept/'); if (await tue.count()) { await tue.first().click(); await p.waitForSelector('.pmtag'); await shot('7-sesion-martes'); } else errs.push('no martes 8 sept');
  console.log(errs); await b.close(); s.close();
})().catch(e => { console.error(e); process.exit(1); });
