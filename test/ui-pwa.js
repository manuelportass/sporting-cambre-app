'use strict';
// App publicada (servidor real): service worker, manifiesto instalable, tarjeta de avisos y apertura desde notificación
const fs = require('fs'), os = require('os'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scpf-pwa-')); process.env.SETUP_CODE = '444444';
const { chromium } = require('playwright');
const { createApp } = require('../server/index');
const out = path.resolve(process.argv[2] || '/tmp/shots-pwa'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const srv = createApp().listen(0); await new Promise(r => srv.on('listening', r));
  const base = `http://localhost:${srv.address().port}`; const errs = [];
  const call = async (pg, m, u, b) => pg.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'scpf' }, body: b ? JSON.stringify(b) : undefined }); return r.json(); }, [m, u, b]);
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'scpf-prof-')), { headless: !process.env.HEADED, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['notifications'] });
  const b = { close: () => ctx.close() };
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(base);
  await call(p, 'POST', '/setup', { code: '444444', name: 'José Manuel Portas Vázquez', pin: 'cambre2026' });
  const cats = await call(p, 'GET', '/categories'); const sen = cats.find(c => c.code === 'senior').id;
  const pl = await call(p, 'POST', '/players', { first_name: 'Ana', last_name: 'Prueba', category_id: sen });
  const u = await call(p, 'POST', '/users', { player_id: pl.id });
  await call(p, 'POST', '/auth/logout');
  await p.goto(base); await p.fill('input[autocomplete=username]', 'Ana Prueba'); await p.fill('input[type=password]', u.pin); await p.click('button:has-text("Entrar")');
  await p.waitForSelector('text=Crea tu PIN'); const pw = p.locator('input[type=password]'); await pw.nth(0).fill(u.pin); await pw.nth(1).fill('2468'); await pw.nth(2).fill('2468'); await p.click('button:has-text("Guardar PIN")');
  await p.waitForSelector('.qtile');
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active }; });
  const mf = await p.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  const swHdr = await p.evaluate(async () => (await fetch('/sw.js')).headers.get('cache-control'));
  const st = await p.evaluate(() => [('PushManager' in window), Notification.permission]); await p.screenshot({ path: path.join(out, '1-inicio.png') });
  await p.waitForTimeout(1500); const st0 = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return [Notification.permission, !!r, window.isSecureContext, 'PushManager' in window, document.querySelectorAll('.setup').length]; }); console.log('estado', st0);
  let sub = 'n/a'; try { await p.click('.setup button:has-text("Activar avisos")'); await p.waitForTimeout(4000); sub = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!(await r.pushManager.getSubscription()); }); } catch (e) { sub = 'error: ' + e.message; }
  await p.click('.pl-nav button:has-text("Perfil")'); await p.waitForSelector('.setup.full'); await p.screenshot({ path: path.join(out, '2-perfil.png'), fullPage: true });
  // Apertura desde una notificación: /?v=rpe abre directamente el formulario de RPE
  await p.goto(base + '/?v=rpe'); await p.waitForSelector('.day-pick'); const urlAfter = p.url();
  console.log(JSON.stringify({ sub, st, sw, manifest: { display: mf.display, icons: mf.icons.length, id: mf.id }, swHdr, urlAfter, errs }));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
