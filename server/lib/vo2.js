'use strict';
// VO₂máx ESTIMADO a partir del 30-15 Intermittent Fitness Test (Buchheit, 2008).
// VO₂máx (ml·kg⁻¹·min⁻¹) = 28,3 − 2,15·G − 0,741·E − 0,0357·P + 0,0586·E·VIFT + 1,03·VIFT
//   G = sexo (masculino 1, femenino 2) · E = edad (años) · P = peso (kg) · VIFT = velocidad final (km/h)
// Es una aproximación de campo, no una medición directa por análisis de gases.
const { db } = require('../db');

const IFT_NAME = '30-15 Intermittent Fitness Test';
const SEX_LABEL = { M: 'Masculino', F: 'Femenino' };

function buchheit({ vift, sex, age, weight }) {
  const G = sex === 'F' ? 2 : 1;
  return 28.3 - 2.15 * G - 0.741 * age - 0.0357 * weight + 0.0586 * age * vift + 1.03 * vift;
}
function ageAt(birth, at) {
  const [y, m, d] = birth.split('-').map(Number);
  const [Y, M, D] = at.split('-').map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}
const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 864e5);

// Peso corporal registrado más cercano a la fecha del test
function weightNear(playerId, date) {
  const rows = db.prepare(`SELECT r.date, r.values_json FROM test_results r JOIN test_types t ON t.id=r.test_type_id
    WHERE t.name='Peso corporal' AND r.player_id=?`).all(playerId)
    .map(r => ({ date: r.date, kg: JSON.parse(r.values_json).peso })).filter(r => r.kg != null);
  if (!rows.length) return null;
  rows.sort((a, b) => dayDiff(a.date, date) - dayDiff(b.date, date) || b.date.localeCompare(a.date));
  return rows[0];
}

// Devuelve { value, inputs, missing[] } para un resultado del 30-15 IFT
function estimate(result) {
  const vift = result.values?.vift;
  const p = db.prepare('SELECT sex FROM players WHERE id=?').get(result.player_id) || {};
  const priv = db.prepare('SELECT birth_date, age FROM player_private WHERE player_id=?').get(result.player_id) || {};
  const age = priv.birth_date ? ageAt(priv.birth_date, result.date) : priv.age ?? null;
  const w = weightNear(result.player_id, result.date);
  const missing = [];
  if (vift == null) missing.push('VIFT');
  if (age == null) missing.push('edad');
  if (!p.sex) missing.push('sexo');
  if (!w) missing.push('peso corporal');
  const inputs = { vift: vift ?? null, age, age_source: priv.birth_date ? 'fecha de nacimiento' : age != null ? 'edad de la ficha' : null,
    sex: p.sex || null, sex_label: SEX_LABEL[p.sex] || null, weight: w?.kg ?? null, weight_date: w?.date ?? null };
  if (missing.length) return { value: null, inputs, missing };
  return { value: Math.round(buchheit({ vift, sex: p.sex, age, weight: w.kg }) * 10) / 10, inputs, missing };
}
// Añade «vo2» a los resultados del 30-15 IFT de una lista ya leída
function attach(list, nameKey = 'name') {
  return list.map(r => ((r[nameKey] || r.test_name) === IFT_NAME ? { ...r, vo2: estimate(r) } : r));
}

module.exports = { IFT_NAME, buchheit, estimate, attach };
