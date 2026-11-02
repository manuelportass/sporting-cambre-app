'use strict';
// Tests de evolución de lesionados (mensuales): movilidad (ángulo por foto), Y-Balance y fuerza.
// Siempre lado lesionado frente a lado sano. LSI (índice de simetría) = lesionado / sano × 100.
const { bad } = require('./util');

const MOB = {
  rodilla_flexion: 'Flexión de rodilla',
  tobillo_wblt: 'Flexión dorsal de tobillo (WBLT)',
  cadera_flexion_activa: 'Flexión de cadera activa',
  cadera_flexion_pasiva: 'Flexión de cadera pasiva',
};
const r1 = x => Math.round(x * 10) / 10;
const lsi = (les, sano) => (les != null && sano ? r1(les / sano * 100) : null);
const n = (v, label, min, max) => {
  if (v === '' || v === null || v === undefined) throw bad(`Falta: ${label}.`);
  const x = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(x) || x < min || x > max) throw bad(`${label}: valor no válido (${min}–${max}).`);
  return x;
};
const brz = (peso, reps) => r1(peso / (1.0278 - 0.0278 * reps));

function clean(kind, b) {
  if (kind === 'movilidad') {
    if (!MOB[b.test]) throw bad('Elige el test de movilidad.');
    const les = n(b.les, 'ángulo del lado lesionado', 0, 180), sano = n(b.sano, 'ángulo del lado sano', 0, 180);
    return { test: b.test, label: MOB[b.test], les: r1(les), sano: r1(sano), lsi: lsi(les, sano) };
  }
  if (kind === 'ybt') {
    const side = (o, nm) => ({ ant: n(o?.ant, `alcance anterior (${nm})`, 0, 250), pm: n(o?.pm, `alcance posteromedial (${nm})`, 0, 250), pl: n(o?.pl, `alcance posterolateral (${nm})`, 0, 250) });
    const leg_les = n(b.leg_les, 'longitud de la pierna lesionada', 40, 140), leg_sano = n(b.leg_sano, 'longitud de la pierna sana', 40, 140);
    const les = side(b.les, 'lesionada'), sano = side(b.sano, 'sana');
    // Puntuación compuesta (%) = (anterior + posteromedial + posterolateral) / (3 × longitud de la pierna) × 100
    const comp = (s, L) => r1((s.ant + s.pm + s.pl) / (3 * L) * 100);
    const c_les = comp(les, leg_les), c_sano = comp(sano, leg_sano);
    return { leg_les, leg_sano, les, sano, comp_les: c_les, comp_sano: c_sano,
      lsi: { ant: lsi(les.ant, sano.ant), pm: lsi(les.pm, sano.pm), pl: lsi(les.pl, sano.pl), comp: lsi(c_les, c_sano) },
      diff_ant: r1(Math.abs(les.ant - sano.ant)) };
  }
  if (kind === 'fuerza') {
    const exercise = String(b.exercise || '').trim().slice(0, 80);
    if (!exercise) throw bad('Indica el ejercicio.');
    if (b.mode === '1rm') {
      const s = (o, nm) => { const peso = n(o?.peso, `peso (${nm})`, 0, 1000), reps = n(o?.reps, `repeticiones (${nm})`, 1, 10); if (!Number.isInteger(reps)) throw bad('Las repeticiones deben ser un número entero (1–10).'); return { peso, reps, rm: brz(peso, reps) }; };
      const les = s(b.les, 'lado lesionado'), sano = s(b.sano, 'lado sano');
      return { mode: '1rm', exercise, unit: 'kg', les, sano, lsi: lsi(les.rm, sano.rm) };
    }
    if (b.mode === 'iso') {
      const unit = b.unit === 'N' ? 'N' : 'kg';
      const les = n(b.les, 'fuerza del lado lesionado', 0, 20000), sano = n(b.sano, 'fuerza del lado sano', 0, 20000);
      return { mode: 'iso', exercise, unit, les: r1(les), sano: r1(sano), lsi: lsi(les, sano) };
    }
    throw bad('Elige el tipo de test de fuerza.');
  }
  if (kind === 'salto') {
    const les = n(b.les, 'altura del lado lesionado', 0, 100), sano = n(b.sano, 'altura del lado sano', 0, 100);
    return { test: 'cmj_unilateral', les: r1(les), sano: r1(sano), lsi: lsi(les, sano), method: b.method === 'video' ? 'video' : 'manual' };
  }
  throw bad('Tipo de test no válido.');
}
module.exports = { clean, MOB };
