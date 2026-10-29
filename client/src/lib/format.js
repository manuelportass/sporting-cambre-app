export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isoWeekday = s => { const d = new Date(s + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
export const mondayOf = s => addDays(s, 1 - isoWeekday(s));
export const WEEKDAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function fmtDate(s, opts = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!s) return '—';
  const d = new Date(s.length === 10 ? s + 'T12:00:00Z' : s);
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...opts }).format(d);
}
export const fmtDateLong = s => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtShort = s => fmtDate(s, { day: '2-digit', month: 'short' });
export const fmtDateTime = s => (s ? fmtDate(s.replace(' ', 'T') + (s.includes('Z') || s.includes('+') ? '' : 'Z'), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export function fmtNum(v, d = 0) {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '—';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v));
}
export const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
export const age = birth => {
  if (!birth) return null;
  const t = todayISO();
  const [y, m, d] = birth.split('-').map(Number), [Y, M, D] = t.split('-').map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
};

export const COLOR_LABEL = { verde: 'Dentro del intervalo', amarillo: 'Intermedio favorable', naranja: 'Requiere atención', rojo: 'Revisión prioritaria', gris: 'Sin datos suficientes', neutro: 'Referencia' };
export const COLOR_VAR = { verde: 'var(--verde)', amarillo: 'var(--amarillo)', naranja: 'var(--naranja)', rojo: 'var(--rojo)', gris: 'var(--gris)', neutro: '#111511' };
export const COLOR_HEX = { verde: '#0ca30c', amarillo: '#fab219', naranja: '#ec835a', rojo: '#d03b3b', gris: '#9a9b95', neutro: '#111511' };

export const ATT_LABEL = { presente: 'Presente', ausente: 'Ausente', justificada: 'Ausencia justificada', pendiente: 'Pendiente', movido: 'Cambiado de franja', lesionado: 'Lesionado' };
export const AVAIL_COLOR = { disponible: 'verde', limitado: 'amarillo', no_disponible: 'rojo', pendiente: 'gris' };
export const INJ_STATUS = { activa: 'Lesión activa', readaptacion: 'En readaptación', reincorporacion: 'Reincorporación', completada: 'Completado' };
export const INJ_COLOR = { activa: 'rojo', readaptacion: 'naranja', reincorporacion: 'amarillo', completada: 'verde' };
export const seasonOf = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`; };

// Posiciones del primer equipo (y equivalencias de valores antiguos)
export const POS_ORDER = [['Portero', 'Porteros'], ['Defensa', 'Defensas'], ['Lateral', 'Laterales'], ['Medio', 'Medios'], ['Delantero', 'Delanteros'], ['Extremo', 'Extremos']];
export function posGroup(p) {
  const s = String(p || '').toLowerCase();
  if (!s) return null;
  if (s.startsWith('port')) return 'Portero';
  if (s.startsWith('lateral') || s.includes('carrilero')) return 'Lateral';
  if (s.startsWith('extremo')) return 'Extremo';
  if (s.startsWith('delant') || s.includes('punta')) return s.includes('media') ? 'Medio' : 'Delantero';
  if (s.startsWith('defensa') || s.includes('central')) return 'Defensa';
  if (s.startsWith('medi') || s.includes('pivote') || s.includes('interior')) return 'Medio';
  return null;
}
