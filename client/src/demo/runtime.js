// Ejecuta el servidor real de la app dentro del navegador (versión de prueba sin instalación).
// Intercepta fetch('/api/...') y lo resuelve con las mismas rutas, validaciones y permisos del servidor.
import dbMod from '../../../server/db.js';
import A from '../../../server/auth.js';
import core from '../../../server/routes/core.js';
import gym from '../../../server/routes/gym.js';
import injuries from '../../../server/routes/injuries.js';
import team from '../../../server/routes/team.js';
import player from '../../../server/routes/player.js';
import { Router } from './shims/express.js';
import { files, fileUrls, saveDbBytes, persistent, resetAll } from './storage.js';
import { VIRTUAL } from './shims/fs.js';

const { db } = dbMod;
const app = Router();
app.use(A.loadUser);
app.use('/', core.router);
app.use('/gym', gym.router);
app.use('/injuries', injuries.router);
app.use('/team', team.router);
app.use('/me', player.router);

let sid = null;
try { sid = localStorage.getItem('scpf-demo-sid'); } catch { /* sin almacenamiento */ }
const setSid = v => { sid = v; try { v ? localStorage.setItem('scpf-demo-sid', v) : localStorage.removeItem('scpf-demo-sid'); } catch { /* idem */ } };

function dataUrlToBlob(u) {
  const [head, b64] = u.split(',');
  const mime = head.match(/data:([^;]+)/)[1];
  const bin = atob(b64); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: mime });
}
function blobFor(path) {
  const name = String(path).split('/').pop();
  if (files.has(name)) return files.get(name);
  if (name in VIRTUAL && String(VIRTUAL[name]).startsWith('data:')) return dataUrlToBlob(VIRTUAL[name]);
  return null;
}

// Se guarda en cuanto termina cada operación que modifica datos (antes de responder a la interfaz)
async function persist() {
  if (!db.dirty) return;
  db.dirty = false;
  try { await saveDbBytes(db.exportBytes()); } catch (e) { console.error('No se pudo guardar', e); }
}

