// Escudos de los equipos de la liga (Primera Futgal, Grupo 2), extraídos de los resultados de la jornada 8 (RFGF)
const FILES = import.meta.glob('../../../server/seed/escudos/*.png', { eager: true, query: '?url', import: 'default' });
export const teamKey = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const MAP = Object.fromEntries(Object.entries(FILES).map(([p, url]) => [teamKey(p.split('/').pop().replace(/\.png$/, '')), url]));
export function crestOf(name) {
  const k = teamKey(name);
  if (!k) return null;
  if (MAP[k]) return MAP[k];
  const hit = Object.keys(MAP).find(x => x.includes(k) || k.includes(x));
  return hit ? MAP[hit] : null;
}
// Nombre legible: «S.D. CACHEIRAS» → «S.D. Cacheiras»
export const teamName = n => String(n || '').toLowerCase().replace(/(^|[\s.(])([a-zñáéíóú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Sd|Cf|Fc|Ud|Ccd|Sr|S\.d|C\.f|F\.c|U\.d|S\.r|S\. D)\b/g, x => x.toUpperCase());
