'use strict';
// Primer arranque en producción: crear la cuenta del preparador con el código y cargar los datos de la temporada
const fs = require('fs'), os = require('os'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scpf-boot-')); process.env.SETUP_CODE = '271026';
const { chromium } = require('playwright');
const { createApp } = require('../server/index');
(async () => {
  const srv = createApp().listen(0); await new Promise(r => srv.on('listening', r));
  const base = `http://localhost:${srv.address().port}`; const errs = [];
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const health = await (await fetch(base + '/api/health')).json();
  await p.goto(base); await p.waitForSelector('input'); await p.screenshot({ path: '/tmp/boot-1.png' });
  const inputs = p.locator('input'); const n = await inputs.count();
  const labels = await p.locator('label, .field').allTextContents();
  console.log('campos', n, labels.join(' | ').slice(0, 200));
  await inputs.nth(0).fill('271026'); await inputs.nth(1).fill('José Manuel Portas Vázquez'); await inputs.nth(2).fill('cambre2026'); await inputs.nth(3).fill('cambre2026');
  await p.locator('button[type=submit], button:has-text("Crear")').first().click();
  await p.waitForSelector('text=Puesta en marcha', { timeout: 30000 }); await p.screenshot({ path: '/tmp/boot-2.png' });
  await p.click('button:has-text("Cargar datos de la temporada")'); await p.waitForSelector('text=Datos de la temporada cargados', { timeout: 120000 });
  await p.waitForTimeout(1200); await p.screenshot({ path: '/tmp/boot-3.png' });
  const counts = await p.evaluate(async () => { const h = { 'x-requested-with': 'scpf' };
    const pl = await (await fetch('/api/players', { headers: h })).json(); const d = await (await fetch('/api/team/dashboard', { headers: h })).json();
    return { players: pl.length, photos: pl.filter(x => x.photo_file_id).length, acwr: d.rows.filter(r => r.indicators?.acwr.value != null).length, matches: (await (await fetch('/api/team/matches', { headers: h })).json()).length }; });
  await b.close(); srv.close();
  console.log(JSON.stringify({ health, counts, errs }));
})().catch(e => { console.error(e); process.exit(1); });
