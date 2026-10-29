'use strict';
// Base de datos común (SQLite). Un único registro por jugador con id estable;
// todos los módulos se relacionan por players.id, nunca por el nombre.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });

const db = new Database(process.env.DB_FILE || path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,          -- infantil | cadete | juvenil | senior
  name TEXT NOT NULL,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  name_key TEXT NOT NULL,             -- nombre normalizado (detección de duplicados)
  category_id INTEGER REFERENCES categories(id),
  position TEXT,
  dominant_leg TEXT,                  -- derecha | izquierda | ambas
  joined_at TEXT,
  photo_file_id INTEGER,
  notes TEXT,
  availability TEXT DEFAULT 'pendiente', -- disponible | limitado | no_disponible | pendiente
  custom TEXT DEFAULT '{}',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_players_key ON players(name_key);

-- Datos personales separados de los de rendimiento (permisos)
CREATE TABLE IF NOT EXISTS player_private (
  player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  birth_date TEXT,
  weight_kg REAL,
  height_cm REAL,
  anthropometry TEXT,
  sports_history TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username_key TEXT UNIQUE NOT NULL,  -- nombre completo normalizado
  display_name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','player')),
  player_id INTEGER UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  active INTEGER DEFAULT 1,
  must_change_pin INTEGER DEFAULT 0,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  owner_type TEXT NOT NULL,           -- player_photo | injury | club
  owner_id INTEGER,
  original_name TEXT,
  mime TEXT,
  size INTEGER,
  stored_name TEXT NOT NULL,
  uploaded_by INTEGER,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  user_id INTEGER,
  at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log(entity, entity_id);

-- ===== MÓDULO 1: GIMNASIO =====
CREATE TABLE IF NOT EXISTS gym_slots (
  id INTEGER PRIMARY KEY,
  weekday INTEGER NOT NULL,           -- 2 = martes, 3 = miércoles (ISO: 1 lunes)
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  label TEXT,
  category_id INTEGER REFERENCES categories(id),
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS gym_assignments (     -- asignación habitual
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES gym_slots(id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, slot_id)
);
CREATE TABLE IF NOT EXISTS gym_sessions (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  slot_id INTEGER NOT NULL REFERENCES gym_slots(id) ON DELETE CASCADE,
  cancelled INTEGER DEFAULT 0,
  notes TEXT,
  UNIQUE (date, slot_id)
);
CREATE TABLE IF NOT EXISTS gym_attendance (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendiente', -- presente | ausente | justificada | pendiente | movido
  origin TEXT NOT NULL DEFAULT 'habitual',  -- habitual | puntual | cambio_franja
  moved_slot_id INTEGER,                     -- destino (si movido) u origen (si cambio_franja)
  note TEXT,
  updated_by INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (session_id, player_id)
);

-- ===== MÓDULO 2: LESIONES =====
CREATE TABLE IF NOT EXISTS rehab_phases (
  id INTEGER PRIMARY KEY,
  sort INTEGER NOT NULL,
  name TEXT NOT NULL,
  objectives TEXT,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS injuries (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  injury_date TEXT NOT NULL,
  zone TEXT,
  diagnosis TEXT,
  laterality TEXT,                    -- derecha | izquierda | bilateral
  injury_type TEXT,
  mechanism TEXT,
  diagnostics TEXT,                   -- pruebas y valoración del profesional sanitario
  previous_injuries TEXT,
  symptoms TEXT,
  restrictions TEXT,
  coach_notes TEXT,
  status TEXT NOT NULL DEFAULT 'activa', -- activa | readaptacion | reincorporacion | completada
  phase_id INTEGER REFERENCES rehab_phases(id),
  phase_objectives TEXT,
  pending_criteria TEXT,
  next_review TEXT,
  return_training_date TEXT,
  return_match_date TEXT,
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS injury_phase_history (
  id INTEGER PRIMARY KEY,
  injury_id INTEGER NOT NULL REFERENCES injuries(id) ON DELETE CASCADE,
  from_phase_id INTEGER,
  to_phase_id INTEGER,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  user_id INTEGER,
  at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  keys TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_ok TEXT,
  failures INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS push_log (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                 -- wellness | rpe | eva | prueba | manual
  date TEXT NOT NULL,
  user_id INTEGER,
  sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS injury_pain (
  id INTEGER PRIMARY KEY,
  injury_id INTEGER NOT NULL REFERENCES injuries(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  eva INTEGER NOT NULL,               -- dolor percibido durante la sesión (EVA 0-10), lo registra el jugador
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(injury_id, date)
);
CREATE TABLE IF NOT EXISTS injury_entries (
  id INTEGER PRIMARY KEY,
  injury_id INTEGER NOT NULL REFERENCES injuries(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  phase_id INTEGER,
  exercises TEXT DEFAULT '[]',        -- [{name, sets, reps, load, other}]
  pain REAL,
  response TEXT,
  incidents TEXT,
  review_date TEXT,
  pending_criteria TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ===== MÓDULO 3: PRIMER EQUIPO =====
CREATE TABLE IF NOT EXISTS team_sessions (       -- entrenamientos colectivos programados
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'Entrenamiento',
  planned_minutes INTEGER,
  notes TEXT,
  track_missing INTEGER DEFAULT 1,     -- 0: sesión importada del histórico (no se reclaman RPE)
  UNIQUE (date, session_type)
);
CREATE TABLE IF NOT EXISTS team_attendance (
  session_id INTEGER NOT NULL REFERENCES team_sessions(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL,               -- presente | ausente | justificada | lesionado
  note TEXT,
  PRIMARY KEY (session_id, player_id)
);
CREATE TABLE IF NOT EXISTS load_entries (        -- RPE colectivo y entrenamientos adicionales
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('colectivo','adicional','partido')),
  session_type TEXT NOT NULL,
  description TEXT,
  duration_min REAL NOT NULL,
  rpe REAL NOT NULL,
  load_au REAL NOT NULL,              -- duración × RPE, calculada en el servidor
  notes TEXT NOT NULL,
  team_session_id INTEGER REFERENCES team_sessions(id) ON DELETE SET NULL,
  match_id INTEGER,
  status TEXT NOT NULL DEFAULT 'valido', -- valido | anulado
  superseded_by INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_load_player_date ON load_entries(player_id, date);
CREATE TABLE IF NOT EXISTS wellness_entries (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  scores TEXT NOT NULL,               -- {clave: puntuación}
  notes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valido',
  superseded_by INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_well_player_date ON wellness_entries(player_id, date);
CREATE TABLE IF NOT EXISTS correction_requests (
  id INTEGER PRIMARY KEY,
  entity TEXT NOT NULL,               -- load | wellness
  entity_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  proposed TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | aprobada | rechazada
  resolved_by INTEGER,
  resolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  season TEXT NOT NULL,
  competition TEXT,
  matchday TEXT,
  date TEXT NOT NULL,
  opponent TEXT NOT NULL,
  home_away TEXT,                     -- local | visitante
  goals_for INTEGER,
  goals_against INTEGER,
  duration_min INTEGER DEFAULT 90,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  source_ref TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (season, date, opponent)
);
CREATE TABLE IF NOT EXISTS match_stats (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  called_up INTEGER DEFAULT 1,
  started INTEGER,
  minutes INTEGER,
  goals INTEGER DEFAULT 0,
  assists INTEGER,
  yellow INTEGER DEFAULT 0,
  red INTEGER DEFAULT 0,
  extra TEXT DEFAULT '{}',
  source TEXT DEFAULT 'manual',
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (match_id, player_id)
);
CREATE TABLE IF NOT EXISTS player_aliases (      -- nombres en fuentes externas -> jugador
  alias_key TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  family TEXT,                        -- resistencia | salto | sprint | otro
  fields TEXT NOT NULL,               -- [{key,label,unit,decimals,better:'higher'|'lower'|null}]
  protocol TEXT,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY,
  test_type_id INTEGER NOT NULL REFERENCES test_types(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  values_json TEXT NOT NULL,
  device TEXT,
  protocol TEXT,
  conditions TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

db.exec(SCHEMA);
// Migraciones de bases de datos creadas con versiones anteriores
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
if (!cols('player_private').includes('age')) db.exec('ALTER TABLE player_private ADD COLUMN age INTEGER');
// Disponibilidad: solo disponible / limitado / lesionado
db.exec("UPDATE players SET availability='disponible' WHERE availability IS NULL OR availability='pendiente'; UPDATE players SET availability='lesionado' WHERE availability='no_disponible'");
if (!cols('team_sessions').includes('track_missing')) db.exec('ALTER TABLE team_sessions ADD COLUMN track_missing INTEGER DEFAULT 1');

// ---------- Configuración por defecto ----------
const DEFAULT_SETTINGS = {
  club: {
    name: 'Sporting Cambre',
    coachName: 'José Manuel Portas Vázquez',
    crestFileId: null,
    primary: '#ffffff',   // color principal del club: blanco
    accent: '#dc0b11',    // color secundario: rojo del escudo
  },
  collectiveDays: [2, 4, 5], // martes, jueves, viernes
  load: {
    method: 'rolling',          // rolling | ewma
    acuteDays: 7,
    chronicDays: 28,
    minChronicDays: 21,         // exposición mínima para considerar válida la carga crónica
    maxMissingChronic: 0,       // registros pendientes tolerados en la ventana crónica
    ewmaAcuteDays: 7,
    ewmaChronicDays: 28,
    matchRpe: 10,               // RPE fijo de los partidos: carga = minutos jugados × 10
  },
  // Bandas de ACWR: valores iniciales editables. No son predictivos de lesión.
  acwrBands: {
    green: [0.8, 1.3],
    yellow: [[0.7, 0.8], [1.3, 1.4]],
    orange: [[0.5, 0.7], [1.4, 1.5]],
    note: 'Valores iniciales editables tomados de la literatura habitualmente citada (zona 0,8–1,3; Gabbett, 2016). Orientativos: no predicen lesiones ni constituyen un diagnóstico individual.',
  },
  // Variación semanal de carga aguda respecto a la semana previa (%). Editable.
  weeklyChangeBands: { green: 10, yellow: 15, orange: 25 },
  rpeScale: [
    'Reposo', 'Muy, muy suave', 'Suave', 'Moderado', 'Algo duro', 'Duro', 'Duro +', 'Muy duro', 'Muy duro +', 'Casi máximo', 'Máximo',
  ],
  wellness: {
    min: 1,
    max: 5,
    items: [
      { key: 'sueno', label: 'Calidad del sueño', higherIsBetter: true, anchors: ['Muy mala', 'Mala', 'Normal', 'Buena', 'Excelente'] },
      { key: 'fatiga', label: 'Fatiga', higherIsBetter: true, anchors: ['Agotado', 'Muy cansado', 'Normal', 'Fresco', 'Muy fresco'] },
      { key: 'dolor', label: 'Dolor muscular', higherIsBetter: true, anchors: ['Dolor muy intenso', 'Dolor intenso', 'Molestias', 'Leve', 'Sin dolor'] },
      { key: 'estres', label: 'Estrés', higherIsBetter: true, anchors: ['Muy estresado', 'Estresado', 'Normal', 'Relajado', 'Muy relajado'] },
      { key: 'animo', label: 'Estado de ánimo', higherIsBetter: true, anchors: ['Muy bajo', 'Bajo', 'Normal', 'Bueno', 'Muy bueno'] },
      { key: 'recuperacion', label: 'Percepción de recuperación', higherIsBetter: true, anchors: ['Nada recuperado', 'Poco recuperado', 'Parcialmente', 'Bastante', 'Totalmente recuperado'] },
    ],
    // Umbrales sobre la puntuación normalizada 0–100 % (100 = estado más favorable)
    bands: { green: 75, yellow: 50, orange: 25 },
  },
  painScale: { min: 0, max: 10, label: 'EVA 0–10 (0 = sin dolor, 10 = máximo dolor imaginable)' },
  playerCustomFields: [],   // [{key,label,type}]
  // Qué puede ver cada jugador de sus propios datos
  playerView: { showLoad: true, showAcwr: false, showTests: true, showStats: true },
  // Recordatorios al móvil (notificaciones push). Hora de Madrid; solo a quien no lo ha registrado.
  notifications: { enabled: true, wellness: { enabled: true, time: '17:00' }, rpe: { enabled: true, time: '22:00' }, eva: { enabled: true, time: '22:00' } },
  sessionTypes: ['Entrenamiento', 'Recuperación', 'Activación'],
  extraTypes: ['Fuerza / gimnasio', 'Carrera continua', 'Intervalos', 'Fisioterapia / readaptación', 'Movilidad', 'Otro deporte', 'Otro'],
};

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const putSetting = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

function settings() {
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const row = getSetting.get(k);
    const def = DEFAULT_SETTINGS[k];
    const val = row ? JSON.parse(row.value) : def;
    // Los objetos guardados se completan con las claves nuevas por defecto
    out[k] = def && typeof def === 'object' && !Array.isArray(def) && val && typeof val === 'object' && !Array.isArray(val) ? { ...def, ...val } : val;
  }
  return out;
}
function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error('Clave de configuración desconocida: ' + key);
  putSetting.run(key, JSON.stringify(value));
}

function seed() {
  const cats = [['infantil', 'Infantil', 1], ['cadete', 'Cadete', 2], ['juvenil', 'Juvenil', 3], ['senior', 'Primer equipo sénior', 4]];
  const ins = db.prepare('INSERT OR IGNORE INTO categories(code,name,sort) VALUES (?,?,?)');
  cats.forEach(c => ins.run(...c));

  if (!db.prepare('SELECT 1 FROM rehab_phases LIMIT 1').get()) {
    const p = db.prepare('INSERT INTO rehab_phases(sort,name,objectives) VALUES (?,?,?)');
    [
      'Fase inicial y control de síntomas',
      'Recuperación de movilidad, fuerza básica y función',
      'Desarrollo de fuerza y control neuromuscular',
      'Introducción progresiva de carrera y tareas específicas',
      'Reincorporación al entrenamiento colectivo',
      'Retorno a la competición y seguimiento posterior',
    ].forEach((n, i) => p.run(i + 1, n, null));
  }

  if (!db.prepare('SELECT 1 FROM test_types LIMIT 1').get()) {
    const t = db.prepare('INSERT INTO test_types(name,family,fields,protocol) VALUES (?,?,?,?)');
    t.run('30-15 Intermittent Fitness Test', 'resistencia', JSON.stringify([
      { key: 'vift', label: 'VIFT', unit: 'km/h', decimals: 1, better: 'higher' },
      { key: 'etapa', label: 'Última etapa completada', unit: '', decimals: 0, better: 'higher' },
    ]), 'Protocolo 30-15 IFT (Buchheit). Indicar superficie y condiciones.');
    t.run('CMJ bilateral', 'salto', JSON.stringify([{ key: 'altura', label: 'Altura', unit: 'cm', decimals: 1, better: 'higher' }]), 'Contramovimiento con manos en cadera.');
    t.run('CMJ pierna derecha', 'salto', JSON.stringify([{ key: 'altura', label: 'Altura', unit: 'cm', decimals: 1, better: 'higher' }]), 'CMJ unipodal derecho, manos en cadera.');
    t.run('CMJ pierna izquierda', 'salto', JSON.stringify([{ key: 'altura', label: 'Altura', unit: 'cm', decimals: 1, better: 'higher' }]), 'CMJ unipodal izquierdo, manos en cadera.');
    t.run('Sprint 10 m', 'sprint', JSON.stringify([{ key: 'tiempo', label: 'Tiempo', unit: 's', decimals: 2, better: 'lower' }]), 'Salida parada; indicar distancia de salida y sistema (fotocélulas, vídeo…).');
    t.run('Sprint 30 m', 'sprint', JSON.stringify([{ key: 'tiempo', label: 'Tiempo', unit: 's', decimals: 2, better: 'lower' }]), 'Salida parada; indicar distancia de salida y sistema (fotocélulas, vídeo…).');
  }
}
seed();
// Nombre del preparador con tilde (versiones anteriores lo guardaban sin ella)
{ const c = getSetting.get('club'); if (c && c.value.includes('"Jose Manuel Portas')) putSetting.run('club', c.value.replace('"Jose Manuel Portas', '"José Manuel Portas')); }
// El peso corporal se registra como un test (evolución a lo largo de la temporada)
{
  db.prepare("INSERT OR IGNORE INTO test_types(name,family,fields,protocol) VALUES ('Peso corporal','antropometria',?,?)")
    .run(JSON.stringify([{ key: 'peso', label: 'Peso', unit: 'kg', decimals: 1, better: null }]), 'En ayunas o a la misma hora del día, con ropa ligera y la misma báscula.');
  const tp = db.prepare("SELECT id FROM test_types WHERE name='Peso corporal'").get();
  const old = db.prepare('SELECT player_id, weight_kg FROM player_private WHERE weight_kg IS NOT NULL').all();
  for (const o of old) {
    db.prepare("INSERT INTO test_results(test_type_id,player_id,date,values_json,notes) VALUES (?,?,date('now'),?,'Peso de la ficha')").run(tp.id, o.player_id, JSON.stringify({ peso: o.weight_kg }));
    db.prepare('UPDATE player_private SET weight_kg=NULL WHERE player_id=?').run(o.player_id);
  }
}

function audit(entity, entityId, action, before, after, userId) {
  db.prepare('INSERT INTO audit_log(entity,entity_id,action,before_json,after_json,user_id) VALUES (?,?,?,?,?,?)')
    .run(entity, entityId ?? null, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, userId ?? null);
}

// Normaliza nombres: minúsculas, sin tildes, espacios simples.
function nameKey(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Copia de seguridad diaria (se conservan las 14 últimas)
async function backup() {
  const dir = path.join(DATA_DIR, 'backups');
  const name = `app-${new Date().toISOString().slice(0, 10)}.db`;
  const target = path.join(dir, name);
  await db.backup(target);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort();
  while (files.length > 14) fs.unlinkSync(path.join(dir, files.shift()));
  return target;
}

module.exports = { db, settings, setSetting, DEFAULT_SETTINGS, audit, nameKey, backup, DATA_DIR };
