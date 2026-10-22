// Bus sự kiện giữa các module (mục 9.5). Module phát sự kiện, module khác đăng ký nghe;
// không gọi thẳng vào bảng/hàm nội bộ của module khác.
// Mọi sự kiện được ghi vào bảng event_log để tra soát và để tiến trình worker đọc lại.
// Danh sách loại sự kiện là HỢP ĐỒNG CHUNG: thêm loại mới phải được cả nhóm duyệt (xem docs/CONTRACTS.md).
const { EventEmitter } = require('node:events');
const db = require('./db');

const TYPES = {
  // TV1 accounts-teams
  'team.roster_locked': 'Đội hình bị khóa (hết hạn đăng ký)',
  'notification.requested': 'Module khác yêu cầu gửi thông báo cho người dùng/đội',
  // TV2 bots-runner
  'bot.version_ready': 'Một phiên bản bot đã nhận và kiểm thử xong',
  'game.started': 'Worker bắt đầu chạy một hiệp',
  'game.move': 'Một nước đi trong hiệp đang chạy (cho phòng trực tiếp)',
  'game.finished': 'Một hiệp kết thúc, kèm kết quả chuẩn',
  'game.failed': 'Hiệp lỗi do hạ tầng (không phải lỗi bot), cần chạy lại',
  // TV3 tournaments
  'stage.opened': 'Mở một mức sơ loại/vòng loại trực tiếp',
  'pair.assigned': 'Có cặp đấu mới cần tạo phòng',
  'decision.made': 'Trọng tài/BTC ra quyết định (tạm hoãn, chạy lại, chốt)',
  // TV4 rooms-matches
  'game.requested': 'Phòng yêu cầu worker chạy một hiệp đã khóa lựa chọn',
  'match.completed': 'Trận kết thúc (5 hoặc 7 hiệp), chờ TV3 chốt',
  'appeal.submitted': 'Đội trưởng gửi khiếu nại chính thức từ phòng',
};

const bus = new EventEmitter();
bus.setMaxListeners(50);

/** Phát sự kiện: ghi log rồi báo cho các module đang nghe trong cùng tiến trình. */
function emit(type, payload = {}, { actorId = null } = {}) {
  if (!TYPES[type]) throw new Error(`Loại sự kiện chưa đăng ký trong core/events.js: ${type}`);
  const id = Number(db.run('INSERT INTO event_log (type, payload, actor_id) VALUES (?, ?, ?)', type, JSON.stringify(payload), actorId).lastInsertRowid);
  const event = { id, type, payload, actorId, at: new Date().toISOString() };
  for (const fn of bus.listeners(type)) {
    try { fn(event); } catch (e) { console.error(`[events] lỗi khi xử lý ${type}:`, e); }
  }
  return event;
}

function on(type, fn) {
  if (!TYPES[type]) throw new Error(`Loại sự kiện chưa đăng ký trong core/events.js: ${type}`);
  bus.on(type, fn);
}

/** Đọc lại sự kiện sau một mốc id (dùng cho phòng trực tiếp kết nối lại, hoặc worker ở tiến trình khác). */
function since(afterId, types) {
  const rows = types && types.length
    ? db.all(`SELECT * FROM event_log WHERE id > ? AND type IN (${types.map(() => '?').join(',')}) ORDER BY id LIMIT 500`, afterId, ...types)
    : db.all('SELECT * FROM event_log WHERE id > ? ORDER BY id LIMIT 500', afterId);
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

module.exports = { TYPES, emit, on, since };
