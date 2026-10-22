// Dịch vụ của module tournaments (TV3).
//
// PHẦN 1 — GIAO DIỆN CHO MODULE KHÁC (bản tối thiểu; giữ nguyên chữ ký).
// PHẦN 2 — NGHIỆP VỤ CỦA TV3 (đang todo()).
const db = require('../../core/db');
const events = require('../../core/events');
const { validateMatchCompleted } = require('../../core/contracts');
const { todo } = require('../../core/errors');

const OWNER = 'TV3';

// ---------------------------------------------------------------- PHẦN 1: giao diện dùng chung

/** Giải đang diễn ra (mới nhất chưa lưu trữ), hoặc null. */
function currentTournament() {
  return db.get(`SELECT * FROM tournaments WHERE status != 'archived' ORDER BY id DESC LIMIT 1`) || null;
}

/** PairAssignment (core/contracts.js) theo id, cho TV4 tạo phòng. */
function getPair(pairId) {
  const p = db.get(`SELECT p.*, s.kind, s.bot_lock_at FROM pairs p JOIN stages s ON s.id = p.stage_id WHERE p.id = ?`, pairId);
  return p ? { pairId: p.id, stageId: p.stage_id, kind: p.kind, teamA: p.team_a, teamB: p.team_b, seedA: p.seed_a, seedB: p.seed_b, lockAt: p.bot_lock_at, status: p.status } : null;
}

// ---------------------------------------------------------------- PHẦN 2: nghiệp vụ TV3 (chưa làm)

const getCurrent = () => todo(OWNER, 'thông tin công khai của giải hiện tại: lịch, mức, mốc khóa (giờ máy chủ)');
const createTournament = () => todo(OWNER, 'tạo/cấu hình giải: tên, mô tả, luật, hạn đăng ký, số đội, danh sách mức');
const updateTournament = () => todo(OWNER, 'sửa cấu hình giải trước khi bắt đầu');
const createStage = () => todo(OWNER, 'tạo mức sơ loại/vòng: số đội đi tiếp, số vòng, mốc 18:00/20:00');
const openStage = () => todo(OWNER, 'mở mức: chọn đội đủ điều kiện, khóa bot theo mốc, đặt điểm về 0 (giữ lịch sử mức trước)');
const pairRound = () => todo(OWNER, 'ghép vòng: vòng đầu ngẫu nhiên có seed, sau đó gần điểm, tránh tái đấu, xử lý lẻ/bye (Q03)');
const standings = () => todo(OWNER, 'bảng xếp hạng mức: điểm 3/1/0, ĐTB đối thủ, hiệu số ván, tạm/đã chốt, tô xanh/đỏ + nhãn');
const finalizeStage = () => todo(OWNER, 'chốt mức: xử lý tranh suất ranh giới (Q04), chọn đội đi tiếp');
const buildBracket = () => todo(OWNER, 'hạt giống và cây 32 lá → 16+8+4 cặp; phát pair.assigned cho TV4; dừng ở Top 4');
const bracket = () => todo(OWNER, 'dữ liệu cây công khai cho giao diện (TV4 vẽ)');
const confirmPair = () => todo(OWNER, 'chốt kết quả cặp sau khi xử lý khiếu nại; chặn chuyển vòng sai trạng thái');
const listAppeals = () => todo(OWNER, 'danh sách khiếu nại cho trọng tài');
const decideAppeal = () => todo(OWNER, 'quyết định khiếu nại: chấp nhận/bác, tạm hoãn, chạy lại; ghi audit; phát decision.made');

/** Nhận kết quả trận từ TV4. Chưa chốt chính thức ở đây: TV3 đối soát rồi mới confirm. */
function onMatchCompleted(event) {
  const errs = validateMatchCompleted(event.payload);
  if (errs.length) { console.error('[tournaments] match.completed sai hợp đồng:', errs); return; }
  // TODO(TV3): lưu kết quả tạm vào pairs (points, winner, result_version) nếu result_version mới hơn,
  // không cộng điểm trùng khi chạy lại; chờ trọng tài/BTC chốt rồi mới chuyển nhánh.
}

function init() {
  events.on('match.completed', onMatchCompleted);
}

module.exports = {
  currentTournament, getPair,
  getCurrent, createTournament, updateTournament, createStage, openStage, pairRound, standings, finalizeStage,
  buildBracket, bracket, confirmPair, listAppeals, decideAppeal, init,
};
