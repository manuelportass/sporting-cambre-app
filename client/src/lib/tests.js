// Utilidades de presentación de tests: pares derecha/izquierda, campo principal, variaciones test → retest
export const FAMILY = {
  resistencia: 'Resistencia', salto: 'Salto', sprint: 'Velocidad', fuerza: 'Fuerza', movilidad: 'Movilidad',
  equilibrio: 'Equilibrio', antropometria: 'Antropometría', otro: 'Otros',
};
export const FAMILY_ORDER = ['resistencia', 'salto', 'sprint', 'fuerza', 'equilibrio', 'movilidad', 'antropometria', 'otro'];

// Campos que se calculan solos (no se escriben al registrar)
export const COMPUTED = { 'Sentadilla · 1RM estimado': ['rm'], 'Perímetros': ['icc'], 'Y-Balance Test': ['comp_d', 'comp_i'] };
export const inputFields = type => type.fields.filter(f => !(COMPUTED[type.name] || []).includes(f.key) && !f.virtual);

// Pares derecha/izquierda: claves terminadas en _d / _i
const strip = l => l.replace(/\s*\((D|I)\)\s*$/, '').replace(/\s+(derech[oa]|izquierd[oa])\s*$/i, '').trim();
export function pairsOf(fields) {
  const out = [];
  for (const f of fields) {
    if (!f.key.endsWith('_d')) continue;
    const g = fields.find(x => x.key === f.key.slice(0, -2) + '_i');
    if (g) out.push({ key: f.key.slice(0, -2), label: strip(f.label), d: f, i: g, unit: f.unit, decimals: f.decimals, better: f.better });
  }
  return out;
}
// Campos sueltos (no emparejados)
export const singlesOf = fields => fields.filter(f => !((f.key.endsWith('_d') || f.key.endsWith('_i')) && pairsOf(fields).some(p => p.d === f || p.i === f)));

// Opciones que se pueden mostrar en la vista visual: campos sueltos y pares D/I
export function viewOptions(fields) {
  const pairs = pairsOf(fields).filter(p => p.key !== 'long');
  return [
    ...pairs.map(p => ({ id: 'pair:' + p.key, label: p.label, pair: p })),
    ...singlesOf(fields).map(f => ({ id: 'f:' + f.key, label: f.label, field: f })),
  ];
}
// Opción por defecto: la más representativa del test
export function defaultOption(type, opts) {
  const prefer = { 'Y-Balance Test': 'pair:comp', 'Movilidad': 'pair:rodilla' };
  const pick = prefer[type.name] && opts.find(o => o.id === prefer[type.name]);
  return (pick || opts.find(o => o.field?.better) || opts[0])?.id;
}

// Variación entre dos valores según «mejor si sube / baja»
export function delta(cur, prev, better) {
  if (cur == null || prev == null) return null;
  const d = cur - prev, pct = prev ? d / Math.abs(prev) * 100 : null;
  const tone = !d ? 'same' : !better ? 'neutral' : (better === 'higher') === (d > 0) ? 'up' : 'down';
  return { d, pct, tone };
}
// Simetría entre lados: menor / mayor × 100 (verde ≥ 90 · naranja 80–89 · rojo < 80)
export const symmetry = (a, b) => (a != null && b != null && Math.max(a, b) > 0 ? Math.min(a, b) / Math.max(a, b) * 100 : null);
export const symColor = v => (v == null ? '#9a9b95' : v >= 90 ? '#2e9e4f' : v >= 80 ? '#ef7d32' : '#d6262f');

// Test virtual «CMJ unilateral · LSI»: une «CMJ pierna derecha» e «CMJ pierna izquierda» del mismo día
export const CMJ_D = 'CMJ pierna derecha', CMJ_I = 'CMJ pierna izquierda';
export function cmjLsiType(types) {
  const d = types.find(t => t.name === CMJ_D), i = types.find(t => t.name === CMJ_I);
  if (!d || !i) return null;
  const f = (k, l, s) => ({ key: `${k}_${s}`, label: `${l} (${s.toUpperCase()})`, unit: 'cm', decimals: 1, better: 'higher' });
  return { id: 'cmj_lsi', name: 'CMJ unilateral · LSI', family: 'salto', virtual: true, dId: d.id, iId: i.id,
    fields: [f('altura', 'Mejor salto', 'd'), f('altura', 'Mejor salto', 'i'), f('media', 'Media', 'd'), f('media', 'Media', 'i')] };
}
// Une los resultados D e I por jugador y fecha → filas con values { altura_d, altura_i, media_d, media_i }
export function mergeCmj(dRows = [], iRows = []) {
  const m = new Map();
  const put = (r, s) => {
    const k = r.player_id + '|' + r.date;
    if (!m.has(k)) m.set(k, { id: 'c' + k, player_id: r.player_id, player_name: r.player_name, photo_file_id: r.photo_file_id, date: r.date, values: {} });
    const o = m.get(k).values;
    if (r.values.altura != null) o['altura_' + s] = r.values.altura;
    if (r.values.media != null) o['media_' + s] = r.values.media;
  };
  dRows.forEach(r => put(r, 'd')); iRows.forEach(r => put(r, 'i'));
  return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
// Lado menor de un par
export const weakSide = (d, i) => (d == null || i == null || d === i ? null : d < i ? 'derecha' : 'izquierda');
