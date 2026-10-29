// Persistencia de la versión de prueba en el navegador (IndexedDB). Si no está disponible, solo memoria.
const DB_NAME = 'sporting-cambre-demo', STORE = 'kv';
export const files = new Map();      // nombre → Blob
export const fileUrls = new Map();   // nombre → blob: URL
let idb = null;
function open() {
  return new Promise(resolve => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
const tx = (mode, fn) => new Promise(resolve => {
  if (!idb) return resolve(null);
  try { const t = idb.transaction(STORE, mode); const req = fn(t.objectStore(STORE)); t.oncomplete = () => resolve(req?.result ?? null); t.onerror = () => resolve(null); }
  catch { resolve(null); }
});
idb = await open();
const keys = (await tx('readonly', s => s.getAllKeys())) || [];
for (const k of keys) if (String(k).startsWith('file:')) {
  const b = await tx('readonly', s => s.get(k));
  if (b) { const n = String(k).slice(5); files.set(n, b); fileUrls.set(n, URL.createObjectURL(b)); }
}
export const persistent = !!idb;
export async function loadDbBytes() { const v = await tx('readonly', s => s.get('db')); return v ? new Uint8Array(v) : null; }
export async function saveDbBytes(bytes) { await tx('readwrite', s => s.put(bytes, 'db')); }
export async function putFile(name, blob) { files.set(name, blob); fileUrls.set(name, URL.createObjectURL(blob)); await tx('readwrite', s => s.put(blob, 'file:' + name)); }
export function delFile(name) { files.delete(name); const u = fileUrls.get(name); if (u) URL.revokeObjectURL(u); fileUrls.delete(name); tx('readwrite', s => s.delete('file:' + name)); }
export async function resetAll() { await tx('readwrite', s => s.clear()); try { localStorage.removeItem('scpf-demo-sid'); } catch { /* sin almacenamiento */ } }
