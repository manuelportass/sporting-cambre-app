'use strict';
// Cálculo de carga de entrenamiento (funciones puras, verificadas en test/load.test.js)
//
//  Carga de sesión (UA)   = duración (min) × RPE (0–10)
//  Carga diaria (UA)      = suma de las cargas válidas del día
//  Método "rolling" (acoplado):
//    Carga aguda (UA/semana)   = suma de los últimos 7 días naturales (incluido el día de cálculo)
//    Carga crónica (UA/semana) = suma de los últimos 28 días / 4
//       Si la exposición disponible E (días desde el primer registro) es < 28 pero >= mínimo configurado:
//       crónica = suma de los E días / (E / 7)  → sigue siendo una media semanal.
//    ACWR = aguda / crónica (ambas en UA/semana)
//  Método "ewma" (Williams et al., 2017): λ = 2 / (N + 1), con N = 7 (aguda) y 28 (crónica)
//    EWMA_hoy = carga_hoy × λ + (1 − λ) × EWMA_ayer   (ambas en UA/día) → ACWR = EWMA_a / EWMA_c
//
//  Estado de cada día:
//    'registrado'   → hay al menos una carga válida (puede ser 0 real si RPE = 0 o se registró descanso)
//    'sin_registro' → había un entrenamiento colectivo programado, el jugador no figura como ausente
//                     y no envió su RPE: dato desconocido (NO se interpreta como carga cero)
//    'sin_actividad'→ no había sesión programada ni registro: se considera carga 0
//    'previo'       → anterior al primer registro del jugador (fuera del periodo de exposición)

const DAY = 864e5;
const toDate = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);

function sessionLoad(durationMin, rpe) {
  const d = Number(durationMin), r = Number(rpe);
  if (!Number.isFinite(d) || !Number.isFinite(r) || d < 0 || r < 0 || r > 10) return null;
  return Math.round(d * r * 100) / 100;
}

/**
 * @param {object} p
 * @param {Array<{date:string, load_au:number}>} p.entries   cargas válidas
 * @param {string[]} p.expectedDates   fechas con sesión colectiva programada a la que el jugador debía asistir y sin RPE enviado
 * @param {string} p.from  primera fecha de la serie devuelta
 * @param {string} p.to    fecha de cálculo (incluida)
 * @param {object} p.cfg   settings.load
 */
