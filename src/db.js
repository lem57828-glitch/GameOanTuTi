// Lưu trữ SQLite (node:sqlite, không cần cài thêm). WAL cho phép web và worker tách tiến trình cùng đọc/ghi.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  student_id TEXT,
  school TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  team_id INTEGER REFERENCES teams(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  captain_id INTEGER NOT NULL REFERENCES users(id),
  invite_code TEXT NOT NULL UNIQUE,
  official_submission_id INTEGER REFERENCES submissions(id),
  withdrawn INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Phiên bản luật: các loại quân và bảng khắc chế. Luật chung kết là một bản ghi mới.
CREATE TABLE IF NOT EXISTS rulesets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  moves TEXT NOT NULL,
  beats TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  phase_key TEXT NOT NULL DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'pending',
  check_log TEXT,
  env_version TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_team ON submissions(team_id);

-- Giai đoạn: swiss, r32, r16, qf, sf, final. Mỗi giai đoạn khóa một phiên bản bot/đội.
CREATE TABLE IF NOT EXISTS phases (
  key TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ruleset_id INTEGER NOT NULL REFERENCES rulesets(id),
  reveal_opponent INTEGER NOT NULL DEFAULT 0,
  best_of INTEGER NOT NULL DEFAULT 1,
  play_all INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT
);

CREATE TABLE IF NOT EXISTS entries (
  phase_key TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  submission_id INTEGER NOT NULL,
  PRIMARY KEY (phase_key, team_id)
);

-- Cặp đấu loại trực tiếp (có thể gồm nhiều trận, ví dụ bán kết 3 trận).
CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY,
  phase_key TEXT NOT NULL,
  slot INTEGER NOT NULL,
  team_a INTEGER,
  team_b INTEGER,
  seed_a INTEGER,
  seed_b INTEGER,
  winner INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  UNIQUE (phase_key, slot)
);

-- Trận đấu: kết quả chính thức. Lần chạy (runs) tách riêng để chạy lại không cộng điểm hai lần.
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  phase_key TEXT,
  round_no INTEGER,
  series_id INTEGER REFERENCES series(id),
  game_no INTEGER,
  team_a INTEGER,
  team_b INTEGER,
  sub_a INTEGER,
  sub_b INTEGER,
  sample_bot TEXT,
  ruleset_id INTEGER NOT NULL,
  reveal_opponent INTEGER NOT NULL DEFAULT 0,
  decisive INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  result TEXT,
  wins_a INTEGER, wins_b INTEGER, draws INTEGER,
  extra_turns_used INTEGER NOT NULL DEFAULT 0,
  decided_by TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  requested_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_match_phase ON matches(phase_key, round_no);
CREATE INDEX IF NOT EXISTS idx_match_team_a ON matches(team_a);
CREATE INDEX IF NOT EXISTS idx_match_team_b ON matches(team_b);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  worker TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  turns_json TEXT,
  log_a TEXT, log_b TEXT,
  error TEXT
);

-- Hàng đợi: ưu tiên thi chính thức (0) → kiểm tra bài (1) → luyện tập (2).
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  ref_id INTEGER NOT NULL,
  priority INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  worker TEXT,
  heartbeat_at INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(status, priority, id);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  team_id INTEGER,
  match_id INTEGER,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reply TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS awards (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL,
  award_key TEXT NOT NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  UNIQUE (team_id, award_key)
);

