// Emulación de la API síncrona de better-sqlite3 sobre sql.js (SQLite compilado a JavaScript)
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { loadDbBytes } from '../storage.js';

const SQL = await initSqlJs();
const saved = await loadDbBytes();

const norm = v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
function bindArgs(args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !(args[0] instanceof Uint8Array)) {
    const o = {};
    for (const [k, v] of Object.entries(args[0])) o['@' + k] = norm(v);
    return o;
  }
  const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return flat.map(norm);
}

export default class Database {
  constructor() {
    this.raw = saved ? new SQL.Database(saved) : new SQL.Database();
    this.depth = 0;
    this.dirty = false;
  }
  pragma(s) { if (/journal_mode/i.test(s)) return; this.raw.exec('PRAGMA ' + s); }
  exec(sql) { this.raw.exec(sql); this.dirty = true; }
  prepare(sql) {
    const db = this;
    const runStmt = (args, mode) => {
      const st = db.raw.prepare(sql);
      try {
        const b = bindArgs(args);
        if ((Array.isArray(b) && b.length) || (!Array.isArray(b) && Object.keys(b).length)) st.bind(b);
        if (mode === 'run') {
          st.step();
          db.dirty = true;
          const changes = db.raw.getRowsModified();
          const id = db.raw.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
          return { changes, lastInsertRowid: id };
        }
        const rows = [];
        while (st.step()) { rows.push(st.getAsObject()); if (mode === 'get') break; }
        return mode === 'get' ? rows[0] : rows;
      } finally { st.free(); }
    };
    return { get: (...a) => runStmt(a, 'get'), all: (...a) => runStmt(a, 'all'), run: (...a) => runStmt(a, 'run') };
  }
  transaction(fn) {
    return (...args) => {
      const sp = 'sp' + this.depth;
      this.raw.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      this.depth++;
      try {
        const r = fn(...args);
        this.depth--;
        this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
        this.dirty = true;
        return r;
      } catch (e) {
        this.depth--;
        this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    };
  }
  async backup(target) { return target; }
  exportBytes() { const b = this.raw.export(); this.raw.exec('PRAGMA foreign_keys = ON'); return b; }
}
