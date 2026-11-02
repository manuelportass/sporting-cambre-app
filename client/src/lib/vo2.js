// VO₂máx ESTIMADO (Buchheit, 2008) a partir del 30-15 IFT. El cálculo se hace en el servidor (server/lib/vo2.js).
import { fmtDate, fmtNum } from './format';

export const IFT = '30-15 Intermittent Fitness Test';
export const VO2_FIELD = { key: 'vo2', label: 'VO₂máx estimado', unit: 'ml/kg/min', decimals: 1, better: 'higher', virtual: true };
export const VO2_NOTE = 'VO₂máx estimado con la ecuación de Buchheit (2008) a partir de la VIFT, la edad, el sexo y el peso corporal. Es una aproximación, no una medición directa por análisis de gases.';
export const isIFT = t => (t?.name || t?.test_name) === IFT;
export const withVO2 = type => (isIFT(type) ? { ...type, fields: [...type.fields, VO2_FIELD] } : type);
export const mergeVO2 = r => (r.vo2 ? { ...r, values: { ...r.values, vo2: r.vo2.value } } : r);

// Texto con los datos usados o lo que falta para calcularlo
export function vo2Detail(v) {
  if (!v || typeof v !== 'object') return '';
  if (v.value == null) return `Falta: ${v.missing.join(', ')}`;
  const i = v.inputs;
  return `VIFT ${fmtNum(i.vift, 1)} km/h · ${i.age} años (${i.age_source}) · ${i.sex_label} · ${fmtNum(i.weight, 1)} kg (peso del ${fmtDate(i.weight_date)})`;
}
