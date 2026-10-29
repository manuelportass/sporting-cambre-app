'use strict';
// Versión de prueba: vista del jugador (móvil) con datos precargados y foto
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const out = path.resolve(process.argv[2] || '/tmp/shots-pl'); fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'dist-demo', 'demo.html'), 'utf8');
const s = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' })).newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const shot = async (n, full = true) => { await p.waitForTimeout(700); await p.screenshot({ path: path.join(out, n + '.png'), fullPage: full }); };
  await p.goto(`http://127.0.0.1:${s.address().port}/artifact`); await p.waitForSelector('.tile', { timeout: 90000 });
  const pin = await p.evaluate(async () => {
    const h = { 'x-requested-with': 'scpf', 'content-type': 'application/json' };
    const pl = await (await fetch('/api/players', { headers: h })).json();
    const bruno = pl.find(x => x.first_name === 'Bruno');
    const u = await (await fetch('/api/users', { method: 'POST', headers: h, body: JSON.stringify({ player_id: bruno.id }) })).json();
    await fetch('/api/auth/logout', { method: 'POST', headers: h });
    return u.pin;
  });
  await p.reload(); await p.waitForSelector('input[autocomplete=username]');
  await p.fill('input[autocomplete=username]', 'Bruno González'); await p.fill('input[type=password]', pin); await p.click('button:has-text("Entrar")');
  await p.waitForSelector('text=Crea tu PIN'); const pw = p.locator('input[type=password]');
  await pw.nth(0).fill(pin); await pw.nth(1).fill('2468'); await pw.nth(2).fill('2468'); await p.click('button:has-text("Guardar PIN")');
  await p.waitForSelector('.qtile'); await shot('1-inicio', false);
  await p.click('.pl-nav button:has-text("Mi temporada")'); await p.waitForSelector('.ring'); await shot('2-temporada'); await p.evaluate(() => window.scrollTo(0, 99999)); await shot('2b-temporada-fin', false);
  await p.click('.pl-nav button:has-text("Mi progreso")'); await p.waitForSelector('.status'); await shot('3-progreso');
  await p.click('.pl-nav button:has-text("Perfil")'); await shot('4-perfil');
  await p.click('button:has-text("Mis registros enviados")'); await shot('5-registros', false);
  console.log(errs); await b.close(); s.close();
})().catch(e => { console.error(e); process.exit(1); });