function computeSeries({ entries, expectedDates = [], from, to, cfg }) {
  const c = { method: 'rolling', acuteDays: 7, chronicDays: 28, minChronicDays: 21, maxMissingChronic: 0, ewmaAcuteDays: 7, ewmaChronicDays: 28, ...cfg };
  const byDay = new Map();
  for (const e of entries) byDay.set(e.date, (byDay.get(e.date) || 0) + Number(e.load_au));
  const expected = new Set(expectedDates);
  const firstDate = entries.length ? entries.map(e => e.date).sort()[0] : null;

  // Construimos días desde el inicio necesario para las ventanas
  const start = firstDate && firstDate < from ? firstDate : addDays(from, -(c.chronicDays - 1));
  const days = [];
  for (let d = start; d <= to; d = addDays(d, 1)) {
    let state, load;
    // expectedDates = sesiones colectivas sin RPE del jugador: el día queda como desconocido
    // aunque tenga otros registros (p. ej. un entrenamiento adicional).
    if (expected.has(d) && firstDate && d >= firstDate) { state = 'sin_registro'; load = null; }
    else if (byDay.has(d)) { state = 'registrado'; load = byDay.get(d); }
    else if (!firstDate || d < firstDate) { state = 'previo'; load = null; }
    else { state = 'sin_actividad'; load = 0; }
    days.push({ date: d, load, state });
  }

  const la = 2 / (c.ewmaAcuteDays + 1), lc = 2 / (c.ewmaChronicDays + 1);
  let ea = null, ec = null;
  const out = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    // EWMA: los días sin registro no actualizan (no se imputa carga)
    if (day.state === 'registrado' || day.state === 'sin_actividad') {
      ea = ea === null ? day.load * la : day.load * la + (1 - la) * ea;
      ec = ec === null ? day.load * lc : day.load * lc + (1 - lc) * ec;
    }
    if (day.date < from) continue;

    const exposure = firstDate && day.date >= firstDate ? diffDays(firstDate, day.date) + 1 : 0;
    const win = n => days.slice(Math.max(0, i - n + 1), i + 1);
    const aw = win(c.acuteDays), cw = win(c.chronicDays);
    const missA = aw.filter(x => x.state === 'sin_registro').length;
    const missC = cw.filter(x => x.state === 'sin_registro').length;
    const sum = arr => arr.reduce((s, x) => s + (x.load || 0), 0);

    const r = { date: day.date, dayLoad: day.load, state: day.state, exposure, missingAcute: missA, missingChronic: missC };
    const reasons = [];
    if (!firstDate || exposure === 0) reasons.push('Sin registros todavía');

    if (c.method === 'ewma') {
      r.unit = 'UA/día';
      r.acute = exposure >= c.acuteDays && missA === 0 ? round(ea) : null;
      r.chronic = exposure >= c.minChronicDays && missC <= c.maxMissingChronic ? round(ec) : null;
    } else {
      r.unit = 'UA/semana';
      r.acute = exposure >= c.acuteDays && missA === 0 ? round(sum(aw)) : null;
      if (exposure >= c.minChronicDays && missC <= c.maxMissingChronic) {
        const E = Math.min(exposure, c.chronicDays);
        const used = cw.slice(cw.length - E);
        r.chronic = round(sum(used) / (E / 7));
        r.chronicPartial = E < c.chronicDays;
      } else r.chronic = null;
    }
    if (exposure > 0 && exposure < c.acuteDays) reasons.push(`Exposición de ${exposure} días (< ${c.acuteDays})`);
    if (missA) reasons.push(`${missA} registro(s) pendiente(s) en la ventana aguda`);
    if (exposure > 0 && exposure < c.minChronicDays) reasons.push(`Exposición de ${exposure} días (< ${c.minChronicDays} necesarios para la crónica)`);
    if (missC > c.maxMissingChronic) reasons.push(`${missC} registro(s) pendiente(s) en la ventana crónica`);
    if (r.acute !== null && r.chronic !== null && r.chronic > 0) r.acwr = Math.round((r.acute / r.chronic) * 100) / 100;
    else {
      r.acwr = null;
      if (r.chronic === 0) reasons.push('Carga crónica igual a cero');
    }
    r.reasons = reasons;
    out.push(r);
  }
  return out;
}

const round = v => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

function inRange(v, [a, b]) { return v >= a && v <= b; }
function acwrColor(v, bands) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'gris';
  if (inRange(v, bands.green)) return 'verde';
  if (bands.yellow.some(r => inRange(v, r))) return 'amarillo';
  if (bands.orange.some(r => inRange(v, r))) return 'naranja';
  return 'rojo';
}
function changeColor(pct, b) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 'gris';
  const a = Math.abs(pct);
  if (a <= b.green) return 'verde';
  if (a <= b.yellow) return 'amarillo';
  if (a <= b.orange) return 'naranja';
  return 'rojo';
}
// Wellness: cada ítem se normaliza a 0–100 % donde 100 = estado más favorable,
// respetando la dirección configurada (higherIsBetter). Así el color es coherente
// aunque una escala vaya al revés (p. ej. fatiga 1 = sin fatiga).
function wellnessPct(item, value, cfg) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const span = cfg.max - cfg.min;
  const p = ((v - cfg.min) / span) * 100;
  return Math.round(item.higherIsBetter ? p : 100 - p);
}
function pctColor(p, bands) {
  if (p === null || p === undefined) return 'gris';
  if (p >= bands.green) return 'verde';
  if (p >= bands.yellow) return 'amarillo';
  if (p >= bands.orange) return 'naranja';
  return 'rojo';
}
function wellnessSummary(scores, cfg) {
  const items = cfg.items.map(it => {
    const pct = wellnessPct(it, scores?.[it.key], cfg);
    return { key: it.key, label: it.label, value: scores?.[it.key] ?? null, pct, color: pctColor(pct, cfg.bands) };
  });
  const valid = items.filter(i => i.pct !== null);
  const total = valid.length === cfg.items.length ? Math.round(valid.reduce((s, i) => s + i.pct, 0) / valid.length) : null;
  return { items, total, color: pctColor(total, cfg.bands) };
}

module.exports = { sessionLoad, computeSeries, acwrColor, changeColor, wellnessPct, wellnessSummary, pctColor, addDays, diffDays, iso };
