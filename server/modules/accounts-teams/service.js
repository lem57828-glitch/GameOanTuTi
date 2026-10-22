// Dịch vụ của module accounts-teams (TV1).
//
// PHẦN 1 — GIAO DIỆN CHO MODULE KHÁC (đã viết sẵn ở mức tối thiểu để TV2–TV4 làm song song).
// TV1 được phép đổi cách cài đặt bên trong, nhưng giữ nguyên tên hàm, tham số và kiểu trả về
// (hoặc đổi qua review chung, xem docs/CONTRACTS.md).
//
// PHẦN 2 — NGHIỆP VỤ CỦA TV1: các hàm bên dưới đang để todo(), TV1 hiện thực và gắn vào routes.js.
const db = require('../../core/db');
const events = require('../../core/events');
const { todo } = require('../../core/errors');

const OWNER = 'TV1';

// ---------------------------------------------------------------- PHẦN 1: giao diện dùng chung

/** Đội của người dùng trong một giải, hoặc null. */
function teamOf(userId, tournamentId) {
  return db.get(`SELECT t.* FROM teams t JOIN team_members m ON m.team_id = t.id
    WHERE m.user_id = ? AND m.tournament_id = ?`, userId, tournamentId) || null;
}

function getTeam(teamId) {
  return db.get('SELECT * FROM teams WHERE id = ?', teamId) || null;
}

function members(teamId) {
  return db.all(`SELECT u.id, u.username, u.display_name FROM team_members m JOIN users u ON u.id = m.user_id
    WHERE m.team_id = ? ORDER BY m.joined_at`, teamId);
}

function isCaptain(userId, teamId) {
  return !!db.get('SELECT 1 FROM teams WHERE id = ? AND captain_id = ?', teamId, userId);
}

function isMember(userId, teamId) {
  return !!db.get('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?', teamId, userId);
}

/**
 * Gửi thông báo cho người dùng hoặc cả đội. Module khác gọi hàm này (hoặc phát sự kiện 'notification.requested'),
 * không tự ghi vào bảng notifications.
 * @param {{ userIds?: number[], teamId?: number, kind: string, title: string, body?: string, link?: string }} n
 */
function notify(n) {
  const ids = new Set(n.userIds || []);
  if (n.teamId) for (const m of members(n.teamId)) ids.add(m.id);
  for (const uid of ids) {
    db.run('INSERT INTO notifications (user_id, kind, title, body, link) VALUES (?,?,?,?,?)', uid, n.kind, n.title, n.body || null, n.link || null);
  }
  // TODO(TV1): gửi email cho loại thông báo quan trọng (adapter email), chống gửi trùng.
  return ids.size;
}

// ---------------------------------------------------------------- PHẦN 2: nghiệp vụ TV1 (chưa làm)

const register = () => todo(OWNER, 'đăng ký: kiểm tra miền email sinh viên (Q01), username/email không trùng, băm mật khẩu, gửi mã xác minh');
const login = () => todo(OWNER, 'đăng nhập bằng mật khẩu, giới hạn thử sai; dùng core/auth.setSession khi thành công');
const verifyEmail = () => todo(OWNER, 'xác minh email bằng mã/đường dẫn');
const forgotPassword = () => todo(OWNER, 'gửi mã khôi phục mật khẩu');
const resetPassword = () => todo(OWNER, 'đặt lại mật khẩu bằng mã');
const getProfile = () => todo(OWNER, 'xem hồ sơ của mình');
const updateProfile = () => todo(OWNER, 'sửa hồ sơ, đánh dấu hoàn tất trường bắt buộc');
const history = () => todo(OWNER, 'lịch sử thi đấu, thống kê thắng/hòa/thua, thành tích');
const createTeam = () => todo(OWNER, 'tạo đội (chuẩn hóa và kiểm tra trùng tên trong giải)');
const myTeam = () => todo(OWNER, 'đội của tôi trong giải hiện tại, kèm thành viên');
const checkTeamName = () => todo(OWNER, 'kiểm tra trùng tên đội khi đang nhập');
const invite = () => todo(OWNER, 'mời thành viên qua email/ID hoặc tạo mã/link mời');
const joinTeam = () => todo(OWNER, 'tham gia đội bằng mã mời (2–4 người, một người một đội trong giải)');
const leaveTeam = () => todo(OWNER, 'rời đội trước khi khóa đội hình');
const transferCaptain = () => todo(OWNER, 'chuyển đội trưởng');
const listNotifications = () => todo(OWNER, 'danh sách thông báo, số chưa đọc');
const markRead = () => todo(OWNER, 'đánh dấu đã đọc');
const listChat = () => todo(OWNER, 'đọc tin nhắn một kênh (kiểm tra quyền đọc)');
const postChat = () => todo(OWNER, 'gửi tin nhắn (chống spam)');

function init() {
  // Module khác có thể yêu cầu gửi thông báo bằng sự kiện thay vì gọi hàm trực tiếp.
  events.on('notification.requested', (e) => notify(e.payload));
  // TODO(TV1): nghe 'stage.opened', 'pair.assigned', 'decision.made' để thông báo lịch/đối thủ/quyết định (mục 7).
}

module.exports = {
  // giao diện dùng chung
  teamOf, getTeam, members, isCaptain, isMember, notify,
  // nghiệp vụ
  register, login, verifyEmail, forgotPassword, resetPassword, getProfile, updateProfile, history,
  createTeam, myTeam, checkTeamName, invite, joinTeam, leaveTeam, transferCaptain,
  listNotifications, markRead, listChat, postChat, init,
};
