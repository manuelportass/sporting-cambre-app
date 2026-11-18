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
const strip = l => l.replace(/\s*\((D|I)\)\s*$/, '').trim();
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
