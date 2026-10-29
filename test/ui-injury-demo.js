'use strict';
// Versión de prueba: flujo completo de lesión (alta, EVA del jugador, eliminar, finalizar, historial)
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const out = path.resolve(process.argv[2] || '/tmp/shots-inj'); fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'dist-demo', 'demo.html'), 'utf8');
const s = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es-ES' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const shot = async n => { await p.waitForTimeout(600); await p.screenshot({ path: path.join(out, n + '.png'), fullPage: true }); };
  const base = `http://127.0.0.1:${s.address().port}/artifact`;
  await p.goto(base); await p.waitForSelector('.tile', { timeout: 90000 });
  // 1) Registrar lesión desde la interfaz
  await p.click('nav >> text=Lesiones'); await p.click('button:has-text("Registrar lesión")'); await p.waitForSelector('.modal');
  await shot('1-registrar');
  if (await p.locator('.modal >> text=Próxima revisión').count()) errs.push('Sigue apareciendo «Próxima revisión»');
  await p.fill('.modal input[type=search], .modal input[placeholder*="Buscar"]', 'Bruno'); await p.waitForTimeout(400); await p.locator('.modal button:has-text("Bruno González")').first().click();
  await p.fill('.modal input[placeholder="p. ej. Isquiotibiales"]', 'Isquiotibiales'); await p.click('button:has-text("Abrir proceso")'); await p.waitForSelector('text=Finalizar recuperación');
  // 2) Cuenta del jugador y EVA desde su pantalla
  const pin = await p.evaluate(async () => { const h = { 'x-requested-with': 'scpf', 'content-type': 'application/json' };
    const pl = await (await fetch('/api/players', { headers: h })).json(); const id = pl.find(x => x.first_name === 'Bruno').id;
    const u = await (await fetch('/api/users', { method: 'POST', headers: h, body: JSON.stringify({ player_id: id }) })).json(); return u.pin; });
  const mp = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage(); mp.on('pageerror', e => errs.push(e.message));
  // mismo almacenamiento: se usa la misma pestaña para el jugador
  await p.evaluate(async () => fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'scpf' } }));
  await p.setViewportSize({ width: 390, height: 844 }); await p.goto(base); await p.waitForSelector('input[autocomplete=username]');
  await p.fill('input[autocomplete=username]', 'Bruno González'); await p.fill('input[type=password]', pin); await p.click('button:has-text("Entrar")');
  await p.waitForSelector('text=Crea tu PIN'); const pw = p.locator('input[type=password]'); await pw.nth(0).fill(pin); await pw.nth(1).fill('2468'); await pw.nth(2).fill('2468'); await p.click('button:has-text("Guardar PIN")');
  await p.waitForSelector('button.qtile:has-text("EVA lesión")'); await shot('2-jugador-inicio');
  await p.click('button.qtile:has-text("EVA lesión")'); await p.locator('.eva-grid button').nth(3).click(); await p.fill('textarea', 'Molestia leve en el último sprint'); await p.click('button:has-text("Enviar")');
  await p.waitForSelector('text=guardado'); await p.click('button:has-text("Volver al inicio")'); await shot('3-jugador-eva-ok');
  // 3) Preparador: eliminar EVA, seguimiento, finalizar e historial
  await p.click('.pl-nav button:has-text("Perfil")'); await p.click('button:has-text("Cerrar sesión")'); await p.setViewportSize({ width: 1360, height: 900 });
  await p.waitForSelector('input[autocomplete=username]'); await p.fill('input[autocomplete=username]', 'José Manuel Portas Vázquez'); await p.fill('input[type=password]', '123456'); await p.click('button:has-text("Entrar")');
  await p.waitForSelector('.tile'); await p.click('nav >> text=Lesiones'); await p.locator('.lrow:has-text("Bruno")').first().click(); await p.waitForSelector('text=Finalizar recuperación');
  await p.click('.tabs button:has-text("Dolor EVA")'); await shot('4-eva-admin');
  await p.click('button[aria-label="Eliminar registro de dolor"]'); await p.click('.modal button:has-text("Eliminar")'); await p.waitForTimeout(700);
  if (await p.locator('text=Molestia leve').count()) errs.push('No se eliminó el EVA');
  await p.click('button:has-text("+ Seguimiento")'); await p.locator('.modal table input').first().fill('Puente glúteo'); await p.click('.modal button:has-text("Guardar")'); await p.waitForTimeout(600);
  await p.click('.tabs button:has-text("Seguimiento")'); await shot('5-seguimiento');
  await p.click('button[aria-label="Eliminar seguimiento"]'); await p.click('.modal button:has-text("Eliminar")'); await p.waitForTimeout(700);
  if (await p.locator('text=Puente glúteo').count()) errs.push('No se eliminó el seguimiento');
  await p.click('button:has-text("Finalizar recuperación")'); await p.fill('.modal textarea', 'Alta con criterios cumplidos'); await p.click('.modal button:has-text("Finalizar y guardar")');
  await p.waitForSelector('text=Recuperación finalizada'); await shot('6-finalizada');
  await p.click('nav >> text=Primer equipo'); await p.click('.tile:has-text("Jugadores")'); await p.locator('.pg:has-text("Bruno")').click(); await p.click('.tabs button:has-text("Lesiones")'); await p.waitForSelector('.inj-it'); await shot('7-historial-jugador');
  console.log(errs); await b.close(); s.close();
})().catch(e => { console.error(e); process.exit(1); });
