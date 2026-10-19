-- Bảng dùng chung, thuộc core. Module khác tham chiếu nhưng không sửa cấu trúc các bảng này
-- (cần thêm cột thì đề xuất qua review và tạo migration mới trong core).

-- Danh tính người dùng tối thiểu để mọi module làm việc được.
-- Hồ sơ đầy đủ (mã SV, lớp/khoa, avatar, xác minh email...) do TV1 thêm bằng bảng riêng trong module accounts-teams.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT,                       -- NULL với tài khoản mẫu chỉ dùng đăng nhập giả lập
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','referee','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  reason TEXT,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  actor_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_event_type ON event_log(type, id);

-- Cài đặt dạng khóa/giá trị cho mọi module; đặt tiền tố theo module, ví dụ 'tournaments.current_id'.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
