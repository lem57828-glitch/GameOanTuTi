-- LƯỢC ĐỒ ĐỀ XUẤT (M0) cho module rooms-matches — TV4 sở hữu, hoàn thiện và chốt cùng nhóm.
-- Trận (match) tách khỏi hiệp (game) và lần chạy (run): một hiệp chỉ có một kết quả có hiệu lực; chạy lại thay hiệu lực, không cộng thêm điểm.

-- Một phòng/trận cho mỗi cặp vòng 32→4 (mục 6.1). Phòng dùng chung cho các hiệp và lần chạy lại.
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  pair_id INTEGER NOT NULL UNIQUE,              -- tham chiếu pairs (TV3)
  room_code TEXT NOT NULL UNIQUE,
  team_a INTEGER NOT NULL,
  team_b INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','choosing','running','between','held','completed')),
  current_game INTEGER NOT NULL DEFAULT 0,
  points_a INTEGER NOT NULL DEFAULT 0,
  points_b INTEGER NOT NULL DEFAULT 0,
  result_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Bộ 1–3 bot đội đăng ký cho vòng (khóa mã cho cả vòng, mục 6.2).
CREATE TABLE IF NOT EXISTS match_bot_sets (
  match_id INTEGER NOT NULL REFERENCES matches(id),
  team_id INTEGER NOT NULL,
  bot_version_ids TEXT NOT NULL,                -- JSON [id, id, id] — phiên bản bất biến của TV2
  locked_at TEXT,
  PRIMARY KEY (match_id, team_id)
);

-- Một hiệp: 5 hiệp chính + tối đa 2 hiệp phụ.
CREATE TABLE IF NOT EXISTS match_games (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  no INTEGER NOT NULL,
  extra INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'choosing' CHECK (status IN ('choosing','locked','running','finished','void')),
  choose_deadline TEXT,                         -- tối đa 10 phút giữa hiệp, giờ máy chủ
  -- Lựa chọn kín: KHÔNG trả về API/sự kiện trước khi cả hai sẵn sàng hoặc hết hạn (mục 8).
  choice_a TEXT, choice_b TEXT,                 -- JSON { botVersionId, extraType }
  ready_a INTEGER NOT NULL DEFAULT 0, ready_b INTEGER NOT NULL DEFAULT 0,
  revealed_at TEXT,
  coin TEXT,                                    -- JSON kết quả tung xu (công khai, có seed)
  blue_team INTEGER,
  effective_run INTEGER,                        -- run đang có hiệu lực
  points_a INTEGER, points_b INTEGER,
  UNIQUE (match_id, no)
);

-- Mỗi lần chạy một hiệp (chạy lại giữ nguyên bot, quân thứ 10, màu và kết quả tung xu đã khóa).
CREATE TABLE IF NOT EXISTS game_runs (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES match_games(id),
  run_no INTEGER NOT NULL,
  request_key TEXT NOT NULL UNIQUE,             -- khóa gửi sang TV2
  status TEXT NOT NULL DEFAULT 'requested',
  result TEXT,                                  -- GameResult (JSON)
  reason TEXT,                                  -- lý do chạy lại (từ quyết định trọng tài)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (game_id, run_no)
);

-- TODO(TV4): ý kiến khán giả trong phòng (dùng nền chat của TV1), trạng thái kết nối/khôi phục tiến độ.
