-- LƯỢC ĐỒ ĐỀ XUẤT (M0) cho module bots-runner — TV2 sở hữu, hoàn thiện và chốt cùng nhóm.

-- Phiên bản bot BẤT BIẾN (mục 4.1): lưu chính mã nguồn để phục hồi được, không chỉ link GitHub/đường dẫn tệp.
CREATE TABLE IF NOT EXISTS bot_versions (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL,                     -- tham chiếu teams (TV1)
  version INTEGER NOT NULL,
  source_code TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  repo TEXT,                                    -- repository GitHub nếu nhận từ GitHub
  commit_sha TEXT,
  submitted_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','invalid')),
  check_log TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (team_id, version)
);
CREATE INDEX IF NOT EXISTS idx_bot_versions_sha ON bot_versions(sha256);

-- Hàng đợi chạy hiệp. request_key là khóa chống chạy trùng (reconnect của người xem không được tạo hiệp mới).
CREATE TABLE IF NOT EXISTS game_jobs (
  id INTEGER PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request TEXT NOT NULL,                        -- GameRequest (JSON), xem core/contracts.js
  priority INTEGER NOT NULL DEFAULT 1,          -- 0 chính thức, 1 kiểm thử, 2 đấu thử
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  worker TEXT,
  heartbeat_at INTEGER,
  result TEXT,                                  -- GameResult (JSON)
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_game_jobs_pick ON game_jobs(status, priority, id);

-- TODO(TV2): bảng bộ luật (ruleset) nếu cần nhiều luật; liên kết GitHub của đội; log riêng theo hiệp/lần chạy.
