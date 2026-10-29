export function join(...p) { return p.join('/').replace(/\/+/g, '/').split('/').reduce((a, s) => (s === '..' ? a.slice(0, -1) : s === '.' ? a : [...a, s]), []).join('/') || '/'; }
export const resolve = join;
export function extname(p) { const m = String(p).match(/\.[^./]*$/); return m ? m[0] : ''; }
export function basename(p) { return String(p).split('/').pop(); }
export default { join, resolve, extname, basename };
