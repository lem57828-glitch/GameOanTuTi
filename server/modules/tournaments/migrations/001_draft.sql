-- LƯỢC ĐỒ ĐỀ XUẤT (M0) cho module tournaments — TV3 sở hữu, hoàn thiện và chốt cùng nhóm.

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','registration','qualifier','knockout','top4','archived')),
  announced_at TEXT,                            -- công bố trước hạn đăng ký 2 tuần (mục 3)
  registration_deadline TEXT,                   -- ISO, giờ máy chủ
  config TEXT NOT NULL DEFAULT '{}',            -- JSON: số vòng/mức, giới hạn, tài liệu...
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Một mức sơ loại (vd 1000→500) hoặc một vòng loại trực tiếp (32, 16, tứ kết).
CREATE TABLE IF NOT EXISTS stages (
  id INTEGER PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  ord INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('qualifier','knockout')),
  name TEXT NOT NULL,
  team_target INTEGER,                          -- số đội đi tiếp sau mức (qualifier)
  rounds INTEGER,                               -- số vòng Swiss trong mức, áp dụng đồng đều (Q03)
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','locked','running','finalizing','done')),
  bot_lock_at TEXT,                             -- 18:00 khóa bot (mục 5.1)
  publish_at TEXT,                              -- 20:00 công bố
  UNIQUE (tournament_id, ord)
);

-- Đội tham gia một mức; điểm được tính lại từ kết quả trận, cột dưới đây là bảng điểm đã chốt.
CREATE TABLE IF NOT EXISTS stage_entries (
  stage_id INTEGER NOT NULL REFERENCES stages(id),
  team_id INTEGER NOT NULL,
  seed INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','advanced','eliminated','withdrawn')),
  final_rank INTEGER,
  PRIMARY KEY (stage_id, team_id)
);

-- Cặp đấu: sơ loại (theo vòng) hoặc ô trong cây 32→4 (slot cố định).
CREATE TABLE IF NOT EXISTS pairs (
  id INTEGER PRIMARY KEY,
  stage_id INTEGER NOT NULL REFERENCES stages(id),
  round_no INTEGER,
  slot INTEGER,                                 -- vị trí trong cây (knockout)
  team_a INTEGER,
  team_b INTEGER,                               -- NULL = bye/miễn đấu
  seed_a INTEGER,
  seed_b INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','playing','completed','confirmed','held')),
  winner_team INTEGER,
  points_a INTEGER, points_b INTEGER,
  result_version INTEGER NOT NULL DEFAULT 0,    -- tăng khi TV4 gửi kết quả mới (chạy lại)
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pairs_stage ON pairs(stage_id, round_no);

-- Khiếu nại chính thức và quyết định trọng tài (mục 6.5, 7).
CREATE TABLE IF NOT EXISTS appeals (
  id INTEGER PRIMARY KEY,
  pair_id INTEGER NOT NULL REFERENCES pairs(id),
  game_no INTEGER,
  move_no INTEGER,
  team_id INTEGER NOT NULL,
  submitted_by INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','accepted','rejected')),
  decision TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
