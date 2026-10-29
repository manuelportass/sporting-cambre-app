// Sistema de archivos virtual: archivos subidos (persistidos en IndexedDB) y recursos incluidos
import { files, putFile, delFile } from '../storage.js';
import seed from '../../../../server/seed/temporada-2026-2027.json';
import rpeSeed from '../../../../server/seed/rpe-historico-2026.json';
import crestUrl from '../../../../server/assets/escudo.png';
const base = p => String(p).split('/').pop();
export const VIRTUAL = { 'temporada-2026-2027.json': JSON.stringify(seed), 'rpe-historico-2026.json': JSON.stringify(rpeSeed), 'escudo.png': crestUrl };
export function mkdirSync() {}
export function existsSync(p) { const b = base(p); return b in VIRTUAL || files.has(b); }
export function readFileSync(p) { const b = base(p); if (b in VIRTUAL) return VIRTUAL[b]; throw new Error('No existe ' + p); }
export function unlinkSync(p) { delFile(base(p)); }
export function readdirSync() { return []; }
export function statSync() { return { size: 0 }; }
export { putFile };
export default { mkdirSync, existsSync, readFileSync, unlinkSync, readdirSync, statSync };
