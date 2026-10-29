'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../server/lib/load');
const cfg = { method: 'rolling', acuteDays: 7, chronicDays: 28, minChronicDays: 21, maxMissingChronic: 0 };

test('carga de sesión = minutos × RPE', () => {
  assert.equal(L.sessionLoad(90, 7), 630);
  assert.equal(L.sessionLoad(60, 0), 0);
  assert.equal(L.sessionLoad(60, 11), null);
});

test('rolling: 28 días a 100 UA/día → aguda 700, crónica 700, ACWR 1', () => {
  const entries = [];
  for (let i = 0; i < 28; i++) entries.push({ date: L.addDays('2026-01-01', i), load_au: 100 });
  const s = L.computeSeries({ entries, from: '2026-01-28', to: '2026-01-28', cfg });
  assert.equal(s[0].acute, 700);
  assert.equal(s[0].chronic, 700);
  assert.equal(s[0].acwr, 1);
  assert.equal(s[0].unit, 'UA/semana');
});

test('rolling: semana final doble → aguda 1400, crónica (3×700+1400)/4 = 875, ACWR 1.6', () => {
  const entries = [];
  for (let i = 0; i < 28; i++) entries.push({ date: L.addDays('2026-01-01', i), load_au: i >= 21 ? 200 : 100 });
  const s = L.computeSeries({ entries, from: '2026-01-28', to: '2026-01-28', cfg });
  assert.equal(s[0].acute, 1400);
  assert.equal(s[0].chronic, 875);
  assert.equal(s[0].acwr, 1.6);
  assert.equal(L.acwrColor(1.6, { green: [0.8, 1.3], yellow: [[0.7, 0.8], [1.3, 1.4]], orange: [[0.5, 0.7], [1.4, 1.5]] }), 'rojo');
});

test('días sin sesión programada cuentan como 0; exposición parcial escala a media semanal', () => {
  // 3 sesiones/semana de 500 UA durante 21 días (exposición mínima)
  const entries = [];
  for (let i = 0; i < 21; i++) if (i % 7 === 0 || i % 7 === 2 || i % 7 === 3) entries.push({ date: L.addDays('2026-02-02', i), load_au: 500 });
  const s = L.computeSeries({ entries, from: '2026-02-22', to: '2026-02-22', cfg });
  assert.equal(s[0].exposure, 21);
  assert.equal(s[0].acute, 1500);
  assert.equal(s[0].chronic, 1500); // 4500 UA / (21/7) semanas
  assert.equal(s[0].chronicPartial, true);
  assert.equal(s[0].acwr, 1);
});

test('registro pendiente en sesión programada → ACWR no calculable (gris)', () => {
  const entries = [];
  for (let i = 0; i < 28; i++) if (i !== 25) entries.push({ date: L.addDays('2026-01-01', i), load_au: 100 });
  const s = L.computeSeries({ entries, expectedDates: [L.addDays('2026-01-01', 25)], from: '2026-01-28', to: '2026-01-28', cfg });
  assert.equal(s[0].acute, null);
  assert.equal(s[0].acwr, null);
  assert.equal(s[0].missingAcute, 1);
  assert.equal(L.acwrColor(s[0].acwr, { green: [0.8, 1.3], yellow: [], orange: [] }), 'gris');
});

test('exposición insuficiente → crónica nula', () => {
  const entries = [{ date: '2026-03-01', load_au: 400 }, { date: '2026-03-05', load_au: 400 }];
  const s = L.computeSeries({ entries, from: '2026-03-10', to: '2026-03-10', cfg });
  assert.equal(s[0].chronic, null);
  assert.equal(s[0].acwr, null);
  assert.ok(s[0].reasons.length > 0);
});

test('crónica cero → sin ACWR', () => {
  const entries = [];
  for (let i = 0; i < 28; i++) entries.push({ date: L.addDays('2026-01-01', i), load_au: 0 });
  const s = L.computeSeries({ entries, from: '2026-01-28', to: '2026-01-28', cfg });
  assert.equal(s[0].chronic, 0);
  assert.equal(s[0].acwr, null);
});

test('EWMA: carga constante converge a ACWR ≈ 1 y usa UA/día', () => {
  const entries = [];
  for (let i = 0; i < 120; i++) entries.push({ date: L.addDays('2026-01-01', i), load_au: 300 });
  const s = L.computeSeries({ entries, from: L.addDays('2026-01-01', 119), to: L.addDays('2026-01-01', 119), cfg: { ...cfg, method: 'ewma' } });
  assert.equal(s[0].unit, 'UA/día');
  assert.ok(Math.abs(s[0].acwr - 1) < 0.02, String(s[0].acwr));
});

test('wellness respeta la dirección de cada ítem', () => {
  const wcfg = { min: 1, max: 5, bands: { green: 75, yellow: 50, orange: 25 }, items: [
    { key: 'sueno', label: 'Sueño', higherIsBetter: true },
    { key: 'fatiga', label: 'Fatiga', higherIsBetter: false } ] };
  const w = L.wellnessSummary({ sueno: 5, fatiga: 1 }, wcfg);
  assert.equal(w.items[0].pct, 100);
  assert.equal(w.items[1].pct, 100);
  assert.equal(w.color, 'verde');
  const w2 = L.wellnessSummary({ sueno: 1, fatiga: 5 }, wcfg);
  assert.equal(w2.total, 0);
  assert.equal(w2.color, 'rojo');
});
