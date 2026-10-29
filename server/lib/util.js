'use strict';
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = msg => new HttpError(400, msg);
const notFound = (msg = 'No encontrado.') => new HttpError(404, msg);

// Envuelve controladores (síncronos o asíncronos) y traduce errores a JSON
const h = fn => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.then === 'function') r.catch(next);
  } catch (e) { next(e); }
};

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
function reqDate(v, label = 'Fecha') { if (!isDate(v)) throw bad(`${label} no válida (AAAA-MM-DD).`); return v; }
function optDate(v, label) { if (v === undefined || v === null || v === '') return null; return reqDate(v, label); }
function reqText(v, label, max = 5000) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw bad(`${label} es obligatorio.`);
  if (s.length > max) throw bad(`${label} es demasiado largo.`);
  return s;
}
function optText(v, max = 20000) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s.length > max) throw bad('Texto demasiado largo.');
  return s || null;
}
function num(v, label, { min = -Infinity, max = Infinity, required = false, int = false } = {}) {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`${label} es obligatorio.`); return null; }
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw bad(`${label} debe ser un número.`);
  if (int && !Number.isInteger(n)) throw bad(`${label} debe ser un número entero.`);
  if (n < min || n > max) throw bad(`${label} debe estar entre ${min} y ${max}.`);
  return n;
}
function oneOf(v, list, label) { if (!list.includes(v)) throw bad(`${label} no válido.`); return v; }
const today = () => {
  // Fecha local de Madrid
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ_APP || 'Europe/Madrid' }).format(new Date());
};
const isoWeekday = s => { const d = new Date(s + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };

module.exports = { HttpError, bad, notFound, h, isDate, reqDate, optDate, reqText, optText, num, oneOf, today, isoWeekday };