export function handle(url, init = {}) {
  return new Promise(resolve => {
    const u = new URL(url, 'http://demo');
    const method = (init.method || 'GET').toUpperCase();
    const headers = {}; new Headers(init.headers || {}).forEach((v, k) => { headers[k] = v; });
    const req = { method, path: u.pathname.replace(/^\/api/, '') || '/', query: Object.fromEntries(u.searchParams), body: {}, cookies: sid ? { [A.COOKIE]: sid } : {}, ip: 'demo', get: h => headers[h.toLowerCase()] };
    if (init.body instanceof FormData) req._formFile = init.body.get('file');
    else if (init.body) { try { req.body = JSON.parse(init.body); } catch { req.body = {}; } }
    const out = { status: 200, headers: {} };
    let done = false;
    const finish = body => {
      if (done) return; done = true;
      const reply = () => resolve(new Response(body ?? null, { status: out.status, headers: out.headers }));
      if (method !== 'GET') persist().then(reply); else reply();
    };
    const res = {
      status(n) { out.status = n; return res; },
      setHeader(k, v) { out.headers[k.toLowerCase()] = v; return res; },
      type(t) { out.headers['content-type'] = t; return res; },
      json(o) { out.headers['content-type'] = 'application/json'; finish(JSON.stringify(o)); },
      send(x) { finish(x); }, end() { finish(null); },
      sendFile(p) { const b = blobFor(p); if (!b) { out.status = 404; return finish(null); } out.headers['content-type'] = out.headers['content-type'] || b.type; finish(b); },
      download(p) { res.sendFile(p); },
      cookie(name, val) { if (name === A.COOKIE) setSid(val); }, clearCookie(name) { if (name === A.COOKIE) setSid(null); },
    };
    try {
      app(req, res, err => {
        if (!err) return res.status(404).json({ error: 'Ruta no encontrada.' });
        const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
        if (status >= 500) console.error(err);
        res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo (15 MB).' : status >= 500 ? 'Error interno: ' + err.message : err.message });
      });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno: ' + e.message }); }
  });
}

// URLs de imagen (las etiquetas <img> no pasan por fetch)
function fileUrl(id) {
  const f = id && db.prepare('SELECT stored_name FROM files WHERE id=?').get(id);
  return f ? fileUrls.get(f.stored_name) || null : null;
}
let defaultCrest = null;
function crestSrc() {
  const id = dbMod.settings().club.crestFileId;
  return (id && fileUrl(id)) || (defaultCrest ||= URL.createObjectURL(dataUrlToBlob(VIRTUAL['escudo.png'])));
}

// Instalación del interceptor y cuenta inicial del preparador
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/api/') || url === '/api') return handle(url, init);
  return realFetch(input, init);
};
export const DEMO_PIN = '123456';
export const DEMO_NAME = 'José Manuel Portas Vázquez';
if (A.needsSetup()) {
  await handle('/api/setup', { method: 'POST', body: JSON.stringify({ code: A.ensureSetupCode(), name: DEMO_NAME, pin: DEMO_PIN }) });
}
// Fotos de los jugadores («Fotos con edit»): el nombre del archivo identifica al jugador
const PHOTOS = import.meta.glob('../../../server/seed/fotos/*.jpg', { eager: true, query: '?url', import: 'default' });
function pendingPhotos() {
  const norm = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9ñ]+/).filter(Boolean);
  const players = db.prepare('SELECT id, first_name, last_name, photo_file_id FROM players').all();
  const out = [];
  for (const [path, url] of Object.entries(PHOTOS)) {
    const name = decodeURIComponent(path.split('/').pop());
    const ft = new Set(norm(name.replace(/\.jpg$/i, '')));
    const hits = players.filter(p => { const t = norm(`${p.first_name} ${p.last_name}`); return t.length && t.every(x => ft.has(x)); });
    if (hits.length === 1 && !hits[0].photo_file_id) out.push({ id: hits[0].id, name, url });
  }
  return out;
}
async function seedPhotos() {
  for (const x of pendingPhotos()) {
    const fd = new FormData(); fd.append('file', new File([dataUrlToBlob(x.url)], x.name, { type: 'image/jpeg' }));
    await handle(`/api/players/${x.id}/photo`, { method: 'POST', headers: { 'x-requested-with': 'scpf' }, body: fd });
  }
}
// Datos precargados: listado 2026/27 y histórico de RPE ya depurado (solo si aún no están)
{
  const call = async (u, body) => { const r = await handle('/api' + u, { method: body ? 'POST' : 'GET', headers: { 'x-requested-with': 'scpf' }, body: body && JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
  const count = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  const seedKeys = (() => { try { return JSON.parse(VIRTUAL['temporada-2026-2027.json']).players.map(p => dbMod.nameKey(`${p.first_name} ${p.last_name}`)); } catch { return []; } })();
  const haveKeys = new Set(db.prepare('SELECT name_key FROM players').all().map(x => x.name_key));
  // Jugadores del listado con franja que aún no la tienen asignada (p. ej. juveniles A/B añadidos después)
  const seedRows = (() => { try { return JSON.parse(VIRTUAL['temporada-2026-2027.json']).players; } catch { return []; } })();
  const unslotted = new Set(db.prepare("SELECT p.name_key FROM players p WHERE NOT EXISTS (SELECT 1 FROM gym_assignments a WHERE a.player_id=p.id)").all().map(x => x.name_key));
  const needSlots = seedRows.some(p => p.weekday && unslotted.has(dbMod.nameKey(`${p.first_name} ${p.last_name}`)));
  const needPlayers = count('players') === 0 || seedKeys.some(k => !haveKeys.has(k)) || needSlots, needRpe = count('load_entries') === 0, needPhotos = needPlayers || pendingPhotos().length > 0;
  if (needPlayers || needRpe || needPhotos) {
    try {
      const me = await handle('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null);
      if (!me || me.user?.role !== 'admin') await call('/auth/login', { name: DEMO_NAME, pin: DEMO_PIN });
      if (needPlayers) {
        const seed = await call('/seed/season');
        await call('/seed/season/slots', {});
        const rows = haveKeys.size ? seed.players.filter(p => { const k = dbMod.nameKey(`${p.first_name} ${p.last_name}`); return !haveKeys.has(k) || (p.weekday && unslotted.has(k)); }) : seed.players;
        const pv = await call('/players/import/preview', { rows });
        await call('/players/import/commit', { rows: pv.rows });
      }
      if (needPhotos) await seedPhotos(); // también las fotos nuevas que falten
      if (needRpe) await call('/team/seed/rpe-history', {});
      // Entrenamientos sin RPE: se asumen realizados (RPE 5 × 90′) para poder calcular aguda, crónica y ACWR
      if (needRpe) await call('/team/fill-missing', { rpe: 5, minutes: 90 });
    } catch (e) { console.error('No se pudieron precargar los datos', e); }
  }
}
window.__scpfDemo = { fileUrl, crestSrc, persistent, reset: resetAll, pin: DEMO_PIN, name: DEMO_NAME };
