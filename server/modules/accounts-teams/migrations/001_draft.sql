-- LƯỢC ĐỒ ĐỀ XUẤT (M0) cho module accounts-teams — TV1 sở hữu, hoàn thiện và chốt cùng nhóm.
-- Thêm thay đổi bằng tệp migration mới (002_...), không sửa tệp này sau khi đã chạy trên máy người khác.

-- Hồ sơ thí sinh (đặc tả mục 2): bổ sung cho bảng users của core.
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  student_code TEXT,
  class_name TEXT,
  faculty TEXT,
  avatar_url TEXT,
  email_verified_at TEXT,
  completed INTEGER NOT NULL DEFAULT 0          -- đủ trường bắt buộc chưa
);

-- Đội trong một giải (mục 3). tournament_id tham chiếu module tournaments (TV3); để số nguyên, không ràng buộc khóa ngoại chéo module.
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  tournament_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,                       -- tên đã chuẩn hóa (Unicode, khoảng trắng, hoa/thường) để chống trùng
  captain_id INTEGER NOT NULL REFERENCES users(id),
  invite_code TEXT NOT NULL UNIQUE,
  github_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','locked','withdrawn')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (tournament_id, name_key)
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  tournament_id INTEGER NOT NULL,               -- lặp lại để ràng buộc "một người một đội trong cùng giải"
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (team_id, user_id),
  UNIQUE (user_id, tournament_id)
);

-- Trung tâm thông báo (mục 7).
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

-- TODO(TV1): bảng lời mời, mã xác minh email/khôi phục mật khẩu, chat (kênh đội, kênh phòng cho TV4).