CREATE TABLE IF NOT EXISTS certificates (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  member_name TEXT NOT NULL,
  team_name TEXT NOT NULL,
  achievement TEXT NOT NULL,
  awards TEXT,
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS final_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ruleset_id INTEGER NOT NULL,
  briefing TEXT,
  data_json TEXT,
  duration_min INTEGER NOT NULL,
  started_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS human_games (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  bot TEXT NOT NULL,
  ruleset_id INTEGER,
  reveal_opponent INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 100,
  color TEXT,
  history TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Thách đấu: đội A mời bot đội B đấu giao hữu; chỉ chạy khi đội B đồng ý. Không tính điểm giải.
CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY,
  from_team INTEGER NOT NULL REFERENCES teams(id),
  to_team INTEGER NOT NULL REFERENCES teams(id),
  from_sub INTEGER NOT NULL REFERENCES submissions(id),
  to_sub INTEGER REFERENCES submissions(id),
  status TEXT NOT NULL DEFAULT 'pending',
  match_id INTEGER REFERENCES matches(id),
  created_by INTEGER NOT NULL,
  responded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_challenge_to ON challenges(to_team, status);
CREATE INDEX IF NOT EXISTS idx_challenge_from ON challenges(from_team, status);
`;

const CLASSIC = {
  name: 'OTTv2 cổ điển',
  moves: ['ROCK', 'PAPER', 'SCISSORS'],
  beats: { ROCK: ['SCISSORS'], PAPER: ['ROCK'], SCISSORS: ['PAPER'] },
  description: 'Búa ăn kéo, kéo ăn bao, bao ăn búa. Quân cùng loại không ăn nhau mà chặn đường nhau.',
};

const PHASES = [
  // key, title, best_of, play_all
  ['swiss', 'Sơ loại Swiss', 1, 0],
  ['r32', 'Vòng 32', 1, 0],
  ['r16', 'Vòng 16', 1, 0],
  ['qf', 'Tứ kết', 1, 0],
  ['sf', 'Bán kết', 3, 1],
  ['final', 'Chung kết', 3, 0],
];

let db;

function open(file = config.DB_FILE) {
  if (db) return db;
  if (file !== ':memory:') fs.mkdirSync(require('node:path').dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate();
  seed();
  return db;
}

// Thêm cột mới cho CSDL tạo từ phiên bản trước (CREATE TABLE IF NOT EXISTS không tự thêm cột).
function migrate() {
  const add = (table, col, def) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  add('human_games', 'ruleset_id', 'INTEGER');
  add('human_games', 'reveal_opponent', 'INTEGER NOT NULL DEFAULT 0');
  add('human_games', 'turns', 'INTEGER NOT NULL DEFAULT 100');
  add('human_games', 'color', 'TEXT');
  // Đổi tên bộ luật mặc định khi chuyển từ bản chọn đồng thời sang bàn cờ OTTv2.
  db.prepare(`UPDATE rulesets SET name = 'OTTv2 cổ điển', description = 'Búa ăn kéo, kéo ăn bao, bao ăn búa. Quân cùng loại không ăn nhau mà chặn đường nhau.'
    WHERE name = 'Cổ điển (búa/kéo/bao)'`).run();
}

function seed() {
  if (!get('SELECT id FROM rulesets LIMIT 1')) {
    run('INSERT INTO rulesets (name, moves, beats, description) VALUES (?,?,?,?)',
      CLASSIC.name, JSON.stringify(CLASSIC.moves), JSON.stringify(CLASSIC.beats), CLASSIC.description);
  }
  const classicId = get('SELECT id FROM rulesets ORDER BY id LIMIT 1').id;
  PHASES.forEach(([key, title, bestOf, playAll], i) => {
    run(`INSERT OR IGNORE INTO phases (key, ord, title, ruleset_id, best_of, play_all, reveal_opponent)
         VALUES (?,?,?,?,?,?,?)`, key, i, title, classicId, bestOf, playAll, key === 'final' ? 1 : 0);
  });
  const defaults = {
    submissions_open: 'true',
    practice_open: 'true',
    challenges_open: 'true',
    current_phase: 'swiss',
    swiss_rounds: String(config.swiss.rounds),
  };
  for (const [k, v] of Object.entries(defaults)) run('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)', k, v);
}

const plain = (row) => (row ? { ...row } : row);
function get(sql, ...params) { return plain(db.prepare(sql).get(...params)); }
function all(sql, ...params) { return db.prepare(sql).all(...params).map(plain); }
function run(sql, ...params) { return db.prepare(sql).run(...params); }

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function setting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}
function jsonSetting(key, fallback = null) {
  const v = setting(key);
  return v == null ? fallback : JSON.parse(v);
}

function audit(userId, action, detail) {
  run('INSERT INTO audit (user_id, action, detail) VALUES (?,?,?)', userId ?? null, action,
    typeof detail === 'string' ? detail : JSON.stringify(detail ?? null));
}

function ruleset(id) {
  const r = get('SELECT * FROM rulesets WHERE id = ?', id);
  if (!r) return null;
  return { ...r, moves: JSON.parse(r.moves), beats: JSON.parse(r.beats) };
}

function close() { if (db) { db.close(); db = null; } }

module.exports = { open, close, get, all, run, tx, setting, setSetting, jsonSetting, audit, ruleset, CLASSIC };
